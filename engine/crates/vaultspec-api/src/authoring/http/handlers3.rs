//! http handlers (module-decomposition, contiguous domain slice). See ./mod.rs.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use ingest_struct::reader::blob_oid;
use serde_json::{Value, json};

use super::super::actors::{ActorDisplayMetadata, ActorRecordInput};
use super::super::api::{
    ApplyRequest as ApplyRequestDto, CommentUpdateRequest, CreateCommentRequest,
    DeleteCommentRequest, IssueActorTokenRequest, LeaseAcquireRequest, LeaseReleaseRequest,
    LeaseRenewRequest, RollbackRequest as RollbackRequestDto,
};
use super::super::apply::{ApplyError, ApplyOutcome, ApplyRequest};
use super::super::comments::{
    COMMENT_LIST_CAP_DEFAULT, COMMENT_LIST_CAP_MAX, CommentDocument, CreateCommentInput,
    ServedComment, create_comment, delete_comment, mint_comment_id, reanchor_comment,
    serve_comment, set_comment_resolved, update_comment_body,
};
use super::super::core_adapter::CoreAdapter;
use super::super::documents::{DocumentResolver, ExistingDocumentLookup};
use super::super::executor::{
    ExecuteDisposition, ExecuteOutcome, ExecuteToolCallRequest, execute_tool_call,
};
use super::super::leases::AcquireLeaseInput;
use super::super::model::{
    ActorId, ActorRef, ApplyState, ApprovalId, ChangesetId, CommandKind, CommentId, DocumentRef,
    IdempotencyKey, ProposalId, RunId, ToolCallId,
};
use super::super::modes::scope_id_for_worktree;
use super::super::policy::ToolRiskTier;
use super::super::principal::ResolvedCommand;
use super::super::proposal::{DraftProposalRequest, TerminalProposalRequest};
use super::super::rollback::{RollbackOutcome, RollbackRequest, RollbackSourceChild};
use super::super::security::tool_requester_kind_guard;
use super::super::snapshots::SnapshotReader;
use super::super::store::{Result as StoreResult, StoreError};
use super::super::tools::{
    AgentToolCall, CancelProposalAlias, DraftAlias, PreparedToolCall, PreparedToolDispatch,
    ProposeChangesetDispatch, SemanticToolName, ValidateProposalToolInput,
};
use super::*;
use crate::app::{AppState, now_ms};

/// `POST /authoring/v1/leases` — acquire (or idempotently re-acquire) an advisory lease on
/// a target document's scope. A concurrent hold by another actor rides the 200 envelope as
/// a denial value; a fresh acquisition returns the lease row with its monotonic fencing
/// token. The holder is the middleware-resolved principal, never a body claim.
pub async fn acquire_lease(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<LeaseAcquireRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let scope_id = match lease_scope_for_target(&state, &payload.target) {
        Some(scope_id) => scope_id,
        None => return lease_target_invalid(&state),
    };
    let input = AcquireLeaseInput {
        scope_id,
        purpose: payload.purpose,
        holder: actor,
        idempotency_key: idempotency_key.as_str().to_string(),
        created_at_ms: now,
        ttl_ms: payload.ttl_ms.map(|ttl| ttl as i64),
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::AcquireLease, |uow| {
            uow.leases().acquire_lease(input)
        })
    }) {
        Ok(outcome) => lease_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/leases/renew` — extend a live lease's TTL (owner-only; the fencing
/// token is unchanged). A non-owner or lapsed renewal is a denial value.
pub async fn renew_lease(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<LeaseRenewRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    let scope_id = match lease_scope_for_target(&state, &payload.target) {
        Some(scope_id) => scope_id,
        None => return lease_target_invalid(&state),
    };
    let ttl_ms = payload.ttl_ms.map(|ttl| ttl as i64);
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::RenewLease, |uow| {
            uow.leases().renew_lease(&scope_id, &actor, ttl_ms, now)
        })
    }) {
        Ok(outcome) => lease_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/leases/release` — release a live lease (owner-only). A non-owner
/// release is refused as a value and leaves the lease held by its owner.
pub async fn release_lease(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<LeaseReleaseRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    let scope_id = match lease_scope_for_target(&state, &payload.target) {
        Some(scope_id) => scope_id,
        None => return lease_target_invalid(&state),
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::ReleaseLease, |uow| {
            uow.leases().release_lease(&scope_id, &actor, now)
        })
    }) {
        Ok(outcome) => lease_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

// --- section-anchored comments (authoring-surface ADR D2) ---------------------

#[derive(Debug, serde::Deserialize)]
pub(crate) struct CommentListParams {
    #[serde(default)]
    cap: Option<u32>,
}

/// `GET /authoring/v1/documents/{node_id}/comments` — the bounded, backend-served
/// comment listing for one document. Each stored anchor is resolved EXACT-OR-CONFLICT
/// against the CURRENT worktree body (read through the shared document-read seam), so
/// the served `orphaned` flag is authoritative and never frontend-derived. A document
/// that cannot be read at all serves its comments as orphaned (missing anchor), the
/// honest "the section is unreachable" signal. Reads are principal-permissive.
pub async fn list_comments(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<String>,
    Query(params): Query<CommentListParams>,
) -> Response {
    let cap = params
        .cap
        .unwrap_or(COMMENT_LIST_CAP_DEFAULT)
        .min(COMMENT_LIST_CAP_MAX);
    let records = match state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::ReadContext, |uow| {
            uow.comments().list_for_document(&node_id, cap)
        })
    }) {
        Ok(records) => records,
        Err(err) => return command_error_response(&state, &err),
    };

    // Read the CURRENT document body once, through the confined document-read seam:
    // the path is derived server-side from the node id (never a client-supplied path),
    // so this can never read outside the vault. A node id that no longer resolves, or a
    // document that cannot be read, yields `None` — every comment then serves as
    // orphaned (missing anchor), the honest "the section is unreachable" signal.
    let body = resolve_document_body(&state, &node_id);
    let served: Vec<ServedComment> = records
        .into_iter()
        .map(|record| serve_comment(record, body.as_deref()))
        .collect();

    super::super::response::snapshot(
        &state,
        json!({ "document_node_id": node_id, "comments": served }),
    )
    .into_response()
}

