//! Landscape and graph query endpoints (contract §3–§4, W03.P11.S49).

use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{NodeId, Tier};
use engine_query::filter::{Filter, vocabulary};
use engine_query::graph::{
    Granularity, MAX_GRAPH_NODES, bound_slice, graph_query, graph_query_cached,
};
use serde::Deserialize;
use serde_json::{Value, json};

use std::sync::Arc as StdArc;

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Resolve the per-request scope to its warm cell (contract §3, W02.P04.S15 +
/// W02.P05.S16). The scope is no longer compared to ONE frozen value: it is
/// resolved through the registry to any selectable vault-bearing worktree in
/// this workspace, building the cell on first access. An unknown or non-vault
/// scope still 400s honestly with the tiers block attached.
pub fn validate_scope(
    state: &AppState,
    scope: &str,
) -> Result<StdArc<ScopeCell>, (StatusCode, Json<Value>)> {
    crate::registry::get_or_build(state, scope)
        .map_err(|reason| super::api_error(state, StatusCode::BAD_REQUEST, reason))
}

fn rag_tiers(cell: &ScopeCell) -> Value {
    // Every front door must report ALL FOUR tiers truthfully (M-A3), and the
    // declared tier must reflect ACTUAL core ingestion, never hardcoded true
    // (M-D1). This helper used to build the block from rag discovery alone, so
    // the 8 query routes that use it advertised declared:true even when core
    // was unreachable — contradicting /status for the same state (LENSA-01).
    // Delegate to the shared query_tiers, which overlays the cell's
    // declared_status for THIS resolved scope.
    super::query_tiers(cell)
}

#[derive(Deserialize)]
pub struct ScopeParam {
    pub scope: String,
}

// --- GET /map ----------------------------------------------------------------

/// The optional `workspace=` selector (dashboard-workspace-registry ADR,
/// P02.S07). Absent or `"active"` lists the active workspace (the unchanged
/// single-workspace default); a registered workspace id lists that root; an
/// unknown id 400s honestly.
#[derive(Deserialize, Default)]
pub struct MapParams {
    #[serde(default)]
    pub workspace: Option<String>,
}

pub async fn map(State(state): State<Arc<AppState>>, Query(params): Query<MapParams>) -> ApiResult {
    // /map is workspace-level: it enumerates every worktree of the chosen
    // registered root. The optional `workspace=` parameter selects WHICH root —
    // defaulting to the active workspace, so the existing single-workspace
    // behaviour is the unchanged `workspace=active` case. The root is resolved
    // READ-ONLY through the registry; discovery never mutates anything.
    let root =
        crate::routes::registry::resolve_map_workspace_root(&state, params.workspace.as_deref())?;
    let workspace = ingest_git::workspace::Workspace::discover(&root)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let config = ingest_git::branches::ClassifyConfig::default();
    let worktrees: Vec<Value> = ingest_git::worktrees::enumerate(&workspace)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?
        .into_iter()
        .map(|wt| {
            json!({
                "path": super::scope_token(&wt.path),
                "head_ref": wt.head_ref,
                "dirty": wt.dirty,
                "is_main": wt.is_main,
                "has_vault": wt.path.join(".vault").is_dir(),
                "ahead": wt.ahead,
                "behind": wt.behind,
            })
        })
        .collect();
    let class = |c: ingest_git::branches::BranchClass| match c {
        ingest_git::branches::BranchClass::Default => "default",
        ingest_git::branches::BranchClass::Feature => "feature",
        ingest_git::branches::BranchClass::Other => "other",
    };
    let branches: Vec<Value> = ingest_git::branches::local_branches(&workspace, &config)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?
        .into_iter()
        .map(|b| json!({"name": b.name, "class": class(b.class)}))
        .collect();
    let remotes: Vec<Value> = ingest_git::branches::remote_refs(&workspace, &config)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?
        .into_iter()
        .map(|b| json!({"name": b.name, "class": class(b.class), "degraded": b.degraded_tiers}))
        .collect();
    // Corpus views + scope-token documentation (L2 + D6.1 parity with the
    // CLI map verb).
    let corpus_views: Vec<Value> = worktrees
        .iter()
        .filter(|wt| wt["has_vault"].as_bool().unwrap_or(false))
        .map(|wt| json!({"worktree": wt["path"], "head_ref": wt["head_ref"]}))
        .collect();
    Ok(super::envelope(
        json!({
            "workspace": super::scope_token(&workspace.common_dir),
            "worktrees": worktrees,
            "branches": branches,
            "remote_refs": remotes,
            "corpus_views": corpus_views,
            // The documented scope-token grammar (L2): what every
            // scope= parameter accepts.
            "scope_token_format": "absolute worktree path, forward slashes, no extended-length prefix",
        }),
        rag_tiers(&state.active_cell()),
        None,
    ))
}

// --- GET /vault-tree?scope= ---------------------------------------------------

#[derive(Deserialize)]
pub struct VaultTreeParams {
    pub scope: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub page_size: Option<usize>,
}

pub async fn vault_tree(
    State(state): State<Arc<AppState>>,
    Query(params): Query<VaultTreeParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let graph = cell.graph_arc();
    let mut entries: Vec<Value> = graph
        .nodes()
        .filter(|n| n.id.0.starts_with("doc:"))
        .map(|n| {
            // Plan lifecycle progress for THIS scope (dashboard-pipeline-wire):
            // read from the SAME `lifecycle_in_scope` facet the node-graph
            // pipeline projection consumes (`engine_query::pipeline::in_flight`),
            // never recomputed differently. Read-and-infer projection — no
            // mutation. Present only on plan rows that carry checkbox progress;
            // truthfully absent everywhere else so the client paints the honest
            // not-started baseline rather than guessing a ✓/◐.
            let progress = engine_graph::lifecycle_in_scope(n, &cell.scope)
                .and_then(|l| l.progress)
                .map(|p| json!({ "done": p.done, "total": p.total }));
            json!({
                "stem": n.key,
                "node_id": n.id.0,
                "feature_tags": n.feature_tags,
                // Contract §4 list fields server-side (addendum S04) —
                // the client never derives doc_type from stem suffixes.
                "title": n.title,
                "doc_type": n.doc_type,
                "dates": n.dates,
                // Status/tier query-time facets (dashboard-pipeline-wire W01):
                // forwarded so an ADR carries its status and a plan its tier.
                "status": n.status,
                "tier": n.tier,
                // Plan checkbox progress (done/total); null on every non-plan
                // row and on plans with no checkboxes (truthful absence).
                "progress": progress,
            })
        })
        .collect();
    entries.sort_by_key(|e| e["stem"].as_str().unwrap_or_default().to_string());
    // Cursor pagination on the unbounded listing (contract §2, audit N8).
    // Clamp the page size (robustness M2): a client-supplied page_size must not
    // defeat the cursor cap and pull the whole listing in one response. 2000 is
    // a generous upper bound; the default stays 500.
    let page_size = params.page_size.unwrap_or(500).min(2000);
    let (page, next_cursor) = engine_query::envelope::paginate(
        &entries,
        |e| e["stem"].as_str().unwrap_or_default(),
        params.cursor.as_deref(),
        page_size,
    );
    Ok(super::envelope(
        json!({"entries": page}),
        rag_tiers(&cell),
        next_cursor,
    ))
}

// --- POST /graph/query ----------------------------------------------------------

#[derive(Deserialize)]
pub struct GraphQueryBody {
    pub scope: String,
    #[serde(default)]
    pub filter: Option<Filter>,
    #[serde(default)]
    pub granularity: Option<String>,
    #[serde(default)]
    pub as_of: Option<String>,
    /// The active salience lens (graph-node-salience ADR wire amendment):
    /// `status` (default when omitted) or `design`. The stores layer owns the
    /// active-lens view state and sends it here; switching lens is a re-query.
    #[serde(default)]
    pub lens: Option<String>,
    /// The focus node id for the DOI focus-distance term (folded into the
    /// warm-started PPR). Absent = no focus (DOI == a-priori importance).
    #[serde(default)]
    pub focus: Option<String>,
}

/// Parse the `lens` request parameter, defaulting to the status lens when
/// omitted (ADR: "defaulted to the status lens when omitted"). An unrecognized
/// lens is a tiered 400, not a silent default.
pub(crate) fn parse_lens(
    state: &AppState,
    raw: Option<&str>,
) -> Result<engine_query::salience::Lens, (StatusCode, Json<Value>)> {
    engine_query::salience::Lens::parse(raw).ok_or_else(|| {
        super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("unknown lens `{}`", raw.unwrap_or("")),
        )
    })
}

