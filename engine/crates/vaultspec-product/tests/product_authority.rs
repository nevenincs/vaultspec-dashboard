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

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use vaultspec_product::credentials::{CredentialError, CredentialRole, CredentialStore};
use vaultspec_product::locking::{
    Actor, InstallLock, LockAuthorityError, LockBusy, LockError, LockIdentityStrength,
    ProcessInstanceLiveness, process_instance_liveness,
};
use vaultspec_product::manifest::{
    CapsuleManifest, ComponentLock, ManifestError, ReleaseSetManifest, Target,
};
use vaultspec_product::paths::ProductPaths;
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
        "contract_version": "2.0",
        "identity": {
            "name": lock.a2a_source.release_identity.name,
            "version": a2a_version
        },
        "target": TRIPLE,
        "compatibility": {
            "api_versions": { "minimum": "v1", "maximum": "v1" },
            "migration_range": { "base": "0001", "head": "0008" }
        },
        "consistency_group": {
            "stores": [
                {
                    "kind": "primary-database",
                    "derivable": false,
                    "schema_authority": "alembic-migration-range",
                    "schema_version": "0008"
                },
                {
                    "kind": "checkpoint-database",
                    "derivable": false,
                    "schema_authority": "checkpointer-schema",
                    "schema_version": "1.0.0"
                }
            ]
        },
        "entrypoints": {
            "gateway": {
                "kind": "gateway",
                "console_script": "vaultspec-a2a",
                "reference": "vaultspec_a2a.cli:main",
                "relative_command": ["bin", "vaultspec-a2a"]
            },
            "standalone_mcp": {
                "kind": "standalone-mcp",
                "console_script": "vaultspec-a2a-mcp",
                "reference": "vaultspec_a2a.mcp:main",
                "relative_command": ["bin", "vaultspec-a2a-mcp"]
            }
        },
        "digest_algorithm": "sha256",
        "assets": [
            { "kind": "python-runtime", "version": "3.13", "license": lock.base_closure.python.license, "digest": python },
            { "kind": "a2a-distribution", "version": a2a_version, "license": "MIT", "digest": "c".repeat(64) },
            { "kind": "node-runtime", "version": "22", "license": lock.base_closure.node.license, "digest": node },
            { "kind": "acp-adapter", "version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": acp }
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
        "schema_version": "2.0",
        "target": TRIPLE,
        "digest_algorithm": "sha256",
        "cohort": {
            "id": "release-2026.07.19",
            "targets": [
                "aarch64-apple-darwin",
                "x86_64-apple-darwin",
                "aarch64-unknown-linux-gnu",
                "x86_64-unknown-linux-gnu",
                TRIPLE
            ]
        },
        "release_manifest": {
            "path": "release.json",
            "binding_mode": "external-cohort-and-receipt"
        },
        "dashboard": {
            "version": "0.1.4",
            "commit": "a".repeat(40),
            "path": "bin/dashboard.exe",
            "size": 16,
            "digest": "b".repeat(64)
        },
        "updater": {
            "version": "0.1.4",
            "path": "bin/updater.exe",
            "size": 16,
            "digest": "c".repeat(64)
        },
        "a2a_component": {
            "commit": lock.a2a_source.commit,
            "release_identity": {
                "name": lock.a2a_source.release_identity.name,
                "version": lock.a2a_source.release_identity.version
            },
            "component_lock": {
                "path": "packaging/a2a-component.lock.json",
                "digest": "d".repeat(64)
            },
            "capsule_manifest": {
                "path": "a2a/component-manifest.json",
                "digest": "e".repeat(64)
            },
            "capsule_archive": {
                "path": "a2a/capsule.zip",
                "size": 20,
                "digest": "f".repeat(64)
            },
            "tree_evidence": {
                "path": "a2a/tree.json",
                "size": 24,
                "digest": "1".repeat(64),
                "tree_digest": "2".repeat(64),
                "file_count": 3
            }
        },
        "runtimes": {
            "cpython": {
                "version": lock.base_closure.python.version,
                "license": lock.base_closure.python.license,
                "digest": python
            },
            "node": {
                "version": lock.base_closure.node.version,
                "license": lock.base_closure.node.license,
                "digest": node
            },
            "acp": {
                "version": lock.base_closure.acp.version,
                "license": lock.base_closure.acp.license,
                "digest": acp
            }
        },
        "protocol": { "gateway_api_version_range": { "minimum": "v1", "maximum": "v1" } },
        "state_schema": { "migration_range": { "minimum": "0001", "maximum": "0008" } },
        "licenses": [{
            "component": "vaultspec-a2a",
            "spdx": "MIT",
            "path": "licenses/a2a.txt",
            "digest": "8".repeat(64)
        }],
        "sbom": {
            "format": "cyclonedx",
            "path": "sbom.cdx.json",
            "size": 32,
            "digest": "9".repeat(64)
        },
        "file_digests": {
            "bin/dashboard.exe": "b".repeat(64)
        }
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

fn fixed_claim_path(lock_path: &Path) -> PathBuf {
    let mut name = lock_path.file_name().unwrap().to_os_string();
    name.push(".owner");
    lock_path.with_file_name(name)
}

#[cfg(unix)]
fn replace_lock_entry(lock_path: &Path, displaced: &Path) {
    std::fs::rename(lock_path, displaced).unwrap();
    std::fs::write(lock_path, b"replacement lock entry").unwrap();
}

#[test]
fn install_lock_guard_is_bound_to_its_canonical_product_identity() {
    let dir = tempfile::tempdir().unwrap();
    let first_paths = ProductPaths::under_app_home(&dir.path().join("first"));
    let other_paths = ProductPaths::under_app_home(&dir.path().join("other"));
    first_paths.ensure().unwrap();
    other_paths.ensure().unwrap();

    // Leave a real lock file at the unrelated canonical product path, then
    // prove that holding another product tree's genuine lock is insufficient.
    let other_lock = InstallLock::new(other_paths.install_lock_path());
    drop(
        other_lock
            .acquire(Actor::Installer, "other-owner")
            .unwrap()
            .unwrap(),
    );

    let first_lock = InstallLock::new(first_paths.install_lock_path());
    let guard = first_lock
        .acquire(Actor::Installer, "first-owner")
        .unwrap()
        .unwrap();
    guard.verify_for_product(&first_paths).unwrap();
    assert!(matches!(
        guard.verify_for_product(&other_paths),
        Err(LockAuthorityError::AuthorityMismatch)
    ));
    #[cfg(windows)]
    assert_eq!(
        guard.identity_strength(),
        LockIdentityStrength::WindowsHighRes128
    );
    #[cfg(unix)]
    assert_eq!(guard.identity_strength(), LockIdentityStrength::UnixInode);
}

#[test]
fn install_lock_guard_rejects_a_replaced_lock_entry() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let displaced_path = paths.transaction_dir().join("displaced-install.lock");

    let lock = InstallLock::new(&lock_path);
    let guard = lock
        .acquire(Actor::CopiedUpdater, "update-owner")
        .unwrap()
        .unwrap();
    guard.verify_for_product(&paths).unwrap();

    #[cfg(unix)]
    {
        // Keep the original locked handle alive while the canonical directory
        // entry is replaced by a different real file. A path-only guard would
        // authorize the wrong lock; filesystem identity must reject it.
        replace_lock_entry(&lock_path, &displaced_path);
        assert!(matches!(
            guard.verify_for_product(&paths),
            Err(LockAuthorityError::AuthorityMismatch)
        ));
    }
    #[cfg(windows)]
    {
        // The Windows authority handle denies delete sharing, closing the
        // replacement window entirely while the guard is alive.
        assert!(std::fs::rename(&lock_path, &displaced_path).is_err());
        guard.verify_for_product(&paths).unwrap();
    }
}

