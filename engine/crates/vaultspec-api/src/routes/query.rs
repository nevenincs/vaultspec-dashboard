//! Landscape and graph query endpoints (contract §3–§4, W03.P11.S49).

use std::sync::Arc;
use std::time::Instant;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{NodeId, Tier};
use engine_query::graph::{Granularity, MAX_GRAPH_NODES};
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

#[derive(Deserialize, Default)]
pub struct OptionalScopeParam {
    #[serde(default)]
    pub scope: Option<String>,
}

fn node_scope_cell(
    state: &AppState,
    scope: Option<&str>,
) -> Result<StdArc<ScopeCell>, (StatusCode, Json<Value>)> {
    match scope {
        Some(scope) => validate_scope(state, scope),
        None => Ok(state.active_cell()),
    }
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
    // RESILIENT enumeration (adversarial hardening): one stale/broken sibling
    // worktree (its workdir moved or is no longer a git repo) is skipped rather than
    // 400-ing the whole project — so /map still serves the project's valid worktrees
    // and the picker is never stranded on an otherwise-usable project.
    let worktrees: Vec<Value> = ingest_git::worktrees::enumerate_lenient(&workspace)
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

// --- GET /vault-tree?scope= and /code-files?scope= ----------------------------
//
// The `/vault-tree` (+ `/vault-tree/delta`) and `/code-files` (+ `/code-files/delta`)
// listing handlers moved to `routes::vault_tree` / `routes::code_files`
// (vault-tree-delta ADR D1/D3 + its `/code-files` follow-on); the row projection,
// snapshot ring, and key-generic diff live in `crate::row_delta`. `validate_scope`
// (below) stays the shared scope resolver every listing handler calls.

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
pub(crate) fn unavailable_tier_names(tiers: &Value) -> Vec<&'static str> {
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
    Granularity::from_param(raw)
        .map_err(|e| super::api_error(state, StatusCode::BAD_REQUEST, e.to_string()))
}

// The document/graph node ceiling and the slice-bounding helper now live in
// `engine_query::graph` (imported above) so EVERY engine front door — this HTTP
// route AND the CLI `graph` verb — bounds identically (graph-queries-are-bounded
// -by-default). The `bound_tests` below exercise that shared helper.

#[cfg(test)]
mod bound_tests {
    use super::*;
    use engine_query::filter::Filter;
    use engine_query::graph::{GraphSlice, bound_slice};

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

    fn ego_of(prefix: &str, n: usize, edges: Vec<(usize, usize)>) -> Value {
        json!({
            "nodes": node_ids(prefix, n),
            "edges": edges
                .into_iter()
                .map(|(s, d)| json!({
                    "src": format!("{prefix}:{s:06}"),
                    "dst": format!("{prefix}:{d:06}"),
                }))
                .collect::<Vec<_>>(),
        })
    }

    #[test]
    fn ego_under_ceiling_is_untouched() {
        let mut e = ego_of("doc", 100, vec![(0, 1)]);
        assert_eq!(bound_ego(&mut e, MAX_GRAPH_NODES), Value::Null);
        assert_eq!(e["nodes"].as_array().unwrap().len(), 100);
        assert_eq!(
            e["edges"].as_array().unwrap().len(),
            1,
            "a small ego is served whole with no truncated block"
        );
    }

    #[test]
    fn ego_over_ceiling_truncates_and_drops_dangling_edges() {
        // graph-queries-are-bounded-by-default (the ego analogue of bound_slice):
        // a hub ego over the ceiling is capped, and an edge to a truncated node is
        // dropped so the bounded ego stays self-consistent.
        let mut e = ego_of(
            "doc",
            MAX_GRAPH_NODES + 10,
            vec![
                (0, 1),                   // both endpoints kept (low ids survive)
                (0, MAX_GRAPH_NODES + 5), // dst is truncated away
            ],
        );
        let truncated = bound_ego(&mut e, MAX_GRAPH_NODES);
        assert_eq!(e["nodes"].as_array().unwrap().len(), MAX_GRAPH_NODES);
        assert_eq!(
            truncated["total_nodes"],
            MAX_GRAPH_NODES + 10,
            "the original total is reported honestly"
        );
        assert_eq!(truncated["returned_nodes"], MAX_GRAPH_NODES);
        let edges = e["edges"].as_array().unwrap();
        assert_eq!(edges.len(), 1, "the edge to a truncated node was dropped");
        assert_eq!(
            edges[0]["dst"],
            format!("doc:{:06}", 1),
            "the self-consistent edge survived"
        );
    }