/// Which tiers are unavailable in this cell's served tiers block, as the slice of
/// names the salience partial-flag reads (graph-node-salience: degradation is
/// read from the tiers block, not guessed). Reads the same `query_tiers` block
/// the response carries so the flag and the block agree.
fn unavailable_tier_names(tiers: &Value) -> Vec<&'static str> {
    let mut out = Vec::new();
    for tier in ["declared", "structural", "temporal", "semantic"] {
        let available = tiers
            .get(tier)
            .and_then(|t| t.get("available"))
            .and_then(|a| a.as_bool())
            .unwrap_or(true);
        if !available {
            out.push(tier);
        }
    }
    out
}

/// Parse the engine-owned granularity parameter (contract §4): document-level
/// edges, or feature-convergence nodes + meta-edges. Absent defaults to
/// `document`, mirroring the live engine. Shared by `/graph/query` and
/// `/graph/asof` so a historical slice can be requested in the SAME species as
/// the live constellation (feature) — closing the asof/diff species mismatch
/// (S50) that kept the constellation from time-travelling.
pub(crate) fn parse_granularity(
    state: &AppState,
    raw: Option<&str>,
) -> Result<Granularity, (StatusCode, Json<Value>)> {
    match raw {
        None | Some("document") => Ok(Granularity::Document),
        Some("feature") => Ok(Granularity::Feature),
        Some(other) => Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("unknown granularity `{other}`"),
        )),
    }
}

// The document/graph node ceiling and the slice-bounding helper now live in
// `engine_query::graph` (imported above) so EVERY engine front door — this HTTP
// route AND the CLI `graph` verb — bounds identically (graph-queries-are-bounded
// -by-default). The `bound_tests` below exercise that shared helper.