#[test]
fn fixed_claim_serializes_even_after_lock_path_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let lock = InstallLock::new(&lock_path);
    let guard = lock
        .acquire(Actor::Installer, "first-owner")
        .unwrap()
        .unwrap();

    #[cfg(unix)]
    replace_lock_entry(
        &lock_path,
        &paths.transaction_dir().join("held-install.lock"),
    );
    #[cfg(windows)]
    assert!(
        std::fs::rename(
            &lock_path,
            paths.transaction_dir().join("held-install.lock")
        )
        .is_err()
    );
    match lock.acquire(Actor::CopiedUpdater, "second-owner").unwrap() {
        Err(LockBusy { owner, pid }) => {
            assert_eq!(owner.as_deref(), Some("first-owner"));
            assert_eq!(pid, Some(std::process::id()));
        }
        Ok(_) => panic!("fixed claim must serialize a replacement lock entry"),
    }
    drop(guard);
}

#[cfg(unix)]
#[test]
fn old_guard_does_not_remove_a_replacement_claim() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let claim_path = fixed_claim_path(&lock_path);
    let lock = InstallLock::new(&lock_path);
    let old_guard = lock
        .acquire(Actor::Installer, "old-owner")
        .unwrap()
        .unwrap();

    replace_lock_entry(
        &lock_path,
        &paths.transaction_dir().join("old-install.lock"),
    );
    std::fs::rename(
        &claim_path,
        paths.transaction_dir().join("old-install.lock.owner"),
    )
    .unwrap();
    let replacement_guard = lock
        .acquire(Actor::CopiedUpdater, "replacement-owner")
        .unwrap()
        .unwrap();
    let replacement_bytes = std::fs::read(&claim_path).unwrap();
    assert!(
        old_guard.release().is_err(),
        "explicit release reports that its fixed claim was replaced"
    );
    assert_eq!(std::fs::read(&claim_path).unwrap(), replacement_bytes);
    replacement_guard.verify_for_product(&paths).unwrap();
}

