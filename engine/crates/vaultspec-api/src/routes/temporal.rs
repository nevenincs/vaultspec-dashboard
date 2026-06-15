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
    // Event sourcing shared with the CLI verb via the query core (G7). Scoped
    // to the resolved cell's worktree (W02.P05.S17).
    let workspace = ingest_git::workspace::Workspace::discover(&cell.root)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // Node correlation bounded to graph-known nodes + the code-id cap
    // (addendum S05) — commit pulses address nodes the stage can light.
    let graph = cell.graph_arc();
    let mut rows: Vec<EventRow> =
        engine_query::events::commit_rows(&workspace, "HEAD", 5000, Some(&graph))
            .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e))?;
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
}

pub async fn graph_asof(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AsofParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let granularity = super::query::parse_granularity(&state, params.granularity.as_deref())?;
    let lens = super::query::parse_lens(&state, params.lens.as_deref())?;
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
    let resolved = engine_graph::asof::asof_graph_resolved(&cell.root, &params.t, &scope, 0)
        .map_err(|e| super::revision_error(&state, &params.t, &e))?;
    let mut slice = engine_query::graph::graph_query(
        &resolved.graph,
        &scope,
        engine_query::filter::Filter::default(),
        granularity,
    )
    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // Attach the active-lens salience to the historical document nodes (ADR wire
    // amendment: lens on /graph/asof). The basis is computed over the HISTORICAL
    // graph (the live per-generation cache holds the present view); the as-of
    // tiers block already flags the historical degradation, and the salience
    // partial flag inherits the structural-degraded-at-T note. Document
    // granularity only — feature-convergence nodes are not salience-ranked.
    if granularity == engine_query::graph::Granularity::Document {
        let members: Vec<&engine_model::Node> = resolved
            .graph
            .nodes()
            .filter(|n| n.facets.iter().any(|f| f.scope == scope))
            .collect();
        let basis = engine_query::salience::LensBasis::compute(&resolved.graph, &scope, &members);
        // Historical structural resolution degrades to stale at T (the as-of
        // tiers block says so), so the salience is computed partial for honesty.
        let focus = params
            .focus
            .as_ref()
            .map(|f| engine_model::NodeId(f.clone()));
        let scores = engine_query::salience::compute_salience(
            &basis,
            &resolved.graph,
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
            "resolved_sha": resolved.resolved_sha,
            "interpretation": resolved.interpretation,
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
    // Present-range lineage over THIS scope's live graph (mirrors the
    // graph_query present branch + the events handler). The projection bounds
    // the slice under its document node ceiling and returns only edges among
    // kept nodes; a bad filter facet (unknown tier/relation/state) surfaces as a
    // client error through the shared envelope.
    let graph = cell.graph_arc();
    let slice = engine_query::lineage::lineage(
        &graph,
        &cell.scope,
        params.from.as_deref(),
        params.to.as_deref(),
        filter,
    )
    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // The semantic tier is present-only in the range lineage (ADR; mirrors the
    // as-of view): the success envelope marks semantic unavailable with that
    // reason while overlaying the cell's REAL declared-tier status, so a degraded
    // declared tier is reported truthfully per scope rather than defaulted true.
    Ok(super::envelope(
        json!({
            "nodes": slice.nodes,
            "arcs": slice.arcs,
            "truncated": slice.truncated,
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
    // to the existing delta log.
    let from_resolved =
        engine_graph::asof::asof_graph_resolved(&cell.root, &params.from, &scope, 0)
            .map_err(|e| super::revision_error(&state, &params.from, &e))?;
    let to_resolved = engine_graph::asof::asof_graph_resolved(&cell.root, &params.to, &scope, 0)
        .map_err(|e| super::revision_error(&state, &params.to, &e))?;
    let from_graph = &from_resolved.graph;
    let to_graph = &to_resolved.graph;

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
            "from_resolved_sha": from_resolved.resolved_sha,
            "to_resolved_sha": to_resolved.resolved_sha,
            "from_interpretation": from_resolved.interpretation,
            "to_interpretation": to_resolved.interpretation,
            // The active lens echoed (graph-node-salience ADR wire amendment).
            "lens": lens.as_str(),
        }),
        serde_json::to_value(engine_query::envelope::asof_tiers_block()).expect("tiers serialize"),
        None,
    ))
}