#[cfg(test)]
mod bound_tests {
    use super::*;
    use engine_query::graph::GraphSlice;

    fn node_ids(prefix: &str, n: usize) -> Vec<Value> {
        (0..n)
            .map(|i| json!({"id": format!("{prefix}:{i:06}")}))
            .collect()
    }

    fn slice_of(prefix: &str, n: usize) -> GraphSlice {
        GraphSlice {
            nodes: node_ids(prefix, n),
            edges: Vec::new(),
            meta_edges: Vec::new(),
            filter: Filter::default(),
        }
    }

    #[test]
    fn slice_under_ceiling_is_untouched() {
        let mut s = slice_of("doc", 100);
        assert_eq!(bound_slice(&mut s), None);
        assert_eq!(s.nodes.len(), 100, "small slice served whole");
    }

    #[test]
    fn slice_over_ceiling_truncates_and_reports_total() {
        let mut s = slice_of("doc", MAX_GRAPH_NODES + 1000);
        assert_eq!(
            bound_slice(&mut s),
            Some(MAX_GRAPH_NODES + 1000),
            "the original total is reported for an honest truncated block"
        );
        assert_eq!(
            s.nodes.len(),
            MAX_GRAPH_NODES,
            "node payload is hard-bounded at the ceiling"
        );
    }

    #[test]
    fn doi_ordered_truncation_keeps_the_top_salience_nodes() {
        // graph-node-salience W03.P08.S31: when the active-lens DOI orders the
        // document nodes, MAX_GRAPH_NODES truncation keeps the TOP-DOI nodes for
        // the lens. Build a slice over the ceiling, give one specific node a high
        // salience, order by salience, then bound — it must survive.
        use engine_query::salience::SalienceScores;
        let mut s = slice_of("doc", MAX_GRAPH_NODES + 10);
        // The highest-numbered id sorts LAST by id, so without DOI ordering it
        // would be the first dropped. Give it the top salience.
        let survivor = format!("doc:{:06}", MAX_GRAPH_NODES + 9);
        let mut scores = SalienceScores::default();
        scores.by_id.insert(survivor.clone(), 1.0);
        engine_query::salience::order_by_salience(&mut s.nodes, &scores);
        let total = bound_slice(&mut s);
        assert_eq!(total, Some(MAX_GRAPH_NODES + 10));
        assert_eq!(s.nodes.len(), MAX_GRAPH_NODES);
        assert_eq!(
            s.nodes[0]["id"], survivor,
            "the top-DOI node leads the ordered, bounded slice"
        );
        assert!(
            s.nodes.iter().any(|n| n["id"] == survivor),
            "the top-salience node survives DOI-ordered truncation"
        );
    }

    #[test]
    fn truncation_drops_meta_edges_to_dropped_feature_nodes() {
        // Feature granularity is bounded too: capping feature nodes must drop
        // any meta-edge whose endpoint was truncated, or the constellation
        // would carry dangling edges (boundary self-consistency).
        let meta = |src: &str, dst: &str| engine_graph::MetaEdge {
            src: src.to_string(),
            dst: dst.to_string(),
            src_feature: "x".into(),
            dst_feature: "y".into(),
            count: 1,
            breakdown_by_tier: Default::default(),
        };
        let dropped = format!("feature:{:06}", MAX_GRAPH_NODES + 1);
        let mut s = GraphSlice {
            nodes: node_ids("feature", MAX_GRAPH_NODES + 1000),
            edges: Vec::new(),
            meta_edges: vec![
                meta("feature:000000", "feature:000001"), // both kept
                meta("feature:000000", &dropped),         // endpoint truncated
            ],
            filter: Filter::default(),
        };
        assert_eq!(bound_slice(&mut s), Some(MAX_GRAPH_NODES + 1000));
        assert_eq!(s.nodes.len(), MAX_GRAPH_NODES);
        assert_eq!(
            s.meta_edges.len(),
            1,
            "the meta-edge to a truncated feature node was dropped"
        );
        assert_eq!(
            s.meta_edges[0].dst, "feature:000001",
            "consistent meta-edge survived"
        );
    }
}

