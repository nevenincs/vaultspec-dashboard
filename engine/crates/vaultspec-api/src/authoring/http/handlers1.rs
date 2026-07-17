//! http handlers (module-decomposition, contiguous domain slice). See ./mod.rs.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use ingest_struct::reader::blob_oid;
use serde_json::{Value, json};

use super::super::api::{
    CancelRunRequest, CancelSessionRequest, ChangesetChildOperationDraft, CloseSessionRequest,
    CompleteRunRequest, CreateProposalRequest, CreateSessionRequest, InterruptResumeRequest,
    ResumeRunRequest, StartPromptTurnRequest, ToolPermissionDecisionRequest,
};
use super::super::apply::ApplyOutcome;
use super::super::approvals::{ApprovalError, ApprovalRequestRecord};
use super::super::model::{
    ActionEligibility, ActorRef, ApprovalId, ChangesetId, CommandKind, DocumentRef, IdempotencyKey,
    InterruptId, ProposalId, RevisionToken, RunId, SessionId, ToolCallId,
};
use super::super::modes::ModeAutoApprovalOutcome;
use super::super::principal::ResolvedCommand;
use super::super::proposal::{
    DraftProposalRequest, ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult,
};
use super::super::rebase::{
    CreateReplacementProposalRequest, RebaseProposalRequest, ReplacementProposalResult,
    create_replacement_proposal, rebase_proposal,
};
use super::super::security::{CommandAuthorization, authorize_command};
use super::super::snapshots::SnapshotReader;
use super::super::store::{Result as StoreResult, StoreError};
use super::super::tools::{AgentToolCall, ToolError};
use super::*;
use crate::app::{AppState, now_ms};

/// `GET /authoring/v1/agent-tools` — serve the semantic agent-tool catalog.
pub async fn agent_tool_catalog(State(state): State<Arc<AppState>>) -> Response {
    super::super::response::snapshot(&state, json!(super::super::tools::catalog())).into_response()
}

/// `POST /authoring/v1/agent-tools/prepare` — validate one semantic agent tool
/// call and return the backend command dispatch alias it would use. This is the
/// S152 wiring seam only: durable permission requests, interrupt resume, and
/// executable tool-call records remain later phases.
pub async fn prepare_agent_tool_call(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<AgentToolCall>,
) -> Response {
    let (actor, _command, idempotency_key, mut payload) = command.into_parts();
    if payload.idempotency_key.is_none() {
        payload.idempotency_key = Some(idempotency_key);
    }
    match super::super::tools::prepare_tool_call(payload) {
        Ok(prepared) => super::super::response::snapshot(
            &state,
            json!({
                "actor": actor,
                "prepared": prepared,
            }),
        )
        .into_response(),
        Err(err) => tool_error_response(&state, &err),
    }
}

pub(super) fn tool_error_response(state: &AppState, err: &ToolError) -> Response {
    super::super::response::typed_error(
        state,
        StatusCode::BAD_REQUEST,
        "authoring_tool_invalid",
        &err.to_string(),
    )
    .into_response()
}

