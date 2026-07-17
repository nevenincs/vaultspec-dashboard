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

use std::sync::Arc;

use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Path, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde_json::json;

use super::api::CommandEnvelope;
use super::model::{ActionEligibility, ChangesetId, CommandKind, SessionId};
use super::principal::{
    AUTHORING_ACTOR_TOKEN_HEADER, AuthenticatedPrincipal, PrincipalDenial, ResolvedCommand,
    resolve_principal,
};
use super::projections::ProjectionError;
use super::store::StoreError;
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
mod handlers1;
mod handlers2;
mod handlers3;
mod wire_gaps;
pub(super) use handlers1::*;
pub(super) use handlers2::*;
pub(super) use handlers3::*;
pub(super) use wire_gaps::*;
pub(super) const COMMAND_IN_FLIGHT_TTL_MS: i64 = 60_000;

/// A recorded command outcome's replay-retention window (bounded; a duplicate
/// within it replays the recorded receipt, after it a re-run is a fresh command).
pub(super) const COMMAND_OUTCOME_TTL_MS: i64 = 24 * 3_600 * 1_000;

/// A body/schema violation (missing idempotency key, a body-claimed actor, an
/// unknown field, malformed JSON) — the request was wrong.
pub(super) const REQUEST_INVALID_KIND: &str = "authoring_request_invalid";

/// No actor token was presented on a route that requires a resolved principal.
pub(super) const TOKEN_MISSING_KIND: &str = "authoring_actor_token_missing";

/// A token was presented but is unknown, expired, or revoked. Distinct from
/// "missing" (the client sent nothing) and from the transport gate's "wrong
/// machine credential" (ASA-010).
pub(super) const TOKEN_UNKNOWN_KIND: &str = "authoring_actor_token_unknown";

/// The authoring store could not be opened/read to resolve the principal — the
/// authoring domain degrades honestly rather than the engine panicking.
pub(super) const STORE_UNAVAILABLE_KIND: &str = "authoring_store_unavailable";

/// An authorization refusal: the principal RESOLVED (a live token), but the composed
/// authorization engine ([`authorize_command`]) denied the command — an unregistered or
/// deactivated actor, a stale delegator (confused-deputy fence), or a target outside the
/// session's authorized scope. A distinct kind from the identity denials above
/// (missing / unknown token → 401) and from a bad request (422): the actor is who they
/// say, but lacks authority (403). The reason is authored id/path/token-free.
pub(super) const AUTHORIZATION_DENIED_KIND: &str = "authoring_authorization_denied";

