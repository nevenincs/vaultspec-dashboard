//! Temporal endpoints (contract §5, W03.P11.S50): events with engine-side
//! bucketing, blob-true as-of snapshots, and the ordered diff log on the
//! single delta clock.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use engine_query::events::{BucketMode, bucket_events, parse_bucket_param};
use engine_store::EventRow;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;
use crate::routes::query::validate_scope;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

#[derive(Deserialize)]
pub struct EventsParams {
    pub scope: String,
    #[serde(default)]
    pub from: Option<i64>,
    #[serde(default)]
    pub to: Option<i64>,
    #[serde(default)]
    pub kinds: Option<String>,
    #[serde(default)]
    pub bucket: Option<String>,
}

pub async fn events(
    State(state): State<Arc<AppState>>,
    Query(params): Query<EventsParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let mode = match params.bucket.as_deref() {
        None => BucketMode::Raw,
        Some(p) => parse_bucket_param(p).ok_or_else(|| {
            super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown bucket `{p}`"),
            )
        })?,
    };
    // An inverted range is a client error, not a silently-empty result —
    // fail fast before the commit walk (hardening, 2026-06-13).
    if let (Some(from), Some(to)) = (params.from, params.to)
        && from > to
    {
        return Err(super::api_error(
            &state,
            StatusCode::BAD_REQUEST,
            format!("events range: from ({from}) must be <= to ({to})"),
        ));
    }
    // Event sourcing shared with the CLI verb via the query core (G7). The HEAD
    // commit walk + node correlation (bounded to graph-known nodes + the code-id
    // cap, addendum S05) is immutable per generation and was ~2.2s on EVERY
    // request, so it is memoized on the cell (commit_event_rows, warmed off the
    // request path). The handler clones the cached rows and filters/buckets per
    // request — the per-request work that genuinely varies with from/to/kinds.
    let mut rows: Vec<EventRow> = (*cell
        .commit_event_rows()
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e))?)
    .clone();
    if let Some(kinds) = &params.kinds {
        let wanted: Vec<&str> = kinds.split(',').collect();
        rows.retain(|r| wanted.contains(&r.kind.as_str()));
    }
    let from = params.from.unwrap_or(0);
    let to = params.to.unwrap_or(i64::MAX);
    rows.retain(|r| r.ts >= from && r.ts <= to);
    let upper = to.min(rows.last().map_or(from, |r| r.ts));
    let payload = bucket_events(&rows, from, upper, mode);
    Ok(super::envelope(
        json!({"payload": payload}),
        super::query_tiers(&cell),
        None,
    ))
}

#[derive(Deserialize)]
pub struct AsofParams {
    pub scope: String,
    /// A ref name, commit sha, or millisecond timestamp.
    pub t: String,
    /// `document` (default) or `feature` — a historical keyframe in the same
    /// species as the live view (S50: the constellation time-travels in its
    /// own feature species, not as a disjoint document graph).
    #[serde(default)]
    pub granularity: Option<String>,
    /// The active salience lens (graph-node-salience ADR wire amendment): the
    /// `lens` request parameter is accepted on `/graph/asof` too, defaulting to
    /// status. The historical slice's salience is computed over the historical
    /// graph's own basis (the live per-generation cache holds the present view).
    #[serde(default)]
    pub lens: Option<String>,
    /// The DOI focus node id (folded into the historical salience).
    #[serde(default)]
    pub focus: Option<String>,
    /// The engine-owned wire filter as a URL-encoded JSON object — the SAME
    /// grammar `/graph/query` and `/graph/lineage` accept (contract §4,
    /// unified-filter-plane D4). ABSENT = no constraint (`Filter::default()`),
    /// the unfiltered historical view. PRESENT = the time-travelled snapshot is
    /// narrowed by every facet exactly as the live graph is, so an active filter
    /// is honoured across the time axis instead of dropped on scrub. A malformed
    /// value is a client error shaped through the shared envelope.
    #[serde(default)]
    pub filter: Option<String>,
}