/// Read a document's current worktree text from its NODE ID through the confined
/// [`DocumentResolver`] + [`SnapshotReader`] — the same guarded seam the section-edit
/// path uses. Returns `None` when the node id does not resolve or the document cannot
/// be read; NEVER trusts or reads a client-supplied path.
pub(super) fn resolve_document_body(state: &AppState, node_id: &str) -> Option<String> {
    let root = state.active_workspace_root();
    let document = DocumentResolver::for_worktree(root.clone())
        .resolve_existing(ExistingDocumentLookup::NodeId(node_id.to_string()))
        .ok()?;
    SnapshotReader::for_worktree(root)
        .capture_existing(&document)
        .ok()
        .map(|snapshot| snapshot.text)
}

/// `POST /authoring/v1/documents/{node_id}/comments` — create a section-anchored
/// comment attributed to the resolved principal. The target document must resolve
/// from its node id (server-side, confined) — a comment cannot anchor to a document
/// that does not exist. The comment id is minted deterministically from the node id +
/// idempotency key, so a replay upserts the same row rather than duplicating. Emits
/// `comment.created` on the authoring SSE feed.
pub async fn create_comment_route(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<String>,
    command: ResolvedCommand<CreateCommentRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::CreateComment {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "create-comment route requires command `create_comment`",
        )
        .into_response();
    }
    // Validate the target exists through the confined resolver before storing a comment
    // against it (no client path is ever accepted or stored).
    if DocumentResolver::for_worktree(state.active_workspace_root())
        .resolve_existing(ExistingDocumentLookup::NodeId(node_id.clone()))
        .is_err()
    {
        return super::super::response::typed_error(
            &state,
            StatusCode::NOT_FOUND,
            "authoring_comment_document_not_found",
            "the target document does not exist or its node id is ambiguous",
        )
        .into_response();
    }
    let comment_id = mint_comment_id(&node_id, &idempotency_key);
    let input = CreateCommentInput {
        comment_id,
        document: CommentDocument { node_id },
        selector: payload.selector,
        body: payload.body,
        author: actor,
        created_at_ms: now,
    };
    match state.with_authoring_store(|store| create_comment(store, input, idempotency_key.clone()))
    {
        Ok(record) => {
            super::super::response::snapshot(&state, json!({ "comment": record })).into_response()
        }
        Err(err) => command_error_response(&state, &err),
    }
}

