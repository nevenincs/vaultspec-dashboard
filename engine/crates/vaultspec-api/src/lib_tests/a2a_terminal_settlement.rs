//! A2A terminal-settlement acceptance (a2a-product-provisioning W02.P05.S155).
//!
//! Drives the real `POST /internal/a2a/run-terminal` route through the production
//! router against the production lease repository and the product credential
//! store. Proves attach-control callback authentication, worker-IPC + tokenless
//! rejection, durable-terminal-status gating, idempotency, exact hashed-bundle
//! revocation, and callback lease-id verification. No mocks — a real AppState, a
//! real router, real bootstrapped credentials, and a real SQLite lease repo.
//!
//! The reconciliation legs of S155 (INPUT_REQUIRED retention, expiry, restart
//! reconciliation) land with S160/S161.

use super::*;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use crate::a2a_run_leases::{LeaseReservation, LeaseToken};
use crate::authoring::actor_tokens::hash_actor_token;
use crate::authoring::model::{ActorId, ActorKind, ActorRef};
use vaultspec_product::credentials::CredentialStore;
use vaultspec_product::paths::ProductPaths;

/// A seated state with an ISOLATED product home so we can bootstrap the
/// attach-control + worker-IPC credentials the settlement auth verifies against,
/// plus the returned secrets.
struct Fixture {
    _dir: tempfile::TempDir,
    _home: tempfile::TempDir,
    state: Arc<AppState>,
    attach_control: String,
    worker_ipc: String,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    let home = tempfile::tempdir().unwrap();
    let state = app::build_state_with_product_home(
        dir.path().to_path_buf(),
        "test-bearer".to_string(),
        home.path().to_path_buf(),
    );
    // Bootstrap the dashboard credentials under the SAME product paths the seated
    // LifecyclePlane roots at, so `verify_attach_control` reads what we minted.
    let paths = ProductPaths::under_app_home(home.path());
    paths.ensure().unwrap();
    let store = CredentialStore::new(paths.credentials_dir());
    let creds = store.bootstrap().unwrap();
    let worker = store.create_worker_ipc().unwrap();
    Fixture {
        _dir: dir,
        _home: home,
        state,
        attach_control: creds.attach_control.secret().to_string(),
        worker_ipc: worker.secret().to_string(),
    }
}

fn agent(role: &str) -> ActorRef {
    ActorRef {
        id: ActorId::new(format!("agent:{role}")).unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

/// Seed a committed, active lease with one role token; return the raw token.
fn seed_lease(state: &AppState, lease: &str, run: &str, gateway_lease: &str) -> String {
    let raw = format!("raw-{lease}");
    state
        .a2a_run_leases
        .reserve(
            &LeaseReservation {
                lease_id: lease.to_string(),
                reservation_id: format!("res-{lease}"),
                bundle_id: format!("bundle-{lease}"),
                run_id: Some(run.to_string()),
                tokens: vec![LeaseToken {
                    role: "researcher".to_string(),
                    token_hash: hash_actor_token(&raw),
                    actor: agent("researcher"),
                }],
                expiry_ms: app::now_ms() + 3_600_000,
            },
            app::now_ms(),
        )
        .unwrap();
    state
        .a2a_run_leases
        .commit(lease, run, None, gateway_lease, app::now_ms())
        .unwrap();
    raw
}

/// POST the settlement callback with an optional attach-control bearer.
async fn post_terminal(router: Router, body: Value, bearer: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::post("/internal/a2a/run-terminal")
        .header("host", "127.0.0.1")
        .header("content-type", "application/json");
    if let Some(bearer) = bearer {
        builder = builder.header("authorization", format!("Bearer {bearer}"));
    }
    let response = router
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn terminal_body(run: &str, lease: &str, status: &str) -> Value {
    json!({ "run_id": run, "lease_id": lease, "terminal_status": status })
}

#[tokio::test]
async fn settlement_authenticates_attach_control_only_and_settles_idempotently() {
    let fx = fixture();
    let raw = seed_lease(&fx.state, "L1", "run-1", "gw-1");
    // The token resolves while the lease is active.
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, app::now_ms())
            .unwrap()
            .is_some()
    );
    let router = build_router(fx.state.clone());

    // Tokenless → 401 (attach-control required).
    let (status, _) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "completed"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // The WORKER-IPC secret is a DIFFERENT credential → 401 (never accepted).
    let (status, _) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "completed"),
        Some(&fx.worker_ipc),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // The machine bearer is also NOT the attach-control credential → 401.
    let (status, _) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "completed"),
        Some("test-bearer"),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Attach-control + a NON-terminal status → 422 (only durable terminals settle).
    let (status, _) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "input_required"),
        Some(&fx.attach_control),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, app::now_ms())
            .unwrap()
            .is_some(),
        "a non-terminal callback never revokes"
    );

    // Attach-control + terminal → 200, the lease settles and the token is revoked.
    let (status, body) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "completed"),
        Some(&fx.attach_control),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["settled"], true);
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, app::now_ms())
            .unwrap()
            .is_none(),
        "the settled bundle no longer resolves"
    );

    // A repeat is an idempotent no-op (already terminal), still 200.
    let (status, body) = post_terminal(
        router.clone(),
        terminal_body("run-1", "gw-1", "completed"),
        Some(&fx.attach_control),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["settled"], false);
}

#[tokio::test]
async fn a_mismatched_callback_lease_id_settles_nothing() {
    let fx = fixture();
    let raw = seed_lease(&fx.state, "L2", "run-2", "gw-2");
    let router = build_router(fx.state.clone());

    // Authenticated, terminal, but the callback's lease id does not match the one
    // bound at commit → settle nothing (defense-in-depth atop the auth).
    let (status, body) = post_terminal(
        router,
        terminal_body("run-2", "gw-WRONG", "failed"),
        Some(&fx.attach_control),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["settled"], false);
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, app::now_ms())
            .unwrap()
            .is_some(),
        "a lease-id mismatch never revokes the bundle"
    );
}
