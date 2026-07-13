//! Lifecycle wire surface (single-app-runtime D5): the bearer-gated
//! `/shutdown` route.
//!
//! The route only SIGNALS: it notifies the state's shutdown `Notify` and
//! answers through the shared envelope BEFORE the drain begins, so the
//! caller (the `vaultspec stop` verb, or the seat's own `restart`) gets a
//! confirmed acknowledgement rather than a dropped connection. The actual
//! drain — close SSE, finish in-flight requests bounded, retract discovery,
//! release the seat — is the serve loop's graceful-shutdown path, shared
//! with ctrl-c/SIGTERM so every exit route is the same code.

use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// POST `/shutdown` — request a graceful stop. Idempotent: a repeated call
/// while draining just re-notifies and re-acknowledges.
pub async fn shutdown(State(state): State<Arc<AppState>>) -> ApiResult {
    state.shutdown.notify_one();
    Ok(super::envelope(
        json!({
            "shutting_down": true,
            "pid": std::process::id(),
        }),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}