    #[test]
    fn storage_schema_gate_wiring_degrades_on_newer_version_and_dim_mismatch() {
        // The embedding handler runs a two-stage storage-schema gate before the
        // direct scroll; the async handler itself needs a live rag (its
        // probe_machine_state reads service.json + /health), so this exercises the
        // exact gate COMPOSITION the handler applies, with realistic shapes and no
        // mocks. The gate rules themselves are exhaustively covered in rag-client.
        use rag_client::vectors::{
            EXPECTED_DENSE_DIM, KNOWN_STORAGE_SCHEMA_VERSION, extract_storage_schema_facts,
            storage_schema_supported, storage_schema_version_supported,
        };

        // Stage 1, off /health's schema_version: a newer version degrades (with the
        // drift stated) before any /readiness round-trip; an equal version passes.
        assert!(
            storage_schema_version_supported(Some(KNOWN_STORAGE_SCHEMA_VERSION + 1))
                .unwrap_err()
                .contains("newer")
        );
        assert!(storage_schema_version_supported(Some(KNOWN_STORAGE_SCHEMA_VERSION)).is_ok());

        // Stage 2, off the /readiness descriptor: extract + gate exactly as the
        // handler does. A dimension mismatch hard-refuses with the value stated.
        let mismatched = serde_json::json!({
            "schema": {"version": KNOWN_STORAGE_SCHEMA_VERSION, "vault": {"vectors": {
                "dense": {"name": "dense", "dim": EXPECTED_DENSE_DIM + 256}}}}
        });
        assert!(
            storage_schema_supported(&extract_storage_schema_facts(&mismatched), true)
                .unwrap_err()
                .contains("dimension")
        );

        // A compatible descriptor passes both stages (the serve path).
        let ok = serde_json::json!({
            "schema": {"version": KNOWN_STORAGE_SCHEMA_VERSION, "vault": {"vectors": {
                "dense": {"name": "dense", "dim": EXPECTED_DENSE_DIM}}}}
        });
        assert!(storage_schema_supported(&extract_storage_schema_facts(&ok), true).is_ok());
    }
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
        &views,
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
    // A degraded embedding envelope (no vectors) for any reason rag/Qdrant cannot
    // serve — the stores layer reads availability from the tiers block (ADR D7),
    // never a 5xx.
    let degraded_embeddings = |reason: &str| {
        Ok(super::envelope(
            json!({
                "embeddings": [],
                "generation": generation,
                "semantic_epoch": Value::Null,
                "truncated": Value::Null,
                "lens": lens.as_str(),
                "semantic_timing": {
                    "semantic_epoch_ms": Value::Null,
                    "vector_cache_hit": false,
                    "vector_scroll_ms": Value::Null,
                },
            }),
            super::degraded_tiers(&cell, reason),
            None,
        ))
    };
    // Probe the machine-global running-predicate (discover + heartbeat + /health):
    // the direct embedding scroll requires a RUNNING rag (a fresh-heartbeat-but-
    // dead service is honest absence, not a doomed scroll), and /health carries the
    // Qdrant version the D6 capability gate reads.
    // Blocking /health probe — offload it off the async worker (RCR-001); a task
    // join failure degrades the semantic tier (fail-closed), never a hang.
    let probe = {
        let vault_probe = vault_root.clone();
        match tokio::task::spawn_blocking(move || {
            rag_client::client::probe_machine_state(
                &vault_probe,
                std::time::Duration::from_millis(1500),
            )
        })
        .await
        {
            Ok(p) => p,
            Err(_) => return degraded_embeddings("rag probe task failed"),
        }
    };
    let (info, qdrant_version, schema_version) = match probe {
        rag_client::client::RagMachineState::Running { info, health } => {
            let schema_version = health.schema_version;
            (info, health.qdrant.and_then(|q| q.version), schema_version)
        }
        rag_client::client::RagMachineState::Crashed { reason, .. }
        | rag_client::client::RagMachineState::Absent { reason } => {
            return degraded_embeddings(reason.as_str());
        }
    };
    // D6 capability/version gate: the embedding scroll reads Qdrant DIRECTLY (an
    // unversioned second contract). Refuse the scroll on a Qdrant major the engine
    // was not built against, degrading the semantic tier honestly with the version
    // STATED, rather than scrolling a shape the engine may silently misread.
    if !rag_client::vectors::qdrant_collection_api_supported(qdrant_version.as_deref()) {
        return degraded_embeddings(&format!(
            "Qdrant version {} is not a recognized 1.x; direct embedding read degraded (capability gate)",
            qdrant_version.as_deref().unwrap_or("unknown")
        ));
    }
    // Storage-schema gate (rag-schema-gate ADR): the scroll reads rag's Qdrant SHAPE
    // directly (collection name, dense vector name, dimension). Gate it on rag's
    // advertised storage-schema contract before reading, so a rag shape change degrades
    // the tier with the mismatch STATED rather than silently misreading. Stage 1 is the
    // cheap version check off the `/health` schema_version already in hand — a newer
    // shape short-circuits before any `/readiness` round-trip.
    if let Err(reason) = rag_client::vectors::storage_schema_version_supported(schema_version) {
        return degraded_embeddings(&reason);
    }
    // Stage 2: only a contract-advertising rag (Some version) pays the `/readiness`
    // descriptor read for the dense-name + dimension checks; a pre-contract rag (None)
    // reads as before (the gate is additive, never a regression). A `/readiness` read
    // that fails means the shape cannot be validated before the direct read, so it
    // degrades (fail closed), exactly like the running-probe.
    if schema_version.is_some() {
        let readiness_transport = rag_client::client::LoopbackTransport {
            port: info.port,
            bearer: info.service_token.clone(),
            timeout: rag_client::control::READ_BUDGET,
        };
        // Blocking /readiness read — offload it (RCR-001); a join failure degrades.
        let readiness_result = match tokio::task::spawn_blocking(move || {
            rag_client::control::readiness(&readiness_transport)
        })
        .await
        {
            Ok(r) => r,
            Err(_) => return degraded_embeddings("rag /readiness task failed"),
        };
        match readiness_result {
            Ok(readiness) => {
                let facts = rag_client::vectors::extract_storage_schema_facts(&readiness);
                // `advertised = true`: /health already promised the contract, so the
                // descriptor must validate completely - a missing version/name/dim is a
                // fail-closed degrade, not a vacuous pass.
                if let Err(reason) = rag_client::vectors::storage_schema_supported(&facts, true) {
                    return degraded_embeddings(&reason);
                }
            }
            Err(e) => {
                return degraded_embeddings(&format!(
                    "rag /readiness unreadable for the storage-schema gate ({}); direct embedding read degraded",
                    rag_client::search::degradation_reason(&e)
                ));
            }
        }
    }
    // The semantic freshness epoch (rag-control-plane ADR D4): one bounded
    // `/jobs` read against rag's SERVICE port, reduced to the newest terminal
    // reindex timestamp. It is the rag-side analog of the structural
    // `generation` counter — the embedding VECTOR cache below keys on it so a
    // completed reindex invalidates the served vectors, and the client keys its
    // own cache on the pair (`generation`, `semantic_epoch`). An epoch read that
    // fails (rag service flaking) degrades to `0` (treated as "unknown"): the
    // Qdrant scroll below still serves whatever vectors exist.
    let semantic_epoch_started = Instant::now();
    // Read the epoch through the shared short-TTL cache (rag-integration-hardening
    // D3): a warm window serves without a `/jobs` round-trip, and a successful read
    // here warms the same slot the `/search` freshness annotation reads. A
    // cold/expired slot pays the one bounded `/jobs` read (offloaded, RCR-001); a
    // join failure OR a rag error yields no epoch — the vector key falls back to `0`
    // ("unknown", the existing behaviour) and the slot stays cold so `/search`
    // reports absent rather than a fabricated `0`. A successfully-read epoch (a
    // legitimate `0` included) is cached.
    let semantic_epoch = match state.semantic_epoch_cache.fresh() {
        Some(epoch) => epoch,
        None => {
            let control = rag_client::client::LoopbackTransport {
                port: info.port,
                bearer: info.service_token.clone(),
                timeout: rag_client::control::READ_BUDGET,
            };
            let read =
                tokio::task::spawn_blocking(move || rag_client::control::semantic_epoch(&control))
                    .await
                    .ok()
                    .and_then(|r| r.ok());
            if let Some(epoch) = read {
                state.semantic_epoch_cache.store(epoch);
            }
            read.unwrap_or(0)
        }
    };
    let semantic_epoch_ms = semantic_epoch_started.elapsed().as_millis() as u64;
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
    let mut vector_cache_hit = false;
    let mut vector_scroll_ms = 0_u64;
    let vectors = match cell.embeddings_if_fresh(semantic_epoch) {
        Some(cached) => {
            vector_cache_hit = true;
            cached
        }
        None => {
            let scroll_started = Instant::now();
            // The multi-page Qdrant scroll is the LONGEST blocking read in the rag
            // path (its own multi-page wall-clock budget) — offload it off the async
            // worker (RCR-001) so it cannot pin a runtime thread. A join failure and
            // a scroll error both degrade the semantic tier (no vectors), never a 500.
            let scroll_result = tokio::task::spawn_blocking(move || {
                rag_client::vectors::read_embeddings(&transport, &collection, deadline)
            })
            .await;
            let degraded_scroll = |cell: &ScopeCell, reason: &str, failed_scroll_ms: u64| {
                // Qdrant was reachable through discovery but the scroll itself failed
                // (store down, timeout, shape-miss, or the offload task): semantic
                // suggestions are simply unavailable right now. Degrade the semantic
                // tier (no vectors), never a 500 — the stores layer reads availability
                // from tiers (ADR D7).
                Ok(super::envelope(
                    json!({
                        "embeddings": [],
                        "generation": generation,
                        "semantic_epoch": semantic_epoch,
                        "truncated": Value::Null,
                        "lens": lens.as_str(),
                        "semantic_timing": {
                            "semantic_epoch_ms": semantic_epoch_ms,
                            "vector_cache_hit": false,
                            "vector_scroll_ms": failed_scroll_ms,
                        },
                    }),
                    super::degraded_tiers(cell, reason),
                    None,
                ))
            };
            let fresh = match scroll_result {
                Ok(Ok(vectors)) => std::sync::Arc::new(vectors),
                Ok(Err(e)) => {
                    let failed_scroll_ms = scroll_started.elapsed().as_millis() as u64;
                    let reason = rag_client::search::degradation_reason(&e);
                    return degraded_scroll(&cell, reason.as_str(), failed_scroll_ms);
                }
                Err(_) => {
                    let failed_scroll_ms = scroll_started.elapsed().as_millis() as u64;
                    return degraded_scroll(&cell, "vector scroll task failed", failed_scroll_ms);
                }
            };
            vector_scroll_ms = scroll_started.elapsed().as_millis() as u64;
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
            "semantic_timing": {
                "semantic_epoch_ms": semantic_epoch_ms,
                "vector_cache_hit": vector_cache_hit,
                "vector_scroll_ms": vector_scroll_ms,
            },
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
    // The in-flight projection is generation-stable, so it is memoized per
    // generation on the cell (cache-until-invalidated): a repeat Work-surface poll
    // is a warm read, not a re-scan of every `doc:` node. Invalidated on a
    // watcher rebuild.
    let artifacts = cell.pipeline_artifacts();
    Ok(super::envelope(
        json!({"artifacts": *artifacts}),
        rag_tiers(&cell),
        None,
    ))
}

// --- GET /filters?scope= ----------------------------------------------------------

#[derive(Deserialize)]
pub struct FiltersParams {
    pub scope: String,
    /// Which corpus's facet vocabulary to serve (codebase-graphing ADR D5):
    /// `vault` (default) or `code`. The route serves the ACTIVE corpus's
    /// vocabulary only — never a mixed one.
    #[serde(default)]
    pub corpus: Option<String>,
}

pub async fn filters(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FiltersParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    match params.corpus.as_deref() {
        None | Some("vault") => {}
        Some("code") => {
            // Serve the CODE corpus's own facet vocabulary (languages, module
            // dirs) over a fresh-enough code graph; blocking work off-runtime.
            let blocking_cell = cell.clone();
            let graph = tokio::task::spawn_blocking(move || {
                blocking_cell.code.ensure_fresh(&blocking_cell.root)
            })
            .await
            .map_err(|e| {
                super::api_error(&state, StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?
            .map_err(|e| {
                super::api_error(
                    &state,
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("code corpus extraction failed: {e}"),
                )
            })?;
            let vocab = engine_query::code::code_filter_vocabulary(&graph);
            return Ok(super::envelope(
                json!({"vocabulary": vocab, "corpus": "code"}),
                rag_tiers(&cell),
                None,
            ));
        }
        Some(other) => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown corpus `{other}` (expected `vault` or `code`)"),
            ));
        }
    }
    // The vocabulary is generation-stable (it is a full-graph scan that only
    // changes on a rebuild), so it is memoized per generation on the cell
    // (cache-until-invalidated): a repeat `/filters` poll is a warm read, not a
    // re-scan. The timeline's corpus auto-fit reads it on load. Invalidated on a
    // watcher rebuild.
    let vocab = cell.filters_vocabulary();
    Ok(super::envelope(
        json!({"vocabulary": *vocab}),
        rag_tiers(&cell),
        None,
    ))
}

// --- GET /features?scope=&feature= ------------------------------------------------

#[derive(Deserialize)]
pub struct FeaturesParams {
    pub scope: String,
    /// Which feature group's pipeline coverage to serve. When present, the
    /// response is that feature's full coverage; when absent, the compact
    /// all-features roster (feature-group-authoring ADR D2).
    #[serde(default)]
    pub feature: Option<String>,
}

/// Per-feature pipeline coverage for the feature-group panel
/// (feature-group-authoring ADR D2/D3): resolve the per-request scope to its warm
/// cell, read the generation-memoized whole-corpus coverage map, and serve either
/// the requested feature's coverage or the compact roster through the shared
/// envelope so the tiers block rides success and the unknown-scope 400 alike. An
/// unknown feature (a new one being started in the panel) reads as an all-missing
/// coverage — exactly the "start a new feature" state — never a 404.
pub async fn features(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FeaturesParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    // The coverage map is generation-stable (it changes only on a rebuild), so it
    // is memoized per generation on the cell (cache-until-invalidated): a repeat
    // panel read is a warm lookup, not a re-scan of every `doc:` node. One cached
    // map serves both the per-feature read and the roster. Invalidated on a
    // watcher rebuild.
    let coverage = cell.feature_coverage();
    let data = match params.feature.as_deref() {
        Some(feature) => json!({ "coverage": coverage.coverage_for(feature) }),
        None => json!({ "roster": coverage.roster() }),
    };
    Ok(super::envelope(data, rag_tiers(&cell), None))
}

// --- /nodes/{id} family --------------------------------------------------------------

pub async fn node_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<OptionalScopeParam>,
) -> ApiResult {
    // The /nodes/* family accepts an explicit scope for stateless frontend reads.
    // Omitting it keeps the active-scope fallback for legacy callers.
    let cell = node_scope_cell(&state, params.scope.as_deref())?;
    let graph = cell.graph_arc();
    let detail = engine_query::node::node_detail(&graph, &NodeId(id.clone())).ok_or_else(|| {
        super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("unknown node `{id}`"),
        )
    })?;
    // Lazy headline summary (node-visual-richness hover card): the doc body's first
    // prose line, read on-demand for `doc:` nodes only — never stored in the graph,
    // never blocks the detail when absent (a feature node, an unreadable body).
    let summary = super::content::doc_summary(&cell, &id);
    Ok(super::envelope(
        json!({"detail": detail, "summary": summary}),
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
    Query(params): Query<OptionalScopeParam>,
) -> ApiResult {
    let cell = node_scope_cell(&state, params.scope.as_deref())?;
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
    pub scope: Option<String>,
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
            // `semantic` is NOT a graph tier (D3.5): it falls through to the
            // unknown-tier rejection like any other unknown tier string.
            other => Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown tier `{other}`"),
            )),
        })
        .collect::<Result<_, _>>()?;
    let lens = parse_lens(&state, params.lens.as_deref())?;
    let cell = node_scope_cell(&state, params.scope.as_deref())?;
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
        // Order by DOI so the ego node ceiling (below) keeps the TOP-salience
        // neighbours for the active lens — mirroring the document slice's
        // lens-dependent truncation. The ego center is the DOI focus, so it
        // ranks highest and always survives the cap.
        engine_query::salience::order_by_salience(nodes, &scores);
    }
    // Serialize the ego edges through the SHARED §4 edge projection so the ego
    // wire shape matches `/graph/query` exactly (mock-mirrors-live-wire-shape)
    // and the per-edge dead weight (the identical-per-edge `scope`, the
    // render-dead `provenance`, full-precision `confidence`) is stripped here too
    // — an ego over a hub node ships tens of thousands of edges, so the raw
    // `Edge` serialization was a multi-MB body on the same hot path the slimming
    // already fixed for the document slice.
    if let Some(edges) = ego_value.get_mut("edges").and_then(|e| e.as_array_mut()) {
        *edges = ego
            .edges
            .iter()
            .map(|edge| engine_query::graph::edge_view(&graph, edge))
            .collect();
    }
    // Bound the ego payload (graph-queries-are-bounded-by-default): an ego is
    // depth-bounded (<= MAX_NEIGHBOR_DEPTH) but NOT count-bounded, so a max-depth
    // ego over a hub node approaches the whole graph (measured: depth=3 over the
    // top-degree node = ~1700 nodes / ~17k edges) — a near-full-graph payload no
    // other graph read serializes uncapped. Apply the SAME node ceiling +
    // self-consistent edge drop + honest `truncated` block the document slice
    // carries via `bound_slice`; the nodes are pre-ordered by DOI so the kept
    // page is the top-salience neighbourhood.
    let truncated = bound_ego(&mut ego_value, MAX_GRAPH_NODES);
    Ok(super::envelope(
        json!({"ego": ego_value, "lens": lens.as_str(), "truncated": truncated}),
        tiers,
        None,
    ))
}

