//! A2A lifecycle job-plane acceptance (a2a-product-provisioning W01.P03.S26).
//!
//! Proves the served lifecycle plane against PRODUCTION routes and a REAL
//! registry + real `vaultspec-product` controller rooted at an isolated product
//! home: typed pre-admission refusal, honest absent/busy/recovery projections,
//! an admitted read-only job that runs to completion, retired-receipt
//! non-authority, atomic component single-flight, and the hard at-capacity
//! ceiling. No mocks — the AppState, router, registry, and controller are all
//! real; only the product home is a per-test tempdir.

use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

use vaultspec_product::locking::{Actor, InstallLock};
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
    ProductPaths::under_app_home(product.path())
        .ensure()
        .unwrap();
    let state = app::build_state_with_product_home(
        ws.path().to_path_buf(),
        app::mint_bearer(),
        product.path().to_path_buf(),
    );
    (ws, product, state)
}

/// Write the retired JSON receipt plus a fresh discovery record. This fixture is
/// intentionally non-authorizing: only the fixed active-receipt journal may
/// satisfy lifecycle admission.
fn write_legacy_receipt_and_discovery(
    product_home: &std::path::Path,
    owner_override: Option<&str>,
) {
    let paths = ProductPaths::under_app_home(product_home);
    paths.ensure().unwrap();
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
    let discovery = json!({
        "endpoint": "127.0.0.1:8791",
        "pid": std::process::id(),
        "owner": owner,
        "install_identity": "install-1",
        "generation": "g0",
        "release_set": { "name": "vaultspec-a2a", "version": "0.1.0", "target": "x86_64-pc-windows-msvc" },
        "protocol": { "minimum": "v1", "maximum": "v1" },
        "state_schema": { "minimum": "0001", "maximum": "0009" },
        "handoff_reference": paths.credentials_dir().join("attach.cred").to_string_lossy(),
        "heartbeat_ms": now_ms
    });
    std::fs::write(
        paths.app_home().join("gateway-discovery.json"),
        discovery.to_string(),
    )
    .unwrap();
}

/// Write only the retired JSON receipt, a generation, and mutable data. It must
/// remain inert even though it resembles the pre-journal installed state.
fn write_legacy_stopped_state(product_home: &std::path::Path) -> ProductPaths {
    let paths = ProductPaths::under_app_home(product_home);
    paths.ensure().unwrap();
    let generation = paths.generation_dir("g0").unwrap();
    std::fs::create_dir_all(&generation).unwrap();
    std::fs::write(generation.join("immutable.bin"), b"immutable").unwrap();
    std::fs::write(paths.data_dir().join("user.db"), b"precious").unwrap();
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
    paths
}

#[tokio::test]
async fn retired_json_receipt_cannot_authorize_remove_or_reserve_a_job() {
    let (_ws, product, state) = lifecycle_state();
    let paths = write_legacy_stopped_state(product.path());
    assert!(paths.receipt_path().exists());

    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "remove" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "legacy state must be refused before lifecycle admission: {body}"
    );
    assert_eq!(body["error_kind"], "not_installed");
    assert!(paths.receipt_path().exists(), "legacy receipt is untouched");
    assert!(
        paths.generation_dir("g0").unwrap().exists(),
        "preflight refusal must precede generation deletion"
    );
    assert_eq!(
        std::fs::read(paths.data_dir().join("user.db")).unwrap(),
        b"precious"
    );
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
    assert_eq!(body["data"]["installed_known"], true);
    assert_eq!(body["data"]["install_state"], "absent");
    assert_eq!(body["data"]["degraded"], false);
    assert_eq!(body["data"]["readiness"]["state"], "uninstalled");
}

#[tokio::test]
async fn status_reports_busy_authority_as_unknown_and_degraded() {
    let (_ws, product, state) = lifecycle_state();
    let paths = ProductPaths::under_app_home(product.path());
    paths.ensure().unwrap();
    let _guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "busy-status-test")
        .unwrap()
        .unwrap();

    let (status, body) = get_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/status",
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["installed"].is_null());
    assert_eq!(body["data"]["installed_known"], false);
    assert_eq!(body["data"]["install_state"], "busy");
    assert_eq!(body["data"]["degraded"], true);
    assert!(body["data"]["readiness"].is_null());
}

#[tokio::test]
async fn status_reports_an_untrusted_malformed_journal_as_unverifiable() {
    let (_ws, product, state) = lifecycle_state();
    let paths = ProductPaths::under_app_home(product.path());
    paths.ensure().unwrap();
    std::fs::write(paths.active_receipts_journal_path(), b"invalid-journal").unwrap();

    let (status, body) = get_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/status",
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["installed"].is_null());
    assert_eq!(body["data"]["installed_known"], false);
    assert_eq!(body["data"]["install_state"], "unverifiable");
    assert_eq!(body["data"]["recovery_required"], false);
    assert_eq!(body["data"]["degraded"], true);
    assert!(body["data"]["readiness"].is_null());
}

#[tokio::test]
async fn an_untrusted_malformed_journal_refuses_mutation_before_admission() {
    let (_ws, product, state) = lifecycle_state();
    let paths = ProductPaths::under_app_home(product.path());
    paths.ensure().unwrap();
    std::fs::write(paths.active_receipts_journal_path(), b"invalid-journal").unwrap();

    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "remove" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "unverifiable");
    assert!(
        body["error"]
            .as_str()
            .unwrap_or_default()
            .contains("unverifiable"),
        "untrusted bytes remain explicitly unverifiable: {body}"
    );
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
async fn retired_json_receipt_and_discovery_cannot_bypass_fixed_receipt_preflight() {
    let (_ws, product, state) = lifecycle_state();
    write_legacy_receipt_and_discovery(product.path(), None);
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "body: {body}");
    assert_eq!(body["error_kind"], "not_installed");
}

#[tokio::test]
async fn foreign_discovery_cannot_override_absent_fixed_receipt_authority() {
    let (_ws, product, state) = lifecycle_state();
    write_legacy_receipt_and_discovery(product.path(), Some("someone-else"));
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "stop" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "not_installed");
}

#[tokio::test]
async fn component_single_flight_refuses_concurrent_cross_operation() {
    let (_ws, _product, state) = lifecycle_state();
    // Occupy the component's single-flight slot directly; doctor is read-only,
    // so route admission can be exercised without fabricating install authority.
    let _held = state.a2a_lifecycle.testonly_occupy("stop");

    // A different concurrent operation is refused by the real registry.
    let (status, body) = post_json_with_token(
        build_router(state.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "doctor" }),
        Some(&state.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error_kind"], "at_capacity");

    // An identical concurrent operation de-duplicates onto the running job.
    let (_ws2, _product2, state2) = lifecycle_state();
    let _held2 = state2.a2a_lifecycle.testonly_occupy("doctor");
    let (status, body) = post_json_with_token(
        build_router(state2.clone()),
        "/a2a/lifecycle/run",
        json!({ "op": "doctor" }),
        Some(&state2.bearer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["attached"], true);
}
