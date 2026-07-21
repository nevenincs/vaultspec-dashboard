//! A2A terminal-settlement acceptance (a2a-product-provisioning W02.P05.S155).
//!
//! Drives the real `POST /internal/a2a/run-terminal` route through the production
//! router against the production lease repository and the product credential
//! store. Proves attach-control callback authentication, unrelated-token and
//! tokenless rejection, durable-terminal-status gating, idempotency, exact hashed-bundle
//! revocation, and callback lease-id verification. No mocks — a real AppState, a
//! real router, real bootstrapped credentials, and a real SQLite lease repo.
//!
//! The retention (INPUT_REQUIRED), expiry, and restart-reconciliation legs of
//! S155 are proved here against the seated production lease repository through
//! the committed repo API. The BOOT-time reconciliation WIRING that drives those
//! primitives from a live gateway re-query lands with S160/S161.

use super::*;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use crate::a2a_run_leases::{LeaseRepo, LeaseReservation, LeaseState, LeaseToken};
use crate::authoring::actor_tokens::hash_actor_token;
use crate::authoring::model::{ActorId, ActorKind, ActorRef};
use vaultspec_product::credentials::DashboardCredentialStore;
use vaultspec_product::locking::{Actor, InstallLock};
use vaultspec_product::paths::ProductPaths;

/// A seated state with an ISOLATED product home so we can bootstrap the
/// attach-control credential the settlement auth verifies against, plus one
/// distinct spec-valid token. `vault_root` is the on-disk root the seated
/// `LeaseRepo` opened under, so a test can REOPEN the same durable repo to prove
/// restart survival.
struct Fixture {
    _dir: tempfile::TempDir,
    _home: tempfile::TempDir,
    vault_root: std::path::PathBuf,
    state: Arc<AppState>,
    attach_control: String,
    non_attach_token: String,
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
    let lock = InstallLock::new(paths.install_lock_path());
    let guard = lock
        .acquire(Actor::Installer, "settlement-test")
        .unwrap()
        .unwrap();
    let store = DashboardCredentialStore::for_product(&paths);
    let creds = store.begin_bootstrap(&guard).unwrap();
    let attach_control = creds.attach_control().secret().to_string();
    let mut non_attach_token = attach_control.clone().into_bytes();
    non_attach_token[0] = if non_attach_token[0] == b'a' {
        b'b'
    } else {
        b'a'
    };
    Fixture {
        vault_root: dir.path().join(".vault"),
        _dir: dir,
        _home: home,
        state,
        attach_control,
        non_attach_token: String::from_utf8(non_attach_token).unwrap(),
    }
}

/// Reserve+commit a single-role lease with an explicit bounded expiry; return the
/// raw role token. Mirrors `seed_lease` but lets an expiry-leg control the window.
fn seed_lease_expiring(
    state: &AppState,
    lease: &str,
    run: &str,
    gateway_lease: &str,
    reserve_at: i64,
    expiry_ms: i64,
) -> String {
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
                expiry_ms,
            },
            reserve_at,
        )
        .unwrap();
    state
        .a2a_run_leases
        .commit(lease, run, None, gateway_lease, reserve_at)
        .unwrap();
    raw
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
        Some(&fx.non_attach_token),
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

#[tokio::test]
async fn non_terminal_callbacks_retain_the_running_lease() {
    let fx = fixture();
    let raw = seed_lease(&fx.state, "L3", "run-3", "gw-3");
    let router = build_router(fx.state.clone());

    // Every non-durable-terminal status (INPUT_REQUIRED is the resume case) is
    // rejected as 422 AND retains the worker's lease so the run can continue.
    for status in ["input_required", "working", "submitted", "auth_required"] {
        let (code, _) = post_terminal(
            router.clone(),
            terminal_body("run-3", "gw-3", status),
            Some(&fx.attach_control),
        )
        .await;
        assert_eq!(
            code,
            StatusCode::UNPROCESSABLE_ENTITY,
            "`{status}` is not a durable terminal"
        );
        assert!(
            fx.state
                .a2a_run_leases
                .resolve_token(&raw, app::now_ms())
                .unwrap()
                .is_some(),
            "`{status}` retains the running lease"
        );
    }
}

