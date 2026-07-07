//! Authoring HTTP transport seam: principal-resolution middleware + the
//! `ResolvedCommand<T>` request extractor (ASA-010 route-layer enforcement).
//!
//! [`resolve_principal_layer`] runs AFTER the machine `bearer_gate` (transport
//! first, then principal). It reads the `X-Authoring-Actor-Token` header,
//! resolves it against the server-held token seam, and inserts a
//! [`PrincipalResolution`] into the request extensions — permissively, so a
//! token-less READ still flows (reads carry no principal), while a command route
//! that DOES require identity reads the resolution back through the
//! [`ResolvedCommand<T>`] extractor.
//!
//! The extractor is the SOLE route-layer constructor of a `ResolvedCommand`, and
//! it sources the actor EXCLUSIVELY from the middleware-set resolution (never the
//! request body). So the ASA-010 compile-time actor fence is enforced end-to-end
//! at the wire: a body that claims an `actor` is rejected as an unknown field, a
//! request that never resolved a live principal is rejected — with the missing
//! vs unknown vs store-unavailable denials kept DISTINCT so a client knows which
//! layer refused it.
#![allow(dead_code)]

use std::sync::Arc;

use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Path, Query, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use ingest_struct::reader::blob_oid;
use serde::de::DeserializeOwned;
use serde_json::json;

use super::actors::{ActorDisplayMetadata, ActorRecordInput};
use super::api::{
    ApplyRequest as ApplyRequestDto, CancelRunRequest, CommandEnvelope, CreateProposalRequest,
    CreateSessionRequest, DirectWriteRequest as DirectWriteRequestDto, IssueActorTokenRequest,
    ResumeRunRequest, ReviewDecisionRequest, RollbackRequest as RollbackRequestDto,
    SetOperationModeRequest, StartPromptTurnRequest, SubmitForReviewRequest,
};
use super::apply::{ApplyError, ApplyOutcome, ApplyRequest};
use super::approvals::{
    ApprovalDecision, ApprovalError, ApprovalOutcome, ApprovalRequestInput, ApprovalRequestRecord,
    ReviewDecisionInput, ReviewedTuple, V1_POLICY_VERSION,
};
use super::core_adapter::CoreAdapter;
use super::ledger::ChangesetAggregateRecord;
use super::model::{
    ActionEligibility, ActorId, ActorKind, ActorRef, ApplyState, ApprovalId, ChangesetId,
    ChangesetStatus, CommandKind, IdempotencyKey, ProposalId, ReviewDecisionKind, RevisionToken,
    RunId, SessionId,
};
use super::modes::{
    ModeAutoApprovalOutcome, OperationModeUpdate, scope_id_for_worktree, system_actor,
};
use super::principal::{
    AUTHORING_ACTOR_TOKEN_HEADER, AuthenticatedPrincipal, PrincipalDenial, ResolvedCommand,
    resolve_principal,
};
use super::projections::ProjectionError;
use super::proposal::{
    ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, SubmitProposalRequest,
    ValidateProposalRequest, validation_evidence,
};
use super::rollback::{RollbackOutcome, RollbackRequest, RollbackSourceChild};
use super::snapshots::SnapshotReader;
use super::store::{Result as StoreResult, Store, StoreError};
use super::tools::{AgentToolCall, ToolError};
use super::transitions::ValidationFreshness;
use crate::app::{AppState, now_ms};

#[derive(Debug, serde::Deserialize)]
pub(crate) struct SessionListParams {
    #[serde(default)]
    cap: Option<u32>,
    #[serde(default)]
    after_ms: Option<i64>,
    #[serde(default)]
    after_session_id: Option<SessionId>,
}

/// A mutating command's in-flight idempotency reservation window (resource-bounds:
/// a bounded TTL at creation). A crashed attempt's reservation expires and the
/// command becomes re-runnable.
const COMMAND_IN_FLIGHT_TTL_MS: i64 = 60_000;

/// A recorded command outcome's replay-retention window (bounded; a duplicate
/// within it replays the recorded receipt, after it a re-run is a fresh command).
const COMMAND_OUTCOME_TTL_MS: i64 = 24 * 3_600 * 1_000;

/// A body/schema violation (missing idempotency key, a body-claimed actor, an
/// unknown field, malformed JSON) — the request was wrong.
const REQUEST_INVALID_KIND: &str = "authoring_request_invalid";

/// No actor token was presented on a route that requires a resolved principal.
const TOKEN_MISSING_KIND: &str = "authoring_actor_token_missing";

/// A token was presented but is unknown, expired, or revoked. Distinct from
/// "missing" (the client sent nothing) and from the transport gate's "wrong
/// machine credential" (ASA-010).
const TOKEN_UNKNOWN_KIND: &str = "authoring_actor_token_unknown";

/// The authoring store could not be opened/read to resolve the principal — the
/// authoring domain degrades honestly rather than the engine panicking.
const STORE_UNAVAILABLE_KIND: &str = "authoring_store_unavailable";

/// The outcome of the principal middleware, carried in the request extensions.
/// A command route reads this back through [`ResolvedCommand`]; a read route
/// ignores it. Kept as three DISTINCT denials so the extractor can return a
/// distinct typed 4xx/5xx per failure layer.
#[derive(Debug, Clone)]
pub enum PrincipalResolution {
    /// A live per-principal token resolved to this server-held actor.
    Resolved(AuthenticatedPrincipal),
    /// A token was missing, or presented but unknown/expired/revoked.
    Denied(PrincipalDenial),
    /// The authoring store could not be opened/read to resolve the token.
    Unavailable,
}

/// Principal-resolution middleware. Reads the actor-token header, resolves it
/// over the authoring store, and annotates the request with a
/// [`PrincipalResolution`]. Permissive: it never short-circuits, so read routes
/// (which carry no token) flow through untouched; enforcement is per-route, at
/// the [`ResolvedCommand`] extractor. Mounted AFTER `bearer_gate`.
pub async fn resolve_principal_layer(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Response {
    let now = now_ms();
    let presented = req
        .headers()
        .get(AUTHORING_ACTOR_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    let resolution = match presented.as_deref() {
        // No token: a missing-principal denial WITHOUT forcing the authoring db
        // open — an anonymous read never opens the authoring store.
        None => PrincipalResolution::Denied(PrincipalDenial::MissingToken),
        Some(token) => {
            // Identity is a READ; the house pattern rides a mutating-command unit
            // of work (the deferred transaction takes no write lock and commits
            // empty). A store-open/read failure degrades to `Unavailable`.
            match state.with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    Ok(resolve_principal(&uow.actor_tokens(), Some(token), now))
                })
            }) {
                Ok(Ok(principal)) => PrincipalResolution::Resolved(principal),
                Ok(Err(denial)) => PrincipalResolution::Denied(denial),
                Err(_store_err) => PrincipalResolution::Unavailable,
            }
        }
    };

    req.extensions_mut().insert(resolution);
    next.run(req).await
}

/// A rejection carrying a fully-built, tiers-bearing enveloped error response.
/// Built at extraction time (the `AppState` is in hand) through the shared
/// `api_error_kind` helper so a rejected authoring request rides the same
/// `{error, error_kind, tiers}` envelope as every other error.
pub struct ResolvedCommandRejection(Response);

impl ResolvedCommandRejection {
    fn enveloped(state: &AppState, status: StatusCode, kind: &str, message: String) -> Self {
        Self(crate::routes::api_error_kind(state, status, kind, message).into_response())
    }

    /// Map a principal denial / store-unavailability to its distinct typed error.
    fn from_resolution_failure(state: &AppState, resolution: &PrincipalResolution) -> Self {
        match resolution {
            PrincipalResolution::Resolved(_) => Self::enveloped(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                REQUEST_INVALID_KIND,
                "principal resolution succeeded unexpectedly".to_string(),
            ),
            PrincipalResolution::Denied(PrincipalDenial::MissingToken) => Self::enveloped(
                state,
                StatusCode::UNAUTHORIZED,
                TOKEN_MISSING_KIND,
                "no authoring actor token presented".to_string(),
            ),
            PrincipalResolution::Denied(PrincipalDenial::UnknownPrincipal) => Self::enveloped(
                state,
                StatusCode::UNAUTHORIZED,
                TOKEN_UNKNOWN_KIND,
                "unknown or revoked authoring principal".to_string(),
            ),
            PrincipalResolution::Unavailable => Self::enveloped(
                state,
                StatusCode::SERVICE_UNAVAILABLE,
                STORE_UNAVAILABLE_KIND,
                "authoring store is unavailable".to_string(),
            ),
        }
    }
}

impl IntoResponse for ResolvedCommandRejection {
    fn into_response(self) -> Response {
        self.0
    }
}

impl<T> FromRequest<Arc<AppState>> for ResolvedCommand<T>
where
    T: DeserializeOwned,
{
    type Rejection = ResolvedCommandRejection;

    async fn from_request(req: Request, state: &Arc<AppState>) -> Result<Self, Self::Rejection> {
        // The actor is server-resolved by the principal middleware and carried in
        // the request extensions. Read it BEFORE consuming the body: the body can
        // never supply it (ASA-010), so a non-resolved principal is an identity
        // failure, not a bad body — and each denial keeps its distinct status.
        let resolution = req
            .extensions()
            .get::<PrincipalResolution>()
            .cloned()
            // Defensive: a command route not covered by the middleware reads as a
            // missing token rather than silently trusting the body.
            .unwrap_or(PrincipalResolution::Denied(PrincipalDenial::MissingToken));

        let PrincipalResolution::Resolved(principal) = resolution else {
            return Err(ResolvedCommandRejection::from_resolution_failure(
                state,
                &resolution,
            ));
        };

        let Json(envelope) = Json::<CommandEnvelope<T>>::from_request(req, state)
            .await
            .map_err(|rejection: JsonRejection| {
                ResolvedCommandRejection::enveloped(
                    state,
                    StatusCode::BAD_REQUEST,
                    REQUEST_INVALID_KIND,
                    rejection.body_text(),
                )
            })?;

        Ok(ResolvedCommand::from_principal(principal, envelope))
    }
}

/// A store the route could not open/read → a typed, tiers-bearing 503 (the
/// authoring panel degrades honestly rather than the engine panicking).
fn store_unavailable(state: &AppState, err: &StoreError) -> Response {
    super::response::typed_error(
        state,
        StatusCode::SERVICE_UNAVAILABLE,
        STORE_UNAVAILABLE_KIND,
        &format!("authoring store is unavailable: {err}"),
    )
    .into_response()
}

/// `GET /authoring/v1/proposals` — the bounded review-station proposal list, a
/// pure backend-served projection over the ledger + live worktree (no principal
/// required; reads are unauthenticated). A projection failure is a store failure
/// (the only `ProjectionError` variant), degraded to a typed 503.
pub async fn list_proposals(State(state): State<Arc<AppState>>) -> Response {
    // The target-fence comparison reads the vault worktree (parent of `.vault`).
    let worktree_root = state.active_workspace_root();
    // Identity/projection reads ride a mutating-command unit of work — the house
    // read pattern (projections' own tests do the same); the deferred read
    // transaction takes no write lock and commits empty.
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.projections()
                .list_proposals(&worktree_root)
                .map_err(|ProjectionError::Store(err)| err)
        })
    }) {
        Ok(projection) => {
            let data =
                serde_json::to_value(projection).expect("proposal list projection serializes");
            super::response::snapshot(&state, data).into_response()
        }
        Err(err) => store_unavailable(&state, &err),
    }
}

/// `GET /authoring/v1/proposals/{changeset_id}` — one changeset's backend-served
/// review DETAIL projection (the proposal projection plus the per-operation
/// base+proposed bounded texts the review diff renders over), or a typed 404 when no
/// such changeset exists. Detail-only: the list route (`GET /proposals`) never
/// carries document bodies.
pub async fn project_proposal(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    let worktree_root = state.active_workspace_root();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.projections()
                .project_proposal_detail(&changeset_id, &worktree_root)
                .map_err(|ProjectionError::Store(err)| err)
        })
    }) {
        Ok(Some(projection)) => {
            let data =
                serde_json::to_value(projection).expect("proposal detail projection serializes");
            super::response::snapshot(&state, data).into_response()
        }
        Ok(None) => super::response::typed_error(
            &state,
            StatusCode::NOT_FOUND,
            "authoring_proposal_not_found",
            "no such changeset",
        )
        .into_response(),
        Err(err) => store_unavailable(&state, &err),
    }
}

