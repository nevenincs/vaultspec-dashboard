//! `POST /graph/query` and its generation-keyed slice delta (graph-slice-delta ADR
//! D2/D3). Extracted from `routes/query.rs` so the query handler and the delta
//! handler live together; the snapshot ring + id-keyed node/edge diff live in
//! `crate::graph_delta`. The delta targets ONLY the present-view DOCUMENT vault
//! slice (the ~3.5 MB payload the idle refetch storm re-read); `as_of`, feature,
//! and code paths never record or delta.
//!
//! Guard #1 (opaque token): the full route echoes its own params fingerprint as an
//! OPAQUE `slice_token`; the client returns it verbatim in the delta request, and
//! the ring baseline lookup keys on it — so no client-side canonicalization can
//! drift the lookup (a mismatch is an honest `full_required`, never a wrong patch).

use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use engine_query::filter::Filter;
use engine_query::graph::{
    Granularity, MAX_GRAPH_NODES, bound_slice, graph_query, graph_query_cached,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};
use crate::graph_delta::{GraphSliceDelta, SliceSnapshot};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

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
    /// `status` (default when omitted) or `design`. Switching lens is a re-query.
    #[serde(default)]
    pub lens: Option<String>,
    /// The focus node id for the DOI focus-distance term. Absent = no focus.
    #[serde(default)]
    pub focus: Option<String>,
    /// Which dataset to serve (codebase-graphing ADR D5): `vault` (default) or
    /// `code` — the DISCONNECTED code corpus. Unknown values are a typed 400.
    #[serde(default)]
    pub corpus: Option<String>,
    /// CODE-CORPUS narrowing (ADR D5): keep only nodes under this repo-relative
    /// directory prefix. Ignored (validated away) on `vault`.
    #[serde(default)]
    pub dir_prefix: Option<String>,
    /// CODE-CORPUS narrowing: language wire tokens. Ignored (validated away) on
    /// `vault`.
    #[serde(default)]
    pub languages: Option<Vec<String>>,
}

/// The engine-authoritative params fingerprint for the present-view document slice
/// (D2/D3, guard #1): the ring key AND the opaque `slice_token` echoed to the
/// client. Deterministic within a process for the same (validated filter, lens,
/// focus), which is all the delta-eligible path varies by (scope is per-cell;
/// granularity=document, corpus=vault, as_of=none are fixed for the recorded set).
fn slice_fingerprint(
    filter: &Filter,
    lens: engine_query::salience::Lens,
    focus: Option<&str>,
) -> String {
    serde_json::to_string(&json!({
        "filter": filter,
        "lens": lens.as_str(),
        "focus": focus,
    }))
    .unwrap_or_default()
}

/// The processed present-view document slice a client receives AND the ring records
/// — `Arc`-wrapped nodes/edges shared between the response serialization and the
/// ring (no deep copy per serve).
struct PresentDocumentSlice {
    generation: u64,
    nodes: Arc<Vec<Value>>,
    edges: Arc<Vec<Value>>,
    meta_edges: Value,
    filter: Filter,
    truncated: Option<Value>,
    salience_partial: bool,
    fingerprint: String,
}

