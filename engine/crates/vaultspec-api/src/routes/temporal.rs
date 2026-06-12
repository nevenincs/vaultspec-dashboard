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
    validate_scope(&state, &params.scope)?;
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
    // Event sourcing shared with the CLI verb via the query core (G7).
    let workspace = ingest_git::workspace::Workspace::discover(&state.root)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let mut rows: Vec<EventRow> = engine_query::events::commit_rows(&workspace, "HEAD", 5000)
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
    Ok(Json(json!({"payload": payload})))
}

#[derive(Deserialize)]
pub struct AsofParams {
    pub scope: String,
    /// A ref name or commit sha.
    pub t: String,
}

pub async fn graph_asof(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AsofParams>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let scope = engine_model::ScopeRef::Ref {
        name: params.t.clone(),
    };
    let graph = engine_graph::asof::asof_graph(&state.root, &params.t, &scope, 0)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let slice = engine_query::graph::graph_query(
        &graph,
        &scope,
        engine_query::filter::Filter::default(),
        engine_query::graph::Granularity::Document,
    )
    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(json!({
        "t": params.t,
        "nodes": slice.nodes,
        "edges": slice.edges,
        // A HISTORICAL keyframe carries no live-clock position (audit N2):
        // splicing to LIVE requires a present keyframe (/graph/query
        // without as_of) whose deltas arrive on the stream's sequence.
        "last_seq": Value::Null,
        "tiers": serde_json::to_value(engine_query::envelope::asof_tiers_block())
            .expect("tiers serialize"),
    })))
}

#[derive(Deserialize)]
pub struct DiffParams {
    pub scope: String,
    pub from: String,
    pub to: String,
}

pub async fn graph_diff(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiffParams>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let scope_from = engine_model::ScopeRef::Ref {
        name: params.from.clone(),
    };
    let scope_to = engine_model::ScopeRef::Ref {
        name: params.to.clone(),
    };
    let from_graph = engine_graph::asof::asof_graph(&state.root, &params.from, &scope_from, 0)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let to_graph = engine_graph::asof::asof_graph(&state.root, &params.to, &scope_to, 0)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;

    // Historical diffs number RESULT-LOCALLY (audit N2): a scrub must
    // never burn live-clock positions or manufacture stream gaps. Only
    // `commit_graph` advances the shared atomic; `last_seq` here is the
    // local log's end, and splicing to LIVE goes through a present
    // keyframe + the stream's own sequence space.
    let log = engine_graph::diff::diff(&from_graph, &to_graph, crate::app::now_ms(), 0);
    Ok(Json(json!({
        "deltas": log.entries,
        "last_seq": log.last_seq,
        "clock": "result-local",
        "tiers": serde_json::to_value(engine_query::envelope::asof_tiers_block())
            .expect("tiers serialize"),
    })))
}
