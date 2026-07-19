//! A2A lifecycle job-plane acceptance (a2a-product-provisioning W01.P03.S26).
//!
//! Proves the served lifecycle plane against PRODUCTION routes and a REAL
//! registry + real `vaultspec-product` controller rooted at an isolated product
//! home: typed refusal, the uninstalled bootstrap projection, an admitted job
//! that runs to completion, the combined owned+ownership mutation gate (a
//! mutation is refused unless BOTH gates hold), atomic component single-flight,
//! and the hard at-capacity ceiling. No mocks — the AppState, router, registry,
//! and controller are all real; only the product home is a per-test tempdir.

use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

use vaultspec_product::credentials::CredentialStore;
use vaultspec_product::manifest::{ReleaseIdentity, Target};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::receipt::{Channel, Receipt};

/// Build an AppState whose A2A lifecycle plane is rooted at an ISOLATED product
/// home (never the real machine app home), so lifecycle route calls touch only
/// the tempdir. Returns the workspace + product tempdirs (kept alive) and state.
fn lifecycle_state() -> (tempfile::TempDir, tempfile::TempDir, Arc<AppState>) {
    let ws = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(ws.path().join(".vault/plan")).unwrap();
    std::fs::write(
        ws.path().join(".vault/plan/2026-06-12-srv-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#srv'\n---\n\nbody\n",
    )
    .unwrap();
    let product = tempfile::tempdir().unwrap();
    let state = app::build_state_with_product_home(
        ws.path().to_path_buf(),
        app::mint_bearer(),
        product.path().to_path_buf(),
    );
    (ws, product, state)
}

/// Install a real active receipt, ownership + attach-control credentials, and a
/// fresh OWNED gateway discovery record under the product home, so the combined
/// mutation gate classifies our own live gateway and authorizes. `owner_override`
/// forces a foreign owner to exercise the attach-gate refusal.
fn install_owned_gateway(product_home: &std::path::Path, owner_override: Option<&str>) {
    let paths = ProductPaths::under_app_home(product_home);
    paths.ensure().unwrap();
    CredentialStore::new(paths.credentials_dir())
        .bootstrap()
        .unwrap();
    Receipt::bootstrap(
        Channel::SelfInstall,
        Target::X86_64PcWindowsMsvc,
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        "g0",
        1,
    )
    .persist(&paths.receipt_path())
    .unwrap();
    let owner = owner_override
        .map(str::to_string)
        .unwrap_or_else(|| paths.root().to_string_lossy().to_string());
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let handoff = paths.credentials_dir().join("attach-control.cred");
    let discovery = json!({
        "endpoint": "127.0.0.1:8791",
        "pid": std::process::id(),
        "owner": owner,
        "install_identity": "install-1",
        "generation": "g0",
        "release_set": { "name": "vaultspec-a2a", "version": "0.1.0", "target": "x86_64-pc-windows-msvc" },
        "protocol": { "minimum": "v1", "maximum": "v1" },
        "state_schema": { "minimum": "0001", "maximum": "0009" },
        "handoff_reference": handoff.to_string_lossy(),
        "heartbeat_ms": now_ms
    });
    std::fs::write(
        paths.app_home().join("gateway-discovery.json"),
        discovery.to_string(),
    )
    .unwrap();
}

#[tokio::test]
async fn uninstalled_mutation_is_a_typed_refusal() {
    let (_ws, _product, state) = lifecycle_state();
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "not_installed");
    assert!(body["tiers"].is_object(), "refusal still carries tiers");
}

#[tokio::test]
async fn status_serves_the_uninstalled_bootstrap_state() {
    let (_ws, _product, state) = lifecycle_state();
    let (status, body) = get_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/status",
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["installed"], false);
    assert_eq!(body["data"]["readiness"]["state"], "uninstalled");
}

#[tokio::test]
async fn doctor_run_admits_and_completes() {
    let (_ws, _product, state) = lifecycle_state();
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "doctor" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["attached"], false);
    let job_id = body["data"]["job"]["id"].as_str().unwrap().to_string();

    // Poll the real registry through the production job route until terminal.
    let mut terminal = Value::Null;
    for _ in 0..40 {
        let (_s, polled) = get_with_token(
            build_router(state.clone()),
            &format!("/a2a/lifecycle/jobs/{job_id}"),
            Some(&state.bearer),
        )
        .await;
        if polled["data"]["job"]["state"] != "running" {
            terminal = polled;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    assert_eq!(terminal["data"]["job"]["state"], "succeeded");
    assert_eq!(
        terminal["data"]["job"]["outcome"]["readiness"]["state"],
        "uninstalled"
    );
}

#[tokio::test]
async fn active_receipt_mutation_passes_the_combined_gate() {
    let (_ws, product, state) = lifecycle_state();
    // A real receipt + ownership + OUR OWNED live gateway: both gates hold.
    install_owned_gateway(product.path(), None);
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    // The mutation is ADMITTED (a job is created), not refused — proving the
    // combined owned+ownership gate passed.
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"]["job"]["id"].is_string());
}

#[tokio::test]
async fn foreign_gateway_mutation_is_refused_by_the_attach_gate() {
    let (_ws, product, state) = lifecycle_state();
    // Same receipt + ownership, but a FOREIGN discovery owner: the attach gate
    // must refuse even though the authority gate could pass.
    install_owned_gateway(product.path(), Some("someone-else"));
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "foreign_resident");
}

#[tokio::test]
async fn component_single_flight_refuses_concurrent_cross_operation() {
    let (_ws, product, state) = lifecycle_state();
    install_owned_gateway(product.path(), None);
    // Occupy the component's single-flight slot with a running mutation.
    let _held = state.a2a_lifecycle.testonly_occupy("stop");

    // A DIFFERENT concurrent mutation is refused — the component is busy.
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "update" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "at_capacity");

    // An IDENTICAL concurrent mutation de-duplicates onto the running job.
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["attached"], true);
}
