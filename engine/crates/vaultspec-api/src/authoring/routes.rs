use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use serde_json::Value;

use crate::app::AppState;

/// Authoring domain status snapshot.
///
/// ENABLED as of the W03.P39 mount: the propose → review → apply → rollback route
/// family is live. Reports the ownership boundary + the V1 capability set.
pub async fn status(State(state): State<Arc<AppState>>) -> Json<Value> {
    super::response::enabled_status(&state)
}