#[cfg(unix)]
#[test]
fn retained_transaction_directory_cleanup_cannot_be_redirected_by_parent_replacement() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let transaction = paths.transaction_dir();
    let displaced = paths.root().join("retained-transaction");
    let lock_path = paths.install_lock_path();
    let claim_path = fixed_claim_path(&lock_path);
    let guard = InstallLock::new(&lock_path)
        .acquire(Actor::Installer, "retained-parent-owner")
        .unwrap()
        .unwrap();

    std::fs::rename(&transaction, &displaced).unwrap();
    std::fs::create_dir(&transaction).unwrap();
    std::fs::set_permissions(&transaction, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::write(&lock_path, b"replacement lock sentinel").unwrap();
    std::fs::write(&claim_path, b"replacement claim sentinel").unwrap();

    assert!(guard.verify_for_product(&paths).is_err());
    guard.release().unwrap();

    assert!(
        !fixed_claim_path(&displaced.join("install.lock")).exists(),
        "descriptor-relative release retracts the claim in the retained directory"
    );
    assert_eq!(
        std::fs::read(&lock_path).unwrap(),
        b"replacement lock sentinel"
    );
    assert_eq!(
        std::fs::read(&claim_path).unwrap(),
        b"replacement claim sentinel"
    );
}

#[cfg(windows)]
#[test]
fn retained_windows_claim_cannot_be_replaced_and_is_removed_by_its_guard() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let claim_path = fixed_claim_path(&paths.install_lock_path());
    let displaced = paths.transaction_dir().join("displaced-install.lock.owner");
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "retained-owner")
        .unwrap()
        .unwrap();

    assert!(
        std::fs::OpenOptions::new()
            .write(true)
            .open(&claim_path)
            .is_err(),
        "the final claim handle must deny in-place content mutation"
    );
    assert!(
        vaultspec_windows_authority::AuthorityFile::open_claim_shared_delete(&claim_path).is_err(),
        "the final claim handle must deny a competing delete-capable transition handle"
    );
    assert!(std::fs::rename(&claim_path, &displaced).is_err());
    guard.verify_for_product(&paths).unwrap();
    drop(guard);
    assert!(!claim_path.exists());
    assert!(!displaced.exists());
}