pub async fn graph_asof(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AsofParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let granularity = super::query::parse_granularity(&state, params.granularity.as_deref())?;
    let lens = super::query::parse_lens(&state, params.lens.as_deref())?;
    // Parse the optional URL-encoded JSON filter; a malformed value is a client
    // error through the shared envelope (mirrors `/graph/lineage`). The graph
    // projection below validates the facet vocabulary, so this only catches a
    // syntactically-broken value (unified-filter-plane D4).
    let filter = match &params.filter {
        None => engine_query::filter::Filter::default(),
        Some(raw) => serde_json::from_str(raw).map_err(|e| {
            super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("invalid filter: {e}"),
            )
        })?,
    };
    // Scope the historical snapshot to the SERVED WORKTREE (same as the
    // present view), NOT the ref name: the ref is the TIME axis (`t`), not the
    // corpus-view label. Stamping the ref as the facet scope makes two
    // snapshots differ by label alone, which floods `/graph/diff` with
    // spurious `change` deltas (2026-06-13 hardening). graph_query filters by
    // this same scope, so both must agree. Now the RESOLVED cell's scope/root
    // (W02.P05.S17).
    let scope = cell.scope.clone();
    // Echo the RESOLVED sha + the chosen interpretation (ADD-901): a client
    // sends `t` (a ref, sha, or epoch-ms) and must learn, without re-deriving,
    // both which commit the engine landed on and how it read the token (the
    // revision/timestamp readings can collide on an all-digit value).
    // Resolve (sha, interpretation) CHEAPLY from THIS request's token (no graph
    // build), then fetch the historical graph from the cell's by-sha LRU: a
    // time-travel REVISIT (scrubbing returns to a commit) is served from cache,
    // skipping the ~35s per-request re-index (core `vault graph --ref` subprocess +
    // structural rebuild). First visit to a never-seen sha still pays the re-index
    // (inherent). The interpretation is echoed from the FRESH resolve, not the
    // cache, so two token forms that resolve to one commit each echo their own
    // reading (ADD-901) while sharing the cached graph.
    let (resolved_sha, interpretation) =
        engine_graph::asof::resolve_ref_interpreted(&cell.root, &params.t)
            .map_err(|e| super::revision_error(&state, &params.t, &e))?;
    let resolved = cell
        .asof_graph(&resolved_sha)
        .map_err(|e| super::revision_error(&state, &params.t, &e))?;
    let mut slice =
        engine_query::graph::graph_query(&resolved.asof.graph, &scope, filter, granularity)
            .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // Attach the active-lens salience to the historical document nodes (ADR wire
    // amendment: lens on /graph/asof). The basis is computed over the HISTORICAL
    // graph (the live per-generation cache holds the present view); the as-of
    // tiers block already flags the historical degradation, and the salience
    // partial flag inherits the structural-degraded-at-T note. Document
    // granularity only — feature-convergence nodes are not salience-ranked.
    if granularity == engine_query::graph::Granularity::Document {
        let members: Vec<&engine_model::Node> = resolved
            .asof
            .graph
            .nodes()
            .filter(|n| n.facets.iter().any(|f| f.scope == scope))
            .collect();
        let basis =
            engine_query::salience::LensBasis::compute(&resolved.asof.graph, &scope, &members);
        // Historical structural resolution degrades to stale at T (the as-of
        // tiers block says so), so the salience is computed partial for honesty.
        let focus = params
            .focus
            .as_ref()
            .map(|f| engine_model::NodeId(f.clone()));
        let scores = engine_query::salience::compute_salience(
            &basis,
            &resolved.asof.graph,
            lens,
            focus.as_ref(),
            crate::app::now_ms(),
            true,
        );
        engine_query::salience::annotate_nodes(&mut slice.nodes, &scores);
        engine_query::salience::order_by_salience(&mut slice.nodes, &scores);
    }
    Ok(super::envelope(
        json!({
            "t": params.t,
            // Additive (ADD-901): the raw `t` echo above is preserved; these
            // name the commit `t` resolved to and how the token was read.
            "resolved_sha": resolved_sha,
            "interpretation": interpretation,
            "nodes": slice.nodes,
            "edges": slice.edges,
            // Feature granularity carries the constellation meta-edges so a
            // historical keyframe matches the live constellation exactly.
            "meta_edges": slice.meta_edges,
            // A HISTORICAL keyframe carries no live-clock position (N2):
            // splicing to LIVE requires a present keyframe whose deltas
            // arrive on the stream's sequence.
            "last_seq": Value::Null,
            // The active lens echoed (graph-node-salience ADR wire amendment).
            "lens": lens.as_str(),
        }),
        serde_json::to_value(engine_query::envelope::asof_tiers_block()).expect("tiers serialize"),
        None,
    ))
}