/// `GET /authoring/v1/proposals/{changeset_id}/snapshot` — the full changeset
/// revision history + latest aggregate + latest validation record (the
/// lower-level read behind the review projection). The domain `ProposalSnapshot`
/// wrapper is not itself `Serialize`, but its fields are, so the handler
/// assembles them into the envelope directly (no domain edit).
pub async fn proposal_snapshot(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            super::proposal::proposal_snapshot(uow, &changeset_id)
        })
    }) {
        Ok(snapshot) => {
            let data = json!({
                "changeset_id": changeset_id.as_str(),
                "history": snapshot.history,
                "latest": snapshot.latest,
                "latest_validation": snapshot.latest_validation,
            });
            super::response::snapshot(&state, data).into_response()
        }
        Err(err) => store_unavailable(&state, &err),
    }
}

/// The `/authoring` router — the enabled status shell, the read/projection
/// surface, the propose → review → apply → rollback command routes, and the
/// actor-token issuance seam — wired with the principal middleware layer so a
/// command route resolves identity AFTER the app `bearer_gate` (this router nests
/// under it). Returns a state-parameterized `Router<Arc<AppState>>` so the app
/// router supplies state on `.nest`.
pub fn authoring_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        // The enabled status shell, moved under the nest so the app router owns
        // exactly one `/authoring` subtree (no route/nest overlap).
        .route("/status", get(super::routes::status))
        // Reads are principal-permissive; mutating commands require a resolved
        // principal via the `ResolvedCommand` extractor.
        .route("/v1/events", get(super::stream::events))
        .route("/v1/recovery", get(super::stream::recovery))
        .route("/v1/agent-tools", get(agent_tool_catalog))
        .route("/v1/agent-tools/prepare", post(prepare_agent_tool_call))
        .route("/v1/sessions", get(list_sessions).post(create_session))
        .route("/v1/sessions/{session_id}", get(get_session))
        .route("/v1/sessions/{session_id}/turns", post(start_prompt_turn))
        .route("/v1/runs/{run_id}/cancel", post(cancel_run))
        .route("/v1/runs/{run_id}/resume", post(resume_run))
        .route("/v1/proposals", get(list_proposals).post(create_proposal))
        .route("/v1/proposals/{changeset_id}", get(project_proposal))
        .route(
            "/v1/proposals/{changeset_id}/snapshot",
            get(proposal_snapshot),
        )
        .route(
            "/v1/proposals/{changeset_id}/submit",
            post(submit_for_review),
        )
        .route(
            "/v1/reviews/{approval_id}/decisions",
            post(submit_review_decision),
        )
        .route("/v1/apply-requests", post(apply_changeset))
        .route("/v1/rollback-proposals", post(create_rollback))
        .route("/v1/mode", post(set_operation_mode))
        .route("/v1/direct-writes", post(direct_write))
        // The bootstrap seam: mint a per-principal actor token. Machine-bearer-gated
        // by the app router; the permissive principal layer never blocks it (it uses
        // a plain JSON body, not the ResolvedCommand extractor).
        .route("/v1/actor-tokens", post(issue_actor_token))
        // Unknown `/authoring/*` paths fail as tiered API JSON, not SPA fallback.
        .fallback(authoring_route_not_found)
        // Principal resolution runs AFTER the app-level bearer gate (this router is
        // nested under it): a valid machine bearer first, then the actor principal.
        .layer(axum::middleware::from_fn_with_state(
            state,
            resolve_principal_layer,
        ))
}

/// Tiered 404 for an unknown `/authoring/*` path (the nested router's fallback), so
/// an unknown authoring API path fails as enveloped JSON rather than HTML/SPA.
async fn authoring_route_not_found(
    State(state): State<Arc<AppState>>,
    uri: axum::http::Uri,
) -> Response {
    super::response::typed_error(
        &state,
        StatusCode::NOT_FOUND,
        "authoring_unknown_route",
        &format!("unknown API path `{}`", uri.path()),
    )
    .into_response()
}

// --- mutating command handlers --------------------------------------------

