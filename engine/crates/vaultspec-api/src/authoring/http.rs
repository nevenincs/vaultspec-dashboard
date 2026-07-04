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
use axum::extract::{FromRequest, Path, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use ingest_struct::reader::blob_oid;
use serde::de::DeserializeOwned;
use serde_json::json;

use super::api::{
    CommandEnvelope, CreateProposalRequest, ReviewDecisionRequest, SubmitForReviewRequest,
};
use super::approvals::{
    ApprovalDecision, ApprovalError, ApprovalOutcome, ApprovalRequestInput, ApprovalRequestRecord,
    ReviewDecisionInput, ReviewedTuple, V1_POLICY_VERSION,
};
use super::model::{
    ActionEligibility, ActorRef, ApprovalId, ChangesetId, CommandKind, IdempotencyKey, ProposalId,
    ReviewDecisionKind, RevisionToken,
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
use super::snapshots::SnapshotReader;
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::ValidationFreshness;
use crate::app::{AppState, now_ms};

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
/// review projection, or a typed 404 when no such changeset exists.
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
                .project_proposal(&changeset_id, &worktree_root)
                .map_err(|ProjectionError::Store(err)| err)
        })
    }) {
        Ok(Some(projection)) => {
            let data = serde_json::to_value(projection).expect("proposal projection serializes");
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

/// The `/authoring` router — the read/projection surface, wired with the
/// principal middleware layer (so a command route added here resolves identity
/// AFTER `bearer_gate`). This is the router-builder SKELETON: the mutating
/// command slices, the shared app-router mount, and the `disabled_status` flip
/// land together in the mount increment. It returns a state-parameterized
/// `Router<Arc<AppState>>` so the app router supplies state on `.nest`.
pub fn authoring_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/proposals", get(list_proposals))
        .route("/v1/proposals/{changeset_id}", get(project_proposal))
        .route(
            "/v1/proposals/{changeset_id}/snapshot",
            get(proposal_snapshot),
        )
        .layer(axum::middleware::from_fn_with_state(
            state,
            resolve_principal_layer,
        ))
}

// --- mutating command handlers --------------------------------------------

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
        Ok(composite) => submit_composite_response(&state, composite),
        Err(err) => command_error_response(&state, &err),
    }
}

/// Map a composed submit outcome to its enveloped response: a denial rides the 200
/// success envelope as a value; a still-in-flight step returns 202; a completed
/// submit (or idempotent replay) serves the reviewed revision + derived ids + the
/// opened approval the reviewer drives the decision from.
fn submit_composite_response(state: &AppState, composite: SubmitComposite) -> Response {
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
            }),
        )
        .into_response(),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::{Body, to_bytes};
    use axum::routing::post;
    use axum::{Extension, Router};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use std::path::Path;

    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::api::{
        ApiVersion, ChangesetChildOperationDraft, ChangesetOperationKind, CreateSessionRequest,
        DraftMode, DraftMutation, EndpointFamily, TargetRevisionFence, request_fixture,
    };
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::model::{
        ActorId, ActorKind, ActorRef, DocumentRef, IdempotencyKey, SessionId,
    };
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
                    ))
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
            "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nbase\n",
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
                interrupt_id: None,
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