#[derive(Deserialize)]
pub struct LineageParams {
    pub scope: String,
    /// Inclusive ISO `yyyy-mm-dd` lower bound; absent = open on that side.
    #[serde(default)]
    pub from: Option<String>,
    /// Inclusive ISO `yyyy-mm-dd` upper bound; absent = open on that side.
    #[serde(default)]
    pub to: Option<String>,
    /// The engine-owned wire filter as a URL-encoded JSON object (contract §4,
    /// §5 `&filter=`). Absent = no constraint (`Filter::default()`). The same
    /// filter grammar `/graph/query` accepts; a malformed value or an unknown
    /// facet is a client error shaped through the shared envelope.
    #[serde(default)]
    pub filter: Option<String>,
    /// Optional as-of time-travel token (a ref name, commit sha, or millisecond
    /// timestamp — the SAME vocabulary as [`AsofParams::t`]). ABSENT = lineage
    /// over the live cell graph (unchanged). PRESENT = BLOB-TRUE lineage as of T:
    /// the historical graph is resolved via `asof_graph_resolved` and the bounded
    /// lineage projection runs over THAT graph, so the timeline's lineage is
    /// time-accurate (the graph as it existed at instant T via the git object DB),
    /// not just client-side creation-date gating (dashboard-timeline ADR: the
    /// as-of lineage form, implemented below).
    #[serde(default)]
    pub t: Option<String>,
    /// The relation-overlay opt-in (dashboard-timeline ADR: the always-on surface
    /// is dated marks ONLY; relations are an on-demand overlay). ABSENT/false =
    /// the DEFAULT nodes-only timeline read — served from the per-generation
    /// lineage-node cache as a cheap range slice, with NO edge scan, so a
    /// scroll/zoom never iterates the graph's edges. true = also return the
    /// self-consistent arcs among the kept nodes (the on-demand overlay / debug
    /// inspection), which flows through the full projection.
    #[serde(default)]
    pub include_arcs: Option<bool>,
}

