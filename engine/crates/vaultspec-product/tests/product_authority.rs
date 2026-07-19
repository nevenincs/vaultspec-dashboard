//! Product-authority acceptance (a2a-product-provisioning W01.P01.S11).
//!
//! These tests exercise the production `vaultspec-product` API against real
//! files, real credential material, a real receipt on disk, and — for the lock
//! exclusion proof — a real second operating-system process. No fakes, mocks,
//! stubs, or skipped cases: the ADR's certification posture forbids them, and
//! the boundary this crate owns (manifest rejection, atomic activation,
//! credential separation, cross-process locking) is only meaningful when proven
//! against reality.
//!
//! Fixtures are derived from the committed component lock, not copied from a
//! run's output: the lock is parsed with the production parser and its pinned
//! digests seed the capsule and release-set instances, so a drift between this
//! test and the real pins fails the build rather than passing silently.

use std::path::Path;
use std::time::{Duration, Instant};

use vaultspec_product::credentials::{CredentialError, CredentialRole, CredentialStore};
use vaultspec_product::locking::{Actor, InstallLock, LockBusy, LockError};
use vaultspec_product::manifest::{
    CapsuleManifest, ComponentLock, ManifestError, ReleaseSetManifest, Target,
};
use vaultspec_product::receipt::{
    Channel, InterruptionMarker, RECEIPT_SCHEMA_VERSION, Receipt, ReceiptState,
};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");
const TARGET: Target = Target::X86_64PcWindowsMsvc;
const TRIPLE: &str = "x86_64-pc-windows-msvc";

/// Build a capsule-manifest JSON string whose pins agree with the committed
/// component lock for the Windows target. `mutate` gets the mutable value tree
/// before serialization so a test can introduce exactly one defect.
fn capsule_json(lock: &ComponentLock, mut mutate: impl FnMut(&mut serde_json::Value)) -> String {
    let python = lock.python_digest(TARGET).unwrap();
    let node = lock.node_digest(TARGET).unwrap();
    let acp = &lock.base_closure.acp.sha256;
    let a2a_version = &lock.a2a_source.release_identity.version;
    let mut v = serde_json::json!({
        "contract_version": "1.0",
        "identity": { "name": "vaultspec-a2a", "version": a2a_version },
        "target": TRIPLE,
        "compatibility": {
            "api_versions": { "minimum": "v1", "maximum": "v1" },
            "migration_range": { "base": "0001", "head": "0009" }
        },
        "digest_algorithm": "sha256",
        "assets": [
            { "kind": "python-runtime", "version": "3.13", "license": "PSF-2.0", "digest": python },
            { "kind": "a2a-distribution", "version": a2a_version, "license": "MIT", "digest": "c".repeat(64) },
            { "kind": "node-runtime", "version": "22", "license": "MIT", "digest": node },
            { "kind": "acp-adapter", "version": "0.59.0", "license": "Apache-2.0", "digest": acp }
        ],
        "dependency_lock": {
            "uv_lock_digest": "d".repeat(64),
            "package_lock_digest": "e".repeat(64)
        }
    });
    mutate(&mut v);
    serde_json::to_string(&v).unwrap()
}

/// Build a release-set-manifest JSON string whose pins agree with the committed
/// component lock for the Windows target, with a single-defect hook.
fn release_json(lock: &ComponentLock, mut mutate: impl FnMut(&mut serde_json::Value)) -> String {
    let python = lock.python_digest(TARGET).unwrap();
    let node = lock.node_digest(TARGET).unwrap();
    let acp = &lock.base_closure.acp.sha256;
    let mut v = serde_json::json!({
        "schema_version": "1.0",
        "target": TRIPLE,
        "digest_algorithm": "sha256",
        "dashboard": { "version": "0.1.4", "commit": "a".repeat(40), "digest": "b".repeat(64) },
        "a2a_component": {
            "commit": lock.a2a_source.commit,
            "release_identity": {
                "name": lock.a2a_source.release_identity.name,
                "version": lock.a2a_source.release_identity.version
            },
            "component_lock": "packaging/a2a-component.lock.json",
            "capsule_manifest": "schemas/desktop-capsule-manifest.json",
            "capsule_digest": "f".repeat(64)
        },
        "runtimes": {
            "cpython": { "version": "3.13.5", "license": "PSF-2.0", "digest": python },
            "node": { "version": "22.17.0", "license": "MIT", "digest": node },
            "acp": { "version": "0.59.0", "license": "Apache-2.0", "digest": acp }
        },
        "protocol": { "gateway_api_version_range": { "minimum": "v1", "maximum": "v1" } },
        "state_schema": { "migration_range": { "minimum": "0001", "maximum": "0009" } },
        "licenses": [{ "component": "vaultspec-a2a", "spdx": "MIT" }],
        "sbom": { "format": "spdx", "path": "sbom.spdx.json", "digest": "9".repeat(64) }
    });
    mutate(&mut v);
    serde_json::to_string(&v).unwrap()
}