/// Bound an ego payload (a `Value` with `nodes`/`edges` arrays) to a node
/// ceiling, keeping the returned neighbourhood self-consistent (edges to dropped
/// nodes removed) and returning an honest `truncated` block when truncation
/// happened. The ego analogue of [`bound_slice`]
/// (graph-queries-are-bounded-by-default): without it a max-depth ego over a hub
/// node serializes a near-full-graph payload. Nodes are assumed pre-ordered (by
/// DOI), so the kept page is the top-ranked neighbourhood.
fn bound_ego(ego: &mut Value, cap: usize) -> Value {
    let total = ego
        .get("nodes")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    if total <= cap {
        return Value::Null;
    }
    if let Some(nodes) = ego.get_mut("nodes").and_then(Value::as_array_mut) {
        nodes.truncate(cap);
    }
    let kept: std::collections::HashSet<String> = ego
        .get("nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|n| n.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    if let Some(edges) = ego.get_mut("edges").and_then(Value::as_array_mut) {
        let endpoint_ok = |e: &Value, key: &str| {
            e.get(key)
                .and_then(Value::as_str)
                .is_some_and(|s| kept.contains(s))
        };
        edges.retain(|e| endpoint_ok(e, "src") && endpoint_ok(e, "dst"));
    }
    json!({
        "total_nodes": total,
        "returned_nodes": cap,
        "reason": "ego node ceiling: reduce depth to narrow the neighbourhood",
    })
}

pub async fn node_evidence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<OptionalScopeParam>,
) -> ApiResult {
    let cell = node_scope_cell(&state, params.scope.as_deref())?;
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
    // doc_type}` and commits carry `subject`.
    Ok(super::envelope(
        serde_json::to_value(evidence).expect("evidence serializes"),
        rag_tiers(&cell),
        None,
    ))
}
