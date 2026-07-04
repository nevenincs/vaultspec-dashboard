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

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde::de::DeserializeOwned;

use super::api::CommandEnvelope;
use super::model::CommandKind;
use super::principal::{
    AUTHORING_ACTOR_TOKEN_HEADER, AuthenticatedPrincipal, PrincipalDenial, ResolvedCommand,
    resolve_principal,
};
use crate::app::{AppState, now_ms};

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

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::{Body, to_bytes};
    use axum::routing::post;
    use axum::{Extension, Router};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use crate::authoring::api::{CreateSessionRequest, EndpointFamily, request_fixture};
    use crate::authoring::model::{ActorId, ActorKind, ActorRef};
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
