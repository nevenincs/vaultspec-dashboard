//! agent-wire-gaps read routes (D3/D5). Principal-permissive GET handlers that
//! expose durable authoring state the shipped frontend interims work around today:
//! a run's interrupt listing (recovery of a lost `awaiting_permission` response) and
//! the active scope's operation mode (so the autonomy control renders pre-proposal).
//!
//! These are additive READ routes, mounted from `./mod.rs`. Each rides the shared
//! tiers envelope via `response::snapshot` and maps a store fault through the one
//! `command_error_response` taxonomy — no hand-built bodies.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use super::super::api::CreateFeedbackBatchRequest;
use super::super::feedback::CreateFeedbackBatchInput;
use super::super::interrupts::INTERRUPT_LIST_CAP;
use super::super::model::{CommandKind, RunId};
use super::super::modes::scope_id_for_worktree;
use super::*;
use crate::app::AppState;

/// `GET /authoring/v1/runs/{run_id}/interrupts` — the bounded, raise-order interrupt
/// listing for a run (agent-wire-gaps ADR D3). A recovery read: a client that dropped
/// the tool-execute `awaiting_permission` response reads its pending interrupts back
/// from here, each carrying the typed per-kind decision projection (`decision_unreadable`
/// for a legacy opaque decision) and a `truncated` marker at `INTERRUPT_LIST_CAP`.
/// Principal-permissive like every other authoring read; an unknown run serves an empty
/// page rather than a fault.
pub async fn get_run_interrupts(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<RunId>,
) -> Response {
    match state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            uow.interrupts()
                .interrupts_list_page(&run_id, INTERRUPT_LIST_CAP)
        })
    }) {
        Ok(page) => super::super::response::snapshot(&state, json!(page)).into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `GET /authoring/v1/mode` — the active workspace scope's operation-mode record
/// (agent-wire-gaps ADR D5). Reads the SAME record the write (`POST /v1/mode`) round-trips
/// — the store's `current_record`, which resolves the default record when the scope was
/// never set — so the autonomy control renders pre-proposal from the wire instead of
/// inferring mode from an empty review queue. The scope is backend-derived from the active
/// worktree (never client-claimed), via the SAME `scope_id_for_worktree` the write uses so
/// the two agree on the scope. `updated_at_ms` is the record's effective-at timestamp
/// (`created_at_ms`: every mode-set writes a fresh record).
pub async fn get_operation_mode(State(state): State<Arc<AppState>>) -> Response {
    let scope_id = scope_id_for_worktree(&state.active_workspace_root());
    match state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            uow.modes().current_record(&scope_id)
        })
    }) {
        Ok(record) => super::super::response::snapshot(
            &state,
            json!({
                "scope_id": record.scope_id,
                "mode": record.mode,
                "actor": record.actor,
                "policy_id": record.policy_id,
                "policy_version": record.policy_version,
                "updated_at_ms": record.created_at_ms,
            }),
        )
        .into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/feedback-batches` — freeze an immutable, digest-addressed
/// feedback batch (agent-wire-gaps ADR D7 / feedback-loop ADR D3+D4). The author is
/// the middleware-resolved principal; the target session must exist (the batch is
/// session-scoped — the turn-time consumption fence re-verifies ownership). Identical
/// content replays the stored record idempotently; the receipt is `{batch_id, digest}`.
pub async fn create_feedback_batch_route(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<CreateFeedbackBatchRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, _idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::CreateFeedbackBatch {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "feedback-batch route requires command `create_feedback_batch`",
        )
        .into_response();
    }
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateFeedbackBatch, |uow| {
            if uow.sessions().session(&payload.session_id)?.is_none() {
                return Err(crate::authoring::store::StoreError::Validation(format!(
                    "unknown session `{}` for feedback batch",
                    payload.session_id.as_str()
                )));
            }
            uow.feedback_batches().create(CreateFeedbackBatchInput {
                session_id: payload.session_id.clone(),
                source_document: payload.source_document.clone(),
                source_revision: payload.source_revision.clone(),
                author: actor.clone(),
                items: payload.items.clone(),
                instruction: payload.instruction.clone(),
                created_at_ms: now,
            })
        })
    }) {
        Ok(outcome) => super::super::response::snapshot(
            &state,
            json!({
                "status": if outcome.replayed { "replayed" } else { "recorded" },
                "batch_id": outcome.record.feedback_batch_id,
                "digest": outcome.record.digest,
                "comment_count": outcome.record.items.len(),
                "total_bytes": outcome.record.total_bytes,
            }),
        )
        .into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `GET /authoring/v1/feedback-batches/{feedback_batch_id}` — the frozen snapshot
/// (principal-permissive read, like every authoring read). An unknown id is an
/// honest 404, never an empty fabrication.
pub async fn get_feedback_batch(
    State(state): State<Arc<AppState>>,
    Path(feedback_batch_id): Path<String>,
) -> Response {
    match state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            uow.feedback_batches().get(&feedback_batch_id)
        })
    }) {
        Ok(Some(record)) => {
            super::super::response::snapshot(&state, json!({ "batch": record })).into_response()
        }
        Ok(None) => super::super::response::typed_error(
            &state,
            StatusCode::NOT_FOUND,
            "authoring_feedback_batch_not_found",
            "no feedback batch exists under that id",
        )
        .into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}