/// `PATCH /authoring/v1/comments/{comment_id}` — edit the body, toggle resolved, or
/// re-anchor to the current section (one tagged op per request), attributed to the
/// resolved principal. Emits `comment.updated`.
pub async fn update_comment_route(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<CommentId>,
    command: ResolvedCommand<CommentUpdateRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::UpdateComment {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "update-comment route requires command `update_comment`",
        )
        .into_response();
    }
    let result = state.with_authoring_store(|store| match payload {
        CommentUpdateRequest::EditBody { body } => {
            update_comment_body(store, &comment_id, body, actor, idempotency_key, now)
        }
        CommentUpdateRequest::SetResolved { resolved } => {
            set_comment_resolved(store, &comment_id, resolved, actor, idempotency_key, now)
        }
        CommentUpdateRequest::Reanchor { selector } => {
            reanchor_comment(store, &comment_id, selector, actor, idempotency_key, now)
        }
    });
    match result {
        Ok(record) => {
            super::super::response::snapshot(&state, json!({ "comment": record })).into_response()
        }
        Err(err) => command_error_response(&state, &err),
    }
}

/// `DELETE /authoring/v1/comments/{comment_id}` — delete a comment (idempotent: an
/// absent id returns `deleted: false` and emits nothing). Emits `comment.deleted`
/// when a row was removed.
pub async fn delete_comment_route(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<CommentId>,
    command: ResolvedCommand<DeleteCommentRequest>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, _payload) = command.into_parts();
    if command_kind != CommandKind::DeleteComment {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "delete-comment route requires command `delete_comment`",
        )
        .into_response();
    }
    match state.with_authoring_store(|store| {
        delete_comment(store, &comment_id, actor, idempotency_key, now)
    }) {
        Ok(removed) => {
            super::super::response::snapshot(&state, json!({ "deleted": removed })).into_response()
        }
        Err(err) => command_error_response(&state, &err),
    }
}

// --- apply (the one side-effecting command) -----------------------------------

/// Map an `ApplyError` FAULT to a `StoreError` for the shared taxonomy. Policy
/// DENIALS never reach here — `apply_changeset` returns them as a denied
/// `ApplyOutcome` value; only genuine faults become an `ApplyError`.
pub(super) fn apply_err_to_store(err: ApplyError) -> StoreError {
    match err {
        ApplyError::Store(store) => store,
        ApplyError::Conflict => StoreError::Idempotency(
            "apply idempotency key conflicts with a different recorded request".to_string(),
        ),
        ApplyError::NotFound(detail) => {
            StoreError::StaleRevision(format!("apply target not found: {detail}"))
        }
        ApplyError::MissingMaterialization {
            changeset_id,
            child_key,
        } => StoreError::Ledger(format!(
            "approved changeset `{changeset_id}` child `{child_key}` is not materialized"
        )),
        ApplyError::Internal(detail) => {
            StoreError::Ledger(format!("apply invariant violated: {detail}"))
        }
    }
}

/// `POST /authoring/v1/apply-requests` — materialize an APPROVED changeset (the one
/// side-effecting command). Drives the `vaultspec-core` subprocess, so per
/// apply.rs's lock discipline the whole sync command runs on a BLOCKING thread. A
/// preflight denial rides the 200 success envelope as a value; `apply_changeset`
/// owns the OUTCOME-INDETERMINATE contract (post-state re-verify, fail-closed); a
/// panic of the blocking task itself is a typed indeterminate, never a lie.
pub async fn apply_changeset(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<ApplyRequestDto>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    match apply_changeset_body(state.clone(), actor, idempotency_key, now, payload).await {
        Ok((status, value)) => {
            (status, super::super::response::snapshot(&state, value)).into_response()
        }
        Err(response) => response,
    }
}