/// `GET /authoring/v1/agent-tools` — serve the semantic agent-tool catalog.
pub async fn agent_tool_catalog(State(state): State<Arc<AppState>>) -> Response {
    super::response::snapshot(&state, json!(super::tools::catalog())).into_response()
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
    match super::tools::prepare_tool_call(payload) {
        Ok(prepared) => super::response::snapshot(
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

fn tool_error_response(state: &AppState, err: &ToolError) -> Response {
    super::response::typed_error(
        state,
        StatusCode::BAD_REQUEST,
        "authoring_tool_invalid",
        &err.to_string(),
    )
    .into_response()
}

/// `POST /authoring/v1/sessions` — create a durable authoring workflow session.
pub async fn create_session(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<CreateSessionRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state
        .with_authoring_store(|store| super::session::create_session(store, context, payload))
    {
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
        .unwrap_or(super::session::SESSION_LIST_CAP_DEFAULT);
    match state.with_authoring_store(|store| {
        super::session::list_sessions(store, cap, params.after_ms, params.after_session_id)
    }) {
        Ok(page) => super::response::snapshot(&state, json!(page)).into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `GET /authoring/v1/sessions/{session_id}` — read one durable session snapshot.
pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
) -> Response {
    match state.with_authoring_store(|store| super::session::session_snapshot(store, session_id)) {
        Ok(snapshot) => super::response::snapshot(&state, json!(snapshot)).into_response(),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/sessions/{session_id}/turns` — start a prompt turn or
/// join the already-active run for the session.
pub async fn start_prompt_turn(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<SessionId>,
    command: ResolvedCommand<StartPromptTurnRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = session_context(actor, idempotency_key, now);
    match state.with_authoring_store(|store| {
        super::session::start_prompt_turn(store, context, session_id, payload)
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
    match state
        .with_authoring_store(|store| super::session::cancel_run(store, context, run_id, payload))
    {
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
    match state
        .with_authoring_store(|store| super::session::resume_run(store, context, run_id, payload))
    {
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
fn command_error_response(state: &AppState, err: &StoreError) -> Response {
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
    super::response::typed_error(state, status, kind, &message).into_response()
}

/// Map a completed proposal command to its enveloped response: an accepted
/// outcome and an idempotent replay both serve the outcome snapshot (200); a
/// still-in-flight prior attempt returns 202 so the client continues rather than
/// re-issuing; an eligibility DENIAL rides the 200 success envelope as a denied
/// value (denials-are-values), never a 4xx fault.
fn proposal_result_response(state: &AppState, result: ProposalCommandResult) -> Response {
    match result {
        ProposalCommandResult::Accepted { outcome, .. } => {
            let data = serde_json::to_value(&outcome).expect("proposal outcome serializes");
            super::response::snapshot(state, data).into_response()
        }
        ProposalCommandResult::Replayed { idempotency } => {
            let data = idempotency
                .outcome
                .map(|outcome| outcome.payload)
                .unwrap_or_else(|| json!({ "status": "replayed" }));
            super::response::snapshot(state, data).into_response()
        }
        ProposalCommandResult::InFlight { .. } => (
            StatusCode::ACCEPTED,
            super::response::snapshot(state, json!({ "status": "in_flight" })),
        )
            .into_response(),
        // Denials are VALUES: an eligibility refusal rides the SUCCESS envelope
        // (200) as a denied decision carrying the domain reason, never a 4xx fault
        // (denials-are-values ADR; errors are faults).
        ProposalCommandResult::Denied { eligibility } => denial_snapshot(state, &eligibility),
    }
}

fn session_result_response(
    state: &AppState,
    result: super::session::SessionCommandResult,
) -> Response {
    match result {
        super::session::SessionCommandResult::Accepted { outcome, .. }
        | super::session::SessionCommandResult::Replayed { outcome, .. } => {
            let data = serde_json::to_value(&outcome).expect("session outcome serializes");
            super::response::snapshot(state, data).into_response()
        }
        super::session::SessionCommandResult::InFlight { idempotency } => (
            StatusCode::ACCEPTED,
            super::response::snapshot(
                state,
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
        )
            .into_response(),
    }
}

fn session_context(
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now: i64,
) -> super::session::SessionCommandContext {
    super::session::SessionCommandContext {
        actor,
        idempotency_key,
        now_ms: now,
        in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
        outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
    }
}

/// A denied eligibility as a 200 SUCCESS-envelope value (denials-are-values ADR):
/// the shared shape every command surface uses for a refusal — status, the command
/// it refused, and the domain reason.
fn denial_snapshot(state: &AppState, eligibility: &ActionEligibility) -> Response {
    super::response::snapshot(
        state,
        json!({
            "status": "denied",
            "command": eligibility.command,
            "allowed": eligibility.allowed,
            "reason": eligibility.reason,
        }),
    )
    .into_response()
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
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let context = ProposalCommandContext {
        actor,
        idempotency_key,
        now_ms: now,
        in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
        outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
    };
    // The materializer reads the vault worktree (parent of `.vault`).
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    match state.with_authoring_store(|store| {
        super::proposal::create_proposal(store, &reader, context, payload)
    }) {
        Ok(result) => proposal_result_response(&state, result),
        Err(err) => command_error_response(&state, &err),
    }
}

// --- submit for review (composite: validate + submit + open approval) ---------

/// The reduced outcome of one composed proposal command: its recorded outcome
/// (on accept OR idempotent replay), a denial VALUE, or a still-in-flight prior
/// attempt the composition must not run past.
enum StepOutcome {
    Outcome {
        outcome: ProposalCommandOutcome,
        replayed: bool,
    },
    Denied(ActionEligibility),
    InFlight,
}

/// Reduce a `ProposalCommandResult` to the outcome the composition threads
/// forward, deserializing the recorded outcome on an idempotent replay.
fn reduce_step(result: ProposalCommandResult) -> StoreResult<StepOutcome> {
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
enum SubmitComposite {
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

struct ModePostSubmitOutcome {
    auto_approval: ModeAutoApprovalOutcome,
    apply: Option<ApplyOutcome>,
}

/// The proposal ↔ approval identity is 1:1 in V1: the proposal id is DERIVED
/// deterministically from the changeset id (hashed like the apply/rollback receipt
/// ids — a long changeset id can never overflow the id cap, and a client-opaque
/// value never leaks). The submit response echoes it so the reviewer can name it.
fn derive_proposal_id(changeset_id: &ChangesetId) -> StoreResult<ProposalId> {
    ProposalId::new(format!(
        "proposal:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived proposal id is invalid: {err}")))
}

/// The approval-request id, likewise derived deterministically from the changeset
/// (1:1 with the proposal in V1), so a submit retry opens the SAME request.
fn derive_approval_id(changeset_id: &ChangesetId) -> StoreResult<ApprovalId> {
    ApprovalId::new(format!(
        "approval:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived approval id is invalid: {err}")))
}

/// A composed sub-command idempotency key `{base}:{step}` so each internal step of
/// the submit composition dedups independently and a whole-submit retry replays
/// every step.
fn step_key(base: &IdempotencyKey, step: &str) -> StoreResult<IdempotencyKey> {
    IdempotencyKey::new(format!("{}:{step}", base.as_str())).map_err(|err| {
        StoreError::Idempotency(format!("composed idempotency key is invalid: {err}"))
    })
}

/// Map an `ApprovalError` to a `StoreError` so an approval step composes inside a
/// unit of work: a nested store fault surfaces verbatim; a domain approval refusal
/// becomes a typed approval error (mapped to a 4xx by the taxonomy).
fn approval_err_to_store(err: ApprovalError) -> StoreError {
    match err {
        ApprovalError::Store(store) => store,
        other => StoreError::Approval(other.to_string()),
    }
}

/// The submit composition: validate the drafted proposal (evidence derived from the
/// live worktree), submit it for review, and open its approval request — all
/// SERVER-SIDE, each step idempotent under the composed keys. A denial at validate
/// or submit rides back as a value; a store fault aborts.
fn submit_for_review_composed(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now: i64,
    changeset_id: &ChangesetId,
    payload: &SubmitForReviewRequest,
) -> StoreResult<SubmitComposite> {
    // 1. VALIDATE — derive the evidence from the live worktree so the client never
    //    supplies validation material (the "compose validation server-side" rule).
    let latest = store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.ledger().latest(changeset_id)
        })?
        .ok_or_else(|| {
            StoreError::StaleRevision(format!(
                "changeset `{changeset_id}` has no proposal history to submit"
            ))
        })?;

    // R1 PARTIAL-SUBMIT WEDGE HEAL: the composition is three units of work, so a
    // crash between the submit and the approval-open leaves the head in NeedsReview
    // with NO approval — and a fresh-key retry would then deny at validate
    // (NeedsReview is not validatable), wedging the proposal unrecoverably. The
    // deterministic proposal/approval ids let us RESUME idempotently: an in-review
    // head skips validate+submit and (re-)opens the approval.
    if latest.status == ChangesetStatus::NeedsReview {
        return resume_submit_in_review(store, changeset_id, &latest, now);
    }
    if let Some(replay) =
        replay_submitted_if_already_advanced(store, changeset_id, &latest, idempotency_key)?
    {
        return Ok(replay);
    }

    let (current_revisions, chunk_evidence) = validation_evidence(reader, &latest)?;
    let validate = super::proposal::validate_proposal(
        store,
        ProposalCommandContext {
            actor: actor.clone(),
            idempotency_key: step_key(idempotency_key, "validate")?,
            now_ms: now,
            in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
            outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
        },
        ValidateProposalRequest {
            changeset_id: changeset_id.clone(),
            expected_revision: payload.expected_revision.clone(),
            summary: payload.summary.clone(),
            current_revisions,
            chunk_evidence,
        },
    )?;
    let validated = match reduce_step(validate)? {
        StepOutcome::Outcome { outcome, .. } => outcome,
        StepOutcome::Denied(eligibility) => return Ok(SubmitComposite::Denied(eligibility)),
        StepOutcome::InFlight => return Ok(SubmitComposite::InFlight),
    };
    let validation_digest = validated
        .validation_digest
        .clone()
        .ok_or_else(|| StoreError::Validation("validation pass produced no digest".to_string()))?;

    // 2. SUBMIT — move the validated proposal to NeedsReview under its new revision.
    let submit = super::proposal::submit_for_review(
        store,
        ProposalCommandContext {
            actor: actor.clone(),
            idempotency_key: step_key(idempotency_key, "submit")?,
            now_ms: now,
            in_flight_expires_at_ms: Some(now + COMMAND_IN_FLIGHT_TTL_MS),
            outcome_expires_at_ms: Some(now + COMMAND_OUTCOME_TTL_MS),
        },
        SubmitProposalRequest {
            changeset_id: changeset_id.clone(),
            expected_revision: validated.changeset_revision.clone(),
            validation_digest: validation_digest.clone(),
            summary: payload.summary.clone(),
        },
    )?;
    let (submitted, replayed) = match reduce_step(submit)? {
        StepOutcome::Outcome { outcome, replayed } => (outcome, replayed),
        StepOutcome::Denied(eligibility) => return Ok(SubmitComposite::Denied(eligibility)),
        StepOutcome::InFlight => return Ok(SubmitComposite::InFlight),
    };
    let needs_review_revision = submitted.changeset_revision.clone();

    // 3. OPEN APPROVAL — server-driven (request_approval is domain plumbing, not a
    //    wire verb), idempotent by proposal id + the composed `:approval` key.
    let proposal_id = derive_proposal_id(changeset_id)?;
    let approval_id = derive_approval_id(changeset_id)?;
    let approval = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals()
            .request_approval(ApprovalRequestInput {
                approval_id: approval_id.clone(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: needs_review_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: format!("{}:approval", idempotency_key.as_str()),
                created_at_ms: now,
            })
            .map_err(approval_err_to_store)
    })?;

    Ok(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision,
        validation_digest,
        proposal_id,
        approval: Box::new(approval.record),
        replayed,
    })
}

/// Resume a submit whose changeset is ALREADY in review (R1 wedge heal). If the
/// approval already exists the submit is fully done → replay it; if it is ABSENT
/// (the crash window between submit and approval-open) → open it from the recorded
/// validation, healing the wedge idempotently under a deterministic key.
fn resume_submit_in_review(
    store: &mut Store,
    changeset_id: &ChangesetId,
    latest: &ChangesetAggregateRecord,
    now: i64,
) -> StoreResult<SubmitComposite> {
    let proposal_id = derive_proposal_id(changeset_id)?;
    let existing = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals().latest_for_proposal(&proposal_id)
    })?;
    if let Some(approval) = existing {
        // Fully submitted already — an idempotent re-submit replays the state.
        return Ok(SubmitComposite::Submitted {
            changeset_id: changeset_id.clone(),
            needs_review_revision: approval.reviewed.proposal_revision.clone(),
            validation_digest: approval.reviewed.validation_digest.clone(),
            proposal_id,
            approval: Box::new(approval),
            replayed: true,
        });
    }

    // WEDGE: NeedsReview but no approval → open it from the recorded validation.
    let validation_digest = store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            uow.validations().latest_for_changeset(changeset_id)
        })?
        .map(|record| record.validation_digest)
        .ok_or_else(|| {
            StoreError::Validation(
                "submitted proposal has no validation record to resume its approval".to_string(),
            )
        })?;
    let needs_review_revision = latest.changeset_revision.clone();
    let approval_id = derive_approval_id(changeset_id)?;
    let approval = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals()
            .request_approval(ApprovalRequestInput {
                approval_id,
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: needs_review_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: format!("resume-approval:{changeset_id}"),
                created_at_ms: now,
            })
            .map_err(approval_err_to_store)
    })?;

    Ok(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision,
        validation_digest,
        proposal_id,
        approval: Box::new(approval.record),
        replayed: true,
    })
}

/// Replay a submit whose first request already advanced beyond review, such as
/// autonomous mode auto-applying the changeset before the client retry arrives.
/// The replay is keyed to the original approval-open step so a different submit
/// attempt cannot inherit an old approval.
fn replay_submitted_if_already_advanced(
    store: &mut Store,
    changeset_id: &ChangesetId,
    latest: &ChangesetAggregateRecord,
    idempotency_key: &IdempotencyKey,
) -> StoreResult<Option<SubmitComposite>> {
    if matches!(
        latest.status,
        ChangesetStatus::Draft | ChangesetStatus::Proposed | ChangesetStatus::NeedsReview
    ) {
        return Ok(None);
    }
    let proposal_id = derive_proposal_id(changeset_id)?;
    let expected_key = format!("{}:approval", idempotency_key.as_str());
    let existing = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals().latest_for_proposal(&proposal_id)
    })?;
    let Some(approval) = existing else {
        return Ok(None);
    };
    if approval.idempotency_key != expected_key || approval.changeset_id != *changeset_id {
        return Ok(None);
    }
    Ok(Some(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision: approval.reviewed.proposal_revision.clone(),
        validation_digest: approval.reviewed.validation_digest.clone(),
        proposal_id,
        approval: Box::new(approval),
        replayed: true,
    }))
}

/// `POST /authoring/v1/proposals/{changeset_id}/submit` — move a drafted proposal
/// into review. The route COMPOSES the validation pass + the approval-request
/// opening SERVER-SIDE; the actor is the middleware-resolved principal.
pub async fn submit_for_review(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
    command: ResolvedCommand<SubmitForReviewRequest>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::response::typed_error(
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
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    match state.with_authoring_store(|store| {
        submit_for_review_composed(
            store,
            &reader,
            &actor,
            &idempotency_key,
            now,
            &changeset_id,
            &payload,
        )
    }) {
        Ok(composite) => {
            let mode_outcome =
                mode_after_submit(state.clone(), &composite, idempotency_key.clone(), now).await;
            match mode_outcome {
                Ok(outcome) => submit_composite_response(&state, composite, outcome),
                Err(err) => command_error_response(&state, &err),
            }
        }
        Err(err) => command_error_response(&state, &err),
    }
}

async fn mode_after_submit(
    state: Arc<AppState>,
    composite: &SubmitComposite,
    idempotency_key: IdempotencyKey,
    now: i64,
) -> StoreResult<Option<ModePostSubmitOutcome>> {
    let SubmitComposite::Submitted {
        changeset_id,
        proposal_id: _,
        approval,
        ..
    } = composite
    else {
        return Ok(None);
    };
    let worktree_root = state.active_workspace_root();
    let scope_id = scope_id_for_worktree(&worktree_root);
    let approval = (**approval).clone();
    let changeset_id = changeset_id.clone();
    let state_for_blocking = state.clone();
    tokio::task::spawn_blocking(move || {
        let auto_approval = state_for_blocking.with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, now)
            })
        })?;
        let apply = if auto_approval.should_auto_apply() {
            let system = system_actor();
            let key = IdempotencyKey::new(format!(
                "mode-auto-apply:{}",
                blob_oid(idempotency_key.as_str().as_bytes())
            ))
            .map_err(|err| StoreError::Idempotency(format!("auto-apply key: {err}")))?;
            let adapter = CoreAdapter::detect();
            Some(state_for_blocking.with_authoring_store(|store| {
                super::apply::apply_changeset(
                    store,
                    &adapter,
                    &worktree_root,
                    ApplyRequest {
                        changeset_id: &changeset_id,
                        proposal_id: &approval.proposal_id,
                        actor: &system,
                        idempotency_key: &key,
                        now_ms: now,
                    },
                )
                .map_err(apply_err_to_store)
            })?)
        } else {
            None
        };
        Ok(Some(ModePostSubmitOutcome {
            auto_approval,
            apply,
        }))
    })
    .await
    .map_err(|_| {
        StoreError::Mode(
            "operation-mode post-submit task did not complete; re-query the proposal".to_string(),
        )
    })?
}

/// Map a composed submit outcome to its enveloped response: a denial rides the 200
/// success envelope as a value; a still-in-flight step returns 202; a completed
/// submit (or idempotent replay) serves the reviewed revision + derived ids + the
/// opened approval the reviewer drives the decision from.
fn submit_composite_response(
    state: &AppState,
    composite: SubmitComposite,
    mode_outcome: Option<ModePostSubmitOutcome>,
) -> Response {
    match composite {
        SubmitComposite::Denied(eligibility) => denial_snapshot(state, &eligibility),
        SubmitComposite::InFlight => (
            StatusCode::ACCEPTED,
            super::response::snapshot(state, json!({ "status": "in_flight" })),
        )
            .into_response(),
        SubmitComposite::Submitted {
            changeset_id,
            needs_review_revision,
            validation_digest,
            proposal_id,
            approval,
            replayed,
        } => super::response::snapshot(
            state,
            json!({
                "status": if replayed { "replayed" } else { "submitted" },
                "changeset_id": changeset_id.as_str(),
                "proposal_id": proposal_id.as_str(),
                "reviewed_revision": needs_review_revision,
                "validation_digest": validation_digest,
                "approval": approval,
                "mode": mode_post_submit_value(mode_outcome),
            }),
        )
        .into_response(),
    }
}

fn mode_post_submit_value(outcome: Option<ModePostSubmitOutcome>) -> serde_json::Value {
    let Some(outcome) = outcome else {
        return serde_json::Value::Null;
    };
    let auto = outcome.auto_approval;
    json!({
        "policy": auto.policy,
        "auto_approval": {
            "status": if auto.approved() { "approved" } else { "not_applicable" },
            "eligibility": auto.eligibility,
            "approval": auto.approval,
            "system_policy_approval": auto.marker,
        },
        "auto_apply": outcome.apply.map(|apply| json!({
            "status": if apply.replayed { "replayed" } else if apply.in_flight { "in_flight" } else { "recorded" },
            "receipt": apply.receipt,
        })),
    })
}

// --- review decision (approve / reject) ---------------------------------------

/// `POST /authoring/v1/reviews/{approval_id}/decisions` — record a reviewer's
/// approve/reject on an opened approval. The self-approval ban + freshness gate run
/// INSIDE `submit_decision`; the reviewer is the middleware-resolved principal, and
/// the current validation freshness is read from store state (never client-claimed).
pub async fn submit_review_decision(
    State(state): State<Arc<AppState>>,
    Path(approval_id): Path<String>,
    command: ResolvedCommand<ReviewDecisionRequest>,
) -> Response {
    let path_approval_id = match ApprovalId::new(&approval_id) {
        Ok(id) => id,
        Err(err) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid approval id: {err}"),
            )
            .into_response();
        }
    };
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    if path_approval_id != payload.approval_id {
        return super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "path approval id does not match the request body",
        )
        .into_response();
    }
    let decision = match payload.decision {
        ReviewDecisionKind::Approve => ApprovalDecision::Approve,
        ReviewDecisionKind::Reject => ApprovalDecision::Reject,
        // Edit / Respond (request-changes + edit-response review loops) are reserved
        // for W05.P24; the V1 review subset is approve/reject only. This rides the
        // success envelope as a denial value (denials-are-values), never a fault.
        ReviewDecisionKind::Edit | ReviewDecisionKind::Respond => {
            return denial_snapshot(
                &state,
                &ActionEligibility::denied(
                    CommandKind::EditProposal,
                    "request-changes and edit-response review loops are reserved for W05.P24; \
                     the V1 review subset is approve/reject only",
                ),
            );
        }
    };
    let command_kind = match decision {
        ApprovalDecision::Approve => CommandKind::Approve,
        ApprovalDecision::Reject => CommandKind::Reject,
        ApprovalDecision::RequestChanges => CommandKind::EditProposal,
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(command_kind, |uow| {
            let approval = uow
                .approvals()
                .latest_for_proposal(&payload.proposal_id)?
                .ok_or_else(|| {
                    StoreError::Approval(format!(
                        "no approval request exists for proposal `{}`",
                        payload.proposal_id
                    ))
                })?;
            // R1: reviewed_revision is LOAD-BEARING — the reviewer attests the exact
            // revision the approval was opened against. A mismatch means they reviewed
            // a SUPERSEDED revision → a typed conflict (409), never a silently-ignored
            // field.
            if payload.reviewed_revision != approval.reviewed.proposal_revision {
                return Err(StoreError::StaleReview(format!(
                    "reviewed revision `{}` is stale — the approval was opened against `{}`",
                    payload.reviewed_revision, approval.reviewed.proposal_revision
                )));
            }
            // Cheap belt: the loaded approval must be the one named on the path
            // (unreachable under the V1 derived-id world, but guards a future where a
            // client names an approval id directly).
            if approval.approval_id != payload.approval_id {
                return Err(StoreError::Approval(format!(
                    "loaded approval `{}` does not match the requested approval `{}`",
                    approval.approval_id, payload.approval_id
                )));
            }
            let validation = uow
                .validations()
                .latest_for_changeset(&approval.changeset_id)?;
            let current_validation_digest = validation
                .as_ref()
                .map(|record| record.validation_digest.clone())
                .unwrap_or_default();
            let validation_freshness = ValidationFreshness {
                record_present: validation.is_some(),
                approval_ready: validation
                    .as_ref()
                    .map(|record| record.approval_ready)
                    .unwrap_or(false),
                digest_matches_reviewed: validation
                    .as_ref()
                    .map(|record| record.validation_digest == approval.reviewed.validation_digest)
                    .unwrap_or(false),
            };
            uow.approvals()
                .submit_decision(ReviewDecisionInput {
                    proposal_id: &payload.proposal_id,
                    decision,
                    reviewer: &actor,
                    validation: validation_freshness,
                    current_validation_digest: &current_validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: payload.comment.clone(),
                    decided_at_ms: now,
                })
                .map_err(approval_err_to_store)
        })
    }) {
        Ok(outcome) => approval_outcome_response(&state, outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Map an approval decision outcome to its enveloped response: a refused decision
/// (the self-approval ban, a stale/ineligible review) rides the 200 success
/// envelope as a denied value; a permitted decision serves the durable approval.
fn approval_outcome_response(state: &AppState, outcome: ApprovalOutcome) -> Response {
    if !outcome.eligibility.allowed {
        return denial_snapshot(state, &outcome.eligibility);
    }
    super::response::snapshot(
        state,
        json!({
            "status": if outcome.replayed { "replayed" } else { "decided" },
            "approval": outcome.record,
        }),
    )
    .into_response()
}

// --- operation mode writes ----------------------------------------------------

/// `POST /authoring/v1/mode` — set the active worktree operation mode. The scope
/// is backend-derived from the active workspace root, and the actor is the
/// middleware-resolved principal.
pub async fn set_operation_mode(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<SetOperationModeRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    if !matches!(actor.kind, ActorKind::Human | ActorKind::System) {
        return denial_snapshot(
            &state,
            &ActionEligibility::denied(
                CommandKind::SetOperationMode,
                "only a human or system principal may change operation mode policy",
            ),
        );
    }
    let scope_id = scope_id_for_worktree(&state.active_workspace_root());
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::SetOperationMode, |uow| {
            uow.modes()
                .set_scope_mode(&scope_id, payload.mode, &actor, &idempotency_key, now)
        })
    }) {
        Ok(update) => mode_update_response(&state, &scope_id, update),
        Err(err) => command_error_response(&state, &err),
    }
}

fn mode_update_response(state: &AppState, scope_id: &str, update: OperationModeUpdate) -> Response {
    super::response::snapshot(
        state,
        json!({
            "status": if update.replayed { "replayed" } else { "recorded" },
            "scope_id": scope_id,
            "previous_mode": update.previous_mode,
            "mode": update.record.mode,
            "policy_id": update.record.policy_id,
            "policy_version": update.record.policy_version,
            "requeued_approvals": update.requeued_approvals,
        }),
    )
    .into_response()
}

// --- direct editor save -------------------------------------------------------

/// `POST /authoring/v1/direct-writes` — route a human editor save through the
/// authoring ledger as a self-approved direct changeset. The direct path is
/// authoritative for the live worktree; the legacy core write is measured only
/// against an isolated temporary copy inside the domain handler.
pub async fn direct_write(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<DirectWriteRequestDto>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::DirectWrite {
        return super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "direct-write route requires command `direct_write`",
        )
        .into_response();
    }

    let worktree_root = state.active_workspace_root();
    let capabilities = super::direct_write::DirectWriteCapabilities::for_worktree(&worktree_root);
    if !capabilities.enabled
        || capabilities.authority != super::direct_write::DirectWriteAuthorityMode::DirectChangeset
    {
        return super::response::typed_error(
            &state,
            StatusCode::SERVICE_UNAVAILABLE,
            "authoring_direct_write_disabled",
            "direct editor saves are not enabled by the backend capability state",
        )
        .into_response();
    }

    let adapter = CoreAdapter::detect();
    let state_for_blocking = state.clone();
    let joined = tokio::task::spawn_blocking(move || {
        state_for_blocking.with_authoring_store(|store| {
            super::direct_write::execute_direct_write(
                store,
                &adapter,
                &worktree_root,
                &actor,
                &idempotency_key,
                now,
                payload,
            )
        })
    })
    .await;

    match joined {
        Ok(Ok(outcome)) => direct_write_outcome_response(&state, outcome),
        Ok(Err(err)) => command_error_response(&state, &err),
        Err(_join) => super::response::typed_error(
            &state,
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_direct_write_indeterminate",
            "the direct editor save did not complete; re-query the document and changeset before retrying",
        )
        .into_response(),
    }
}

fn direct_write_outcome_response(
    state: &AppState,
    outcome: super::direct_write::DirectWriteOutcome,
) -> Response {
    if outcome.status == super::direct_write::DirectWriteStatus::InFlight {
        return (
            StatusCode::ACCEPTED,
            super::response::snapshot(state, json!({ "status": "in_flight" })),
        )
            .into_response();
    }
    let data = serde_json::to_value(&outcome).expect("direct write outcome serializes");
    super::response::snapshot(state, data).into_response()
}

// --- apply (the one side-effecting command) -----------------------------------

/// Map an `ApplyError` FAULT to a `StoreError` for the shared taxonomy. Policy
/// DENIALS never reach here — `apply_changeset` returns them as a denied
/// `ApplyOutcome` value; only genuine faults become an `ApplyError`.
fn apply_err_to_store(err: ApplyError) -> StoreError {
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
    let changeset_id = payload.changeset_id.clone();

    // The proposal + approval are derived 1:1 from the changeset (V1). The wire
    // approval id must NAME that derived approval — a coherence check that the
    // client is applying the approval it was handed at submit.
    let proposal_id = match derive_proposal_id(&changeset_id) {
        Ok(id) => id,
        Err(err) => return command_error_response(&state, &err),
    };
    let expected_approval = match latest_approval_id_for_apply(&state, &proposal_id, &changeset_id)
    {
        Ok(id) => id,
        Err(err) => return command_error_response(&state, &err),
    };
    if payload.approval_id != expected_approval {
        return super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "apply approval id does not match the changeset's approval",
        )
        .into_response();
    }

    let worktree_root = state.active_workspace_root();
    let adapter = CoreAdapter::detect();
    let state_for_blocking = state.clone();
    // The whole sync apply (subprocess included) runs off the async worker.
    let joined = tokio::task::spawn_blocking(move || {
        state_for_blocking.with_authoring_store(|store| {
            super::apply::apply_changeset(
                store,
                &adapter,
                &worktree_root,
                ApplyRequest {
                    changeset_id: &changeset_id,
                    proposal_id: &proposal_id,
                    actor: &actor,
                    idempotency_key: &idempotency_key,
                    now_ms: now,
                },
            )
            .map_err(apply_err_to_store)
        })
    })
    .await;

    match joined {
        Ok(Ok(outcome)) => apply_outcome_response(&state, outcome),
        Ok(Err(err)) => command_error_response(&state, &err),
        // The blocking task itself panicked: the write outcome is UNKNOWN. Report a
        // typed indeterminate (never a forged success or failure).
        Err(_join) => super::response::typed_error(
            &state,
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_apply_indeterminate",
            "the apply attempt did not complete; its outcome is indeterminate — \
             re-query the changeset before retrying",
        )
        .into_response(),
    }
}

fn latest_approval_id_for_apply(
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

/// Map an apply outcome to its enveloped response: a preflight denial rides the 200
/// success envelope as a value; a still-in-flight prior attempt returns 202; a
/// completed attempt serves the durable receipt (whose `state` reports Applied vs
/// Failed — a recorded business failure is not a fault).
fn apply_outcome_response(state: &AppState, outcome: ApplyOutcome) -> Response {
    if !outcome.eligibility.allowed {
        return denial_snapshot(state, &outcome.eligibility);
    }
    if outcome.in_flight {
        return (
            StatusCode::ACCEPTED,
            super::response::snapshot(state, json!({ "status": "in_flight" })),
        )
            .into_response();
    }
    let child_outcome = outcome.receipt.as_ref().map(|receipt| match receipt.state {
        ApplyState::Applied => "applied",
        _ => "failed",
    });
    super::response::snapshot(
        state,
        json!({
            "status": if outcome.replayed { "replayed" } else { "recorded" },
            "child_outcome": child_outcome,
            "receipt": outcome.receipt,
        }),
    )
    .into_response()
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
        super::rollback::generate_rollback(
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
fn rollback_outcome_response(state: &AppState, outcome: RollbackOutcome) -> Response {
    if !outcome.eligibility.allowed {
        return super::response::snapshot(
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
    super::response::snapshot(
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
const ISSUANCE_PRINCIPAL: &str = "system:bootstrap";

/// Default minted-token lifetime when the request omits one. The issue path clamps
/// to `MAX_ACTOR_TOKEN_LIFETIME_MS` regardless (a credential is bounded at creation).
const DEFAULT_ACTOR_TOKEN_LIFETIME_MS: i64 = 24 * 3_600 * 1_000;

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
            super::response::snapshot(
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

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::{Body, to_bytes};
    use axum::routing::post;
    use axum::{Extension, Router};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use std::path::Path;
    use std::process::Command;

    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::api::{
        ApiVersion, ChangesetChildOperationDraft, ChangesetOperationKind, CreateSessionRequest,
        DirectWriteRequest, DraftMode, DraftMutation, EndpointFamily, RollbackChildSource,
        TargetRevisionFence, request_fixture,
    };
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
    use crate::authoring::model::{
        ActorId, ActorKind, ActorRef, DocumentRef, IdempotencyKey, SessionId,
    };
    use crate::authoring::policy::OperationMode;
    use crate::authoring::store::Store;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path()
                .join(".vault/plan/2026-06-30-authoring-http-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .env("GIT_AUTHOR_NAME", "authoring-http")
            .env("GIT_AUTHOR_EMAIL", "authoring-http@example.invalid")
            .env("GIT_COMMITTER_NAME", "authoring-http")
            .env("GIT_COMMITTER_EMAIL", "authoring-http@example.invalid")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn scaffold_vaultspec_workspace(root: &Path) {
        let output = Command::new("uv")
            .current_dir(root)
            .args([
                "run",
                "--no-sync",
                "vaultspec-core",
                "install",
                "--target",
                ".",
            ])
            .output()
            .expect("vaultspec-core install command runs");
        assert!(
            output.status.success() && root.join(".vaultspec").is_dir(),
            "real vaultspec-core install must succeed for authoring HTTP acceptance tests: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn fixture_state_with_core() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-b", "main", "."]);
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/operation-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
        )
        .unwrap();
        scaffold_vaultspec_workspace(dir.path());
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "authoring http fixture"]);
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    fn agent() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:writer").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    /// Mint a live token in a temporary authoring store and resolve it to an
    /// `AuthenticatedPrincipal` — the same path the middleware takes, so the test
    /// never fabricates a principal (there is no public constructor).
    fn resolved_principal(actor: &ActorRef) -> (tempfile::TempDir, AuthenticatedPrincipal) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        let raw = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(
                    actor,
                    &ActorId::new("system:bootstrap").unwrap(),
                    100,
                    3_600_000,
                ))
            })
            .unwrap()
            .unwrap()
            .raw_token;
        let principal = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(resolve_principal(&uow.actor_tokens(), Some(raw.as_str()), 200).unwrap())
            })
            .unwrap();
        (dir, principal)
    }

    fn request(resolution: Option<PrincipalResolution>, body: &Value) -> Request {
        let mut req = Request::builder()
            .method("POST")
            .uri("/authoring/v1/sessions")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        if let Some(resolution) = resolution {
            req.extensions_mut().insert(resolution);
        }
        req
    }

    async fn extract(
        state: &Arc<AppState>,
        resolution: Option<PrincipalResolution>,
        body: &Value,
    ) -> Result<ResolvedCommand<CreateSessionRequest>, (StatusCode, Value)> {
        match ResolvedCommand::<CreateSessionRequest>::from_request(
            request(resolution, body),
            state,
        )
        .await
        {
            Ok(command) => Ok(command),
            Err(rejection) => {
                let response = rejection.into_response();
                let status = response.status();
                let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
                Err((status, serde_json::from_slice(&bytes).unwrap()))
            }
        }
    }

    #[tokio::test]
    async fn a_resolved_principal_and_a_valid_body_yield_the_server_actor() {
        let (_state_dir, state) = fixture_state();
        let (_token_dir, principal) = resolved_principal(&agent());

        let command = extract(
            &state,
            Some(PrincipalResolution::Resolved(principal)),
            &request_fixture(EndpointFamily::Session),
        )
        .await
        .unwrap_or_else(|_| panic!("valid session command extracts"));

        // The command's actor is the SERVER-RESOLVED principal, never a body claim.
        assert_eq!(command.actor(), &agent());
        assert_eq!(command.command(), CommandKind::CreateSession);
        assert_eq!(command.idempotency_key().as_str(), "idem:session:create");
        assert_eq!(command.payload().scope, "scope_a");
    }

    #[tokio::test]
    async fn missing_unknown_and_unavailable_principals_are_distinct_rejections() {
        let (_state_dir, state) = fixture_state();
        let body = request_fixture(EndpointFamily::Session);

        // No resolution at all (route not middleware-covered) → treated as missing.
        let (status, envelope) = extract(&state, None, &body).await.unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);
        assert!(envelope["tiers"]["semantic"]["available"].is_boolean());

        let (status, envelope) = extract(
            &state,
            Some(PrincipalResolution::Denied(PrincipalDenial::MissingToken)),
            &body,
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);

        let (status, envelope) = extract(
            &state,
            Some(PrincipalResolution::Denied(
                PrincipalDenial::UnknownPrincipal,
            )),
            &body,
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(envelope["error_kind"], TOKEN_UNKNOWN_KIND);

        let (status, envelope) = extract(&state, Some(PrincipalResolution::Unavailable), &body)
            .await
            .unwrap_err();
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(envelope["error_kind"], STORE_UNAVAILABLE_KIND);
    }

    #[tokio::test]
    async fn a_body_claimed_actor_is_rejected_as_an_unknown_field() {
        let (_state_dir, state) = fixture_state();
        let (_token_dir, principal) = resolved_principal(&agent());

        // A2.3 FALSIFIER: even WITH a valid resolved principal, a body that tries
        // to claim an actor is rejected — the envelope has no actor field
        // (deny_unknown_fields), so kind:Human can never be smuggled.
        let claims_actor = json!({
            "api_version": "v1",
            "command": "create_session",
            "actor": {"id": "human:alice", "kind": "human"},
            "idempotency_key": "idem:session:create",
            "payload": {"scope": "scope_a", "title": "Agentic authoring"}
        });
        let (status, envelope) = extract(
            &state,
            Some(PrincipalResolution::Resolved(principal)),
            &claims_actor,
        )
        .await
        .unwrap_err();

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(envelope["error_kind"], REQUEST_INVALID_KIND);
        assert!(
            envelope["error"].as_str().unwrap().contains("actor"),
            "the rejection names the offending unknown `actor` field: {envelope}"
        );
    }

    #[tokio::test]
    async fn a_malformed_body_is_rejected_as_invalid() {
        let (_state_dir, state) = fixture_state();
        let (_token_dir, principal) = resolved_principal(&agent());

        let (status, envelope) = extract(
            &state,
            Some(PrincipalResolution::Resolved(principal)),
            &json!({ "api_version": "v1" }),
        )
        .await
        .unwrap_err();

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(envelope["error_kind"], REQUEST_INVALID_KIND);
    }

    // --- read / projection handlers -------------------------------------------

    #[tokio::test]
    async fn list_proposals_over_an_empty_store_serves_an_honest_empty_page() {
        let (_dir, state) = fixture_state();
        let response = list_proposals(State(state.clone())).await;

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["items"], json!([]));
        assert_eq!(body["data"]["truncated"], false);
        assert_eq!(body["data"]["cap"], 200);
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the projection rides the shared tiers envelope"
        );
    }

    #[tokio::test]
    async fn project_proposal_for_an_unknown_changeset_is_a_typed_404() {
        let (_dir, state) = fixture_state();
        let response =
            project_proposal(State(state.clone()), Path("changeset_absent".to_string())).await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error_kind"], "authoring_proposal_not_found");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn project_proposal_rejects_an_invalid_changeset_id() {
        let (_dir, state) = fixture_state();
        let response = project_proposal(State(state.clone()), Path("bad id".to_string())).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
    }

    #[tokio::test]
    async fn proposal_snapshot_over_an_unknown_changeset_serves_an_empty_history() {
        let (_dir, state) = fixture_state();
        let response =
            proposal_snapshot(State(state.clone()), Path("changeset_absent".to_string())).await;

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["changeset_id"], "changeset_absent");
        assert!(
            body["data"]["latest"].is_null(),
            "an unknown changeset has no latest revision"
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    // --- the /authoring router-builder skeleton (un-mounted) ------------------

    #[tokio::test]
    async fn authoring_router_serves_the_list_read_through_the_middleware() {
        let (_dir, state) = fixture_state();
        // The read flows through the permissive principal middleware (no token).
        let router = authoring_router(state.clone()).with_state(state);
        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/proposals")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["items"], json!([]));
        assert_eq!(body["data"]["cap"], 200);
    }

    #[tokio::test]
    async fn authoring_router_serves_agent_tool_catalog_and_principal_gated_prepare() {
        let (_dir, state) = fixture_state();
        let agent = agent();
        register_actor(&state, &agent);
        let token = issue_token_in_state(&state, &agent);
        let router = authoring_router(state.clone()).with_state(state.clone());

        let catalog_response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/agent-tools")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(catalog_response.status(), StatusCode::OK);
        let catalog = json_body(catalog_response).await;
        assert_eq!(catalog["data"]["tools"][0]["name"], "read_context");
        assert_eq!(
            catalog["data"]["tools"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|tool| tool["name"] == "request_apply")
                .count(),
            1
        );

        let body = json!({
            "api_version": "v1",
            "command": "request_tool_permission",
            "idempotency_key": "idem:tool:search",
            "payload": {
                "tool_call_id": "tool_call_1",
                "name": "search_graph",
                "input": {
                    "query": "approval gate",
                    "type": "vault"
                }
            }
        });
        let missing = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/agent-tools/prepare")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);

        let (status, prepared) =
            post_authoring(router, "/v1/agent-tools/prepare", &token, body).await;
        assert_eq!(status, StatusCode::OK, "{prepared}");
        assert_eq!(prepared["data"]["actor"]["id"], agent.id.as_str());
        assert_eq!(prepared["data"]["prepared"]["command"], "search_graph");
        assert_eq!(
            prepared["data"]["prepared"]["dispatch"]["kind"],
            "search_graph"
        );
        assert!(prepared["tiers"]["semantic"]["available"].is_boolean());
    }

    fn direct_write_envelope(doc_ref: &str, body: &str, expected: &str, idem: &str) -> Value {
        serde_json::to_value(CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::DirectWrite,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: DirectWriteRequest {
                doc_ref: doc_ref.to_string(),
                body: body.to_string(),
                expected_blob_hash: expected.to_string(),
                summary: Some("route editor save".to_string()),
            },
        })
        .unwrap()
    }

    async fn post_authoring(
        router: Router,
        uri: &str,
        token: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "application/json")
                    .header(AUTHORING_ACTOR_TOKEN_HEADER, token)
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = json_body(response).await;
        (status, body)
    }

    #[tokio::test]
    async fn session_route_success_and_principal_error_are_tiered() {
        let (_dir, state) = fixture_state();
        let human = human_reviewer();
        register_actor(&state, &human);
        let token = issue_token_in_state(&state, &human);
        let body = request_fixture(EndpointFamily::Session);
        let router = authoring_router(state.clone()).with_state(state.clone());

        let (status, envelope) = post_authoring(router, "/v1/sessions", &token, body.clone()).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(envelope["data"]["command"], "create_session");
        assert_eq!(envelope["data"]["status"], "created");
        assert!(envelope["data"]["session_id"].as_str().is_some());
        assert!(envelope["tiers"]["semantic"]["available"].is_boolean());

        let router = authoring_router(state.clone()).with_state(state);
        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let envelope = json_body(response).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);
        assert!(envelope["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn direct_write_route_is_disabled_until_backend_capability_file_enables_it() {
        let (dir, state) = fixture_state();
        let human = human_reviewer();
        register_actor(&state, &human);
        let token = issue_token_in_state(&state, &human);
        let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
        let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
        let router = authoring_router(state.clone()).with_state(state.clone());

        let (status, body) = post_authoring(
            router,
            "/v1/direct-writes",
            &token,
            direct_write_envelope(
                doc_ref,
                "route body",
                &blob_oid(base.as_bytes()),
                "idem:route:off",
            ),
        )
        .await;

        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(body["error_kind"], "authoring_direct_write_disabled");
        let marker = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::DirectWrite, |uow| {
                    uow.direct_writes().record_by_actor_key(
                        &human,
                        &IdempotencyKey::new("idem:route:off").unwrap(),
                    )
                })
            })
            .unwrap();
        assert!(
            marker.is_none(),
            "flag-off direct route must not create direct-write records"
        );

        let Json(status_body) = super::super::response::enabled_status(&state);
        assert_eq!(status_body["data"]["capabilities"]["direct_write"], false);
        assert!(
            !dir.path()
                .join(".vault/data/authoring-state/direct-write-capabilities.json")
                .exists(),
            "the disabled default is read, not synthesized by creating config"
        );
    }

    #[tokio::test]
    async fn direct_write_route_uses_actor_token_and_records_agent_denial_as_value() {
        let (dir, state) = fixture_state();
        super::super::direct_write::DirectWriteCapabilities::write_for_tests(
            dir.path(),
            super::super::direct_write::DirectWriteCapabilities::direct_dual_run(),
        );
        register_actor(&state, &agent());
        let token = issue_token_in_state(&state, &agent());
        let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
        let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
        let router = authoring_router(state.clone()).with_state(state.clone());

        let (status, body) = post_authoring(
            router,
            "/v1/direct-writes",
            &token,
            direct_write_envelope(
                doc_ref,
                "route denied body",
                &blob_oid(base.as_bytes()),
                "idem:route:agent:denied",
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK, "agent denial is a value: {body}");
        assert_eq!(body["data"]["status"], "denied");
        assert_eq!(body["data"]["record"]["status"], "denied");
        assert!(
            body["data"]["eligibility"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("agents must propose changesets"))
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
        assert!(
            !body.to_string().contains("route denied body"),
            "route value evidence must not leak the raw requested body: {body}"
        );
    }

    #[tokio::test]
    async fn direct_write_route_rejects_the_wrong_command_kind_before_execution() {
        let (dir, state) = fixture_state();
        super::super::direct_write::DirectWriteCapabilities::write_for_tests(
            dir.path(),
            super::super::direct_write::DirectWriteCapabilities::direct_dual_run(),
        );
        register_actor(&state, &human_reviewer());
        let token = issue_token_in_state(&state, &human_reviewer());
        let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
        let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
        let mut envelope = direct_write_envelope(
            doc_ref,
            "route body",
            &blob_oid(base.as_bytes()),
            "idem:route:wrong-kind",
        );
        envelope["command"] = json!("create_session");
        let router = authoring_router(state.clone()).with_state(state);

        let (status, body) = post_authoring(router, "/v1/direct-writes", &token, envelope).await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
    }

    #[tokio::test]
    async fn authoring_status_reports_enabled_direct_write_capability_through_router() {
        let (dir, state) = fixture_state();
        super::super::direct_write::DirectWriteCapabilities::write_for_tests(
            dir.path(),
            super::super::direct_write::DirectWriteCapabilities::direct_dual_run(),
        );
        let router = authoring_router(state.clone()).with_state(state);
        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["data"]["capabilities"]["direct_write"], true);
        assert_eq!(body["data"]["capabilities"]["direct_write_dual_run"], true);
        assert_eq!(
            body["data"]["capabilities"]["direct_write_authority"],
            "direct_changeset"
        );
    }

    // --- mutating command handler: create proposal ----------------------------

    /// Register `actor` in the authoring actor registry (P19) of the state's own
    /// store — an authoring command requires a registered, active actor.
    fn register_actor(state: &AppState, actor: &ActorRef) {
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor.clone(),
                        ActorDisplayMetadata {
                            display_name: "Test Actor".to_string(),
                            display_summary: None,
                        },
                        now_ms(),
                    ))?;
                    uow.sessions().create_session(
                        SessionId::new("session_http_1").unwrap(),
                        CreateSessionRequest {
                            scope: "http-tests".to_string(),
                            title: "HTTP test session".to_string(),
                        },
                        actor.clone(),
                        now_ms(),
                    )?;
                    Ok(())
                })
            })
            .unwrap();
    }

    /// A `create_proposal` command over a real seeded existing document with a
    /// single `ReplaceBody` operation whose base/current revision matches the
    /// worktree (the skeleton materializes ReplaceBody, not CreateDocument). The
    /// same seed + request is reproducible, so a duplicate replays idempotently.
    fn create_command(
        principal: AuthenticatedPrincipal,
        root: &Path,
        changeset: &str,
        idem: &str,
    ) -> ResolvedCommand<CreateProposalRequest> {
        let doc_path = root.join(".vault/plan/operation-plan.md");
        std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
        std::fs::write(
            &doc_path,
            "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
        )
        .unwrap();
        let document = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
            .unwrap();
        let DocumentRef::Existing { base_revision, .. } = &document else {
            unreachable!("resolved an existing document");
        };
        let revision = base_revision.clone();
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::CreateProposal,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: CreateProposalRequest {
                session_id: SessionId::new("session_http_1").unwrap(),
                changeset_id: ChangesetId::new(changeset).unwrap(),
                summary: "create a plan".to_string(),
                operations: vec![ChangesetChildOperationDraft {
                    child_key: "child_1".to_string(),
                    operation: ChangesetOperationKind::ReplaceBody,
                    target: TargetRevisionFence {
                        document: document.clone(),
                        base_revision: Some(revision.clone()),
                        current_revision: Some(revision),
                    },
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nnew body\n".to_string(),
                    },
                }],
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    fn create_body_command(
        principal: AuthenticatedPrincipal,
        root: &Path,
        changeset: &str,
        idem: &str,
        body: &str,
    ) -> ResolvedCommand<CreateProposalRequest> {
        let doc_path = root.join(".vault/plan/operation-plan.md");
        std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
        std::fs::write(
            &doc_path,
            "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
        )
        .unwrap();
        let document = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
            .unwrap();
        let DocumentRef::Existing { base_revision, .. } = &document else {
            unreachable!("resolved an existing document");
        };
        let revision = base_revision.clone();
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::CreateProposal,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: CreateProposalRequest {
                session_id: SessionId::new("session_http_1").unwrap(),
                changeset_id: ChangesetId::new(changeset).unwrap(),
                summary: "create a plan".to_string(),
                operations: vec![ChangesetChildOperationDraft {
                    child_key: "child_1".to_string(),
                    operation: ChangesetOperationKind::ReplaceBody,
                    target: TargetRevisionFence {
                        document: document.clone(),
                        base_revision: Some(revision.clone()),
                        current_revision: Some(revision),
                    },
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: body.to_string(),
                    },
                }],
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    fn mode_command(
        principal: AuthenticatedPrincipal,
        mode: OperationMode,
        idem: &str,
    ) -> ResolvedCommand<SetOperationModeRequest> {
        ResolvedCommand::from_principal(
            principal,
            CommandEnvelope {
                api_version: ApiVersion::V1,
                command: CommandKind::SetOperationMode,
                idempotency_key: IdempotencyKey::new(idem).unwrap(),
                payload: SetOperationModeRequest { mode },
            },
        )
    }

    #[tokio::test]
    async fn create_proposal_opens_a_draft_changeset_under_the_resolved_actor() {
        let (dir, state) = fixture_state();
        register_actor(&state, &agent());
        let (_token_dir, principal) = resolved_principal(&agent());

        let response = create_proposal(
            State(state.clone()),
            create_command(principal, dir.path(), "changeset_http_1", "idem:create:1"),
        )
        .await;

        let status = response.status();
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(status, StatusCode::OK, "create failed: {body}");
        assert_eq!(body["data"]["changeset_id"], "changeset_http_1");
        assert_eq!(body["data"]["status"], "draft");
        assert_eq!(body["data"]["command"], "create_proposal");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn create_proposal_replays_a_duplicate_idempotent_command() {
        let (dir, state) = fixture_state();
        register_actor(&state, &agent());

        let (_d1, principal1) = resolved_principal(&agent());
        let first = create_proposal(
            State(state.clone()),
            create_command(principal1, dir.path(), "changeset_http_2", "idem:create:2"),
        )
        .await;
        assert_eq!(first.status(), StatusCode::OK);

        // Same actor + idempotency key + request → the recorded outcome replays.
        let (_d2, principal2) = resolved_principal(&agent());
        let second = create_proposal(
            State(state.clone()),
            create_command(principal2, dir.path(), "changeset_http_2", "idem:create:2"),
        )
        .await;
        assert_eq!(second.status(), StatusCode::OK);
        let bytes = to_bytes(second.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["changeset_id"], "changeset_http_2");
        assert_eq!(body["data"]["command"], "create_proposal");
    }

    #[tokio::test]
    async fn operation_mode_policy_write_denies_agent_principal() {
        let (_dir, state) = fixture_state();
        register_actor(&state, &agent());
        let (_token_dir, principal) = resolved_principal(&agent());

        let response = set_operation_mode(
            State(state.clone()),
            mode_command(
                principal,
                OperationMode::Autonomous,
                "idem:mode:agent-denied",
            ),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "denied");
        assert_eq!(body["data"]["command"], "set_operation_mode");
        assert!(
            body["data"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("human or system")),
            "unexpected denial body: {body}"
        );
        let scope_id = scope_id_for_worktree(&state.active_workspace_root());
        let mode = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.modes().current_mode(&scope_id)
                })
            })
            .unwrap();
        assert_eq!(mode, OperationMode::Manual);
    }

    #[tokio::test]
    async fn an_ineligible_command_is_a_200_denial_not_a_4xx_fault() {
        // Denials-are-values (ADR): an eligibility refusal rides the SUCCESS
        // envelope (200) as a denied decision carrying the domain reason — never a
        // 4xx. The fault map (`command_error_response`) only ever sees genuine
        // `StoreError`s; a denial never reaches it.
        let (_dir, state) = fixture_state();
        let eligibility = crate::authoring::model::ActionEligibility::denied(
            CommandKind::AppendDraft,
            "changeset is terminal and cannot be mutated",
        );
        let response =
            proposal_result_response(&state, ProposalCommandResult::Denied { eligibility });

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "a denial is a 200 value, not a fault"
        );
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["data"]["status"], "denied");
        assert_eq!(body["data"]["allowed"], false);
        assert_eq!(body["data"]["command"], "append_draft");
        assert!(
            body["data"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("terminal")),
            "the denial carries the domain reason: {body}"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the denial rides the shared tiers envelope"
        );
    }

    // --- mutating command handlers: submit for review + review decision -------

    async fn json_body(response: Response) -> Value {
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn human_reviewer() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn submit_command(
        principal: AuthenticatedPrincipal,
        expected_revision: &str,
        idem: &str,
    ) -> ResolvedCommand<SubmitForReviewRequest> {
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::SubmitForReview,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: SubmitForReviewRequest {
                expected_revision: RevisionToken::new(expected_revision).unwrap(),
                summary: "submit for review".to_string(),
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    fn decision_command(
        principal: AuthenticatedPrincipal,
        approval_id: &str,
        proposal_id: &str,
        reviewed_revision: &str,
        decision: ReviewDecisionKind,
    ) -> ResolvedCommand<ReviewDecisionRequest> {
        let command = match decision {
            ReviewDecisionKind::Reject => CommandKind::Reject,
            _ => CommandKind::Approve,
        };
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command,
            idempotency_key: IdempotencyKey::new(format!("idem:decision:{approval_id}")).unwrap(),
            payload: ReviewDecisionRequest {
                proposal_id: ProposalId::new(proposal_id).unwrap(),
                approval_id: ApprovalId::new(approval_id).unwrap(),
                decision,
                reviewed_revision: RevisionToken::new(reviewed_revision).unwrap(),
                comment: Some("decision".to_string()),
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    /// Drive create → submit over the real handlers (the proposer is `agent()`,
    /// registered here), returning the parsed submit response for the review tests.
    async fn create_then_submit(
        state: &Arc<AppState>,
        root: &std::path::Path,
        changeset: &str,
    ) -> Value {
        register_actor(state, &agent());
        let (_d1, p1) = resolved_principal(&agent());
        let created = create_proposal(
            State(state.clone()),
            create_command(p1, root, changeset, &format!("idem:create:{changeset}")),
        )
        .await;
        assert_eq!(created.status(), StatusCode::OK);
        let created_body = json_body(created).await;
        let revision = created_body["data"]["changeset_revision"]
            .as_str()
            .expect("create returns the draft revision")
            .to_string();

        let (_d2, p2) = resolved_principal(&agent());
        let response = submit_for_review(
            State(state.clone()),
            axum::extract::Path(changeset.to_string()),
            submit_command(p2, &revision, &format!("idem:submit:{changeset}")),
        )
        .await;
        let status = response.status();
        let body = json_body(response).await;
        assert_eq!(status, StatusCode::OK, "submit failed: {body}");
        body
    }

    fn child_input_from_latest(
        child: &crate::authoring::ledger::ChangesetChildOperationRecord,
    ) -> ChangesetChildOperationInput {
        ChangesetChildOperationInput {
            child_key: child.child_key.clone(),
            operation: child.operation,
            target: child.target.clone(),
            materialized_operation: child.materialized_operation.clone(),
            material_digest: child.material_digest.clone(),
            validation_digest: child.validation_digest.clone(),
        }
    }

    fn append_status_revision_for_test(
        state: &AppState,
        changeset_id: &ChangesetId,
        status: ChangesetStatus,
        created_at_ms: i64,
    ) {
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::RequestApply, |uow| {
                    let system = system_actor();
                    uow.actors().put_record(ActorRecordInput::active(
                        system.clone(),
                        ActorDisplayMetadata::new(
                            "System",
                            Some("Operation mode policy".to_string()),
                        ),
                        created_at_ms,
                    ))?;
                    let latest = uow.ledger().latest(changeset_id)?.unwrap();
                    let next = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                        changeset_id: changeset_id.clone(),
                        previous_revision: Some(latest.changeset_revision.clone()),
                        kind: latest.kind,
                        status,
                        session_id: latest.session_id.clone(),
                        actor: system,
                        summary: latest.summary.clone(),
                        children: latest
                            .children
                            .iter()
                            .map(child_input_from_latest)
                            .collect(),
                        created_at_ms,
                    })
                    .map_err(|err| StoreError::Ledger(err.to_string()))?;
                    uow.ledger().append_revision(&next)
                })
            })
            .unwrap();
    }

    #[tokio::test]
    async fn submit_route_composes_validation_and_opens_the_approval() {
        let (dir, state) = fixture_state();
        let body = create_then_submit(&state, dir.path(), "changeset_submit_1").await;

        assert_eq!(body["data"]["status"], "submitted");
        assert_eq!(body["data"]["changeset_id"], "changeset_submit_1");
        assert!(
            body["data"]["proposal_id"]
                .as_str()
                .unwrap()
                .starts_with("proposal:"),
            "proposal id is derived from the changeset: {body}"
        );
        assert!(
            body["data"]["validation_digest"].as_str().is_some(),
            "the composed validation pass recorded a digest: {body}"
        );
        // The approval request was opened SERVER-SIDE, queued for a reviewer.
        assert_eq!(body["data"]["approval"]["queue_state"], "queued");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn submit_route_replays_after_auto_apply_advanced_the_head() {
        let (dir, state) = fixture_state();
        register_actor(&state, &agent());
        let changeset = "changeset_submit_auto_replay";
        let changeset_id = ChangesetId::new(changeset).unwrap();

        let (_d1, p1) = resolved_principal(&agent());
        let created = create_proposal(
            State(state.clone()),
            create_command(p1, dir.path(), changeset, "idem:create:auto-replay"),
        )
        .await;
        assert_eq!(created.status(), StatusCode::OK);
        let created_body = json_body(created).await;
        let draft_revision = created_body["data"]["changeset_revision"]
            .as_str()
            .unwrap()
            .to_string();

        let (_d2, p2) = resolved_principal(&agent());
        let first = submit_for_review(
            State(state.clone()),
            axum::extract::Path(changeset.to_string()),
            submit_command(p2, &draft_revision, "idem:submit:auto-replay"),
        )
        .await;
        let first_status = first.status();
        let first_body = json_body(first).await;
        assert_eq!(first_status, StatusCode::OK, "first submit: {first_body}");
        assert_eq!(first_body["data"]["status"], "submitted");

        append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Approved, 1000);
        append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applying, 1001);
        append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applied, 1002);

        let (_d3, p3) = resolved_principal(&agent());
        let replay = submit_for_review(
            State(state.clone()),
            axum::extract::Path(changeset.to_string()),
            submit_command(p3, &draft_revision, "idem:submit:auto-replay"),
        )
        .await;
        let replay_status = replay.status();
        let replay_body = json_body(replay).await;

        assert_eq!(
            replay_status,
            StatusCode::OK,
            "retry after applied head must replay, not conflict or deny: {replay_body}"
        );
        assert_eq!(replay_body["data"]["status"], "replayed");
        assert_eq!(
            replay_body["data"]["approval"]["approval_id"],
            first_body["data"]["approval"]["approval_id"]
        );
    }

    #[tokio::test]
    async fn proposal_routes_serve_backend_policy_decision() {
        let (dir, state) = fixture_state();
        create_then_submit(&state, dir.path(), "changeset_policy_route").await;

        let list = json_body(list_proposals(State(state.clone())).await).await;
        let list_policy = &list["data"]["items"][0]["policy"];
        assert_eq!(list_policy["effective_mode"], "manual");
        assert_eq!(list_policy["risk"], "non_destructive");
        assert_eq!(list_policy["requirement"], "human_approval_required");
        assert!(
            list_policy["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("manual mode")),
            "list route serves backend-authored policy reason: {list}"
        );

        let detail = json_body(
            project_proposal(
                State(state.clone()),
                Path("changeset_policy_route".to_string()),
            )
            .await,
        )
        .await;
        let detail_policy = &detail["data"]["proposal"]["policy"];
        assert_eq!(
            detail_policy, list_policy,
            "detail route reuses the backend projection policy block"
        );
    }

    #[tokio::test]
    async fn increment2_demo_contract_auto_applies_rolls_back_and_requeues_on_downgrade() {
        let (dir, state) = fixture_state_with_core();
        register_actor(&state, &agent());
        register_actor(&state, &human_reviewer());
        let changeset = "changeset_increment2_demo_auto";

        let (_admin_dir, admin) = resolved_principal(&human_reviewer());
        let mode_response = set_operation_mode(
            State(state.clone()),
            mode_command(
                admin,
                OperationMode::Autonomous,
                "idem:mode:increment2:auto",
            ),
        )
        .await;
        let mode_status = mode_response.status();
        let mode_body = json_body(mode_response).await;
        assert_eq!(mode_status, StatusCode::OK, "set auto mode: {mode_body}");
        assert_eq!(mode_body["data"]["mode"], "autonomous");

        let (_create_dir, creator) = resolved_principal(&agent());
        let created = create_proposal(
            State(state.clone()),
            create_body_command(
                creator,
                dir.path(),
                changeset,
                "idem:create:increment2:auto",
                "# Plan\n\nnew body\n",
            ),
        )
        .await;
        let created_status = created.status();
        let created_body = json_body(created).await;
        assert_eq!(created_status, StatusCode::OK, "create: {created_body}");
        let draft_revision = created_body["data"]["changeset_revision"]
            .as_str()
            .expect("create returns draft revision")
            .to_string();

        let (_submit_dir, submitter) = resolved_principal(&agent());
        let submitted = submit_for_review(
            State(state.clone()),
            axum::extract::Path(changeset.to_string()),
            submit_command(submitter, &draft_revision, "idem:submit:increment2:auto"),
        )
        .await;
        let submitted_status = submitted.status();
        let submitted_body = json_body(submitted).await;
        assert_eq!(
            submitted_status,
            StatusCode::OK,
            "autonomous submit: {submitted_body}"
        );
        assert_eq!(submitted_body["data"]["status"], "submitted");
        assert_eq!(
            submitted_body["data"]["mode"]["auto_approval"]["status"],
            "approved"
        );
        assert_eq!(
            submitted_body["data"]["mode"]["auto_approval"]["approval"]["decision"]["reviewer"]["kind"],
            "system"
        );
        assert_eq!(
            submitted_body["data"]["mode"]["auto_apply"]["receipt"]["state"], "applied",
            "auto-apply receipt should be applied: {submitted_body}"
        );

        let document_body =
            std::fs::read_to_string(dir.path().join(".vault/plan/operation-plan.md")).unwrap();
        assert!(
            document_body.contains("new body"),
            "auto-apply materializes the body edit: {document_body}"
        );

        let list = json_body(list_proposals(State(state.clone())).await).await;
        let after_fact = &list["data"]["applied_under_policy"]["items"][0];
        assert_eq!(
            after_fact["proposal"]["changeset_id"],
            "changeset_increment2_demo_auto"
        );
        assert_eq!(after_fact["proposal"]["status"], "applied");
        assert_eq!(after_fact["mode"], "autonomous");
        assert_eq!(after_fact["system_actor"]["kind"], "system");
        assert_eq!(after_fact["proposal"]["rollback"]["available"], true);

        let (_rollback_dir, rollback_actor) = resolved_principal(&human_reviewer());
        let rollback = create_rollback(
            State(state.clone()),
            rollback_command(rollback_actor, changeset, "idem:rollback:increment2:auto"),
        )
        .await;
        let rollback_status = rollback.status();
        let rollback_body = json_body(rollback).await;
        assert_eq!(
            rollback_status,
            StatusCode::OK,
            "rollback generation: {rollback_body}"
        );
        assert_eq!(
            rollback_body["data"]["status"], "generated",
            "rollback should be generated for the applied after-the-fact row: {rollback_body}"
        );
        assert!(
            rollback_body["data"]["rollback_changeset_id"]
                .as_str()
                .is_some_and(|id| id.starts_with("rollback:")),
            "rollback id is served for the after-the-fact lane: {rollback_body}"
        );

        // The public autonomous submit route immediately applies eligible work. To
        // prove the kill-switch contract for an approval that has not reached
        // Applying, return to manual for a second route-served review item, move
        // the scope back to autonomous, then use the mode repository to create
        // only the system approval marker before downgrading through the route and
        // reading the normal projection.
        let (_manual_prep_dir, manual_prep_admin) = resolved_principal(&human_reviewer());
        let manual_prep = set_operation_mode(
            State(state.clone()),
            mode_command(
                manual_prep_admin,
                OperationMode::Manual,
                "idem:mode:increment2:manual-prep",
            ),
        )
        .await;
        let manual_prep_body = json_body(manual_prep).await;
        assert_eq!(manual_prep_body["data"]["mode"], "manual");

        let pending_changeset = "changeset_increment2_demo_pending";
        let (_pcreate_dir, pcreator) = resolved_principal(&agent());
        let pending_created = create_proposal(
            State(state.clone()),
            create_body_command(
                pcreator,
                dir.path(),
                pending_changeset,
                "idem:create:increment2:pending",
                "# Plan\n\npending body\n",
            ),
        )
        .await;
        let pending_created_body = json_body(pending_created).await;
        let pending_revision = pending_created_body["data"]["changeset_revision"]
            .as_str()
            .expect("pending create returns revision")
            .to_string();
        let (_psubmit_dir, psubmitter) = resolved_principal(&agent());
        let pending_submitted = submit_for_review(
            State(state.clone()),
            axum::extract::Path(pending_changeset.to_string()),
            submit_command(
                psubmitter,
                &pending_revision,
                "idem:submit:increment2:pending",
            ),
        )
        .await;
        let pending_body = json_body(pending_submitted).await;
        assert_eq!(
            pending_body["data"]["mode"]["auto_approval"]["status"],
            "not_applicable"
        );
        let pending_changeset_id = ChangesetId::new(pending_changeset).unwrap();
        let pending_proposal_id = derive_proposal_id(&pending_changeset_id).unwrap();
        let pending_approval = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::Approve, |uow| {
                    uow.approvals()
                        .latest_for_proposal(&pending_proposal_id)?
                        .ok_or_else(|| StoreError::Approval("approval missing".to_string()))
                })
            })
            .unwrap();
        let (_auto_pending_dir, auto_pending_admin) = resolved_principal(&human_reviewer());
        let auto_pending = set_operation_mode(
            State(state.clone()),
            mode_command(
                auto_pending_admin,
                OperationMode::Autonomous,
                "idem:mode:increment2:auto-pending",
            ),
        )
        .await;
        let auto_pending_body = json_body(auto_pending).await;
        assert_eq!(auto_pending_body["data"]["mode"], "autonomous");
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::Approve, |uow| {
                    uow.modes()
                        .maybe_auto_approve(
                            &scope_id_for_worktree(&state.active_workspace_root()),
                            &pending_approval,
                            now_ms(),
                        )
                        .map(|outcome| {
                            assert!(
                                outcome.approved(),
                                "pending approval should be system-approved: {pending_body}"
                            );
                        })
                })
            })
            .unwrap();

        let (_manual_dir, manual_admin) = resolved_principal(&human_reviewer());
        let downgrade = set_operation_mode(
            State(state.clone()),
            mode_command(
                manual_admin,
                OperationMode::Manual,
                "idem:mode:increment2:manual",
            ),
        )
        .await;
        let downgrade_status = downgrade.status();
        let downgrade_body = json_body(downgrade).await;
        assert_eq!(
            downgrade_status,
            StatusCode::OK,
            "downgrade mode: {downgrade_body}"
        );
        assert_eq!(downgrade_body["data"]["mode"], "manual");
        assert_eq!(downgrade_body["data"]["requeued_approvals"], 1);

        let pending_projection = json_body(
            project_proposal(State(state.clone()), Path(pending_changeset.to_string())).await,
        )
        .await;
        assert_eq!(
            pending_projection["data"]["proposal"]["approval"]["queue_state"],
            "queued"
        );
        assert_eq!(
            pending_projection["data"]["proposal"]["approval"]["stale_reason"],
            "policy_version_changed"
        );
    }

    #[tokio::test]
    async fn review_decision_route_approves_under_a_distinct_reviewer() {
        let (dir, state) = fixture_state();
        let submitted = create_then_submit(&state, dir.path(), "changeset_review_1").await;
        let proposal_id = submitted["data"]["proposal_id"]
            .as_str()
            .unwrap()
            .to_string();
        let approval_id = submitted["data"]["approval"]["approval_id"]
            .as_str()
            .unwrap()
            .to_string();
        let reviewed = submitted["data"]["reviewed_revision"]
            .as_str()
            .unwrap()
            .to_string();

        register_actor(&state, &human_reviewer());
        let (_d, reviewer) = resolved_principal(&human_reviewer());
        let response = submit_review_decision(
            State(state.clone()),
            axum::extract::Path(approval_id.clone()),
            decision_command(
                reviewer,
                &approval_id,
                &proposal_id,
                &reviewed,
                ReviewDecisionKind::Approve,
            ),
        )
        .await;

        let status = response.status();
        let body = json_body(response).await;
        assert_eq!(status, StatusCode::OK, "decision failed: {body}");
        assert_eq!(body["data"]["status"], "decided");
        assert_eq!(body["data"]["approval"]["queue_state"], "closed");
        assert_eq!(body["data"]["approval"]["decision"]["decision"], "approve");
    }

    #[tokio::test]
    async fn agent_self_approval_is_denied_over_the_wire() {
        let (dir, state) = fixture_state();
        let submitted = create_then_submit(&state, dir.path(), "changeset_selfapprove_1").await;
        let proposal_id = submitted["data"]["proposal_id"]
            .as_str()
            .unwrap()
            .to_string();
        let approval_id = submitted["data"]["approval"]["approval_id"]
            .as_str()
            .unwrap()
            .to_string();
        let reviewed = submitted["data"]["reviewed_revision"]
            .as_str()
            .unwrap()
            .to_string();

        // The PROPOSING agent (registered by create_then_submit) tries to approve
        // its OWN proposal — the self-approval ban denies it as a 200 VALUE.
        let (_d, self_principal) = resolved_principal(&agent());
        let response = submit_review_decision(
            State(state.clone()),
            axum::extract::Path(approval_id.clone()),
            decision_command(
                self_principal,
                &approval_id,
                &proposal_id,
                &reviewed,
                ReviewDecisionKind::Approve,
            ),
        )
        .await;

        let status = response.status();
        let body = json_body(response).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "self-approval must be a 200 denial: {body}"
        );
        assert_eq!(body["data"]["status"], "denied");
        assert!(
            body["data"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("its own proposal")),
            "the ban names the self-approval: {body}"
        );
    }

    #[tokio::test]
    async fn a_stale_reviewed_revision_is_a_409() {
        // R1: reviewed_revision is load-bearing — a reviewer attesting a SUPERSEDED
        // revision is a typed conflict (409 authoring_stale_review), never ignored.
        let (dir, state) = fixture_state();
        let submitted = create_then_submit(&state, dir.path(), "changeset_stalereview").await;
        let proposal_id = submitted["data"]["proposal_id"]
            .as_str()
            .unwrap()
            .to_string();
        let approval_id = submitted["data"]["approval"]["approval_id"]
            .as_str()
            .unwrap()
            .to_string();

        register_actor(&state, &human_reviewer());
        let (_d, reviewer) = resolved_principal(&human_reviewer());
        let response = submit_review_decision(
            State(state.clone()),
            axum::extract::Path(approval_id.clone()),
            decision_command(
                reviewer,
                &approval_id,
                &proposal_id,
                "blob:0000000000000000000000000000000000000000",
                ReviewDecisionKind::Approve,
            ),
        )
        .await;

        assert_eq!(response.status(), StatusCode::CONFLICT);
        let body = json_body(response).await;
        assert_eq!(body["error_kind"], "authoring_stale_review");
    }

    #[tokio::test]
    async fn a_wedged_submit_needsreview_without_approval_heals_on_resubmit() {
        // R1 partial-submit wedge: a crash between submit and approval-open leaves
        // NeedsReview with NO approval. A fresh-key re-submit must RESUME forward
        // (open the approval), not deny at validate.
        let (dir, state) = fixture_state();
        register_actor(&state, &agent());
        let changeset = "changeset_wedge";
        let changeset_id = ChangesetId::new(changeset).unwrap();

        let (_d0, p0) = resolved_principal(&agent());
        let created = create_proposal(
            State(state.clone()),
            create_command(p0, dir.path(), changeset, "idem:create"),
        )
        .await;
        assert_eq!(created.status(), StatusCode::OK);

        // Simulate the crash: drive validate + submit at the DOMAIN to reach
        // NeedsReview WITHOUT opening the approval (the route's step 3).
        let reader = SnapshotReader::for_worktree(state.active_workspace_root());
        let now = now_ms();
        let ctx = |key: &str| ProposalCommandContext {
            actor: agent(),
            idempotency_key: IdempotencyKey::new(key).unwrap(),
            now_ms: now,
            in_flight_expires_at_ms: Some(now + 60_000),
            outcome_expires_at_ms: Some(now + 60_000),
        };
        state
            .with_authoring_store(|store| {
                let latest = store
                    .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                        uow.ledger().latest(&changeset_id)
                    })?
                    .expect("draft exists");
                let (current_revisions, chunk_evidence) = validation_evidence(&reader, &latest)?;
                let validated = super::super::proposal::validate_proposal(
                    store,
                    ctx("idem:wedge:validate"),
                    ValidateProposalRequest {
                        changeset_id: changeset_id.clone(),
                        expected_revision: latest.changeset_revision.clone(),
                        summary: "v".to_string(),
                        current_revisions,
                        chunk_evidence,
                    },
                )?;
                let (vrev, vdigest) = match validated {
                    ProposalCommandResult::Accepted { outcome, .. } => (
                        outcome.changeset_revision,
                        outcome.validation_digest.unwrap(),
                    ),
                    other => panic!("expected validate accepted, got {other:?}"),
                };
                super::super::proposal::submit_for_review(
                    store,
                    ctx("idem:wedge:submit"),
                    SubmitProposalRequest {
                        changeset_id: changeset_id.clone(),
                        expected_revision: vrev,
                        validation_digest: vdigest,
                        summary: "s".to_string(),
                    },
                )?;
                Ok(())
            })
            .unwrap();

        // Confirm the wedge: NeedsReview + no approval for the derived proposal id.
        let proposal_id = derive_proposal_id(&changeset_id).unwrap();
        let wedged = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                    uow.approvals().latest_for_proposal(&proposal_id)
                })
            })
            .unwrap();
        assert!(
            wedged.is_none(),
            "the wedge: submitted but no approval opened"
        );

        // Re-submit via the ROUTE with a FRESH key → the heal opens the approval.
        let (_d1, p1) = resolved_principal(&agent());
        let healed = submit_for_review(
            State(state.clone()),
            axum::extract::Path(changeset.to_string()),
            submit_command(
                p1,
                "blob:0000000000000000000000000000000000000000",
                "idem:wedge:resubmit",
            ),
        )
        .await;
        let hstatus = healed.status();
        let hbody = json_body(healed).await;
        assert_eq!(hstatus, StatusCode::OK, "heal: {hbody}");
        assert_eq!(
            hbody["data"]["status"], "replayed",
            "resume replays: {hbody}"
        );
        assert_eq!(hbody["data"]["approval"]["queue_state"], "queued");

        let healed_exists = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                    uow.approvals().latest_for_proposal(&proposal_id)
                })
            })
            .unwrap();
        assert!(
            healed_exists.is_some(),
            "the wedge is healed — approval opened"
        );
    }

    // --- mutating command handlers: apply + rollback -------------------------

    fn apply_command(
        principal: AuthenticatedPrincipal,
        changeset: &str,
        approval: &str,
        idem: &str,
    ) -> ResolvedCommand<ApplyRequestDto> {
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::RequestApply,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: ApplyRequestDto {
                changeset_id: ChangesetId::new(changeset).unwrap(),
                approval_id: ApprovalId::new(approval).unwrap(),
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    fn rollback_command(
        principal: AuthenticatedPrincipal,
        source: &str,
        idem: &str,
    ) -> ResolvedCommand<RollbackRequestDto> {
        let envelope = CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::CreateRollback,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: RollbackRequestDto {
                source_changeset_id: ChangesetId::new(source).unwrap(),
                source_children: vec![RollbackChildSource {
                    source_child_key: "child_1".to_string(),
                }],
                reason: "restore reviewed preimage".to_string(),
            },
        };
        ResolvedCommand::from_principal(principal, envelope)
    }

    #[tokio::test]
    async fn apply_outcome_response_maps_a_preflight_denial_to_a_200_value() {
        let (_dir, state) = fixture_state();
        let outcome = ApplyOutcome {
            eligibility: ActionEligibility::denied(
                CommandKind::RequestApply,
                "changeset is not approved",
            ),
            receipt: None,
            replayed: false,
            in_flight: false,
        };
        let response = apply_outcome_response(&state, outcome);

        assert_eq!(response.status(), StatusCode::OK, "a denial is a 200 value");
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "denied");
        assert_eq!(body["data"]["command"], "request_apply");
        assert!(
            body["data"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("not approved"))
        );
    }

    #[tokio::test]
    async fn apply_outcome_response_reports_an_in_flight_attempt_as_202() {
        let (_dir, state) = fixture_state();
        let outcome = ApplyOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
            receipt: None,
            replayed: false,
            in_flight: true,
        };
        let response = apply_outcome_response(&state, outcome);

        assert_eq!(response.status(), StatusCode::ACCEPTED);
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "in_flight");
    }

    #[tokio::test]
    async fn apply_route_rejects_a_mismatched_approval_id() {
        let (_dir, state) = fixture_state();
        let (_d, principal) = resolved_principal(&agent());
        // A wrong approval id (not the one derived 1:1 from the changeset) is a 400
        // BEFORE any store or core work.
        let response = apply_changeset(
            State(state.clone()),
            apply_command(
                principal,
                "changeset_apply_1",
                "approval_wrong",
                "idem:apply:1",
            ),
        )
        .await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = json_body(response).await;
        assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
    }

    #[tokio::test]
    async fn rollback_route_over_an_unknown_source_is_unavailable() {
        let (_dir, state) = fixture_state();
        let (_d, principal) = resolved_principal(&agent());
        let response = create_rollback(
            State(state.clone()),
            rollback_command(principal, "changeset_absent_source", "idem:rollback:1"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "unavailable");
        assert!(
            body["data"]["reason"]
                .as_str()
                .is_some_and(|reason| reason.contains("does not exist")),
            "an unknown source is honestly unavailable: {body}"
        );
    }

    #[tokio::test]
    async fn rollback_outcome_response_offers_a_manual_repair_when_unavailable() {
        let (_dir, state) = fixture_state();
        let outcome = RollbackOutcome {
            eligibility: ActionEligibility::denied(
                CommandKind::CreateRollback,
                "rollback_unavailable: no V1 inverse",
            ),
            changeset_id: None,
            changeset_revision: None,
            replayed: false,
            manual_repair: Some(crate::authoring::rollback::ManualRepairProposal {
                source_changeset_id: ChangesetId::new("changeset_1").unwrap(),
                source_children: vec!["child_1".to_string()],
                reason: "restore".to_string(),
            }),
        };
        let response = rollback_outcome_response(&state, outcome);

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "unavailable");
        assert_eq!(
            body["data"]["manual_repair"]["source_children"][0],
            "child_1"
        );
    }

    #[tokio::test]
    async fn rollback_outcome_response_serves_the_generated_changeset() {
        let (_dir, state) = fixture_state();
        let outcome = RollbackOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::CreateRollback),
            changeset_id: Some(ChangesetId::new("rollback:abc123").unwrap()),
            changeset_revision: Some(RevisionToken::new("blob:abc123").unwrap()),
            replayed: false,
            manual_repair: None,
        };
        let response = rollback_outcome_response(&state, outcome);

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["data"]["status"], "generated");
        assert_eq!(body["data"]["rollback_changeset_id"], "rollback:abc123");
    }

    // --- actor-token issuance (the bootstrap seam) ---------------------------

    #[tokio::test]
    async fn issue_actor_token_mints_registers_and_returns_the_raw_token_once() {
        let (_dir, state) = fixture_state();
        let response = issue_actor_token(
            State(state.clone()),
            Json(IssueActorTokenRequest {
                actor: agent(),
                lifetime_ms: Some(3_600_000),
            }),
        )
        .await;

        assert_eq!(response.status(), StatusCode::CREATED);
        let body = json_body(response).await;
        let raw = body["data"]["raw_token"]
            .as_str()
            .expect("the raw token is returned once")
            .to_string();
        // Hash-only persistence: the record carries a token_hash, never the raw token.
        assert_ne!(body["data"]["record"]["token_hash"], json!(raw));
        assert_eq!(body["data"]["record"]["actor"]["id"], "agent:writer");
        assert_eq!(body["data"]["record"]["issued_by"], "system:bootstrap");

        // The actor was REGISTERED active AND the token resolves — so a subsequent
        // command would not 403 on ensure_active (P39 finding #1).
        let resolved = state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actor_tokens().resolve(&raw, now_ms())
                })
            })
            .unwrap();
        assert_eq!(resolved, Some(agent()));
    }

    // --- the middleware, exercised through a real router (oneshot) -------------

    async fn probe(Extension(resolution): Extension<PrincipalResolution>) -> String {
        match resolution {
            PrincipalResolution::Resolved(principal) => {
                format!("resolved:{}", principal.actor().id.as_str())
            }
            PrincipalResolution::Denied(PrincipalDenial::MissingToken) => "denied:missing".into(),
            PrincipalResolution::Denied(PrincipalDenial::UnknownPrincipal) => {
                "denied:unknown".into()
            }
            PrincipalResolution::Unavailable => "unavailable".into(),
        }
    }

    fn probe_router(state: Arc<AppState>) -> Router {
        Router::new()
            .route("/probe", post(probe))
            .layer(axum::middleware::from_fn_with_state(
                state.clone(),
                resolve_principal_layer,
            ))
            .with_state(state)
    }

    /// Issue a live token into the STATE's own authoring store (the one the
    /// middleware resolves against), timestamped at real wall-clock now so it is
    /// live when the middleware resolves it.
    fn issue_token_in_state(state: &AppState, actor: &ActorRef) -> String {
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    Ok(uow.actor_tokens().issue(
                        actor,
                        &ActorId::new("system:bootstrap").unwrap(),
                        now_ms(),
                        3_600_000,
                    ))
                })
            })
            .unwrap()
            .unwrap()
            .raw_token
    }

    async fn probe_body(router: Router, header: Option<&str>) -> String {
        let mut builder = Request::builder().method("POST").uri("/probe");
        if let Some(token) = header {
            builder = builder.header(AUTHORING_ACTOR_TOKEN_HEADER, token);
        }
        let response = router
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    #[tokio::test]
    async fn middleware_resolves_a_live_token_to_the_server_actor() {
        let (_state_dir, state) = fixture_state();
        let raw = issue_token_in_state(&state, &agent());

        let body = probe_body(probe_router(state), Some(&raw)).await;
        assert_eq!(body, "resolved:agent:writer");
    }

    #[tokio::test]
    async fn middleware_denies_missing_and_unknown_tokens_distinctly() {
        let (_state_dir, state) = fixture_state();
        // Force the authoring store open so an unknown-token lookup resolves
        // against a real (empty) store rather than degrading to unavailable.
        let _ = issue_token_in_state(&state, &agent());

        let missing = probe_body(probe_router(state.clone()), None).await;
        assert_eq!(missing, "denied:missing");

        let unknown = probe_body(probe_router(state), Some("deadbeef")).await;
        assert_eq!(unknown, "denied:unknown");
    }
}