/// `GET /graph/lineage?scope&from&to&filter=` — the bounded temporal-lineage
/// projection (dashboard-timeline ADR, contract §5; W01.P02). For a scope and an
/// inclusive `[from, to]` ISO date range, return the dated document nodes in
/// range together with the self-consistent edges among them — the diachronic
/// lineage the phase-lane timeline draws.
///
/// Read-and-infer behind the shared envelope (engine-read-and-infer,
/// every-wire-response-carries-the-tiers-block): the success body and every
/// error path travel through `super::envelope` / `super::api_error`, so the
/// per-tier `tiers` block rides both. The slice is bounded under the document
/// node ceiling by the projection itself (graph-queries-are-bounded-by-default),
/// with an honest `truncated` block; the semantic tier is present-only in the
/// range lineage (ADR), reported via the degraded tiers block.
pub async fn graph_lineage(
    State(state): State<Arc<AppState>>,
    Query(params): Query<LineageParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    // Parse the optional URL-encoded JSON filter; a malformed value is a client
    // error through the shared envelope (the projection validates the facet
    // vocabulary below, so this only catches a syntactically-broken value).
    let filter = match &params.filter {
        None => engine_query::filter::Filter::default(),
        Some(raw) => serde_json::from_str(raw).map_err(|e| {
            super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("invalid filter: {e}"),
            )
        })?,
    };
    // An inverted range is a client error, not a silently-empty result — fail
    // fast before the projection walk (mirrors the events handler). ISO dates
    // compare lexically, the same well-ordering the projection's range test uses.
    if let (Some(from), Some(to)) = (&params.from, &params.to)
        && from > to
    {
        return Err(super::api_error(
            &state,
            StatusCode::BAD_REQUEST,
            format!("lineage range: from ({from}) must be <= to ({to})"),
        ));
    }
    // BLOB-TRUE as-of branch (dashboard-timeline ADR as-of lineage form). When
    // the client supplies `t`, the lineage must reflect the graph AS IT EXISTED
    // at instant T — resolved from the git object DB — not the live graph
    // creation-date-gated by range. Resolve the historical graph the SAME way
    // `graph_asof` does (scoped to the served worktree, NOT the ref label —
    // §5/2026-06-13 hardening), then run the graph-agnostic lineage projection
    // over it. The slice stays bounded + self-consistent + enveloped, and the
    // resolved sha + token interpretation are echoed so a client learns which
    // commit T landed on without re-deriving (ADD-901, consistency with
    // `graph_asof`). Read-and-infer: this reads history and projects, mints no
    // semantics, writes nothing.
    // The relation-overlay opt-in: default false (dated marks only). The default
    // present read is nodes-only and served from the per-generation cache below.
    let include_arcs = params.include_arcs.unwrap_or(false);
    if let Some(t) = params.t.as_deref() {
        let scope = cell.scope.clone();
        // Route through the scope's by-sha as-of cache (the same path /graph/asof
        // and /graph/diff use): a revisit to a recently-seen commit reuses the
        // cached graph (or the declared-tier reuse) instead of re-running the
        // ~35s re-index. Resolution stays FRESH per token so the echo carries
        // this request's own interpretation (ADD-901; the sha-keyed cache carries
        // no token reading).
        let (resolved_sha, interpretation) =
            engine_graph::asof::resolve_ref_interpreted(&cell.root, t)
                .map_err(|e| super::revision_error(&state, t, &e))?;
        let resolved = cell
            .asof_graph(&resolved_sha)
            .map_err(|e| super::revision_error(&state, t, &e))?;
        let slice = engine_query::lineage::lineage(
            &resolved.asof.graph,
            &scope,
            params.from.as_deref(),
            params.to.as_deref(),
            filter,
            include_arcs,
        )
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
        // Historical tiers: semantic present-only/excluded and structural
        // degraded-to-stale-at-T — the SAME `asof_tiers_block` treatment the
        // as-of / diff paths carry, so an as-of lineage matches an as-of keyframe
        // exactly. Built through the shared envelope (tiers on success AND error).
        return Ok(super::envelope(
            json!({
                "t": t,
                // Echo the resolved commit + token reading (ADD-901), as
                // `graph_asof` does: the client learns which commit T resolved to
                // and how the engine read the token (a revision/timestamp reading
                // can collide on an all-digit value).
                "resolved_sha": resolved_sha,
                "interpretation": interpretation,
                "nodes": slice.nodes,
                "arcs": slice.arcs,
                "truncated": slice.truncated,
            }),
            serde_json::to_value(engine_query::envelope::asof_tiers_block())
                .expect("tiers serialize"),
            None,
        ));
    }

    // Present-range lineage over THIS scope's live graph. The timeline is a
    // SERVER-BACKED PROJECTION CACHE, not a hot interactive recompute
    // (cache-until-invalidated): the DEFAULT read (no filter, nodes-only) is
    // served from the per-generation lineage-node cache as a cheap range slice —
    // a scroll/zoom re-slices the warm node set and iterates NO edges and touches
    // NO disk. Only a FILTERED or arcs-requested read flows through the full
    // projection (the filter changes the member set; arcs need the edge scan).
    // The slice stays bounded under the document node ceiling either way; a bad
    // filter facet surfaces as a client error through the shared envelope.
    let generation = cell.generation.load(std::sync::atomic::Ordering::SeqCst);
    let (nodes, arcs, truncated) = if !include_arcs
        && filter == engine_query::filter::Filter::default()
    {
        // Warm path: range-slice the cached full node set. No graph scan.
        let all = cell.lineage_nodes();
        let (nodes, truncated) =
            engine_query::lineage::bound_range(&all, params.from.as_deref(), params.to.as_deref());
        (
            serde_json::to_value(&nodes).expect("lineage nodes serialize"),
            Value::Array(Vec::new()),
            serde_json::to_value(&truncated).expect("truncated serializes"),
        )
    } else {
        let graph = cell.graph_arc();
        let slice = engine_query::lineage::lineage(
            &graph,
            &cell.scope,
            params.from.as_deref(),
            params.to.as_deref(),
            filter,
            include_arcs,
        )
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
        (
            serde_json::to_value(&slice.nodes).expect("lineage nodes serialize"),
            serde_json::to_value(&slice.arcs).expect("lineage arcs serialize"),
            serde_json::to_value(&slice.truncated).expect("truncated serializes"),
        )
    };
    // The semantic tier is present-only in the range lineage (ADR; mirrors the
    // as-of view): the success envelope marks semantic unavailable with that
    // reason while overlaying the cell's REAL declared-tier status, so a degraded
    // declared tier is reported truthfully per scope rather than defaulted true.
    Ok(super::envelope(
        json!({
            // The present view echoes neither field, so a client never reads a
            // resolution that did not happen (mirrors the graph_query present
            // branch's null echoes).
            "resolved_sha": Value::Null,
            "interpretation": Value::Null,
            "nodes": nodes,
            "arcs": arcs,
            "truncated": truncated,
            // The graph generation the projection was read at: the client's cache
            // identity for the timeline. A scroll/zoom at the SAME generation is a
            // warm read; a watcher rebuild bumps it and the client re-fetches. It
            // enters no node/edge stable key (mirrors `/graph/embeddings`).
            "generation": generation,
        }),
        super::degraded_tiers(
            &cell,
            "present-only by design; excluded from the range lineage",
        ),
        None,
    ))
}