#[test]
fn hard_linked_fixed_claim_retains_the_same_authority() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let claim_path = fixed_claim_path(&paths.install_lock_path());
    let alias = paths.transaction_dir().join("claim-hardlink");
    let displaced = paths.transaction_dir().join("claim-displaced");
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "hardlink-owner")
        .unwrap()
        .unwrap();

    std::fs::hard_link(&claim_path, &alias).unwrap();
    #[cfg(unix)]
    {
        std::fs::rename(&claim_path, &displaced).unwrap();
        std::fs::hard_link(&alias, &claim_path).unwrap();
        guard.verify_for_product(&paths).unwrap();
        std::fs::remove_file(alias).unwrap();
        std::fs::remove_file(displaced).unwrap();
    }
    #[cfg(windows)]
    {
        assert!(std::fs::rename(&claim_path, &displaced).is_err());
        guard.verify_for_product(&paths).unwrap();
        drop(guard);
        std::fs::remove_file(alias).unwrap();
        assert!(!displaced.exists());
    }
}

#[test]
fn final_lock_and_claim_aliases_fail_closed_without_touching_targets() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let claim_path = fixed_claim_path(&lock_path);
    let lock_target = dir.path().join("lock-target");
    let claim_target = dir.path().join("claim-target");
    std::fs::write(&lock_target, b"lock sentinel").unwrap();
    std::fs::write(&claim_target, b"claim sentinel").unwrap();

    create_file_symlink(&lock_target, &lock_path);
    assert!(matches!(
        InstallLock::new(&lock_path).acquire(Actor::Installer, "alias-owner"),
        Err(LockError::Io(_))
    ));
    assert_eq!(std::fs::read(&lock_target).unwrap(), b"lock sentinel");
    std::fs::remove_file(&lock_path).unwrap();

    create_file_symlink(&claim_target, &claim_path);
    assert!(matches!(
        InstallLock::new(&lock_path)
            .acquire(Actor::Installer, "alias-owner")
            .unwrap(),
        Err(LockBusy {
            owner: None,
            pid: None
        })
    ));
    assert_eq!(std::fs::read(&claim_target).unwrap(), b"claim sentinel");
}

#[cfg(unix)]
#[test]
fn transaction_directory_is_hardened_to_current_owner_0700_before_authority_use() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    std::fs::set_permissions(
        paths.transaction_dir(),
        std::fs::Permissions::from_mode(0o777),
    )
    .unwrap();

    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "mode-owner")
        .unwrap()
        .unwrap();
    let mode = std::fs::metadata(paths.transaction_dir())
        .unwrap()
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o700);
    guard.verify_for_product(&paths).unwrap();
    guard.release().unwrap();
}

#[test]
fn aliased_product_root_is_refused_before_lock_or_claim_creation() {
    let dir = tempfile::tempdir().unwrap();
    let real_root = dir.path().join("real-product-root");
    std::fs::create_dir_all(real_root.join("transaction")).unwrap();
    let alias_root = dir.path().join("aliased-product-root");
    create_directory_symlink(&real_root, &alias_root);
    let lock_path = alias_root.join("transaction/install.lock");

    assert!(matches!(
        InstallLock::new(&lock_path).acquire(Actor::Installer, "alias-owner"),
        Err(LockError::Io(_))
    ));
    assert!(!real_root.join("transaction/install.lock").exists());
    assert!(!fixed_claim_path(&real_root.join("transaction/install.lock")).exists());
}

