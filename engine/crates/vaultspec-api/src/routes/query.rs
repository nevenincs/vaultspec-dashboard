//! Landscape and graph query endpoints (contract §3–§4, W03.P11.S49).

use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{NodeId, Tier};
use engine_query::filter::{Filter, vocabulary};
use engine_query::graph::{Granularity, GraphSlice, graph_query};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Validate the stateless per-request scope (contract §3). v1 serves one
/// workspace view (the launch worktree); other scopes 400 honestly.
pub fn validate_scope(state: &AppState, scope: &str) -> Result<(), (StatusCode, Json<Value>)> {
    let strip = |s: String| s.strip_prefix("//?/").unwrap_or(&s).to_string();
    let served = strip(state.root.to_string_lossy().replace('\\', "/"));
    let normalized = strip(scope.replace('\\', "/"));
    if normalized == served || normalized.trim_end_matches('/') == served.trim_end_matches('/') {
        Ok(())
    } else {
        Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "scope `{scope}` is not served by this instance (serving `{served}`); \
             v1 serves the launch worktree only"
            ),
        ))
    }
}

fn rag_tiers(state: &AppState) -> Value {
    // Every front door must report ALL FOUR tiers truthfully (M-A3), and the
    // declared tier must reflect ACTUAL core ingestion, never hardcoded true
    // (M-D1). This helper used to build the block from rag discovery alone, so
    // the 8 query routes that use it advertised declared:true even when core
    // was unreachable — contradicting /status for the same state (LENSA-01).
    // Delegate to the shared query_tiers, which overlays declared_status.
    super::query_tiers(state)
}

#[derive(Deserialize)]
pub struct ScopeParam {
    pub scope: String,
}

// --- GET /map ----------------------------------------------------------------

pub async fn map(State(state): State<Arc<AppState>>) -> ApiResult {
    let workspace = ingest_git::workspace::Workspace::discover(&state.root)
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
        rag_tiers(&state),
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
    validate_scope(&state, &params.scope)?;
    let graph = state.graph_arc();
    let mut entries: Vec<Value> = graph
        .nodes()
        .filter(|n| n.id.0.starts_with("doc:"))
        .map(|n| {
            json!({
                "stem": n.key,
                "node_id": n.id.0,
                "feature_tags": n.feature_tags,
                // Contract §4 list fields server-side (addendum S04) —
                // the client never derives doc_type from stem suffixes.
                "title": n.title,
                "doc_type": n.doc_type,
                "dates": n.dates,
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
        rag_tiers(&state),
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

/// Hard ceiling on the number of nodes serialized onto the wire (perf ADR D2 /
/// research F2): an unbounded slice is linear but can reach a multi-gigabyte
/// body at corpus scale, so the engine never serves more than this — at EITHER
/// granularity. Document granularity is the obvious offender (one node per doc),
/// but the feature constellation is only bounded by feature count, and a corpus
/// with near-unique tags per document could explode it too — so the ceiling
/// applies to both, and "every graph read is bounded" holds without an
/// assumption about the tag vocabulary. Beyond it the client narrows with a
/// filter.
const MAX_GRAPH_NODES: usize = 5000;

/// Bound a slice to `MAX_GRAPH_NODES`, keeping the returned subgraph
/// self-consistent: both document edges AND feature meta-edges that reference a
/// dropped node are removed. Returns the original node total when truncation
/// happened, so the response can state it honestly. Nodes are already id-sorted,
/// so the kept page is deterministic. Works for both granularities — at document
/// granularity `meta_edges` is empty (the retain is a no-op); at feature
/// granularity `edges` is empty and the meta-edge retain does the work.
fn bound_slice(slice: &mut GraphSlice) -> Option<usize> {
    let total = slice.nodes.len();
    if total <= MAX_GRAPH_NODES {
        return None;
    }
    slice.nodes.truncate(MAX_GRAPH_NODES);
    let kept: std::collections::HashSet<String> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str().map(str::to_string))
        .collect();
    slice
        .edges
        .retain(|e| kept.contains(&e.src.0) && kept.contains(&e.dst.0));
    slice
        .meta_edges
        .retain(|m| kept.contains(&m.src) && kept.contains(&m.dst));
    Some(total)
}

#[cfg(test)]
mod bound_tests {
    use super::*;

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
    validate_scope(&state, &body.scope)?;
    let granularity = parse_granularity(&state, body.granularity.as_deref())?;
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
                engine_graph::asof::asof_graph_resolved(&state.root, reference, &scope, 0)
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
            let graph = state.graph_arc();
            let mut slice = graph_query(&graph, &state.scope, filter, granularity)
                .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
            // Constellation meta-edges come from the memoized projection
            // (W02P05-203) — same content, one aggregation per rebuild.
            if granularity == Granularity::Feature {
                slice.meta_edges = (*state.meta_edges()).clone();
            }
            (slice, rag_tiers(&state), None)
        }
    };
    // Live keyframe clock anchor (constellation-live-delta ADR / S50): the
    // delta clock's tip at query time, so a held keyframe (either granularity)
    // splices live `graph` deltas with no gap. An `as_of` (historical)
    // keyframe carries no live-clock position.
    let last_seq = match &body.as_of {
        Some(_) => Value::Null,
        None => Value::from(
            state
                .seq
                .load(std::sync::atomic::Ordering::SeqCst)
                .saturating_sub(1),
        ),
    };
    // Bound the payload at BOTH granularities (perf ADR D2): the feature
    // constellation is normally bounded by feature count, but a pathological tag
    // vocabulary could explode it, so the ceiling is unconditional — every graph
    // read is bounded.
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
        }),
        tiers,
        None,
    ))
}