/// A genuine infrastructure failure raised while AUTHORIZING a command — never an
/// authorization refusal (those are eligibility VALUES). Rendered redacted so no id,
/// path, or token leaks from the authorization path.
#[derive(Debug, Clone, Copy)]
pub(super) enum AuthorizationFault {
    /// The authoring store could not be opened/read to run the authorization guards.
    StoreUnavailable,
    /// An authorization guard hit a backend fault reading the actor registry.
    Backend,
}

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

    /// A resolved principal the authorization engine DENIED (unregistered/deactivated
    /// actor, stale delegator). Surfaced as a 403 with the engine's id/path/token-free
    /// reason. The scope guard cannot fire here (the extractor floor supplies no
    /// targets); it runs in the handlers that carry drafted targets.
    fn authorization_denied(state: &AppState, eligibility: &ActionEligibility) -> Self {
        Self::enveloped(
            state,
            StatusCode::FORBIDDEN,
            AUTHORIZATION_DENIED_KIND,
            eligibility
                .reason
                .clone()
                .unwrap_or_else(|| "the acting principal is not authorized".to_string()),
        )
    }

    /// A genuine infrastructure fault while authorizing — redacted, tiers-bearing.
    fn authorization_fault(state: &AppState, fault: AuthorizationFault) -> Self {
        match fault {
            AuthorizationFault::StoreUnavailable => Self::enveloped(
                state,
                StatusCode::SERVICE_UNAVAILABLE,
                STORE_UNAVAILABLE_KIND,
                "authoring store is unavailable".to_string(),
            ),
            AuthorizationFault::Backend => Self::enveloped(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                "authoring_internal_error",
                "an internal authorization check could not be completed".to_string(),
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

        let resolved = ResolvedCommand::from_principal(principal, envelope);
        // W14.P42a — the route-layer authorization FLOOR. Every mutating command is
        // constructed here and NOWHERE else, so running the standing + delegation guards
        // ([`authorize_command`] with no scope/targets/origin) before returning refuses an
        // unregistered, deactivated, or stale-delegated actor on EVERY mutating route with
        // no bypass. The document-scope and review-authority guards run in the handlers
        // that carry a session scope, drafted targets, or an origin author.
        match run_authorization(state, resolved.command(), resolved.actor(), None, &[], None) {
            Ok(eligibility) if eligibility.allowed => Ok(resolved),
            Ok(eligibility) => Err(ResolvedCommandRejection::authorization_denied(
                state,
                &eligibility,
            )),
            Err(fault) => Err(ResolvedCommandRejection::authorization_fault(state, fault)),
        }
    }
}

/// A store the route could not open/read → a typed, tiers-bearing 503 (the
/// authoring panel degrades honestly rather than the engine panicking).
pub(super) fn store_unavailable(state: &AppState, err: &StoreError) -> Response {
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

/// `GET /authoring/v1/proposals/{changeset_id}/conflicts` — the backend-served
/// base-revision CONFLICT REPORT (W13.P27), a pure read ADDITIVE to the cheap `conflict`
/// field on the proposal projection (its served shape is unchanged). Detects stale bases,
/// stale whole-document drafts, overlapping-hunk siblings, anchor drift, and advisory-lease
/// policy collisions over the current worktree + the live corpus. No principal required
/// (reads are unauthenticated); a projection failure degrades to a typed 503.
pub async fn proposal_conflicts(
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
    let now = now_ms();
    let worktree_root = state.active_workspace_root();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.projections()
                .conflict_report(&changeset_id, &worktree_root, now)
                .map_err(|ProjectionError::Store(err)| err)
        })
    }) {
        Ok(Some(report)) => {
            let data = serde_json::to_value(report).expect("conflict report serializes");
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
        .route(
            "/v1/agent-tools/{tool_call_id}/permission-decision",
            post(decide_tool_permission),
        )
        .route(
            "/v1/interrupts/{interrupt_id}/resume",
            post(resume_interrupt),
        )
        .route("/v1/sessions", get(list_sessions).post(create_session))
        .route("/v1/sessions/{session_id}", get(get_session))
        .route("/v1/sessions/{session_id}/turns", post(start_prompt_turn))
        .route("/v1/sessions/{session_id}/cancel", post(cancel_session))
        .route("/v1/sessions/{session_id}/close", post(close_session))
        .route("/v1/runs/{run_id}/cancel", post(cancel_run))
        .route("/v1/runs/{run_id}/complete", post(complete_run))
        .route("/v1/runs/{run_id}/resume", post(resume_run))
        .route("/v1/runs/{run_id}/interrupts", get(get_run_interrupts))
        .route("/v1/feedback-batches", post(create_feedback_batch_route))
        .route(
            "/v1/feedback-batches/{feedback_batch_id}",
            get(get_feedback_batch),
        )
        .route(
            "/v1/runs/{run_id}/agent-tools/execute",
            post(execute_agent_tool_call),
        )
        .route("/v1/proposals", get(list_proposals).post(create_proposal))
        .route("/v1/proposals/{changeset_id}", get(project_proposal))
        .route(
            "/v1/proposals/{changeset_id}/append",
            post(append_proposal_draft),
        )
        .route(
            "/v1/proposals/{changeset_id}/replace",
            post(replace_proposal_draft),
        )
        // Explicit rebase / supersession (W13.P28, wired W14.P42a): advance a stale
        // proposal only through a reviewed decision. Both mutating → floor-authorized.
        .route(
            "/v1/proposals/{changeset_id}/rebase",
            post(rebase_changeset),
        )
        .route("/v1/replacement-proposals", post(create_replacement))
        .route(
            "/v1/proposals/{changeset_id}/snapshot",
            get(proposal_snapshot),
        )
        .route(
            "/v1/proposals/{changeset_id}/conflicts",
            get(proposal_conflicts),
        )
        .route(
            "/v1/proposals/{changeset_id}/provenance",
            get(proposal_provenance),
        )
        .route(
            "/v1/proposals/{changeset_id}/submit",
            post(submit_for_review),
        )
        .route(
            "/v1/reviews/{approval_id}/decisions",
            post(submit_review_decision),
        )
        // Review-station (W13.P24, wired W14.P42a): the human review queue + advisory
        // claim/release/respond. The changeset id rides the body (mirroring the lease
        // action routes) to avoid a path-param clash with `/reviews/{approval_id}`.
        .route("/v1/review-queue", get(review_queue))
        .route("/v1/review-claims", post(claim_review))
        .route("/v1/review-claims/release", post(release_review))
        .route("/v1/review-claims/respond", post(respond_review))
        .route("/v1/apply-requests", post(apply_changeset))
        .route("/v1/rollback-proposals", post(create_rollback))
        .route("/v1/mode", post(set_operation_mode).get(get_operation_mode))
        .route("/v1/direct-writes", post(direct_write))
        // Advisory leases (W13.P26, wired W14.P42a): acquire / renew / release a
        // per-document lease + its monotonic fencing token. Mutating → standing-authorized
        // by the extractor floor.
        .route("/v1/leases", post(acquire_lease))
        .route("/v1/leases/renew", post(renew_lease))
        .route("/v1/leases/release", post(release_lease))
        // Section-anchored document comments (authoring-surface ADR D2). The list is a
        // principal-permissive read that resolves each anchor against the live worktree
        // body; create/edit/resolve/re-anchor/delete are mutating commands attributed to
        // the resolved principal, each emitting a comment event on the authoring SSE feed.
        .route(
            "/v1/documents/{node_id}/comments",
            get(list_comments).post(create_comment_route),
        )
        .route(
            "/v1/comments/{comment_id}",
            patch(update_comment_route).delete(delete_comment_route),
        )
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

#[cfg(test)]
mod tests;