/// The apply dispatch BODY: resolve the proposal id (derived 1:1 from the changeset)
/// and the changeset's current approval id from the ledger, enforce the
/// caller-named-the-right-approval coherence check, then drive `apply::apply_changeset`
/// under a blocking thread (per apply.rs's lock discipline). Shared by the
/// `/apply-requests` route AND the `/execute` agent-tool seam's `request_apply` tool —
/// one resolution, no drift. `Ok` carries the success status + VALUE for the caller to
/// envelope; `Err` carries an already fully-built fault `Response` to return AS-IS.
pub(super) async fn apply_changeset_body(
    state: Arc<AppState>,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now: i64,
    payload: ApplyRequestDto,
) -> Result<(StatusCode, Value), Response> {
    let changeset_id = payload.changeset_id.clone();
    // The ADVISORY fencing token the applying actor presents (W13.P26); enforced by the
    // apply preflight only when a live lease holds the target document's scope.
    let presented_fencing_token = payload.fencing_token;

    // The proposal + approval are derived 1:1 from the changeset (V1). The wire
    // approval id must NAME that derived approval — a coherence check that the
    // client is applying the approval it was handed at submit.
    let proposal_id =
        derive_proposal_id(&changeset_id).map_err(|err| command_error_response(&state, &err))?;
    let expected_approval = latest_approval_id_for_apply(&state, &proposal_id, &changeset_id)
        .map_err(|err| command_error_response(&state, &err))?;
    if payload.approval_id != expected_approval {
        return Err(super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "apply approval id does not match the changeset's approval",
        )
        .into_response());
    }

    let worktree_root = state.active_workspace_root();
    let adapter = CoreAdapter::detect();
    let state_for_blocking = state.clone();
    // The whole sync apply (subprocess included) runs off the async worker.
    let joined = tokio::task::spawn_blocking(move || {
        state_for_blocking.with_authoring_store(|store| {
            super::super::apply::apply_changeset(
                store,
                &adapter,
                &worktree_root,
                ApplyRequest {
                    changeset_id: &changeset_id,
                    proposal_id: &proposal_id,
                    actor: &actor,
                    idempotency_key: &idempotency_key,
                    fencing_token: presented_fencing_token,
                    now_ms: now,
                },
            )
            .map_err(apply_err_to_store)
        })
    })
    .await;

    match joined {
        Ok(Ok(outcome)) => Ok(apply_outcome_value(&outcome)),
        Ok(Err(err)) => Err(command_error_response(&state, &err)),
        // The blocking task itself panicked: the write outcome is UNKNOWN. Report a
        // typed indeterminate (never a forged success or failure).
        Err(_join) => Err(super::super::response::typed_error(
            &state,
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_apply_indeterminate",
            "the apply attempt did not complete; its outcome is indeterminate — \
             re-query the changeset before retrying",
        )
        .into_response()),
    }
}

pub(super) fn latest_approval_id_for_apply(
    state: &AppState,
    proposal_id: &ProposalId,
    changeset_id: &ChangesetId,
) -> StoreResult<ApprovalId> {
    let latest = state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.approvals().latest_for_proposal(proposal_id)
        })
    })?;
    if let Some(approval) = latest {
        return Ok(approval.approval_id);
    }
    derive_approval_id(changeset_id)
}

/// Map an apply outcome to its status + VALUE: a preflight denial rides the 200
/// success envelope as a value; a still-in-flight prior attempt is 202; a completed
/// attempt serves the durable receipt (whose `state` reports Applied vs Failed — a
/// recorded business failure is not a fault). Shared by the `/apply-requests` route
/// AND the `/execute` agent-tool seam's `request_apply` tool.
pub(super) fn apply_outcome_value(outcome: &ApplyOutcome) -> (StatusCode, Value) {
    if !outcome.eligibility.allowed {
        return (StatusCode::OK, denial_value(&outcome.eligibility));
    }
    if outcome.in_flight {
        return (StatusCode::ACCEPTED, json!({ "status": "in_flight" }));
    }
    let child_outcome = outcome.receipt.as_ref().map(|receipt| match receipt.state {
        ApplyState::Applied => "applied",
        _ => "failed",
    });
    (
        StatusCode::OK,
        json!({
            "status": if outcome.replayed { "replayed" } else { "recorded" },
            "child_outcome": child_outcome,
            "receipt": outcome.receipt,
        }),
    )
}

// --- agent-tool executor seam (W12.P41 A3b) ------------------------------------