pub async fn graph_query_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<GraphQueryBody>,
) -> ApiResult {
    let cell = validate_scope(&state, &body.scope)?;
    let granularity = parse_granularity(&state, body.granularity.as_deref())?;
    let lens = parse_lens(&state, body.lens.as_deref())?;
    let filter = body.filter.unwrap_or_default();

    // The as_of branch carries the resolution facts the response must echo
    // (ADD-901): the 40-char `resolved_sha` and the chosen `interpretation`
    // (revision vs ms-timestamp). Mirrors /graph/asof + /graph/diff so the
    // /graph/query historical path no longer makes a client re-derive how its
    // `as_of` token was read. None for the present view (M-F1).
    let (mut slice, tiers, resolution) = match &body.as_of {
        // Blob-true historical view (D7.3) with its fidelity-stating block.
        Some(reference) => {
            let scope = engine_model::ScopeRef::Ref {
                name: reference.clone(),
            };
            let resolved =
                engine_graph::asof::asof_graph_resolved(&cell.root, reference, &scope, 0)
                    .map_err(|e| super::revision_error(&state, reference, &e))?;
            let slice = graph_query(&resolved.graph, &scope, filter, granularity)
                .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
            let tiers = serde_json::to_value(engine_query::envelope::asof_tiers_block())
                .expect("tiers serialize");
            (
                slice,
                tiers,
                Some((resolved.resolved_sha, resolved.interpretation)),
            )
        }
        None => {
            let graph = cell.graph_arc();
            let slice = match granularity {
                // Document: reuse the per-generation enriched node/edge views so
                // repeat and concurrent Document queries skip the dominant
                // projection cost (perf-sweep A1). Filtering/sorting still run
                // per request; only the heavy per-item projection is memoized.
                Granularity::Document => {
                    let views = cell.document_views();
                    graph_query_cached(
                        &graph,
                        &cell.scope,
                        filter,
                        granularity,
                        &views.0,
                        &views.1,
                        &views.2,
                    )
                    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?
                }
                // Constellation meta-edges come from the memoized projection
                // (W02P05-203) — same content, one aggregation per rebuild.
                Granularity::Feature => {
                    let mut s =
                        graph_query(&graph, &cell.scope, filter, granularity).map_err(|e| {
                            super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string())
                        })?;
                    s.meta_edges = (*cell.meta_edges()).clone();
                    s
                }
            };
            (slice, rag_tiers(&cell), None)
        }
    };
    // Live keyframe clock anchor (constellation-live-delta ADR / S50): the
    // cell's delta clock tip at query time, so a held keyframe (either
    // granularity) splices live `graph` deltas with no gap. An `as_of`
    // (historical) keyframe carries no live-clock position. The clock is now
    // per-scope (W02.P04.S12): the keyframe anchors to THIS scope's resume
    // sequence so per-scope `since=` resume is correct.
    let last_seq = match &body.as_of {
        Some(_) => Value::Null,
        None => Value::from(
            cell.seq
                .load(std::sync::atomic::Ordering::SeqCst)
                .saturating_sub(1),
        ),
    };
    // Active-lens salience (graph-node-salience ADR): compute the per-lens DOI
    // over the bounded subgraph and attach the single active-lens `salience`
    // float to each served DOCUMENT node, then order document nodes by descending
    // DOI so the MAX_GRAPH_NODES truncation keeps the top-DOI nodes for the active
    // lens and focus. Feature-granularity nodes are not salience-ranked (the model
    // ranks documents), so they keep their id order. Historical (`as_of`) views
    // carry no live basis — the basis is memoized per the LIVE graph generation —
    // so salience attaches only to the present view.
    let mut salience_partial = false;
    if granularity == Granularity::Document && body.as_of.is_none() {
        let basis = cell.salience_basis();
        let focus = body.focus.as_ref().map(|f| engine_model::NodeId(f.clone()));
        // The partial flag is read from the TIERS BLOCK (graph-node-salience /
        // degradation-is-read-from-tiers), never guessed: a salience computed
        // while a relevant tier is degraded is flagged partial, never presented
        // as a complete ranking.
        salience_partial =
            engine_query::salience::is_partial(lens, &unavailable_tier_names(&tiers));
        let scores = engine_query::salience::compute_salience(
            &basis,
            &cell.graph_arc(),
            lens,
            focus.as_ref(),
            crate::app::now_ms(),
            salience_partial,
        );
        engine_query::salience::annotate_nodes(&mut slice.nodes, &scores);
        engine_query::salience::order_by_salience(&mut slice.nodes, &scores);
    }
    // Bound the payload at BOTH granularities (perf ADR D2): the feature
    // constellation is normally bounded by feature count, but a pathological tag
    // vocabulary could explode it, so the ceiling is unconditional — every graph
    // read is bounded. For the active-lens document view the nodes are already
    // ordered by descending DOI, so the truncation keeps the TOP-salience nodes
    // for the lens and focus (ADR: lens-dependent DOI truncation).
    let truncated = bound_slice(&mut slice).map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": MAX_GRAPH_NODES,
            "reason": "graph node ceiling: narrow with a filter; the feature \
                       constellation is the smallest view",
        })
    });
    // Additive (ADD-901): when `as_of` is set, echo the commit the token
    // resolved to and how the token was read — the same two fields /graph/asof
    // and /graph/diff already carry. Absent on the present view (no as_of),
    // where there is no token to resolve. All existing fields are preserved.
    let (resolved_sha, interpretation) = match resolution {
        Some((sha, interp)) => (
            Value::from(sha),
            serde_json::to_value(interp).expect("interpretation serializes"),
        ),
        None => (Value::Null, Value::Null),
    };
    Ok(super::envelope(
        json!({
            "nodes": slice.nodes,
            "edges": slice.edges,
            "meta_edges": slice.meta_edges,
            "filter": slice.filter,
            "as_of": body.as_of,
            "resolved_sha": resolved_sha,
            "interpretation": interpretation,
            "last_seq": last_seq,
            "truncated": truncated,
            // The active lens the salience was computed for, echoed so the client
            // never has to re-derive which lens it is rendering (ADR wire
            // amendment). Defaults to status when the request omitted it.
            "lens": lens.as_str(),
            // Honest partiality (ADR Constraints): true when the salience was
            // computed over fewer than all relevant tiers (a degraded tier), so
            // the client renders it as a partial ranking, never a complete one.
            // The degraded tier itself is named in the `tiers` block above.
            "salience_partial": salience_partial,
        }),
        tiers,
        None,
    ))
}