#[derive(Deserialize)]
pub struct DiffParams {
    pub scope: String,
    pub from: String,
    pub to: String,
    /// `document` (default) or `feature` — feature returns the projected
    /// meta-edge/feature-node delta log (S50), each entry tagged `feature`.
    #[serde(default)]
    pub granularity: Option<String>,
    /// The active salience lens (graph-node-salience ADR wire amendment): the
    /// `lens` parameter is accepted on `/graph/diff` for wire uniformity and
    /// echoed back; the delta log itself carries node deltas, not a per-node
    /// salience map (a scrub re-keyframes through `/graph/asof`, which serves the
    /// lens-salience). Defaults to status; validated so a bad lens is a 400.
    #[serde(default)]
    pub lens: Option<String>,
}

pub async fn graph_diff(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiffParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let granularity = super::query::parse_granularity(&state, params.granularity.as_deref())?;
    let lens = super::query::parse_lens(&state, params.lens.as_deref())?;
    // BOTH endpoints are scoped to the SAME served worktree so the delta log
    // reflects CONTENT changes (content_hash, presence, lifecycle, edges)
    // between the refs — not the ref LABEL. Using each ref name as the facet
    // scope made every node/edge common to both commits a spurious `change`
    // (2026-06-13: HEAD~3..HEAD reported 8415 changes / 1 add — the diff was
    // useless). The ref distinction lives in `from`/`to` and each entry's `t`.
    // Now the RESOLVED cell's scope/root (W02.P05.S17).
    let scope = cell.scope.clone();
    // Equal-ref fast path: if `from` and `to` resolve to the SAME commit (the
    // common `HEAD` vs its sha case, or a degenerate request), the delta log is
    // empty by definition — return it without building either as-of graph,
    // which on a large corpus each cost ~20s (sweep HIGH, 2026-06-13). Resolve
    // is cheap (no tree walk / no core subprocess); a resolve failure falls
    // through to the build path so the existing per-ref error shaping fires.
    if let (Ok(from_sha), Ok(to_sha)) = (
        engine_graph::asof::resolve_ref(&cell.root, &params.from),
        engine_graph::asof::resolve_ref(&cell.root, &params.to),
    ) && from_sha == to_sha
    {
        // Even the empty-delta fast path echoes the resolved shas (ADD-901):
        // a client that diffed `HEAD` against its sha still learns both
        // endpoints resolved to the same commit, not a silent empty log.
        return Ok(super::envelope(
            json!({
                "deltas": [],
                "last_seq": 0,
                "clock": "result-local",
                "from_resolved_sha": from_sha,
                "to_resolved_sha": to_sha,
                "lens": lens.as_str(),
            }),
            serde_json::to_value(engine_query::envelope::asof_tiers_block())
                .expect("tiers serialize"),
            None,
        ));
    }
    // Echo each endpoint's resolved sha + interpretation (ADD-901), additive
    // to the existing delta log. Route the historical build through the scope's
    // by-sha as-of cache (the same path /graph/asof uses): a diff between two
    // recently-visited or recently-indexed commits reuses the cached graph (or
    // the declared-tier reuse) instead of re-running the ~35s re-index for BOTH
    // endpoints from scratch — the dominant cost of a scrub. Resolution stays
    // FRESH per token so each endpoint echoes its own interpretation while
    // sharing the sha-keyed graph (ADD-901; the cache carries no token reading).
    let (from_sha, from_interpretation) =
        engine_graph::asof::resolve_ref_interpreted(&cell.root, &params.from)
            .map_err(|e| super::revision_error(&state, &params.from, &e))?;
    let (to_sha, to_interpretation) =
        engine_graph::asof::resolve_ref_interpreted(&cell.root, &params.to)
            .map_err(|e| super::revision_error(&state, &params.to, &e))?;
    let from_resolved = cell
        .asof_graph(&from_sha)
        .map_err(|e| super::revision_error(&state, &params.from, &e))?;
    let to_resolved = cell
        .asof_graph(&to_sha)
        .map_err(|e| super::revision_error(&state, &params.to, &e))?;
    let from_graph = &from_resolved.asof.graph;
    let to_graph = &to_resolved.asof.graph;

    // Historical diffs number RESULT-LOCALLY (audit N2): a scrub must
    // never burn live-clock positions or manufacture stream gaps. Only
    // `commit_graph` advances the shared atomic; `last_seq` here is the
    // local log's end, and splicing to LIVE goes through a present
    // keyframe + the stream's own sequence space. At `feature` granularity the
    // engine projects the document diff to the constellation species (S50), so
    // a scrub re-keyframes and replays in its own species; entries are tagged.
    let t = crate::app::now_ms();
    let (deltas, last_seq) = match granularity {
        engine_query::graph::Granularity::Document => {
            let log = engine_graph::diff::diff(from_graph, to_graph, t, 0);
            (
                serde_json::to_value(&log.entries).expect("deltas serialize"),
                log.last_seq,
            )
        }
        engine_query::graph::Granularity::Feature => {
            let (entries, last_seq) =
                engine_query::graph::feature_delta(from_graph, to_graph, &scope, t, 0);
            (Value::Array(entries), last_seq)
        }
    };
    Ok(super::envelope(
        json!({
            "deltas": deltas,
            "last_seq": last_seq,
            "clock": "result-local",
            // Additive (ADD-901): the resolved commit + token reading for each
            // endpoint, so a scrub log states which commits it ran between.
            "from_resolved_sha": from_sha,
            "to_resolved_sha": to_sha,
            "from_interpretation": from_interpretation,
            "to_interpretation": to_interpretation,
            // The active lens echoed (graph-node-salience ADR wire amendment).
            "lens": lens.as_str(),
        }),
        serde_json::to_value(engine_query::envelope::asof_tiers_block()).expect("tiers serialize"),
        None,
    ))
}