/// `POST /authoring/v1/agent-tools/{tool_call_id}/permission-decision` — a human
/// grants or rejects a queued tool-permission request (W12.P41). The reviewer is the
/// server-resolved principal (ASA-010), never a body claim. Reviewer authority is the
/// P22-R1 gate reused verbatim inside `submit_decision` (human-only, not the requester
/// nor its delegate) — an authority denial rides the 200 envelope as a value
/// (denials-are-values); only a genuine fault (unknown request, conflicting decision)
/// is a non-200.
pub async fn decide_tool_permission(
    State(state): State<Arc<AppState>>,
    Path(tool_call_id): Path<ToolCallId>,
    command: ResolvedCommand<ToolPermissionDecisionRequest>,
) -> Response {
    let now = now_ms();
    let (reviewer, _command, _idempotency_key, payload) = command.into_parts();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
            uow.tool_permissions()
                .submit_decision(
                    &tool_call_id,
                    payload.decision,
                    &reviewer,
                    payload.comment,
                    now,
                )
                .map_err(permission_error_to_store)
        })
    }) {
        Ok(outcome) => tool_permission_outcome_response(&state, outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/interrupts/{interrupt_id}/resume` — resume a paused run by
/// resolving its interrupt BY ID (W12.P41, P32). Replay-safe: an already-resolved
/// interrupt returns its recorded decision unchanged (never re-decides). The decision is
/// the typed `InterruptResumeDecision` (S18): serialized as the stored blob so the read
/// projection parses it back through the same schema (write and read one language).
pub async fn resume_interrupt(
    State(state): State<Arc<AppState>>,
    Path(interrupt_id): Path<InterruptId>,
    command: ResolvedCommand<InterruptResumeRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    // Serialize the typed decision as the stored value; a serialization failure is an
    // internal fault, surfaced through the shared error taxonomy, never a silent drop.
    let decision_blob = match serde_json::to_string(&payload.decision) {
        Ok(blob) => blob,
        Err(err) => {
            return command_error_response(
                &state,
                &StoreError::Validation(format!(
                    "interrupt decision could not be serialized: {err}"
                )),
            );
        }
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::ResumeRun, |uow| {
            // Authorization floor (P05 review, HIGH): resuming an interrupt acts ON its
            // run — granting a pending tool permission or steering the agent — so the
            // resuming principal must be that run's owner or the owner's delegator,
            // exactly like `complete_run`. Without this, any standing actor could
            // approve a stranger's grant or inject prompts into an unrelated run.
            let interrupt = uow.interrupts().get(&interrupt_id)?.ok_or_else(|| {
                StoreError::Validation(format!("unknown interrupt `{interrupt_id}`"))
            })?;
            let run = uow.sessions().run(&interrupt.run_id)?.ok_or_else(|| {
                StoreError::Validation(format!(
                    "interrupt `{interrupt_id}` references unknown run `{}`",
                    interrupt.run_id
                ))
            })?;
            super::super::session::authorize_run_owner(&run, &actor)?;
            uow.interrupts()
                .resolve_interrupt(&interrupt_id, decision_blob, now)
        })
    }) {
        Ok(outcome) => super::super::response::snapshot(
            &state,
            json!({
                "status": "resumed",
                "replayed": outcome.replayed,
                "interrupt": outcome.record,
            }),
        )
        .into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// A tool-permission decision outcome as a tiered 200 value: the served eligibility
/// (granted or a distinct denial reason), the durable record, and whether the decision
/// replayed an earlier one.
pub(super) fn tool_permission_outcome_response(
    state: &AppState,
    outcome: super::super::permissions::ToolPermissionOutcome,
) -> Response {
    super::super::response::snapshot(
        state,
        json!({
            "status": if outcome.eligibility.allowed { "granted" } else { "denied" },
            "command": outcome.eligibility.command,
            "allowed": outcome.eligibility.allowed,
            "reason": outcome.eligibility.reason,
            "replayed": outcome.replayed,
            "record": outcome.record,
        }),
    )
    .into_response()
}

/// Map a `PermissionError` fault to the shared `StoreError` taxonomy so the one
/// `command_error_response` mapping applies: a store fault keeps its precise status
/// (e.g. an unregistered actor stays a 403), while an unknown request or a not-permitted
/// decision surfaces as a tool-permission refusal (422).
pub(super) fn permission_error_to_store(
    err: super::super::permissions::PermissionError,
) -> StoreError {
    match err {
        super::super::permissions::PermissionError::Store(store) => store,
        other => StoreError::Permission(other.to_string()),
    }
}

/// `POST /authoring/v1/sessions` — create a durable authoring workflow session.
pub async fn create_session(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<CreateSessionRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::create_session(store, context, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `GET /authoring/v1/sessions` — bounded session listing.
pub async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SessionListParams>,
) -> Response {
    let cap = params
        .cap
        .unwrap_or(super::super::session::SESSION_LIST_CAP_DEFAULT);
    match state.with_authoring_store(|store| {
        super::super::session::list_sessions(store, cap, params.after_ms, params.after_session_id)
    }) {
        Ok(page) => super::super::response::snapshot(&state, json!(page)).into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `GET /authoring/v1/sessions/{session_id}` — read one durable session snapshot.
pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
) -> Response {
    match state
        .with_authoring_store(|store| super::super::session::session_snapshot(store, session_id))
    {
        Ok(snapshot) => super::super::response::snapshot(&state, json!(snapshot)).into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/sessions/{session_id}/turns` — start a prompt turn. When a run
/// is already active the turn is ENQUEUED behind it (D2 bounded FIFO queue), not joined.
pub async fn start_prompt_turn(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
    command: ResolvedCommand<StartPromptTurnRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::start_prompt_turn(store, context, session_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/sessions/{session_id}/cancel` — explicitly terminate a session
/// (D2): cancel its active run if one exists, void every queued turn, and mark the
/// session `Cancelled`. Distinct from the run-scoped `POST /v1/runs/{run_id}/cancel`,
/// which leaves the session `Active`.
pub async fn cancel_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
    command: ResolvedCommand<CancelSessionRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::cancel_session(store, context, session_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/sessions/{session_id}/close` — gracefully close a session
/// (S13): the BENIGN terminal path marking it `Closed` and emitting `session.closed`.
/// Unlike `cancel`, it never tears down work — a session with a genuinely active run is
/// refused; it is idempotent (re-closing, or closing an already-terminal session,
/// publishes no duplicate transition).
pub async fn close_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
    command: ResolvedCommand<CloseSessionRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::CloseSession {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "session-close route requires command `close_session`",
        )
        .into_response();
    }
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::close_session(store, context, session_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/runs/{run_id}/cancel` — record durable cancellation.
pub async fn cancel_run(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<RunId>,
    command: ResolvedCommand<CancelRunRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::cancel_run(store, context, run_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/runs/{run_id}/complete` — settle an active run into its
/// terminal `Completed` state and emit `run.completed` on the durable feed. This
/// is the run-settle callback a run's driver reports through when turn processing
/// finishes; it is idempotent (a re-complete or a completion of an already-terminal
/// run publishes no duplicate transition) and leaves the owning session `Active`.
pub async fn complete_run(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<RunId>,
    command: ResolvedCommand<CompleteRunRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::complete_run(store, context, run_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/runs/{run_id}/resume` — join/read an existing run. It is
/// not LangGraph interrupt resume; that remains a later W12 permission phase.
pub async fn resume_run(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<RunId>,
    command: ResolvedCommand<ResumeRunRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::super::session::resume_run(store, context, run_id, payload)
    }) {
        Ok(result) => session_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Map a domain `StoreError` to a typed, tiers-bearing HTTP FAULT response.
///
/// Denials-are-values (ADR "denials are values; errors are faults"): an
/// eligibility refusal NEVER reaches here — it rides the SUCCESS envelope as a
/// denied value via [`proposal_result_response`]. So every `StoreError` is a
/// genuine fault, mapped by category: a client-correctable fault to a 4xx (with
/// the domain-authored, leak-free reason echoed), an authenticated-but-
/// unregistered actor to a 403 authz refusal, and an infrastructure fault
/// (`Ledger` now included) to a reason-suppressed 503.
pub(super) fn command_error_response(state: &AppState, err: &StoreError) -> Response {
    let (status, kind, message) = match err {
        StoreError::Idempotency(_) => (
            StatusCode::CONFLICT,
            "authoring_idempotency_conflict",
            err.to_string(),
        ),
        StoreError::Snapshot(_) => (
            StatusCode::CONFLICT,
            "authoring_stale_base",
            err.to_string(),
        ),
        // An optimistic-concurrency conflict: the client's `expected_revision` no
        // longer matches the ledger head — "your base is stale", a 409, not a 5xx.
        StoreError::StaleRevision(_) => (
            StatusCode::CONFLICT,
            "authoring_stale_revision",
            err.to_string(),
        ),
        // The reviewer reviewed a superseded proposal revision — a client conflict
        // ("you reviewed a stale snapshot"), a 409, never a 5xx.
        StoreError::StaleReview(_) => (
            StatusCode::CONFLICT,
            "authoring_stale_review",
            err.to_string(),
        ),
        StoreError::Validation(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_validation_failed",
            err.to_string(),
        ),
        StoreError::Approval(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_review_refused",
            err.to_string(),
        ),
        StoreError::Mode(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_mode_refused",
            err.to_string(),
        ),
        StoreError::Permission(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_tool_permission_refused",
            err.to_string(),
        ),
        StoreError::Session(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_session_refused",
            err.to_string(),
        ),
        // The completing principal is not the run's owner (or its delegator): an
        // owner-only authorization refusal on the run-settle command (D1), a 403.
        StoreError::RunForbidden(_) => (
            StatusCode::FORBIDDEN,
            "authoring_run_forbidden",
            err.to_string(),
        ),
        // The per-session turn queue is at `TURN_QUEUE_CAP` (D2): a typed
        // client-correctable refusal, a 422 with its own kind so the composer can
        // surface "queue full" distinctly from a generic session refusal.
        StoreError::TurnQueueFull(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_turn_queue_full",
            err.to_string(),
        ),
        // A comment CRUD fault (unknown comment, malformed anchor, cap/retention
        // refusal) is a client-correctable bad-request-shaped refusal: a 422.
        StoreError::Comment(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_comment_refused",
            err.to_string(),
        ),
        // A lease construction fault (empty scope, malformed id, bad schema). Lease
        // POLICY refusals — concurrent acquire, non-owner release, stale fencing token —
        // are eligibility VALUES on the success envelope, never this error, so a
        // `Lease` error is a genuine bad-request-shaped refusal: a 422.
        StoreError::Lease(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_lease_refused",
            err.to_string(),
        ),
        // A review-claim construction fault (empty id, malformed record, bad schema).
        // Review-station POLICY refusals — claiming a held item, a non-holder release, an
        // automated self-review — are eligibility VALUES on the success envelope, never
        // this error, so a `ReviewStation` error is a genuine bad-request-shaped fault: 422.
        StoreError::ReviewStation(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_review_station_refused",
            err.to_string(),
        ),
        // An authenticated principal that is not a registered/active actor is an
        // AUTHORIZATION refusal (the token resolved, but the actor cannot write) —
        // a 403, distinct from a bad request (422) or a store outage (503).
        StoreError::Actor(_) | StoreError::ActorToken(_) => (
            StatusCode::FORBIDDEN,
            "authoring_actor_forbidden",
            err.to_string(),
        ),
        StoreError::ReadOnlyCommandUnitOfWork { .. } => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_internal_error",
            "authoring command dispatch error".to_string(),
        ),
        // Infrastructure failures: suppress the reason (a path/`file:line` may leak)
        // and degrade honestly. `Ledger` is PURE infrastructure now that eligibility
        // denials are values (a `Ledger` error is a ledger serialize/IO fault).
        StoreError::Sqlite(_)
        | StoreError::Io(_)
        | StoreError::SchemaVersion { .. }
        | StoreError::MigrationMetadata(_)
        | StoreError::Ledger(_)
        | StoreError::Retention(_)
        | StoreError::Outbox(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            STORE_UNAVAILABLE_KIND,
            "authoring store is unavailable".to_string(),
        ),
    };
    super::super::response::typed_error(state, status, kind, &message).into_response()
}

/// Map a completed proposal command to its status + VALUE: an accepted outcome and
/// an idempotent replay both serve the outcome (200); a still-in-flight prior
/// attempt is 202 so the client continues rather than re-issuing; an eligibility
/// DENIAL rides the 200 success envelope as a denied value (denials-are-values),
/// never a 4xx fault. Shared by every proposal-command route AND the `/execute`
/// agent-tool seam — one result mapping, no drift.
pub(super) fn proposal_result_value(result: &ProposalCommandResult) -> (StatusCode, Value) {
    match result {
        ProposalCommandResult::Accepted { outcome, .. } => (
            StatusCode::OK,
            serde_json::to_value(outcome).expect("proposal outcome serializes"),
        ),
        ProposalCommandResult::Replayed { idempotency } => (
            StatusCode::OK,
            idempotency
                .outcome
                .as_ref()
                .map(|outcome| outcome.payload.clone())
                .unwrap_or_else(|| json!({ "status": "replayed" })),
        ),
        ProposalCommandResult::InFlight { .. } => {
            (StatusCode::ACCEPTED, json!({ "status": "in_flight" }))
        }
        // Denials are VALUES: an eligibility refusal rides the SUCCESS envelope
        // (200) as a denied decision carrying the domain reason, never a 4xx fault
        // (denials-are-values ADR; errors are faults).
        ProposalCommandResult::Denied { eligibility } => {
            (StatusCode::OK, denial_value(eligibility))
        }
    }
}

pub(super) fn proposal_result_response(
    state: &AppState,
    result: ProposalCommandResult,
) -> Response {
    let (status, value) = proposal_result_value(&result);
    (status, super::super::response::snapshot(state, value)).into_response()
}

/// The shared `ProposalCommandContext` shape every proposal-command call site
/// builds — a bounded in-flight reservation + a bounded replay-retention window.
pub(super) fn proposal_context(
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now: i64,
) -> ProposalCommandContext {
    ProposalCommandContext {
        actor,
        idempotency_key,
        now_ms: now,
        in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
        outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
    }
}

/// Map a completed session command to its status + VALUE. Shared by every
/// session-command route AND the `/execute` agent-tool seam.
pub(super) fn session_result_value(
    result: &super::super::session::SessionCommandResult,
) -> (StatusCode, Value) {
    match result {
        super::super::session::SessionCommandResult::Accepted { outcome, .. }
        | super::super::session::SessionCommandResult::Replayed { outcome, .. } => (
            StatusCode::OK,
            serde_json::to_value(outcome).expect("session outcome serializes"),
        ),
        super::super::session::SessionCommandResult::InFlight { idempotency } => (
            StatusCode::ACCEPTED,
            json!({
                "status": "in_flight",
                "command": idempotency.key_scope.command,
                "idempotency_key": idempotency.key_scope.key,
                "scope": {
                    "kind": idempotency.scope.kind,
                    "id": idempotency.scope.id,
                },
            }),
        ),
    }
}

pub(super) fn session_result_response(
    state: &AppState,
    result: super::super::session::SessionCommandResult,
) -> Response {
    let (status, value) = session_result_value(&result);
    (status, super::super::response::snapshot(state, value)).into_response()
}

pub(super) fn session_context(
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now: i64,
) -> super::super::session::SessionCommandContext {
    super::super::session::SessionCommandContext {
        actor,
        idempotency_key,
        now_ms: now,
        in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
        outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
    }
}

/// A denied eligibility as a 200 SUCCESS-envelope VALUE (denials-are-values ADR):
/// the shared shape every command surface uses for a refusal — status, the command
/// it refused, and the domain reason. The value form is reused by every per-command
/// result mapper (`proposal_result_value`, `session_result_value`, ...) AND by the
/// `/execute` agent-tool seam, so a denial never drifts between surfaces.
pub(super) fn denial_value(eligibility: &ActionEligibility) -> Value {
    json!({
        "status": "denied",
        "command": eligibility.command,
        "allowed": eligibility.allowed,
        "reason": eligibility.reason,
    })
}

pub(super) fn denial_snapshot(state: &AppState, eligibility: &ActionEligibility) -> Response {
    super::super::response::snapshot(state, denial_value(eligibility)).into_response()
}

/// The SERVER-AUTHORITATIVE authorized scope for a mutating command: the active
/// workspace's `scope_token`. This is the EXACT identifier `DocumentResolver` writes into
/// `DocumentRef::Existing.scope`, so a target claiming a different worktree path is a
/// cross-workspace claim the scope guard refuses. Parity is load-bearing — `engine_model`
/// `scope_token` (what `DocumentResolver` uses), never the mode layer's simpler
/// `scope_id_for_worktree` (which diverges on the Windows extended-length prefix).
pub(super) fn active_authorized_scope(state: &AppState) -> String {
    engine_model::scope_token(&state.active_workspace_root())
}

/// Run the composed authorization engine ([`authorize_command`]) for one mutating command
/// over a bounded actor-registry read (W14.P42a). Standing + delegation always run; the
/// document-scope guard runs when an `authorized_scope` is supplied AND `targets` are
/// present; the review-authority guard runs for approve/apply-class commands carrying an
/// `origin_author`. A refusal is a VALUE (`Ok(ActionEligibility { allowed: false, .. })`);
/// only a genuine infrastructure failure is `Err`. The identity read rides a FIXED
/// mutating command's unit of work (the house pattern: a deferred transaction that commits
/// empty) — keying it on the ACTUAL `command` would reject a non-mutating one (a read tool
/// routed through `/execute`) as a read-only-unit-of-work fault; the real command is still
/// what `authorize_command` decides against.
pub(super) fn run_authorization(
    state: &AppState,
    command: CommandKind,
    actor: &ActorRef,
    authorized_scope: Option<&str>,
    targets: &[&DocumentRef],
    origin_author: Option<&ActorRef>,
) -> Result<ActionEligibility, AuthorizationFault> {
    let outcome = state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateSession, |uow| {
            let authorization = CommandAuthorization {
                command,
                actor,
                authorized_scope,
                targets,
                origin_author,
            };
            Ok(authorize_command(&uow.actors(), &authorization))
        })
    });
    match outcome {
        Ok(Ok(eligibility)) => Ok(eligibility),
        // A `SecurityFault` is already redacted at the engine; never echoed.
        Ok(Err(_security_fault)) => Err(AuthorizationFault::Backend),
        Err(_store_error) => Err(AuthorizationFault::StoreUnavailable),
    }
}

/// Render an authorization infrastructure fault as a redacted, tiers-bearing error for a
/// handler that returns a [`Response`] (the extractor renders its own rejection shape).
pub(super) fn authorization_fault_response(
    state: &AppState,
    fault: AuthorizationFault,
) -> Response {
    match fault {
        AuthorizationFault::StoreUnavailable => super::super::response::typed_error(
            state,
            StatusCode::SERVICE_UNAVAILABLE,
            STORE_UNAVAILABLE_KIND,
            "authoring store is unavailable",
        )
        .into_response(),
        AuthorizationFault::Backend => super::super::response::typed_error(
            state,
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_internal_error",
            "an internal authorization check could not be completed",
        )
        .into_response(),
    }
}

/// `POST /authoring/v1/proposals` — open a new authoring changeset (a Draft
/// proposal). The wire `CreateProposalRequest` IS the domain input; the actor is
/// the middleware-RESOLVED principal (ASA-010), never a body claim. The domain
/// handler owns its own idempotency + unit of work.
pub async fn create_proposal(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<CreateProposalRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    // W14.P42a — document-scope guard: fence every drafted target against the active
    // workspace's SERVER-AUTHORITATIVE authorized scope. Standing + delegation already
    // cleared at the extractor floor; a target claiming a different workspace is a denial
    // VALUE on the 200 envelope (denials-are-values), never a fault.
    if let Some(denied) =
        authorize_targets_or_deny(&state, command_kind, &actor, &payload.operations)
    {
        return denied;
    }
    let context = proposal_context(actor, idempotency_key, now);
    // The materializer reads the vault worktree (parent of `.vault`).
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    match state.with_authoring_store(|store| {
        super::super::proposal::create_proposal(store, &reader, context, payload)
    }) {
        Ok(result) => proposal_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Fence a mutating command's client-supplied operation targets against the active
/// workspace's authorized scope (W14.P42a document-scope guard). Standing + delegation are
/// already enforced at the extractor floor; this adds the target/scope dimension for the
/// handlers that carry drafted `DocumentRef` targets. Returns the denial `Response` when a
/// target is out of scope (a value) or authorization faults (redacted), or `None` when the
/// command may proceed.
pub(super) fn authorize_targets_or_deny(
    state: &AppState,
    command: CommandKind,
    actor: &ActorRef,
    operations: &[ChangesetChildOperationDraft],
) -> Option<Response> {
    let authorized_scope = active_authorized_scope(state);
    let targets: Vec<&DocumentRef> = operations
        .iter()
        .map(|operation| &operation.target.document)
        .collect();
    match run_authorization(
        state,
        command,
        actor,
        Some(&authorized_scope),
        &targets,
        None,
    ) {
        Ok(eligibility) if eligibility.allowed => None,
        Ok(eligibility) => Some(denial_snapshot(state, &eligibility)),
        Err(fault) => Some(authorization_fault_response(state, fault)),
    }
}

/// Which draft-mutation domain handler a draft route dispatches to.
#[derive(Clone, Copy)]
pub(super) enum DraftRoute {
    Append,
    Replace,
}

/// Shared body of the append/replace draft routes: resolve the path changeset id,
/// reject a body that names a DIFFERENT changeset (coherence), then dispatch to the
/// shipped `append_draft`/`replace_draft` domain handler. The actor is the
/// middleware-resolved principal; the handler owns its own idempotency + unit of work.
pub(super) async fn mutate_proposal_draft(
    state: Arc<AppState>,
    changeset_id: String,
    command: ResolvedCommand<DraftProposalRequest>,
    route: DraftRoute,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if payload.changeset_id != changeset_id {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "path changeset id does not match the request body",
        )
        .into_response();
    }
    // W14.P42a — document-scope guard: fence the appended/replaced targets against the
    // active workspace's authorized scope, the same as create.
    if let Some(denied) =
        authorize_targets_or_deny(&state, command_kind, &actor, &payload.operations)
    {
        return denied;
    }
    let context = proposal_context(actor, idempotency_key, now);
    match dispatch_draft_mutation(&state, context, payload, route) {
        Ok(result) => proposal_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// The append/replace draft dispatch: builds its own worktree-scoped reader and
/// routes to the shipped `append_draft`/`replace_draft` domain handler. Shared by
/// the `/append`/`/replace` HTTP routes AND the `/execute` agent-tool seam's
/// `propose_changeset` append/replace aliases — one implementation, no drift.
pub(super) fn dispatch_draft_mutation(
    state: &Arc<AppState>,
    context: ProposalCommandContext,
    request: DraftProposalRequest,
    route: DraftRoute,
) -> StoreResult<ProposalCommandResult> {
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    state.with_authoring_store(|store| match route {
        DraftRoute::Append => {
            super::super::proposal::append_draft(store, &reader, context, request)
        }
        DraftRoute::Replace => {
            super::super::proposal::replace_draft(store, &reader, context, request)
        }
    })
}

/// `POST /authoring/v1/proposals/{changeset_id}/append` — append operations to a draft
/// changeset (the executable route behind the `propose_changeset`/append tool alias).
pub async fn append_proposal_draft(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
    command: ResolvedCommand<DraftProposalRequest>,
) -> Response {
    mutate_proposal_draft(state, changeset_id, command, DraftRoute::Append).await
}

/// `POST /authoring/v1/proposals/{changeset_id}/replace` — replace a draft changeset's
/// operations (the executable route behind the `propose_changeset`/replace tool alias).
pub async fn replace_proposal_draft(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
    command: ResolvedCommand<DraftProposalRequest>,
) -> Response {
    mutate_proposal_draft(state, changeset_id, command, DraftRoute::Replace).await
}

// --- explicit rebase / supersession (W13.P28, wired W14.P42a) ------------------

/// `POST /authoring/v1/proposals/{changeset_id}/rebase` — rebase a CONFLICTED changeset
/// onto the current document state in place, producing a fresh reviewable `Draft`
/// revision. Mirrors the draft-mutation shape: the path changeset id must match the body
/// (coherence), and the domain handler owns its own idempotency + unit of work. A
/// non-conflicted head or an anchor-drift child rides the 200 envelope as a denial VALUE; a
/// stale `expected_revision` is a typed conflict fault. The actor is the middleware-resolved
/// principal (standing already cleared at the extractor floor).
pub async fn rebase_changeset(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
    command: ResolvedCommand<RebaseProposalRequest>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    if payload.changeset_id != changeset_id {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "path changeset id does not match the request body",
        )
        .into_response();
    }
    let context = proposal_context(actor, idempotency_key, now);
    let worktree_root = state.active_workspace_root();
    match state
        .with_authoring_store(|store| rebase_proposal(store, &worktree_root, context, payload))
    {
        Ok(result) => proposal_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Map a two-legged replacement outcome to a response that surfaces BOTH legs faithfully:
/// the create (`replacement`) leg drives the HTTP status, and the value carries the
/// replacement result plus the supersession result (`null` when the create did not land, so
/// the source was never superseded). A denied/in-flight create is visibly distinct from a
/// completed supersede.
pub(super) fn replacement_result_response(
    state: &AppState,
    result: ReplacementProposalResult,
) -> Response {
    let (status, replacement_value) = proposal_result_value(&result.replacement);
    let supersession_value = result
        .supersession
        .as_ref()
        .map(|supersession| proposal_result_value(supersession).1);
    let value = json!({
        "replacement": replacement_value,
        "supersession": supersession_value,
    });
    (status, super::super::response::snapshot(state, value)).into_response()
}

/// `POST /authoring/v1/replacement-proposals` — supersede a stale-but-not-conflicted source
/// with a fresh candidate seeded from its carried-forward operations. The source id is in
/// the request body (there is no single path resource — the command spans two changesets).
/// CREATE-then-SUPERSEDE: the source is never superseded unless the replacement create
/// landed. The actor is the middleware-resolved principal.
pub async fn create_replacement(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<CreateReplacementProposalRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = proposal_context(actor, idempotency_key, now);
    let worktree_root = state.active_workspace_root();
    match state.with_authoring_store(|store| {
        create_replacement_proposal(store, &worktree_root, context, payload)
    }) {
        Ok(result) => replacement_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

// --- submit for review (composite: validate + submit + open approval) ---------

/// The reduced outcome of one composed proposal command: its recorded outcome
/// (on accept OR idempotent replay), a denial VALUE, or a still-in-flight prior
/// attempt the composition must not run past.
pub(super) enum StepOutcome {
    Outcome {
        outcome: ProposalCommandOutcome,
        replayed: bool,
    },
    Denied(ActionEligibility),
    InFlight,
}

/// Reduce a `ProposalCommandResult` to the outcome the composition threads
/// forward, deserializing the recorded outcome on an idempotent replay.
pub(super) fn reduce_step(result: ProposalCommandResult) -> StoreResult<StepOutcome> {
    Ok(match result {
        ProposalCommandResult::Accepted { outcome, .. } => StepOutcome::Outcome {
            outcome,
            replayed: false,
        },
        ProposalCommandResult::Replayed { idempotency } => {
            let payload = idempotency
                .outcome
                .ok_or_else(|| {
                    StoreError::Idempotency(
                        "replayed proposal command carries no recorded outcome".to_string(),
                    )
                })?
                .payload;
            let outcome: ProposalCommandOutcome =
                serde_json::from_value(payload).map_err(|err| {
                    StoreError::Idempotency(format!(
                        "recorded proposal outcome is unreadable: {err}"
                    ))
                })?;
            StepOutcome::Outcome {
                outcome,
                replayed: true,
            }
        }
        ProposalCommandResult::InFlight { .. } => StepOutcome::InFlight,
        ProposalCommandResult::Denied { eligibility } => StepOutcome::Denied(eligibility),
    })
}

/// The composed submit outcome: a denial value at validate or submit, an in-flight
/// prior attempt, or the reviewed revision + derived proposal/approval ids + the
/// opened approval the reviewer needs.
pub(super) enum SubmitComposite {
    Denied(ActionEligibility),
    InFlight,
    Submitted {
        changeset_id: ChangesetId,
        needs_review_revision: RevisionToken,
        validation_digest: String,
        proposal_id: ProposalId,
        // Boxed: the durable approval record dwarfs the other variants, so boxing
        // it keeps `SubmitComposite` small (clippy::large_enum_variant).
        approval: Box<ApprovalRequestRecord>,
        replayed: bool,
    },
}

pub(super) struct ModePostSubmitOutcome {
    pub(super) auto_approval: ModeAutoApprovalOutcome,
    pub(super) apply: Option<ApplyOutcome>,
}

/// The proposal ↔ approval identity is 1:1 in V1: the proposal id is DERIVED
/// deterministically from the changeset id (hashed like the apply/rollback receipt
/// ids — a long changeset id can never overflow the id cap, and a client-opaque
/// value never leaks). The submit response echoes it so the reviewer can name it.
pub(super) fn derive_proposal_id(changeset_id: &ChangesetId) -> StoreResult<ProposalId> {
    ProposalId::new(format!(
        "proposal:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived proposal id is invalid: {err}")))
}

/// The approval-request id, likewise derived deterministically from the changeset
/// (1:1 with the proposal in V1), so a submit retry opens the SAME request.
pub(super) fn derive_approval_id(changeset_id: &ChangesetId) -> StoreResult<ApprovalId> {
    ApprovalId::new(format!(
        "approval:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived approval id is invalid: {err}")))
}

/// A composed sub-command idempotency key `{base}:{step}` so each internal step of
/// the submit composition dedups independently and a whole-submit retry replays
/// every step.
pub(super) fn step_key(base: &IdempotencyKey, step: &str) -> StoreResult<IdempotencyKey> {
    IdempotencyKey::new(format!("{}:{step}", base.as_str())).map_err(|err| {
        StoreError::Idempotency(format!("composed idempotency key is invalid: {err}"))
    })
}

/// Map an `ApprovalError` to a `StoreError` so an approval step composes inside a
/// unit of work: a nested store fault surfaces verbatim; a domain approval refusal
/// becomes a typed approval error (mapped to a 4xx by the taxonomy).
pub(super) fn approval_err_to_store(err: ApprovalError) -> StoreError {
    match err {
        ApprovalError::Store(store) => store,
        other => StoreError::Approval(other.to_string()),
    }
}
