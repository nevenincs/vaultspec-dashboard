//! Route families (contract §3–§8).

pub mod ops;
pub mod query;
pub mod spa;
pub mod stream;
pub mod temporal;

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::AppState;

/// The present-view tier block as JSON (rag truthfully stated).
pub(crate) fn query_tiers(state: &AppState) -> serde_json::Value {
    let mut unavailable: Vec<(&'static str, String)> = Vec::new();
    // Semantic reflects live rag discovery.
    if let rag_client::RagAvailability::Unavailable { reason } =
        rag_client::client::discover(&state.root.join(".vault")).0
    {
        unavailable.push(("semantic", reason));
    }
    // Declared reflects whether the last rebuild ingested core's graph — the
    // tier never claims availability the index could not build.
    if let Ok(status) = state.declared_status.read()
        && let Some(reason) = status.as_ref()
    {
        unavailable.push(("declared", reason.clone()));
    }
    let refs: Vec<(&'static str, &str)> =
        unavailable.iter().map(|(t, r)| (*t, r.as_str())).collect();
    serde_json::to_value(engine_query::envelope::tiers_block(&refs)).expect("tiers serialize")
}

/// THE shared success envelope (audit L1, contract §2): every HTTP payload
/// travels as `{data, tiers, next_cursor?}` — the CLI's ok/command/status
/// vocabulary is the CLI's own; HTTP conforms to §2.
pub(crate) fn envelope(data: Value, tiers: Value, next_cursor: Option<String>) -> Json<Value> {
    let mut body = serde_json::Map::new();
    body.insert("data".into(), data);
    body.insert("tiers".into(), tiers);
    if let Some(cursor) = next_cursor {
        body.insert("next_cursor".into(), Value::String(cursor));
    }
    Json(Value::Object(body))
}

/// One canonical scope-token form everywhere (audit L2): absolute worktree
/// path, forward slashes, no Windows extended-length prefix.
pub(crate) fn scope_token(path: &std::path::Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

/// THE shared error response (audit N7, contract §2): every error carries
/// the tiers block too — absence of a tier is data even on failures.
pub(crate) fn api_error(
    state: &AppState,
    status: StatusCode,
    message: String,
) -> (StatusCode, Json<Value>) {
    (
        status,
        Json(json!({"error": message, "tiers": query_tiers(state)})),
    )
}