/// A command-dispatch idempotency key deterministically derived from the tool
/// call's id (bounded via `blob_oid`, so an at-cap `tool_call_id` can never overflow
/// `IdempotencyKey`'s cap). Effectively-once: a re-drive of the SAME `tool_call_id`
/// reuses this SAME key, so the dispatched command's own idempotency dedups a
/// completed dispatch and heals a crash-lost one (the executor's re-drive contract).
pub(super) fn agent_tool_command_key(tool_call_id: &ToolCallId) -> StoreResult<IdempotencyKey> {
    IdempotencyKey::new(format!(
        "agent-tool-execute:{}",
        blob_oid(tool_call_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Idempotency(format!("agent tool command key: {err}")))
}

/// `propose_changeset`'s append/replace aliases carry a `DraftAlias` (the tool's
/// flattened wire shape); the shared draft-mutation dispatch expects the domain
/// `DraftProposalRequest`. The fields are 1:1 — this is the ONE conversion site.
pub(super) fn draft_request_from_alias(alias: DraftAlias) -> DraftProposalRequest {
    DraftProposalRequest {
        changeset_id: alias.changeset_id,
        expected_revision: alias.expected_revision,
        summary: alias.summary,
        operations: alias.operations,
    }
}

/// The unified `/execute` envelope VALUE: which tool ran, the executor's disposition
/// (`dispatched` / `awaiting_permission` / `refused` / `already_handled`), the served
/// eligibility (a value even on refusal), whether this call replayed a prior terminal
/// record, the durable `ToolCallRecord` the seam wrote (when terminal), and the
/// per-command RESULT (the dispatched command's own outcome value, the prepared read
/// descriptor for a read tool, or `null` when nothing dispatched).
pub(super) fn agent_tool_execute_envelope(
    tool_call_id: &ToolCallId,
    tool: SemanticToolName,
    command: CommandKind,
    outcome: &ExecuteOutcome,
    result: Value,
) -> Value {
    // The raised `interrupt_id` is surfaced ONLY on the awaiting arm (structurally
    // present exactly when suspended), so a wire client resumes-by-id via
    // `/v1/interrupts/{interrupt_id}/resume` with no internal-derivation coupling (F1);
    // every other disposition serves it as `null`.
    let (disposition, interrupt_id) = match &outcome.disposition {
        ExecuteDisposition::Dispatch(_) => ("dispatched", None),
        ExecuteDisposition::AwaitingPermission { interrupt_id } => {
            ("awaiting_permission", Some(interrupt_id))
        }
        ExecuteDisposition::Refused => ("refused", None),
        ExecuteDisposition::AlreadyHandled => ("already_handled", None),
    };
    json!({
        "tool_call_id": tool_call_id,
        "tool": tool,
        "command": command,
        "disposition": disposition,
        "interrupt_id": interrupt_id,
        "eligibility": outcome.eligibility,
        "replayed": outcome.replayed,
        "tool_call_record": outcome.tool_call_record,
        "result": result,
    })
}

pub(super) fn agent_tool_execute_response(
    state: &AppState,
    tool_call_id: &ToolCallId,
    tool: SemanticToolName,
    command: CommandKind,
    outcome: &ExecuteOutcome,
    status: StatusCode,
    result: Value,
) -> Response {
    let value = agent_tool_execute_envelope(tool_call_id, tool, command, outcome, result);
    (status, super::super::response::snapshot(state, value)).into_response()
}

/// `POST /authoring/v1/runs/{run_id}/agent-tools/execute` — the P41 tool-call
/// executor run loop wired to HTTP (W12.P41 A3b). `prepare_tool_call` resolves the
/// semantic tool call to its typed dispatch shape (S152); `executor::execute_tool_call`
/// runs the P22/P32 gate (record-before-dispatch, effectively-once by `tool_call_id`,
/// denials-are-values). A GRANTED mutating/dangerous dispatch routes to the SAME
/// dedicated command body every purpose-built route uses — one implementation per
/// command, no drift. A read tool never dispatches a command: the gate records its
/// permitted `ToolCallRecord` and the caller serves the prepared read descriptor; the
/// caller pulls the read itself through the dedicated read routes. The actor is the
/// server-resolved principal (ASA-010), never a body claim.
pub async fn execute_agent_tool_call(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<RunId>,
    command: ResolvedCommand<AgentToolCall>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, mut payload) = command.into_parts();
    if payload.idempotency_key.is_none() {
        payload.idempotency_key = Some(idempotency_key);
    }
    let prepared = match super::super::tools::prepare_tool_call(payload) {
        Ok(prepared) => prepared,
        Err(err) => return tool_error_response(&state, &err),
    };
    let tool = prepared.name;
    let tool_call_id = prepared.tool_call_id.clone();

    // W14.P42a — authorization tool-requester guard: only a Human or an Agent may drive
    // the semantic tool surface. A System actor's authority is the policy auto-approve
    // lane and a ToolExecutor is an execution identity, not a requester; either is refused
    // as a denial VALUE (never a fault), BEFORE the tool-permission gate records anything.
    // This is distinct from the downstream per-call permission gate and risk-tier
    // requirement, which still run for a permitted requester.
    if let Some(denied) = tool_requester_kind_guard(actor.kind, tool) {
        return denial_snapshot(&state, &denied);
    }

    let worktree_root = state.active_workspace_root();
    let scope_id = scope_id_for_worktree(&worktree_root);
    let gate = state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
            let scope_mode = uow.modes().current_mode(&scope_id)?;
            execute_tool_call(
                uow,
                &ExecuteToolCallRequest {
                    tool,
                    tool_call_id: tool_call_id.clone(),
                    run_id: run_id.clone(),
                    requester: actor.clone(),
                    scope_id: scope_id.clone(),
                    scope_mode,
                    session_override: None,
                    idempotency_key: tool_call_id.as_str().to_string(),
                    now_ms: now,
                    ttl_ms: None,
                },
            )
        })
    });
    let outcome = match gate {
        Ok(outcome) => outcome,
        Err(err) => return command_error_response(&state, &err),
    };

    // A read/context tool never dispatches a command: the gate above already
    // recorded its permitted `ToolCallRecord`. Serve the prepared read descriptor —
    // the caller pulls the read itself through the dedicated read routes.
    if prepared.risk_tier == ToolRiskTier::ReadOnly {
        let result = json!(prepared.dispatch);
        return agent_tool_execute_response(
            &state,
            &tool_call_id,
            tool,
            prepared.command,
            &outcome,
            StatusCode::OK,
            result,
        );
    }

    if outcome.should_dispatch().is_none() {
        // Awaiting permission, refused, or an already-handled refusal: denials (and
        // suspensions) are values — nothing dispatches, and this still rides a 200.
        return agent_tool_execute_response(
            &state,
            &tool_call_id,
            tool,
            prepared.command,
            &outcome,
            StatusCode::OK,
            Value::Null,
        );
    }

    let command_key = match agent_tool_command_key(&tool_call_id) {
        Ok(key) => key,
        Err(err) => return command_error_response(&state, &err),
    };
    dispatch_agent_tool_command(state, actor, command_key, now, prepared, outcome).await
}