#[cfg(unix)]
fn create_file_symlink(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn create_file_symlink(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_file(target, link).unwrap();
}

#[cfg(unix)]
fn create_directory_symlink(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn create_directory_symlink(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_dir(target, link).unwrap();
}

const ENV_LOCK: &str = "PRODUCT_LOCK_CHILD_LOCK";
const ENV_READY: &str = "PRODUCT_LOCK_CHILD_READY";
const ENV_RELEASE: &str = "PRODUCT_LOCK_CHILD_RELEASE";
const ENV_OWNER: &str = "PRODUCT_LOCK_CHILD_OWNER";
const ENV_CRASH_HOLD: &str = "PRODUCT_LOCK_CHILD_CRASH_HOLD";

/// The child half of the cross-process lock proof. In a normal test run it
/// exercises a real acquire/explicit-release assertion. When the parent
/// re-invokes this test binary with the environment set, it acquires the real
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
        let dir = tempfile::tempdir().unwrap();
        let lock_path = dir.path().join("ordinary-helper.lock");
        let claim_path = fixed_claim_path(&lock_path);
        let guard = InstallLock::new(&lock_path)
            .acquire(Actor::CopiedUpdater, "ordinary-helper-owner")
            .unwrap()
            .unwrap();
        assert!(
            claim_path.is_file(),
            "ordinary helper publishes a real claim"
        );
        guard.release().unwrap();
        assert!(
            !claim_path.exists(),
            "ordinary helper explicitly retracts its claim"
        );
        return;
    };
    let lock = InstallLock::new(&lock_path);
    let owner = std::env::var(ENV_OWNER).unwrap_or_else(|_| "child-owner".to_string());
    let guard = lock
        .acquire(Actor::CopiedUpdater, &owner)
        .expect("child acquire is not an io/authority error")
        .expect("child acquires the free lock");
    std::fs::write(&ready, "ready").expect("signal readiness");
    if std::env::var_os(ENV_CRASH_HOLD).is_some() {
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    let deadline = Instant::now() + Duration::from_secs(30);
    while !Path::new(&release).exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        Path::new(&release).exists(),
        "parent never released child holder"
    );
    guard.release().expect("child explicitly releases lock");
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
        Err(LockError::InvalidOwner) => panic!("parent owner is valid"),
        Err(LockError::Io(e)) => panic!("unexpected io error: {e}"),
    }

    // Release the child, reap it, and confirm the freed lock is now acquirable —
    // proving the exclusion was the live cross-process hold, not a dead file.
    std::fs::write(&release, "go").unwrap();
    let status = child.wait().expect("reap child");
    assert!(status.success(), "child holder exited cleanly");
    lock.acquire(Actor::Installer, "parent-owner")
        .unwrap()
        .expect("lock is free once the other process releases it")
        .release()
        .unwrap();
}

fn spawn_crashing_lock_holder(
    lock_path: &Path,
    owner: &str,
    ready: &Path,
    release: &Path,
) -> std::process::Child {
    std::process::Command::new(std::env::current_exe().unwrap())
        .args(["cross_process_lock_child_holder", "--exact", "--nocapture"])
        .env(ENV_LOCK, lock_path)
        .env(ENV_READY, ready)
        .env(ENV_RELEASE, release)
        .env(ENV_OWNER, owner)
        .env(ENV_CRASH_HOLD, "1")
        .spawn()
        .unwrap()
}

fn wait_for_ready(child: &mut std::process::Child, ready: &Path) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while !ready.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
        if let Some(status) = child.try_wait().unwrap() {
            panic!("claim holder exited before readiness: {status}");
        }
    }
    assert!(ready.exists(), "claim holder never became ready");
}

#[test]
fn dead_same_owner_claim_recovers_but_dead_foreign_claim_stays_busy() {
    let dir = tempfile::tempdir().unwrap();
    let same_paths = ProductPaths::under_app_home(&dir.path().join("same"));
    same_paths.ensure().unwrap();
    let same_lock_path = same_paths.install_lock_path();
    let same_ready = dir.path().join("same-ready");
    let same_release = dir.path().join("same-release");
    let mut same_child =
        spawn_crashing_lock_holder(&same_lock_path, "recover-owner", &same_ready, &same_release);
    wait_for_ready(&mut same_child, &same_ready);
    same_child.kill().unwrap();
    same_child.wait().unwrap();
    InstallLock::new(&same_lock_path)
        .acquire(Actor::Installer, "recover-owner")
        .unwrap()
        .expect("same owner recovers a real crashed claimant");

    let foreign_paths = ProductPaths::under_app_home(&dir.path().join("foreign"));
    foreign_paths.ensure().unwrap();
    let foreign_lock_path = foreign_paths.install_lock_path();
    let foreign_ready = dir.path().join("foreign-ready");
    let foreign_release = dir.path().join("foreign-release");
    let mut foreign_child = spawn_crashing_lock_holder(
        &foreign_lock_path,
        "foreign-owner",
        &foreign_ready,
        &foreign_release,
    );
    wait_for_ready(&mut foreign_child, &foreign_ready);
    foreign_child.kill().unwrap();
    foreign_child.wait().unwrap();
    match InstallLock::new(&foreign_lock_path)
        .acquire(Actor::Installer, "local-owner")
        .unwrap()
    {
        Err(LockBusy { owner, pid }) => {
            assert_eq!(owner.as_deref(), Some("foreign-owner"));
            assert!(pid.is_some());
        }
        Ok(_) => panic!("a dead foreign claim remains fail-closed"),
    }
}