// --- GET /filters?scope= ----------------------------------------------------------

pub async fn filters(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ScopeParam>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let vocab = vocabulary(&state.graph_arc());
    Ok(super::envelope(
        json!({"vocabulary": vocab}),
        rag_tiers(&state),
        None,
    ))
}

// --- /nodes/{id} family --------------------------------------------------------------

pub async fn node_detail(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult {
    let graph = state.graph_arc();
    let detail = engine_query::node::node_detail(&graph, &NodeId(id.clone())).ok_or_else(|| {
        super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        )
    })?;
    Ok(super::envelope(
        json!({"detail": detail}),
        rag_tiers(&state),
        None,
    ))
}

#[derive(Deserialize)]
pub struct NeighborParams {
    #[serde(default)]
    pub depth: Option<usize>,
    #[serde(default)]
    pub tiers: Option<String>,
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
    let graph = state.graph_arc();
    let depth = params.depth.unwrap_or(1).min(MAX_NEIGHBOR_DEPTH);
    let ego = engine_query::node::neighbors(&graph, &NodeId(id.clone()), depth, &tiers)
        .ok_or_else(|| {
            super::api_error(
                &state,
                StatusCode::NOT_FOUND,
                format!("unknown node `{id}`"),
            )
        })?;
    Ok(super::envelope(
        json!({"ego": ego}),
        rag_tiers(&state),
        None,
    ))
}

pub async fn node_evidence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult {
    let graph = state.graph_arc();
    let evidence = engine_query::node::evidence(&graph, &NodeId(id.clone())).ok_or_else(|| {
        super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        )
    })?;
    // Envelope-consistent with every other endpoint (`{data, tiers}`): the
    // evidence fields sit directly under `data` (matching the mock's flat
    // shape and the inspector's `evidence.data.documents/...` reads), not
    // hand-built as a bare `{evidence, tiers}` body.
    // NOTE (flagged cross-lane reconciliation, 2026-06-13): the item shapes
    // still diverge from the GUI's NodeEvidence type — `documents` are bare
    // stems vs `{path, doc_type}`, `code_locations` carry `target` not `path`,
    // and `commits` lack the `subject` (a git lookup). Reconciling those is a
    // contract event touching both the engine evidence struct and the GUI
    // type; tracked separately, not papered over here.
    Ok(super::envelope(
        serde_json::to_value(evidence).expect("evidence serializes"),
        rag_tiers(&state),
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
    let node = NodeId(id.clone());
    let graph = state.graph_arc();
    if graph.node(&node).is_none() {
        return Err(super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        ));
    }
    let vault_root = state.root.join(".vault");
    let (availability, info) = rag_client::client::discover(&vault_root);
    let rag_client::RagAvailability::Available = availability else {
        let rag_client::RagAvailability::Unavailable { reason } = availability else {
            unreachable!()
        };
        // Degrades to the §2 tier block, never an error (contract §4).
        return Ok(super::envelope(
            json!({"candidates": []}),
            super::degraded_tiers(&state, reason.as_str()),
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
    let store = state.store.lock().unwrap_or_else(|e| e.into_inner());
    let candidates = match rag_client::discover::discover(
        &transport,
        &store,
        &node,
        &query,
        &state.scope,
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
                super::degraded_tiers(&state, reason.as_str()),
                None,
            ));
        }
    };
    Ok(super::envelope(
        json!({"candidates": candidates}),
        rag_tiers(&state),
        None,
    ))
}