// --- GET /graph/embeddings?scope= -------------------------------------------------

#[derive(Deserialize)]
pub struct EmbeddingsParams {
    pub scope: String,
    /// The active salience lens (kept consistent with `/graph/query`'s DOI
    /// selection so the embedding set matches the served node set, ADR D2 / open
    /// question). Defaults to status when omitted.
    #[serde(default)]
    pub lens: Option<String>,
    /// The DOI focus node id, folded into the same salience ordering
    /// `/graph/query` uses so the bounded embedding slice aligns with the bounded
    /// constellation slice.
    #[serde(default)]
    pub focus: Option<String>,
}

/// The per-socket inactivity timeout on each Qdrant scroll round-trip
/// (subprocess-calls-carry-cap-and-timeout HTTP-read analog, ADR open question):
/// the transport's `set_read_timeout`/`set_write_timeout`, bounding how long a
/// single page may stall with no bytes. It is NOT an overall deadline on its own —
/// a 64-page scroll could otherwise accrue 64 × this — so `read_embeddings` is also
/// handed a true overall wall-clock budget (`EMBEDDING_SCROLL_BUDGET`) that bounds
/// the whole multi-page read. Together with `MAX_RAG_BODY` (the per-page byte cap),
/// a stalled or runaway Qdrant cannot hang or OOM the engine; a breach degrades the
/// semantic tier (no vectors), never blocks the request.
const EMBEDDING_READ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// The OVERALL wall-clock budget for the entire multi-page embedding scroll (W04
/// review): the true bound the per-socket inactivity timeout alone cannot give.
/// Generous enough for the realistic ~1525-doc vault slice in a few round-trips,
/// while capping the pathological many-page stall well below the worst case of
/// `SCROLL_MAX_PAGES × EMBEDDING_READ_TIMEOUT`.
const EMBEDDING_SCROLL_BUDGET: std::time::Duration = std::time::Duration::from_secs(45);