/// Build the present-view DOCUMENT slice (memoized enriched projection + active-lens
/// salience annotation/DOI order + node ceiling) and RECORD it into the slice ring
/// (D2), the ONE builder both `/graph/query` (present document path) and
/// `/graph/query/delta` call so the served bytes and the diffed bytes are identical.
/// Torn-pair guard (mirrors `row_delta`): the generation is read up front and the
/// snapshot is recorded ONLY if it held stable across the build — a moved counter
/// means the slice may be newer than the label, so it is served but NOT recorded (a
/// later `since=` gets an honest `full_required`).
fn build_and_record_present_document_slice(
    state: &Arc<AppState>,
    cell: &ScopeCell,
    filter: Filter,
    lens: engine_query::salience::Lens,
    focus: Option<String>,
    tiers: &Value,
) -> Result<PresentDocumentSlice, (StatusCode, Json<Value>)> {
    let generation = cell.generation.load(std::sync::atomic::Ordering::SeqCst);
    let graph = cell.graph_arc();
    let views = cell.document_views();
    let mut slice = graph_query_cached(&graph, &cell.scope, filter, Granularity::Document, &views)
        .map_err(|e| super::api_error(state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // Active-lens salience: annotate + DOI-order so the ceiling keeps top-salience
    // nodes. Partiality is read from the tiers block, never guessed.
    let salience_partial =
        engine_query::salience::is_partial(lens, &super::query::unavailable_tier_names(tiers));
    let basis = cell.salience_basis();
    let focus_id = focus.as_ref().map(|f| engine_model::NodeId(f.clone()));
    let scores = engine_query::salience::compute_salience(
        &basis,
        &graph,
        lens,
        focus_id.as_ref(),
        crate::app::now_ms(),
        salience_partial,
    );
    engine_query::salience::annotate_nodes(&mut slice.nodes, &scores);
    engine_query::salience::order_by_salience(&mut slice.nodes, &scores);
    let truncated = bound_slice(&mut slice).map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": MAX_GRAPH_NODES,
            "reason": "graph node ceiling: narrow with a filter; the feature \
                       constellation is the smallest view",
        })
    });
    let fingerprint = slice_fingerprint(&slice.filter, lens, focus.as_deref());
    let echoed_filter = slice.filter.clone();
    let meta_edges = serde_json::to_value(&slice.meta_edges).unwrap_or_else(|_| json!([]));
    let nodes = Arc::new(std::mem::take(&mut slice.nodes));
    let edges = Arc::new(std::mem::take(&mut slice.edges));
    if cell.generation.load(std::sync::atomic::Ordering::SeqCst) == generation {
        cell.record_graph_slice(
            &fingerprint,
            generation,
            SliceSnapshot {
                nodes: nodes.clone(),
                edges: edges.clone(),
                truncated: truncated.clone(),
            },
        );
    }
    Ok(PresentDocumentSlice {
        generation,
        nodes,
        edges,
        meta_edges,
        filter: echoed_filter,
        truncated,
        salience_partial,
        fingerprint,
    })
}

pub async fn graph_query_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<GraphQueryBody>,
) -> ApiResult {
    let cell = super::query::validate_scope(&state, &body.scope)?;
    let granularity = super::query::parse_granularity(&state, body.granularity.as_deref())?;
    let lens = super::query::parse_lens(&state, body.lens.as_deref())?;
    // CORPUS DISPATCH (codebase-graphing ADR D5): `code` serves the DISCONNECTED
    // dataset through this same route/envelope; the vault path below is
    // byte-identical to the pre-corpus contract.
    match body.corpus.as_deref() {
        None | Some("vault") => {
            if body.dir_prefix.is_some() || body.languages.is_some() {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    "`dir_prefix`/`languages` are code-corpus facets; they do not \
                     apply to the vault corpus"
                        .to_string(),
                ));
            }
        }
        Some("code") => return code_corpus_query(&state, &cell, &body, granularity, lens).await,
        Some(other) => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown corpus `{other}` (expected `vault` or `code`)"),
            ));
        }
    }
    let filter = body.filter.clone().unwrap_or_default();
    // PRESENT-VIEW DOCUMENT (the delta-eligible path, graph-slice-delta ADR): build
    // + record via the shared builder, serving the `generation` and the opaque
    // `slice_token` so the client can request a `since=` delta instead of re-reading
    // the whole slice on every generation bump.
    if body.as_of.is_none() && granularity == Granularity::Document {
        let tiers = super::query_tiers(&cell);
        let built = build_and_record_present_document_slice(
            &state,
            &cell,
            filter,
            lens,
            body.focus.clone(),
            &tiers,
        )?;
        let last_seq = Value::from(
            cell.seq
                .load(std::sync::atomic::Ordering::SeqCst)
                .saturating_sub(1),
        );
        return Ok(super::envelope(
            json!({
                // Serialize through the Arc's deref: the ring shares the same Arc, so
                // only this one response copy is made — no second deep copy per serve.
                "nodes": built.nodes.as_ref(),
                "edges": built.edges.as_ref(),
                "meta_edges": built.meta_edges,
                "filter": built.filter,
                "as_of": Value::Null,
                "resolved_sha": Value::Null,
                "interpretation": Value::Null,
                "last_seq": last_seq,
                "truncated": built.truncated,
                "lens": lens.as_str(),
                "salience_partial": built.salience_partial,
                // graph-slice-delta ADR D2/D3: the serving generation + the opaque
                // params token the client returns in a `since=` delta request.
                "generation": built.generation,
                "slice_token": built.fingerprint,
            }),
            tiers,
            None,
        ));
    }
    // Historical (`as_of`) OR present-view FEATURE: the non-delta path (never
    // salience-ranked, never recorded).
    let (mut slice, tiers, resolution) = match &body.as_of {
        Some(reference) => {
            let (resolved_sha, interpretation) =
                engine_graph::asof::resolve_ref_interpreted(&cell.root, reference)
                    .map_err(|e| super::revision_error(&state, reference, &e))?;
            let resolved = cell
                .asof_graph(&resolved_sha)
                .map_err(|e| super::revision_error(&state, reference, &e))?;
            let slice = match granularity {
                Granularity::Document => {
                    let views = resolved.document_views(&cell.scope);
                    graph_query_cached(
                        &resolved.asof.graph,
                        &cell.scope,
                        filter,
                        granularity,
                        &views,
                    )
                }
                Granularity::Feature => {
                    graph_query(&resolved.asof.graph, &cell.scope, filter, granularity)
                }
            }
            .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
            let tiers = serde_json::to_value(engine_query::envelope::asof_tiers_block())
                .expect("tiers serialize");
            (slice, tiers, Some((resolved_sha, interpretation)))
        }
        None => {
            // Present-view FEATURE (document handled above): the default constellation
            // poll is served whole from the per-generation memo; a filtered feature
            // query flows through `graph_query` (which prunes meta_edges to the set).
            let graph = cell.graph_arc();
            let slice = if filter == engine_query::filter::Filter::default() {
                engine_query::graph::GraphSlice {
                    nodes: (*cell.feature_nodes()).clone(),
                    edges: Vec::new(),
                    meta_edges: (*cell.meta_edges()).clone(),
                    filter: filter.validated().map_err(|e| {
                        super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string())
                    })?,
                }
            } else {
                graph_query(&graph, &cell.scope, filter, granularity)
                    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?
            };
            (slice, super::query_tiers(&cell), None)
        }
    };
    let last_seq = match &body.as_of {
        Some(_) => Value::Null,
        None => Value::from(
            cell.seq
                .load(std::sync::atomic::Ordering::SeqCst)
                .saturating_sub(1),
        ),
    };
    let truncated = bound_slice(&mut slice).map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": MAX_GRAPH_NODES,
            "reason": "graph node ceiling: narrow with a filter; the feature \
                       constellation is the smallest view",
        })
    });
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
            "lens": lens.as_str(),
            "salience_partial": false,
            // A historical / feature slice is never delta-eligible: no generation
            // token rides it, so the client never requests a delta against it.
            "generation": Value::Null,
        }),
        tiers,
        None,
    ))
}