/// Dispatch a GRANTED (fresh or re-driven) semantic tool call to the SAME command
/// body every dedicated route uses, under a command idempotency key deterministically
/// derived from `tool_call_id` (`agent_tool_command_key`) — effectively-once. A
/// genuine `StoreError` fault escapes immediately as the SAME typed fault response the
/// dedicated route would serve; a successful dispatch's status + value ride the
/// unified `/execute` envelope.
pub(super) async fn dispatch_agent_tool_command(
    state: Arc<AppState>,
    actor: ActorRef,
    command_key: IdempotencyKey,
    now: i64,
    prepared: PreparedToolCall,
    outcome: ExecuteOutcome,
) -> Response {
    let tool_call_id = prepared.tool_call_id.clone();
    let tool = prepared.name;
    let command_kind = prepared.command;
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());

    // W14.P42a — the agent is the untrusted writer the standing/delegation/scope guards
    // target. A granted tool call dispatches its MAPPED backend command INTERNALLY (no
    // second `ResolvedCommand` extraction), so authorize the mapped command EXPLICITLY here
    // before its effect: standing + delegation always, plus the document-scope guard over
    // the drafted targets of a create/append/replace against the active workspace's
    // authorized scope. A refusal rides the unified `/execute` envelope as a value. (An
    // agent applying its own proposal is refused origin-keyed in the apply domain.)
    let authorized_scope = active_authorized_scope(&state);
    let scope_targets: Vec<&DocumentRef> = match &prepared.dispatch {
        PreparedToolDispatch::ProposeChangeset { dispatch } => match dispatch {
            ProposeChangesetDispatch::Create { command } => command
                .payload
                .operations
                .iter()
                .map(|operation| &operation.target.document)
                .collect(),
            ProposeChangesetDispatch::Append { input, .. }
            | ProposeChangesetDispatch::Replace { input, .. } => input
                .operations
                .iter()
                .map(|operation| &operation.target.document)
                .collect(),
        },
        _ => Vec::new(),
    };
    let scope_arg = (!scope_targets.is_empty()).then_some(authorized_scope.as_str());
    match run_authorization(
        &state,
        command_kind,
        &actor,
        scope_arg,
        &scope_targets,
        None,
    ) {
        Ok(eligibility) if eligibility.allowed => {}
        Ok(eligibility) => {
            return agent_tool_execute_response(
                &state,
                &tool_call_id,
                tool,
                command_kind,
                &outcome,
                StatusCode::OK,
                denial_value(&eligibility),
            );
        }
        Err(fault) => return authorization_fault_response(&state, fault),
    }

    let (status, value) = match prepared.dispatch {
        PreparedToolDispatch::ReadContext { .. } | PreparedToolDispatch::SearchGraph { .. } => {
            unreachable!("read-only tools never reach command dispatch (handled by the caller)")
        }
        PreparedToolDispatch::ProposeChangeset { dispatch } => match dispatch {
            ProposeChangesetDispatch::Create { command } => {
                let context = proposal_context(actor, command_key, now);
                // D4: the granted tool call recorded its run before dispatch; stamp that
                // run and its prompt turn (joined through the run record) as the
                // changeset's provenance so a proposal is auditable to the exact run.
                let run_id = outcome
                    .tool_call_record
                    .as_ref()
                    .map(|record| record.run_id.clone());
                match state.with_authoring_store(|store| match run_id {
                    Some(run_id) => {
                        let turn_id = store
                            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                                Ok(uow.sessions().run(&run_id)?.and_then(|run| run.turn_id))
                            })?;
                        super::super::proposal::create_agent_proposal(
                            store,
                            &reader,
                            context,
                            command.payload,
                            super::super::proposal::RunProvenance { run_id, turn_id },
                        )
                    }
                    None => super::super::proposal::create_proposal(
                        store,
                        &reader,
                        context,
                        command.payload,
                    ),
                }) {
                    Ok(result) => proposal_result_value(&result),
                    Err(err) => return command_error_response(&state, &err),
                }
            }
            ProposeChangesetDispatch::Append { input, .. } => {
                let context = proposal_context(actor, command_key, now);
                match dispatch_draft_mutation(
                    &state,
                    context,
                    draft_request_from_alias(input),
                    DraftRoute::Append,
                ) {
                    Ok(result) => proposal_result_value(&result),
                    Err(err) => return command_error_response(&state, &err),
                }
            }
            ProposeChangesetDispatch::Replace { input, .. } => {
                let context = proposal_context(actor, command_key, now);
                match dispatch_draft_mutation(
                    &state,
                    context,
                    draft_request_from_alias(input),
                    DraftRoute::Replace,
                ) {
                    Ok(result) => proposal_result_value(&result),
                    Err(err) => return command_error_response(&state, &err),
                }
            }
        },
        PreparedToolDispatch::ValidateProposal { input, .. } => {
            let ValidateProposalToolInput {
                changeset_id,
                expected_revision,
                summary,
            } = input;
            let context = proposal_context(actor, command_key, now);
            match state.with_authoring_store(|store| {
                let latest = latest_changeset_revision(store, &changeset_id, "validate")?;
                validate_proposal_from_worktree(
                    store,
                    &reader,
                    context,
                    &changeset_id,
                    expected_revision,
                    summary,
                    &latest,
                )
            }) {
                Ok(result) => proposal_result_value(&result),
                Err(err) => return command_error_response(&state, &err),
            }
        }
        PreparedToolDispatch::RequestApproval {
            changeset_id,
            command,
        } => {
            let composite = state.with_authoring_store(|store| {
                submit_for_review_composed(
                    store,
                    &reader,
                    &actor,
                    &command_key,
                    now,
                    &changeset_id,
                    &command.payload,
                )
            });
            match composite {
                Ok(composite) => {
                    match mode_after_submit(state.clone(), &composite, command_key.clone(), now)
                        .await
                    {
                        Ok(mode_outcome) => submit_composite_value(composite, mode_outcome),
                        Err(err) => return command_error_response(&state, &err),
                    }
                }
                Err(err) => return command_error_response(&state, &err),
            }
        }
        PreparedToolDispatch::CancelProposal { input, .. } => {
            let CancelProposalAlias {
                changeset_id,
                expected_revision,
                summary,
            } = input;
            let context = proposal_context(actor, command_key, now);
            match state.with_authoring_store(|store| {
                super::super::proposal::cancel_proposal(
                    store,
                    context,
                    TerminalProposalRequest {
                        changeset_id,
                        expected_revision,
                        summary,
                    },
                )
            }) {
                Ok(result) => proposal_result_value(&result),
                Err(err) => return command_error_response(&state, &err),
            }
        }
        PreparedToolDispatch::CancelRun { run_id, command } => {
            let context = session_context(actor, command_key, now);
            match state.with_authoring_store(|store| {
                super::super::session::cancel_run(store, context, run_id, command.payload)
            }) {
                Ok(result) => session_result_value(&result),
                Err(err) => return command_error_response(&state, &err),
            }
        }
        PreparedToolDispatch::RequestApply { command } => {
            match apply_changeset_body(state.clone(), actor, command_key, now, command.payload)
                .await
            {
                Ok(value) => value,
                Err(response) => return response,
            }
        }
    };

    agent_tool_execute_response(
        &state,
        &tool_call_id,
        tool,
        command_kind,
        &outcome,
        status,
        value,
    )
}

