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
use axum::response::{IntoResponse, Response};
use serde_json::json;

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