#[tokio::test]
async fn an_expired_lease_stops_resolving_and_the_sweep_revokes_it() {
    let fx = fixture();
    let base = app::now_ms();
    // A bounded lease whose window closes shortly after commit.
    let raw = seed_lease_expiring(&fx.state, "L4", "run-4", "gw-4", base, base + 1_000);

    // Within the window it authenticates and lists as unresolved.
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, base + 500)
            .unwrap()
            .is_some()
    );
    assert_eq!(
        fx.state.a2a_run_leases.unresolved_leases().unwrap().len(),
        1
    );

    // Past expiry the token refuses BEFORE the sweep, and the bounded sweep then
    // revokes the row so no bundle outlives its window.
    assert!(
        fx.state
            .a2a_run_leases
            .resolve_token(&raw, base + 2_000)
            .unwrap()
            .is_none(),
        "an expired token never authenticates, even before the sweep"
    );
    assert_eq!(
        fx.state
            .a2a_run_leases
            .expire_elapsed(base + 2_000)
            .unwrap(),
        1
    );
    assert_eq!(
        fx.state.a2a_run_leases.lease_state("L4").unwrap(),
        Some(LeaseState::Revoked)
    );
}

#[tokio::test]
async fn a_settled_terminal_is_durable_across_a_repo_reopen() {
    let fx = fixture();
    let raw = seed_lease(&fx.state, "L5", "run-5", "gw-5");
    let router = build_router(fx.state.clone());

    let (code, body) = post_terminal(
        router,
        terminal_body("run-5", "gw-5", "completed"),
        Some(&fx.attach_control),
    )
    .await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(body["data"]["settled"], true);

    // Reopen the SAME durable repo (a process restart): the settled state and the
    // revoked bundle survive — a settled terminal never resurrects.
    let reopened = LeaseRepo::open(&fx.vault_root).unwrap();
    assert_eq!(
        reopened.lease_state("L5").unwrap(),
        Some(LeaseState::Settled)
    );
    assert!(
        reopened
            .resolve_token(&raw, app::now_ms())
            .unwrap()
            .is_none(),
        "the settled bundle stays revoked after restart"
    );
}

#[tokio::test]
async fn reserved_leases_revoke_on_restart_while_committed_leases_survive() {
    let fx = fixture();
    let base = app::now_ms();

    // A reserved-but-never-committed bundle models a crash between reserve and
    // commit. Its hashes are already inert (pre-commit is not resolvable).
    let reserved_raw = "raw-reserved".to_string();
    fx.state
        .a2a_run_leases
        .reserve(
            &LeaseReservation {
                lease_id: "L6-res".to_string(),
                reservation_id: "res-L6".to_string(),
                bundle_id: "bundle-L6".to_string(),
                run_id: Some("run-6-res".to_string()),
                tokens: vec![LeaseToken {
                    role: "planner".to_string(),
                    token_hash: hash_actor_token(&reserved_raw),
                    actor: agent("planner"),
                }],
                expiry_ms: base + 3_600_000,
            },
            base,
        )
        .unwrap();
    // A committed active bundle must survive the same restart.
    let active_raw = seed_lease(&fx.state, "L6-act", "run-6-act", "gw-6");

    // Restart reconciliation: reserved rows fail closed (never completed their
    // local binding), committed rows are untouched.
    let reopened = LeaseRepo::open(&fx.vault_root).unwrap();
    assert_eq!(reopened.revoke_all_reserved(app::now_ms()).unwrap(), 1);
    assert_eq!(
        reopened.lease_state("L6-res").unwrap(),
        Some(LeaseState::Revoked)
    );
    assert!(
        reopened
            .resolve_token(&reserved_raw, app::now_ms())
            .unwrap()
            .is_none()
    );
    // The committed active lease still authenticates after the restart sweep.
    assert!(
        reopened
            .resolve_token(&active_raw, app::now_ms())
            .unwrap()
            .is_some(),
        "a durably committed lease survives restart reconciliation"
    );
}

