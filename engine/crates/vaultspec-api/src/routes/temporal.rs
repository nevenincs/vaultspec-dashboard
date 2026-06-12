//! Temporal endpoints (contract §5, W03.P11.S50): events with engine-side
//! bucketing, blob-true as-of snapshots, and the ordered diff log on the
//! single delta clock.

use std::sync::Arc;
use std::sync::atomic::Ordering;

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

fn bad_request(message: String) -> (StatusCode, Json<Value>) {
    (StatusCode::BAD_REQUEST, Json(json!({"error": message})))
}

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
        Some(p) => {
            parse_bucket_param(p).ok_or_else(|| bad_request(format!("unknown bucket `{p}`")))?
        }
    };
    // Event sourcing shared with the CLI verb via the query core (G7).
    let workspace = ingest_git::workspace::Workspace::discover(&state.root)
        .map_err(|e| bad_request(e.to_string()))?;
    let mut rows: Vec<EventRow> =
        engine_query::events::commit_rows(&workspace, "HEAD", 5000).map_err(bad_request)?;
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
        .map_err(|e| bad_request(e.to_string()))?;
    let slice = engine_query::graph::graph_query(
        &graph,
        &scope,
        engine_query::filter::Filter::default(),
        engine_query::graph::Granularity::Document,
    )
    .map_err(|e| bad_request(e.to_string()))?;
    Ok(Json(json!({
        "t": params.t,
        "nodes": slice.nodes,
        "edges": slice.edges,
        // Keyframe position on the delta clock, for client splicing.
        "last_seq": state.seq.load(Ordering::SeqCst).saturating_sub(1),
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
        .map_err(|e| bad_request(e.to_string()))?;
    let to_graph = engine_graph::asof::asof_graph(&state.root, &params.to, &scope_to, 0)
        .map_err(|e| bad_request(e.to_string()))?;

    // One monotonic delta clock shared with the live stream (REDLINE-3):
    // historical diff entries consume positions on the same sequence.
    let seq_start = state.seq.load(Ordering::SeqCst);
    let log = engine_graph::diff::diff(&from_graph, &to_graph, crate::app::now_ms(), seq_start);
    if !log.entries.is_empty() {
        state.seq.store(log.last_seq + 1, Ordering::SeqCst);
    }
    Ok(Json(json!({
        "deltas": log.entries,
        "last_seq": log.last_seq,
        "tiers": serde_json::to_value(engine_query::envelope::asof_tiers_block())
            .expect("tiers serialize"),
    })))
}