#[test]
fn valid_capsule_and_release_verify_against_the_real_lock() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    let capsule = CapsuleManifest::parse(&capsule_json(&lock, |_| {})).unwrap();
    capsule.verify_against_lock(&lock, TARGET).unwrap();
    let release = ReleaseSetManifest::parse(&release_json(&lock, |_| {})).unwrap();
    release.verify_against_lock(&lock).unwrap();
}

#[test]
fn manifest_rejects_unpinned_identity() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    // A floating runtime version in the release set is a hard parse rejection.
    let raw = release_json(&lock, |v| {
        v["runtimes"]["cpython"]["version"] = serde_json::json!("latest");
    });
    assert!(matches!(
        ReleaseSetManifest::parse(&raw),
        Err(ManifestError::FloatingSelector { .. })
    ));
    // An A2A commit that is not a full sha cannot pin identity.
    let raw = release_json(&lock, |v| {
        v["a2a_component"]["commit"] = serde_json::json!("main");
    });
    assert!(matches!(
        ReleaseSetManifest::parse(&raw),
        Err(ManifestError::UnpinnedCommit { .. })
    ));
}

#[test]
fn manifest_rejects_target_mismatch() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    let capsule = CapsuleManifest::parse(&capsule_json(&lock, |_| {})).unwrap();
    // The capsule is for the Windows target; verifying it as an Apple-Silicon
    // release must be refused.
    assert!(matches!(
        capsule.verify_against_lock(&lock, Target::Aarch64AppleDarwin),
        Err(ManifestError::TargetMismatch { .. })
    ));
}

#[test]
fn manifest_rejects_digest_drift() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    // A capsule whose ACP digest disagrees with the lock is drift, not a read.
    let raw = capsule_json(&lock, |v| {
        v["assets"][3]["digest"] = serde_json::json!("0".repeat(64));
    });
    let capsule = CapsuleManifest::parse(&raw).unwrap();
    assert!(matches!(
        capsule.verify_against_lock(&lock, TARGET),
        Err(ManifestError::DigestDrift { .. })
    ));
}

#[test]
fn manifest_rejects_floating_latest_selector() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    let raw = release_json(&lock, |v| {
        v["dashboard"]["version"] = serde_json::json!("latest");
    });
    assert!(matches!(
        ReleaseSetManifest::parse(&raw),
        Err(ManifestError::FloatingSelector { .. })
    ));
}

#[test]
fn atomic_receipt_activation_leaves_no_torn_or_staged_state() {
    let lock = ComponentLock::parse(LOCK_JSON).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("receipt.json");
    let mut receipt = Receipt::bootstrap(
        Channel::SelfInstall,
        TARGET,
        lock.a2a_source.release_identity.clone(),
        "2026-07-19-gen0",
        1_700_000_000_000,
    );
    // Mid-transaction the receipt carries a durable interruption marker and is
    // staged, never active.
    receipt.mark(InterruptionMarker::Migrating, &path).unwrap();
    let staged = Receipt::load(&path).unwrap();
    assert_eq!(staged.state, ReceiptState::Staged);
    assert_eq!(staged.interruption, Some(InterruptionMarker::Migrating));
    // Activation atomically commits: the on-disk receipt is active with no
    // interruption marker, and the persisted schema version is the current one.
    receipt.activate(&path).unwrap();
    let active = Receipt::load(&path).unwrap();
    assert_eq!(active.state, ReceiptState::Active);
    assert_eq!(active.interruption, None);
    assert!(active.bootstrap_created_ownership);
    assert_eq!(active.schema_version, RECEIPT_SCHEMA_VERSION);
}

#[test]
fn only_dashboard_bootstrap_creates_the_ownership_capability() {
    let dir = tempfile::tempdir().unwrap();
    let store = CredentialStore::new(dir.path().join("credentials"));
    let creds = store.bootstrap().unwrap();
    // The two dashboard-owned credentials exist and are distinct.
    assert_ne!(creds.ownership.secret(), creds.attach_control.secret());
    // Bootstrap retains: a second create refuses rather than minting a new
    // ownership capability that would strand the running gateway.
    assert!(matches!(
        store.bootstrap(),
        Err(CredentialError::AlreadyExists(CredentialRole::Ownership))
            | Err(CredentialError::AlreadyExists(
                CredentialRole::AttachControl
            ))
    ));
}

#[test]
fn gateway_reads_attach_control_and_creates_only_worker_ipc() {
    let dir = tempfile::tempdir().unwrap();
    let cred_dir = dir.path().join("credentials");
    let dashboard = CredentialStore::new(&cred_dir);
    let boot = dashboard.bootstrap().unwrap();

    // The gateway opens the same store and READS attach-control to authenticate
    // dashboard control and settlement callbacks.
    let gateway = CredentialStore::new(&cred_dir);
    let attach = gateway.read_attach_control().unwrap();
    assert!(boot.attach_control.verify(attach.secret()));
    assert_eq!(attach.role(), CredentialRole::AttachControl);

    // The gateway CREATES the separate worker-IPC credential; its secret is
    // distinct from both dashboard-owned credentials (credential separation).
    let worker = gateway.create_worker_ipc().unwrap();
    assert_eq!(worker.role(), CredentialRole::WorkerIpc);
    assert_ne!(worker.secret(), boot.ownership.secret());
    assert_ne!(worker.secret(), boot.attach_control.secret());

    // The non-secret discovery reference is a file path, never the secret value.
    let reference = gateway.attach_control_reference();
    let reference_text = reference.to_string_lossy();
    assert!(!reference_text.contains(boot.attach_control.secret()));
}