/// The DISCONNECTED code corpus served through the same route/envelope (ADR D5).
/// Never delta-eligible (the code graph is a separate, lazy dataset).
async fn code_corpus_query(
    state: &Arc<AppState>,
    cell: &Arc<ScopeCell>,
    body: &GraphQueryBody,
    granularity: Granularity,
    lens: engine_query::salience::Lens,
) -> ApiResult {
    if body.as_of.is_some() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "the code corpus serves the present view only (`as_of` does not apply)".to_string(),
        ));
    }
    let filter = body.filter.clone().unwrap_or_default();
    let date_range = filter.date_range.clone();
    let date_field = filter.date_field;
    let mut residual = filter;
    residual.date_range = None;
    residual.date_field = engine_query::filter::DateField::default();
    if residual != engine_query::filter::Filter::default() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "vault filter facets do not apply to the code corpus; narrow with \
             `dir_prefix` / `languages` (only `date_range` + `date_field: \"modified\"` \
             carry over)"
                .to_string(),
        ));
    }
    if date_range.is_some() && date_field != engine_query::filter::DateField::Modified {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "the code corpus dates by worktree mtime: a code `date_range` requires \
             `date_field: \"modified\"` (`created`/`stamped` are vault-document criteria)"
                .to_string(),
        ));
    }
    let narrow = engine_query::code::CodeNarrow {
        dir_prefix: body.dir_prefix.clone(),
        languages: body.languages.clone().unwrap_or_default(),
        date_from: date_range.as_ref().and_then(|r| r.from.clone()),
        date_to: date_range.as_ref().and_then(|r| r.to.clone()),
    };
    let blocking_cell = cell.clone();
    let (graph, recency) = tokio::task::spawn_blocking(move || {
        let graph = blocking_cell.code.ensure_fresh(&blocking_cell.root)?;
        let recency = blocking_cell.code.ensure_recency(&blocking_cell.root);
        Ok::<_, String>((graph, recency))
    })
    .await
    .map_err(|e| super::api_error(state, StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| {
        super::api_error(
            state,
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("code corpus extraction failed: {e}"),
        )
    })?;
    let mut slice = if granularity == Granularity::Feature
        && narrow == engine_query::code::CodeNarrow::default()
    {
        (*cell
            .code
            .default_rollup(&graph, &cell.scope, recency.as_ref()))
        .clone()
    } else {
        engine_query::code::code_graph_query(
            &graph,
            &cell.scope,
            granularity == Granularity::Feature,
            &narrow,
            recency.as_deref(),
        )
    };
    let truncated = bound_slice(&mut slice).map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": MAX_GRAPH_NODES,
            "reason": "graph node ceiling: narrow with dir_prefix/languages; the \
                       package rollup is the smallest view",
        })
    });
    let extraction = cell.code.stats_snapshot().map(|s| {
        json!({
            "files": s.files,
            "capped": s.capped,
            "skipped_too_large": s.skipped_too_large,
            "parse_errors": s.parse_errors,
            "imports_total": s.imports_total,
            "imports_internal": s.imports_internal,
            "imports_external": s.imports_external,
            "imports_unresolved": s.imports_unresolved,
        })
    });
    Ok(super::envelope(
        json!({
            "nodes": slice.nodes,
            "edges": slice.edges,
            "meta_edges": slice.meta_edges,
            "filter": slice.filter,
            "as_of": Value::Null,
            "resolved_sha": Value::Null,
            "interpretation": Value::Null,
            "last_seq": Value::Null,
            "truncated": truncated,
            "lens": lens.as_str(),
            "salience_partial": false,
            "corpus": "code",
            "extraction": extraction,
            "code_generation": cell.code.generation.load(std::sync::atomic::Ordering::SeqCst),
            // A code slice is not vault-document-delta-eligible: no token rides it.
            "generation": Value::Null,
        }),
        super::query_tiers(cell),
        None,
    ))
}