/// The dedicated bounded embedding route (graph-semantic-embeddings ADR D2): the
/// stored rag dense vectors for the SERVED document node set, keyed by node id,
/// as raw float32 JSON `number[]` (ADR D3 — no server-side reduction, ADR D4),
/// capped at `MAX_GRAPH_NODES` with an honest `truncated` block, stamped with the
/// graph generation it was read at (ADR D8 — so the client caches per generation;
/// the embedding enters no node/edge stable key). Built through the shared
/// envelope helper so success AND the rag-down degradation both carry the tiers
/// block (every-wire-response-carries-the-tiers-block). NEVER inline on
/// `/graph/query` — semantic is the non-default mode; the 99% of queries pay no
/// embedding tax (ADR D2). The stores layer fetches this LAZILY only on entering
/// semantic mode and reads semantic availability from the tiers block (ADR D7).
pub async fn graph_embeddings(
    State(state): State<Arc<AppState>>,
    Query(params): Query<EmbeddingsParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let lens = parse_lens(&state, params.lens.as_deref())?;
    let graph = cell.graph_arc();
    let generation = cell.generation.load(std::sync::atomic::Ordering::SeqCst);

    // The SERVED document node set, selected EXACTLY as `/graph/query` selects it
    // at document granularity (same enriched views, same active-lens DOI order,
    // same MAX_GRAPH_NODES bound) so the embedding set matches the constellation's
    // served node set (ADR D2 / open question). Reusing the per-generation cached
    // views keeps this off the hot projection path.
    let views = cell.document_views();
    let mut slice = engine_query::graph::graph_query_cached(
        &graph,
        &cell.scope,
        engine_query::filter::Filter::default(),
        engine_query::graph::Granularity::Document,
        &views.0,
        &views.1,
        &views.2,
    )
    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let tiers = rag_tiers(&cell);
    // DOI-order the document nodes the same way the constellation does, then bound
    // — so the embedding slice's node set is byte-identical to the served graph.
    let basis = cell.salience_basis();
    let focus = params
        .focus
        .as_ref()
        .map(|f| engine_model::NodeId(f.clone()));
    let partial = engine_query::salience::is_partial(lens, &unavailable_tier_names(&tiers));
    let scores = engine_query::salience::compute_salience(
        &basis,
        &graph,
        lens,
        focus.as_ref(),
        crate::app::now_ms(),
        partial,
    );
    engine_query::salience::order_by_salience(&mut slice.nodes, &scores);
    engine_query::graph::bound_slice(&mut slice);
    // Only DOCUMENT nodes carry embeddings (ADR D10): the served set is already
    // document-granularity, so every id is a `doc:` node; collect them in order.
    let served_node_ids: Vec<String> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str().map(str::to_string))
        .collect();

    // Read the stored vectors from rag's Qdrant over loopback HTTP. rag/Qdrant
    // down ⇒ semantic tier Unavailable in the envelope tiers, no vectors returned
    // (ADR D7) — the engine builds no embeddings, ever (ADR D1).
    let vault_root = cell.root.join(".vault");
    let (availability, info) = rag_client::client::discover(&vault_root);
    let rag_client::RagAvailability::Available = availability else {
        let rag_client::RagAvailability::Unavailable { reason } = availability else {
            unreachable!()
        };
        return Ok(super::envelope(
            json!({
                "embeddings": [],
                "generation": generation,
                // No reachable rag ⇒ no freshness epoch to report (ADR D4).
                "semantic_epoch": Value::Null,
                "truncated": Value::Null,
                "lens": lens.as_str(),
            }),
            super::degraded_tiers(&cell, reason.as_str()),
            None,
        ));
    };
    let info = info.expect("available implies info");
    // The semantic freshness epoch (rag-control-plane ADR D4): one bounded
    // `/jobs` read against rag's SERVICE port, reduced to the newest terminal
    // reindex timestamp. It is the rag-side analog of the structural
    // `generation` counter — the embedding VECTOR cache below keys on it so a
    // completed reindex invalidates the served vectors, and the client keys its
    // own cache on the pair (`generation`, `semantic_epoch`). An epoch read that
    // fails (rag service flaking) degrades to `0` (treated as "unknown"): the
    // Qdrant scroll below still serves whatever vectors exist.
    let semantic_epoch = {
        let control = rag_client::client::LoopbackTransport {
            port: info.port,
            bearer: info.service_token.clone(),
            timeout: rag_client::control::READ_BUDGET,
        };
        rag_client::control::semantic_epoch(&control).unwrap_or(0)
    };
    // Embeddings are scrolled DIRECTLY from Qdrant's HTTP port (ADR D1), not rag's
    // service port — discovered the same `service.json` way. The transport carries
    // the MAX_RAG_BODY byte cap (its bounded read) AND a wall-clock deadline (ADR
    // open question: the subprocess-calls-carry-cap-and-timeout HTTP-read analog).
    let transport = rag_client::client::LoopbackTransport {
        port: info.qdrant_port(),
        // Qdrant's loopback HTTP needs no bearer; rag's service token is for rag's
        // own routes. The store is loopback-only by design.
        bearer: None,
        timeout: EMBEDDING_READ_TIMEOUT,
    };
    let deadline = std::time::Instant::now() + EMBEDDING_SCROLL_BUDGET;
    // The Qdrant collection is namespaced by a hash of the scope's resolved root
    // (rag's `r{hash}_vault_docs` scheme) — computed from the project root, the
    // same path rag indexed under.
    let collection = rag_client::vectors::vault_collection_name(&cell.root);
    // Warm-cache the multi-page Qdrant scroll on the semantic epoch (ADR D4 /
    // P03.S18): unchanged epoch ⇒ serve the cached vector map (no scroll); a
    // reindex (advanced epoch) ⇒ re-scroll and re-cache. The cached map is the
    // FULL vault-doc vector set, independent of the per-request lens/focus node
    // selection that happens after, so it is reusable across lens switches.
    let vectors = match cell.embeddings_if_fresh(semantic_epoch) {
        Some(cached) => cached,
        None => {
            let fresh =
                match rag_client::vectors::read_embeddings(&transport, &collection, deadline) {
                    Ok(vectors) => std::sync::Arc::new(vectors),
                    Err(e) => {
                        // Qdrant was reachable through discovery but the scroll itself
                        // failed (store down, timeout, shape-miss): semantic suggestions
                        // are simply unavailable right now. Degrade the semantic tier (no
                        // vectors), never a 500 — the stores layer reads availability from
                        // tiers (ADR D7).
                        let reason = rag_client::search::degradation_reason(&e);
                        return Ok(super::envelope(
                            json!({
                                "embeddings": [],
                                "generation": generation,
                                "semantic_epoch": semantic_epoch,
                                "truncated": Value::Null,
                                "lens": lens.as_str(),
                            }),
                            super::degraded_tiers(&cell, reason.as_str()),
                            None,
                        ));
                    }
                };
            cell.store_embeddings(semantic_epoch, fresh.clone());
            fresh
        }
    };

    let (embedding_slice, truncated_total) =
        engine_query::embeddings::build_embedding_slice(&served_node_ids, &vectors);
    let truncated = truncated_total.map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": engine_query::graph::MAX_GRAPH_NODES,
            "reason": "graph node ceiling: narrow with a filter; the feature \
                       constellation is the smallest view",
        })
    });
    Ok(super::envelope(
        json!({
            "embeddings": embedding_slice.embeddings,
            // The graph generation the vectors were read at (ADR D8): the client
            // caches per generation and re-fetches on change. It is NOT folded
            // into any node or edge stable key.
            "generation": generation,
            // The semantic-index freshness epoch the vectors were scrolled at
            // (rag-control-plane ADR D4): the rag-side analog of `generation`. A
            // completed reindex advances it; the client keys its embedding cache
            // on the (generation, semantic_epoch) PAIR so it re-fetches when
            // EITHER the structural graph or rag's index changed. Like
            // `generation`, it enters no node or edge stable key.
            "semantic_epoch": semantic_epoch,
            "truncated": truncated,
            "lens": lens.as_str(),
        }),
        tiers,
        None,
    ))
}