#[test]
fn credential_files_are_separate_and_owner_restricted() {
    let dir = tempfile::tempdir().unwrap();
    let cred_dir = dir.path().join("credentials");
    let store = CredentialStore::new(&cred_dir);
    store.bootstrap().unwrap();
    store.create_worker_ipc().unwrap();

    // Three distinct files back the three credential roles — no aliasing.
    let files = [
        cred_dir.join("ownership.cap"),
        cred_dir.join("attach-control.cred"),
        cred_dir.join("worker-ipc.cred"),
    ];
    for f in &files {
        assert!(f.exists(), "credential file {f:?} must exist");
    }

    // Permission restriction: on Unix each credential file is chmod 0600 (owner
    // read/write only), the file-ACL control for loopback-local secrets.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for f in &files {
            let mode = std::fs::metadata(f).unwrap().permissions().mode() & 0o777;
            assert_eq!(
                mode, 0o600,
                "{f:?} must be owner-restricted (0600), got {mode:o}"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Cross-process installation-lock exclusion
// ---------------------------------------------------------------------------

const ENV_LOCK: &str = "PRODUCT_LOCK_CHILD_LOCK";
const ENV_READY: &str = "PRODUCT_LOCK_CHILD_READY";
const ENV_RELEASE: &str = "PRODUCT_LOCK_CHILD_RELEASE";

/// The child half of the cross-process lock proof. In a normal test run (no
/// child env vars) it returns immediately and passes as a no-op. When the parent
/// re-invokes this test binary with the env vars set, it acquires the real
/// installation lock in a SEPARATE process, signals readiness, and holds the
/// lock until the parent releases it — a genuine cross-process lock, not two
/// in-process handles.
#[test]
fn cross_process_lock_child_holder() {
    let (Ok(lock_path), Ok(ready), Ok(release)) = (
        std::env::var(ENV_LOCK),
        std::env::var(ENV_READY),
        std::env::var(ENV_RELEASE),
    ) else {
        return;
    };
    let lock = InstallLock::new(&lock_path);
    let guard = lock
        .acquire(Actor::CopiedUpdater, "child-owner")
        .expect("child acquire is not an io/authority error")
        .expect("child acquires the free lock");
    std::fs::write(&ready, "ready").expect("signal readiness");
    let deadline = Instant::now() + Duration::from_secs(30);
    while !Path::new(&release).exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
    }
    drop(guard);
}

#[test]
fn install_lock_excludes_a_second_process() {
    let dir = tempfile::tempdir().unwrap();
    let lock_path = dir.path().join("install.lock");
    let ready = dir.path().join("ready");
    let release = dir.path().join("release");

    // Spawn a real second process: this same test binary, running only the
    // child holder test, with the coordination env vars set.
    let exe = std::env::current_exe().expect("test binary path");
    let mut child = std::process::Command::new(exe)
        .args(["cross_process_lock_child_holder", "--exact", "--nocapture"])
        .env(ENV_LOCK, &lock_path)
        .env(ENV_READY, &ready)
        .env(ENV_RELEASE, &release)
        .spawn()
        .expect("spawn child lock holder");

    // Wait for the child to acquire and signal readiness.
    let deadline = Instant::now() + Duration::from_secs(20);
    while !ready.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
        if let Ok(Some(status)) = child.try_wait() {
            panic!("child exited before signalling readiness: {status}");
        }
    }
    assert!(ready.exists(), "child never signalled readiness");

    // The parent, a distinct process, must observe the lock as busy and read the
    // child's advisory owner identity from the sidecar.
    let lock = InstallLock::new(&lock_path);
    match lock.acquire(Actor::Installer, "parent-owner") {
        Ok(Err(LockBusy { owner, pid })) => {
            assert_eq!(owner.as_deref(), Some("child-owner"));
            assert!(pid.is_some(), "the sidecar carries the holder pid");
        }
        Ok(Ok(_)) => panic!("parent must not acquire a cross-process-held lock"),
        Err(LockError::GatewayForbidden) => panic!("installer is not the gateway"),
        Err(LockError::Io(e)) => panic!("unexpected io error: {e}"),
    }

    // Release the child, reap it, and confirm the freed lock is now acquirable —
    // proving the exclusion was the live cross-process hold, not a dead file.
    std::fs::write(&release, "go").unwrap();
    let status = child.wait().expect("reap child");
    assert!(status.success(), "child holder exited cleanly");
    lock.acquire(Actor::Installer, "parent-owner")
        .unwrap()
        .expect("lock is free once the other process releases it");
}
