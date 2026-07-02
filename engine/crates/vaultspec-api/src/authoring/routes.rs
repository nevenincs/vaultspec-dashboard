use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use serde_json::Value;

use crate::app::AppState;

/// Disabled-safe authoring status snapshot.
///
/// W01.P01 establishes the route family and ownership boundary only. Later
/// phases add the command model, durable store, streams, and apply adapter.
pub async fn status(State(state): State<Arc<AppState>>) -> Json<Value> {
    super::response::disabled_status(&state)
}