// --- GET /pipeline?scope= ---------------------------------------------------------

/// The in-flight pipeline projection (dashboard-pipeline-wire W02.P05.S22):
/// resolve the per-request scope to its warm cell, run the bounded `in_flight`
/// projection over that scope's live graph, and return it through the shared
/// envelope helper so the tiers block rides the response (success here, and the
/// unknown-scope 400 via `validate_scope`/`api_error`). The projection is
/// bounded to active artifacts in scope by construction — no node ceiling block
/// is needed because "in-flight" is already the bound.
pub async fn pipeline(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ScopeParam>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let graph = cell.graph_arc();
    let artifacts = engine_query::pipeline::in_flight(&graph, &cell.scope);
    Ok(super::envelope(
        json!({"artifacts": artifacts}),
        rag_tiers(&cell),
        None,
    ))
}

// --- GET /filters?scope= ----------------------------------------------------------

pub async fn filters(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ScopeParam>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    let vocab = vocabulary(&cell.graph_arc());
    Ok(super::envelope(
        json!({"vocabulary": vocab}),
        rag_tiers(&cell),
        None,
    ))
}

// --- /nodes/{id} family --------------------------------------------------------------

pub async fn node_detail(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult {
    // The /nodes/* family carries no scope param: it serves from the active
    // scope's live graph (W02.P05.S16).
    let cell = state.active_cell();
    let graph = cell.graph_arc();
    let detail = engine_query::node::node_detail(&graph, &NodeId(id.clone())).ok_or_else(|| {
        super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        )
    })?;
    Ok(super::envelope(
        json!({"detail": detail}),
        rag_tiers(&cell),
        None,
    ))
}

/// The bounded plan-container interior of a plan node (dashboard-pipeline-wire
/// W03.P08.S43): serves the interior through the shared envelope helper, so the
/// tiers block rides success and the unknown-node 404. Serves from the active
/// scope's live graph like the rest of the /nodes/* family.
pub async fn node_plan_interior(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult {
    let cell = state.active_cell();
    let graph = cell.graph_arc();
    let interior =
        engine_query::node::plan_interior(&graph, &NodeId(id.clone())).ok_or_else(|| {
            // None covers both an unknown node and a node that is not a plan
            // document — a truthful 404 in either case.
            super::api_error(
                &state,
                StatusCode::NOT_FOUND,
                format!("no plan interior for node `{id}`"),
            )
        })?;
    Ok(super::envelope(
        json!({"interior": interior}),
        rag_tiers(&cell),
        None,
    ))
}

#[derive(Deserialize)]
pub struct NeighborParams {
    #[serde(default)]
    pub depth: Option<usize>,
    #[serde(default)]
    pub tiers: Option<String>,
    /// The active salience lens for the ego nodes (graph-node-salience ADR wire
    /// amendment: `lens` on `/nodes/{id}/neighbors`). Defaults to status.
    #[serde(default)]
    pub lens: Option<String>,
}

/// Ego-network depth ceiling (hardening, 2026-06-13 adversarial finding): an
/// unbounded `depth` walks the entire connected component into a single
/// response. The GUI expands one hop at a time; cap the walk server-side so a
/// hostile or accidental `depth=1e9` cannot dump the whole graph.
const MAX_NEIGHBOR_DEPTH: usize = 4;

pub async fn node_neighbors(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<NeighborParams>,
) -> ApiResult {
    let tiers: Vec<Tier> = params
        .tiers
        .as_deref()
        .unwrap_or("")
        .split(',')
        .filter(|t| !t.is_empty())
        .map(|t| match t {
            "declared" => Ok(Tier::Declared),
            "structural" => Ok(Tier::Structural),
            "temporal" => Ok(Tier::Temporal),
            "semantic" => Ok(Tier::Semantic),
            other => Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown tier `{other}`"),
            )),
        })
        .collect::<Result<_, _>>()?;
    let lens = parse_lens(&state, params.lens.as_deref())?;
    let cell = state.active_cell();
    let graph = cell.graph_arc();
    let depth = params.depth.unwrap_or(1).min(MAX_NEIGHBOR_DEPTH);
    let ego = engine_query::node::neighbors(&graph, &NodeId(id.clone()), depth, &tiers)
        .ok_or_else(|| {
            super::api_error(
                &state,
                StatusCode::NOT_FOUND,
                format!("unknown node `{id}`"),
            )
        })?;
    // Attach the active-lens salience to the ego nodes, with the ego center as
    // the DOI focus (graph-node-salience: salience is served through the same
    // shared envelope helper with the tiers block on the neighbors route too).
    let tiers = rag_tiers(&cell);
    let basis = cell.salience_basis();
    let partial = engine_query::salience::is_partial(lens, &unavailable_tier_names(&tiers));
    let focus = NodeId(id.clone());
    let scores = engine_query::salience::compute_salience(
        &basis,
        &graph,
        lens,
        Some(&focus),
        crate::app::now_ms(),
        partial,
    );
    let mut ego_value = serde_json::to_value(&ego).expect("ego serializes");
    if let Some(nodes) = ego_value.get_mut("nodes").and_then(|n| n.as_array_mut()) {
        engine_query::salience::annotate_nodes(nodes, &scores);
    }
    Ok(super::envelope(
        json!({"ego": ego_value, "lens": lens.as_str()}),
        tiers,
        None,
    ))
}