// --- rollback (generate an inverse proposal) ----------------------------------

/// `POST /authoring/v1/rollback-proposals` — generate a rollback of an applied
/// source changeset. Generation is pure in-process (no core subprocess): it appends
/// a `RollbackProposed` inverse changeset that then rides the SAME review → approval
/// → apply path. Unavailable rollbacks ride the 200 envelope as a value with the
/// manual-repair hook the backend offers.
pub async fn create_rollback(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<RollbackRequestDto>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    let source_children = payload
        .source_children
        .iter()
        .map(|child| RollbackSourceChild {
            child_key: child.source_child_key.clone(),
        })
        .collect();
    match state.with_authoring_store(|store| {
        super::super::rollback::generate_rollback(
            store,
            &reader,
            RollbackRequest {
                source_changeset_id: &payload.source_changeset_id,
                source_children,
                reason: payload.reason.clone(),
                actor: &actor,
                idempotency_key: &idempotency_key,
                now_ms: now,
            },
        )
    }) {
        Ok(outcome) => rollback_outcome_response(&state, outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Map a rollback outcome to its enveloped response: an unavailable rollback rides
/// the 200 success envelope as a value carrying the honest reason + the manual-repair
/// hook; a generated (or replayed) rollback serves its new `Rollback` changeset id.
pub(super) fn rollback_outcome_response(state: &AppState, outcome: RollbackOutcome) -> Response {
    if !outcome.eligibility.allowed {
        return super::super::response::snapshot(
            state,
            json!({
                "status": "unavailable",
                "command": outcome.eligibility.command,
                "reason": outcome.eligibility.reason,
                "manual_repair": outcome.manual_repair,
            }),
        )
        .into_response();
    }
    super::super::response::snapshot(
        state,
        json!({
            "status": if outcome.replayed { "replayed" } else { "generated" },
            "rollback_changeset_id": outcome.changeset_id.as_ref().map(ChangesetId::as_str),
            "rollback_changeset_revision": outcome.changeset_revision,
        }),
    )
    .into_response()
}

// --- actor-token issuance (the machine-bearer bootstrap seam) ------------------

/// The machine bootstrap principal recorded as `issued_by` on every minted token —
/// the audited trust root. V1 makes the machine service token the sole
/// administer-policy holder; a permission module narrows this later.
pub(super) const ISSUANCE_PRINCIPAL: &str = "system:bootstrap";

/// Default minted-token lifetime when the request omits one. The issue path clamps
/// to `MAX_ACTOR_TOKEN_LIFETIME_MS` regardless (a credential is bounded at creation).
pub(super) const DEFAULT_ACTOR_TOKEN_LIFETIME_MS: i64 = 24 * 3_600 * 1_000;

/// `POST /authoring/v1/actor-tokens` — mint a per-principal actor token. This is
/// MACHINE-bearer-gated (the app bearer gate), NOT actor-token-gated — it is what
/// mints those tokens. It REGISTERS the named actor active (so a subsequent command
/// does not 403 on `ensure_active` — P39 finding #1), records `issued_by` (the
/// machine principal), and returns the raw token EXACTLY once (the store persists
/// only its hash; the raw is never echoed again). V1 issues NON-delegated
/// principals: a `delegated_by` actor is refused by the registry (a 403).
pub async fn issue_actor_token(
    State(state): State<Arc<AppState>>,
    Json(request): Json<IssueActorTokenRequest>,
) -> Response {
    let now = now_ms();
    let issued_by = ActorId::new(ISSUANCE_PRINCIPAL).expect("issuance principal id is valid");
    let lifetime = request
        .lifetime_ms
        .map(|ms| ms.min(i64::MAX as u64) as i64)
        .unwrap_or(DEFAULT_ACTOR_TOKEN_LIFETIME_MS);
    let actor = request.actor;
    let display = ActorDisplayMetadata::new(actor.id.as_str(), None);
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateSession, |uow| {
            // Register-or-require the actor active so its later commands resolve a
            // live, registered principal (upsert-safe).
            uow.actors()
                .put_record(ActorRecordInput::active(actor.clone(), display, now))?;
            uow.actor_tokens().issue(&actor, &issued_by, now, lifetime)
        })
    }) {
        Ok(issued) => (
            StatusCode::CREATED,
            super::super::response::snapshot(
                &state,
                json!({
                    "raw_token": issued.raw_token,
                    "record": issued.record,
                }),
            ),
        )
            .into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}