#[test]
fn different_start_time_proves_the_recorded_process_instance_is_dead() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let ready = dir.path().join("reuse-ready");
    let release = dir.path().join("reuse-release");
    let mut child = spawn_crashing_lock_holder(&lock_path, "reuse-owner", &ready, &release);
    wait_for_ready(&mut child, &ready);
    child.kill().unwrap();
    child.wait().unwrap();

    let claim_path = fixed_claim_path(&lock_path);
    let mut claim: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&claim_path).unwrap()).unwrap();
    let mut system = sysinfo::System::new();
    let current = sysinfo::Pid::from_u32(std::process::id());
    system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[current]), true);
    let current_start = system.process(current).unwrap().start_time();
    claim["pid"] = serde_json::json!(std::process::id());
    claim["process_start_time"] = serde_json::json!(current_start.saturating_add(1));
    std::fs::write(&claim_path, serde_json::to_vec(&claim).unwrap()).unwrap();

    InstallLock::new(&lock_path)
        .acquire(Actor::Installer, "reuse-owner")
        .unwrap()
        .expect("same pid with another start time is not the recorded live instance");
}

#[test]
fn process_instance_observation_is_tri_state_and_seconds_conservative() {
    let mut system = sysinfo::System::new();
    let current = sysinfo::Pid::from_u32(std::process::id());
    system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[current]), true);
    let current_start = system.process(current).unwrap().start_time();

    assert_eq!(
        process_instance_liveness(std::process::id(), current_start),
        ProcessInstanceLiveness::LiveSameInstance,
        "the same seconds-resolution start remains conservatively live"
    );
    assert_eq!(
        process_instance_liveness(std::process::id(), current_start.saturating_add(1)),
        ProcessInstanceLiveness::DeadOrDifferentInstance
    );
    assert_eq!(
        process_instance_liveness(0, 0),
        ProcessInstanceLiveness::Unverifiable
    );
}

#[cfg(windows)]
#[test]
fn windows_safe_process_probe_reports_real_current_process_and_invalid_input() {
    assert_eq!(
        vaultspec_windows_authority::probe_process_existence(std::process::id()),
        vaultspec_windows_authority::ProcessExistence::Exists
    );
    assert_eq!(
        vaultspec_windows_authority::probe_process_existence(0),
        vaultspec_windows_authority::ProcessExistence::Unverifiable
    );
}

#[cfg(windows)]
#[test]
fn windows_identity_is_high_resolution_and_nonregular_authority_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let lock_path = paths.install_lock_path();
    let guard = InstallLock::new(&lock_path)
        .acquire(Actor::Installer, "high-res-owner")
        .unwrap()
        .unwrap();
    assert_eq!(
        guard.identity_strength(),
        LockIdentityStrength::WindowsHighRes128
    );
    let identity =
        vaultspec_windows_authority::AuthorityFile::identity_at_path(&lock_path).unwrap();
    assert_ne!(identity.file_id, 0);
    drop(guard);

    std::fs::remove_file(&lock_path).unwrap();
    std::fs::create_dir(&lock_path).unwrap();
    assert!(matches!(
        InstallLock::new(&lock_path).acquire(Actor::Installer, "unsupported-owner"),
        Err(LockError::Io(_))
    ));
    assert!(!fixed_claim_path(&lock_path).exists());
}
