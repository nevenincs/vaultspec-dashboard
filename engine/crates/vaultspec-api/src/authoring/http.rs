//! Authoring HTTP transport seam: the `ResolvedCommand<T>` request extractor.
//!
//! This is the ROUTE-layer enforcement of the ASA-010 actor fence. The
//! principal-resolution middleware (mounted in P39's shared-file increment)
//! reads the `X-Authoring-Actor-Token` header, resolves it against the server
//! seam, and inserts an [`AuthenticatedPrincipal`] into the request extensions.
//! This extractor reads that server-resolved principal back out and pairs it
//! with the actor-less [`CommandEnvelope<T>`] deserialized from the JSON body,
//! yielding a [`ResolvedCommand<T>`] — the only value a command handler accepts.
//!
//! Because the extractor is the sole route-layer constructor of a
//! `ResolvedCommand`, and it sources the actor EXCLUSIVELY from the
//! middleware-set extension (never the request body), the compile-time actor
//! fence is enforced end-to-end at the wire: a body that tries to claim an
//! `actor` is rejected as an unknown field, and a request that never passed the
//! principal middleware has no resolved actor and is rejected unauthenticated.
#![allow(dead_code)]

use std::sync::Arc;

use axum::Json;
use axum::extract::FromRequest;
use axum::extract::Request;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::de::DeserializeOwned;

use super::api::CommandEnvelope;
use super::principal::{AuthenticatedPrincipal, ResolvedCommand};
use crate::app::AppState;

/// A body/schema violation (missing idempotency key, a body-claimed actor, an
/// unknown field, malformed JSON) — the request was wrong.
const REQUEST_INVALID_KIND: &str = "authoring_request_invalid";

/// The request never carried a server-resolved principal — it did not pass the
/// principal middleware, or presented no live actor token. Distinct from the
/// transport `bearer_gate`'s "wrong machine credential" (ASA-010).
const UNAUTHENTICATED_KIND: &str = "authoring_unauthenticated";

/// A rejection carrying a fully-built, tiers-bearing enveloped error response.
/// Built at extraction time (the `AppState` is in hand) through the shared
/// `api_error_kind` helper so a rejected authoring request rides the same
/// `{error, error_kind, tiers}` envelope as every other error.
pub struct ResolvedCommandRejection(Response);

impl ResolvedCommandRejection {
    fn enveloped(state: &AppState, status: StatusCode, kind: &str, message: String) -> Self {
        Self(crate::routes::api_error_kind(state, status, kind, message).into_response())
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
        // never supply it (ASA-010), so its absence is an unauthenticated request,
        // not a bad body.
        let Some(principal) = req.extensions().get::<AuthenticatedPrincipal>().cloned() else {
            return Err(ResolvedCommandRejection::enveloped(
                state,
                StatusCode::UNAUTHORIZED,
                UNAUTHENTICATED_KIND,
                "authoring command has no server-resolved principal".to_string(),
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
    use serde_json::{Value, json};

    use crate::authoring::api::{CreateSessionRequest, EndpointFamily, request_fixture};
    use crate::authoring::model::{ActorId, ActorKind, ActorRef, CommandKind};
    use crate::authoring::principal::resolve_principal;
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

    fn request(principal: Option<AuthenticatedPrincipal>, body: &Value) -> Request {
        let mut req = Request::builder()
            .method("POST")
            .uri("/authoring/v1/sessions")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        if let Some(principal) = principal {
            req.extensions_mut().insert(principal);
        }
        req
    }

    async fn body_text(rejection: ResolvedCommandRejection) -> (StatusCode, String) {
        let response = rejection.into_response();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, String::from_utf8_lossy(&bytes).into_owned())
    }

    #[tokio::test]
    async fn a_middleware_resolved_principal_and_a_valid_body_yield_the_server_actor() {
        let (_state_dir, state) = fixture_state();
        let (_token_dir, principal) = resolved_principal(&agent());

        let req = request(Some(principal), &request_fixture(EndpointFamily::Session));
        let command = ResolvedCommand::<CreateSessionRequest>::from_request(req, &state)
            .await
            .unwrap_or_else(|_| panic!("valid session command extracts"));

        // The command's actor is the SERVER-RESOLVED principal, never a body claim.
        assert_eq!(command.actor(), &agent());
        assert_eq!(command.command(), CommandKind::CreateSession);
        assert_eq!(command.idempotency_key().as_str(), "idem:session:create");
        assert_eq!(command.payload().scope, "scope_a");
    }

    #[tokio::test]
    async fn a_request_without_a_resolved_principal_is_rejected_unauthenticated() {
        let (_state_dir, state) = fixture_state();

        // No principal in extensions: the request never passed the middleware.
        let req = request(None, &request_fixture(EndpointFamily::Session));
        let rejection = ResolvedCommand::<CreateSessionRequest>::from_request(req, &state)
            .await
            .expect_err("missing principal is rejected");

        let (status, body) = body_text(rejection).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let parsed: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["error_kind"], UNAUTHENTICATED_KIND);
        assert!(
            parsed["tiers"]["semantic"]["available"].is_boolean(),
            "an authoring rejection still carries the tiers block"
        );
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
        let req = request(Some(principal), &claims_actor);
        let rejection = ResolvedCommand::<CreateSessionRequest>::from_request(req, &state)
            .await
            .expect_err("a body-claimed actor is rejected");

        let (status, body) = body_text(rejection).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let parsed: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["error_kind"], REQUEST_INVALID_KIND);
        assert!(
            parsed["error"].as_str().unwrap().contains("actor"),
            "the rejection names the offending unknown `actor` field: {body}"
        );
    }

    #[tokio::test]
    async fn a_malformed_body_is_rejected_as_invalid() {
        let (_state_dir, state) = fixture_state();
        let (_token_dir, principal) = resolved_principal(&agent());

        // Missing idempotency_key + payload: a schema violation, not an auth one.
        let req = request(Some(principal), &json!({ "api_version": "v1" }));
        let rejection = ResolvedCommand::<CreateSessionRequest>::from_request(req, &state)
            .await
            .expect_err("a malformed body is rejected");

        let (status, body) = body_text(rejection).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let parsed: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["error_kind"], REQUEST_INVALID_KIND);
    }
}