/// The `/graph/query/delta` body: the SAME query params, plus the client's held
/// `since` generation and the opaque `slice_token` the full route echoed.
#[derive(Deserialize)]
pub struct GraphQueryDeltaBody {
    #[serde(flatten)]
    pub query: GraphQueryBody,
    pub since: u64,
    pub slice_token: String,
}

/// `POST /graph/query/delta` (graph-slice-delta ADR D3): re-serve the current
/// present-view document vault slice (warm memo → cheap CPU; the win is the wire +
/// parse, not the projection) and diff it against the ring snapshot at
/// `(slice_token, since)` by node/edge id. `full_required` when the shape is not
/// delta-eligible (guard #2: `as_of`/feature/code), the `(token, since)` pair is not
/// retained, or truncation composition differs. Read-only; standard envelope + tiers.
pub async fn graph_query_delta_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<GraphQueryDeltaBody>,
) -> ApiResult {
    let query = body.query;
    let cell = super::query::validate_scope(&state, &query.scope)?;
    let granularity = super::query::parse_granularity(&state, query.granularity.as_deref())?;
    let lens = super::query::parse_lens(&state, query.lens.as_deref())?;
    let tiers = super::query_tiers(&cell);
    // Guard #2: only the live present-view DOCUMENT VAULT slice is delta-eligible;
    // any other shape never recorded a snapshot, so answer full_required honestly.
    let is_present_document_vault = query.as_of.is_none()
        && granularity == Granularity::Document
        && matches!(query.corpus.as_deref(), None | Some("vault"))
        && query.dir_prefix.is_none()
        && query.languages.is_none();
    if !is_present_document_vault {
        let generation = cell.generation.load(std::sync::atomic::Ordering::SeqCst);
        return Ok(super::envelope(
            json!({"generation": generation, "full_required": true}),
            tiers,
            None,
        ));
    }
    let filter = query.filter.clone().unwrap_or_default();
    // Re-serve (and re-record) the current slice for these params, then diff the ring
    // baseline at the CLIENT'S opaque token (guard #1) against it.
    let current_built =
        build_and_record_present_document_slice(&state, &cell, filter, lens, query.focus, &tiers)?;
    // Guard #1 hardening (review LOW): the token must be THE identity of the body
    // params — a token minted for different params must never diff against this
    // build. The intended client cannot hit this (a param change is a new query
    // key → full drain), but the cross-check forecloses any cross-param diff for
    // one string compare.
    if current_built.fingerprint != body.slice_token {
        return Ok(super::envelope(
            json!({"generation": current_built.generation, "full_required": true}),
            tiers,
            None,
        ));
    }
    let current = SliceSnapshot {
        nodes: current_built.nodes,
        edges: current_built.edges,
        truncated: current_built.truncated,
    };
    let data = match cell.graph_slice_delta(
        &body.slice_token,
        body.since,
        &current,
        current_built.generation,
    ) {
        GraphSliceDelta::Unchanged { generation } => json!({
            "since": body.since,
            "generation": generation,
            "changed_nodes": [],
            "removed_node_ids": [],
            "changed_edges": [],
            "removed_edge_ids": [],
            "truncated": current.truncated,
        }),
        GraphSliceDelta::FullRequired { generation } => json!({
            "generation": generation,
            "full_required": true,
        }),
        GraphSliceDelta::Delta {
            since,
            generation,
            changed_nodes,
            removed_node_ids,
            changed_edges,
            removed_edge_ids,
            truncated,
        } => json!({
            "since": since,
            "generation": generation,
            "changed_nodes": changed_nodes,
            "removed_node_ids": removed_node_ids,
            "changed_edges": changed_edges,
            "removed_edge_ids": removed_edge_ids,
            "truncated": truncated,
        }),
    };
    Ok(super::envelope(data, tiers, None))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_fixture() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-a-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#a'\n---\n\nMentions [[2026-06-12-b-adr]].\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        state.active_cell().rebuild_and_swap().unwrap();
        (dir, state)
    }

    fn active_scope(state: &AppState) -> String {
        state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    fn document_body(scope: String) -> GraphQueryBody {
        GraphQueryBody {
            scope,
            filter: None,
            granularity: Some("document".to_string()),
            as_of: None,
            lens: None,
            focus: None,
            corpus: None,
            dir_prefix: None,
            languages: None,
        }
    }

    #[tokio::test]
    async fn full_route_carries_generation_and_an_opaque_slice_token() {
        // D2/D3: the present-view document route serves the generation + the token
        // the client returns in a delta request.
        let (_dir, state) = vault_fixture();
        let scope = active_scope(&state);
        let Json(body) = graph_query_route(State(state), Json(document_body(scope)))
            .await
            .expect("serves");
        assert!(
            body["data"]["generation"].as_u64().is_some(),
            "generation served"
        );
        assert!(
            body["data"]["slice_token"]
                .as_str()
                .is_some_and(|t| !t.is_empty()),
            "an opaque slice_token is echoed: {body}"
        );
    }

    #[tokio::test]
    async fn delta_round_trips_the_token_to_a_ring_hit_then_short_circuits() {
        // Guard #1 round-trip: serve the full route (token T at gen G), then request
        // the delta with T + since=G — the ring HITS (Unchanged, not full_required).
        let (_dir, state) = vault_fixture();
        let scope = active_scope(&state);
        let Json(full) =
            graph_query_route(State(state.clone()), Json(document_body(scope.clone())))
                .await
                .expect("serves");
        let token = full["data"]["slice_token"].as_str().unwrap().to_string();
        let generation = full["data"]["generation"].as_u64().unwrap();
        let Json(delta) = graph_query_delta_route(
            State(state),
            Json(GraphQueryDeltaBody {
                query: document_body(scope),
                since: generation,
                slice_token: token,
            }),
        )
        .await
        .expect("delta serves");
        // since == current → empty delta (a ring HIT, never full_required).
        assert_eq!(delta["data"]["generation"], generation);
        assert!(
            delta["data"]["full_required"].is_null(),
            "the round-tripped token hit the ring: {delta}"
        );
        assert_eq!(delta["data"]["changed_nodes"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn delta_full_requires_an_unknown_token_and_a_feature_shape() {
        let (_dir, state) = vault_fixture();
        let scope = active_scope(&state);
        // An unknown token → full_required (never served / evicted / other process).
        let Json(unknown) = graph_query_delta_route(
            State(state.clone()),
            Json(GraphQueryDeltaBody {
                query: document_body(scope.clone()),
                since: 0,
                slice_token: "no-such-token".to_string(),
            }),
        )
        .await
        .expect("serves");
        assert_eq!(
            unknown["data"]["full_required"], true,
            "unknown token → full_required"
        );

        // A feature-granularity request is not delta-eligible → full_required (guard #2),
        // WITHOUT building or recording a document slice.
        let mut feature = document_body(scope);
        feature.granularity = Some("feature".to_string());
        let Json(feat) = graph_query_delta_route(
            State(state),
            Json(GraphQueryDeltaBody {
                query: feature,
                since: 1,
                slice_token: "anything".to_string(),
            }),
        )
        .await
        .expect("serves");
        assert_eq!(
            feat["data"]["full_required"], true,
            "feature shape → full_required"
        );
    }
}