pub async fn node_evidence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult {
    let cell = state.active_cell();
    let graph = cell.graph_arc();
    let mut evidence =
        engine_query::node::evidence(&graph, &NodeId(id.clone())).ok_or_else(|| {
            super::api_error(
                &state,
                StatusCode::NOT_FOUND,
                format!("unknown node `{id}`"),
            )
        })?;
    // S13: enrich the correlated commits with their subjects from a read-only
    // git lookup at the route seam (the pure graph projection has no git
    // access; the commit subject lives in the object DB, exactly as the history
    // route reads it). A scope with no readable workspace, or a sha that does
    // not resolve, leaves the subject empty rather than failing the read — the
    // evidence is still served, and the GUI tolerates an empty subject. This
    // stays read-and-infer: only commit metadata is read, never written.
    if !evidence.commits.is_empty()
        && let Ok(workspace) = ingest_git::workspace::Workspace::discover(&cell.root)
    {
        let shas: Vec<String> = evidence.commits.iter().map(|c| c.sha.clone()).collect();
        if let Ok(subjects) = ingest_git::log::subjects_for(&workspace, &shas) {
            for commit in &mut evidence.commits {
                if let Some(subject) = subjects.get(&commit.sha) {
                    commit.subject = subject.clone();
                }
            }
        }
    }
    // Envelope-consistent with every other endpoint (`{data, tiers}`): the
    // evidence fields sit directly under `data` (matching the mock's flat
    // shape and the inspector's `evidence.data.documents/...` reads), not
    // hand-built as a bare `{evidence, tiers}` body. The item shapes are now
    // aligned to the GUI `NodeEvidence` type (S13): documents carry `{path,
    // doc_type}`, code_locations are keyed on `path`, commits carry `subject`.
    Ok(super::envelope(
        serde_json::to_value(evidence).expect("evidence serializes"),
        rag_tiers(&cell),
        None,
    ))
}

#[derive(Deserialize)]
pub struct DiscoverBody {
    #[serde(default)]
    pub query: Option<String>,
}

pub async fn node_discover(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<DiscoverBody>,
) -> ApiResult {
    // Unknown node is a truthful 404 BEFORE any rag round-trip — consistent
    // with /nodes, /neighbors, /evidence, and never proxies a doomed query
    // (hardening, 2026-06-13 adversarial finding: discover used to 400 via
    // rag for an unknown id while its sibling verbs 404).
    // The /nodes/* family serves from the active scope's live graph + store
    // (W02.P05.S16).
    let cell = state.active_cell();
    let node = NodeId(id.clone());
    let graph = cell.graph_arc();
    if graph.node(&node).is_none() {
        return Err(super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        ));
    }
    let vault_root = cell.root.join(".vault");
    let (availability, info) = rag_client::client::discover(&vault_root);
    let rag_client::RagAvailability::Available = availability else {
        let rag_client::RagAvailability::Unavailable { reason } = availability else {
            unreachable!()
        };
        // Degrades to the §2 tier block, never an error (contract §4).
        return Ok(super::envelope(
            json!({"candidates": []}),
            super::degraded_tiers(&cell, reason.as_str()),
            None,
        ));
    };
    let info = info.expect("available implies info");
    let transport = rag_client::client::LoopbackTransport {
        port: info.port,
        bearer: info.service_token,
        timeout: std::time::Duration::from_secs(30),
    };
    // Node-scoped query: built from the node's own key plus its feature
    // tags (its content + linkage, engine-spec §4.3).
    let query = body.query.unwrap_or_else(|| {
        graph
            .node(&node)
            .map(|n| format!("{} {}", n.key, n.feature_tags.join(" ")))
            .unwrap_or_else(|| id.clone())
    });
    // Poison recovery (robustness H2): a poisoned store lock must degrade, not
    // cascade into a permanent outage on every node-discover request.
    let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
    let candidates = match rag_client::discover::discover(
        &transport,
        &store,
        &node,
        &query,
        &cell.scope,
        crate::app::now_ms(),
    ) {
        Ok(candidates) => candidates,
        Err(e) => {
            // rag was reachable but the query itself failed (scope not
            // indexed, timeout, transient): the NODE exists, so this is not a
            // client error — semantic suggestions are simply unavailable right
            // now. Degrade the `semantic` tier (empty candidates + reason),
            // matching the rag-Unavailable path above and `/search`, never a
            // 400 (hardening, 2026-06-13: an unindexed scope used to 400 here).
            let reason = rag_client::search::degradation_reason(&e);
            return Ok(super::envelope(
                json!({"candidates": []}),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ));
        }
    };
    Ok(super::envelope(
        json!({"candidates": candidates}),
        rag_tiers(&cell),
        None,
    ))
}
