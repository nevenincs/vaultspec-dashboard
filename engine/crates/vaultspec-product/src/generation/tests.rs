use super::*;

#[cfg(unix)]
fn run_bounded_test_child(command: &mut std::process::Command) -> std::process::ExitStatus {
    use std::process::Stdio;
    use std::time::{Duration, Instant};

    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            let status = child.wait().unwrap();
            panic!("test child exceeded 10-second bound: {status}");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}
use crate::locking::{Actor, InstallLock};

fn restrict_test_directory(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        assert!(whoami.status.success());
        let user = String::from_utf8(whoami.stdout).unwrap();
        let user_grant = format!("{}:(OI)(CI)F", user.trim());
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &user_grant,
                "/grant",
                "*S-1-5-18:(OI)(CI)F",
                "/grant",
                "*S-1-5-32-544:(OI)(CI)F",
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls restriction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

fn permit_test_peer(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o770)).unwrap();
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args(["/grant", "*S-1-5-32-545:(OI)(CI)RX"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls peer grant failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

fn create_test_generation(path: &Path) {
    std::fs::create_dir(path).unwrap();
    restrict_test_directory(path);
}

struct Fixture {
    paths: ProductPaths,
    guard: InstallLockGuard,
    _temp: tempfile::TempDir,
}

impl Fixture {
    fn new(label: &str) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(temp.path());
        paths.ensure().unwrap();
        for path in [
            paths.root().to_path_buf(),
            paths.generations_dir(),
            paths.app_home(),
        ] {
            restrict_test_directory(&path);
        }
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::Installer, label)
            .unwrap()
            .unwrap();
        Self {
            paths,
            guard,
            _temp: temp,
        }
    }

    fn product(&self) -> LockedProduct<'_> {
        LockedProduct::bind(self.paths.clone(), &self.guard).unwrap()
    }
}

#[test]
fn absent_journal_creates_exclusive_owner_private_final_name() {
    let fixture = Fixture::new("generation-absent");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    assert_eq!(generation.generation(), "release-a");
    assert_eq!(
        generation.path(),
        fixture.paths.generation_dir("release-a").unwrap()
    );
    assert!(!fixture.paths.active_receipts_journal_path().exists());

    let metadata = std::fs::metadata(generation.path()).unwrap();
    assert!(metadata.is_dir());
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(metadata.mode() & 0o077, 0);
        assert_eq!(metadata.uid(), nix::unistd::Uid::effective().as_raw());
    }
    drop(generation);
    assert!(matches!(
        product.create_unpublished("release-a"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::AlreadyExists(name)
        )) if name == "release-a"
    ));
}

#[test]
fn failed_creation_cleanup_retains_nonempty_authority() {
    let fixture = Fixture::new("generation-create-retained");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();
    let child = path.join("payload");
    std::fs::write(&child, b"created bytes must survive").unwrap();

    let CreateUnpublishedError::Retained(poisoned) =
        generation.creation_failed(GenerationError::ParentIdentityChanged)
    else {
        panic!("nonempty failed creation unexpectedly discarded its authority");
    };
    assert!(matches!(
        poisoned.error(),
        GenerationError::CreationValidation {
            validation,
            cleanup,
        } if validation.contains("directory relationship changed")
            && cleanup.contains("filesystem error")
    ));
    assert_eq!(
        std::fs::read(&child).unwrap(),
        b"created bytes must survive"
    );
    #[cfg(windows)]
    assert!(
        std::fs::rename(
            &path,
            fixture.paths.generations_dir().join("release-a-moved")
        )
        .is_err()
    );
    std::fs::remove_file(child).unwrap();
    #[cfg(windows)]
    assert!(std::fs::remove_dir(&path).is_err());
    drop(poisoned);
    std::fs::remove_dir(path).unwrap();
}

#[test]
fn failed_creation_cleanup_refuses_after_removing_exact_empty_name() {
    let fixture = Fixture::new("generation-create-refused");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();

    assert!(matches!(
        generation.creation_failed(GenerationError::ParentIdentityChanged),
        CreateUnpublishedError::Refused(GenerationError::ParentIdentityChanged)
    ));
    assert!(!path.exists());
}

#[cfg(unix)]
#[test]
fn unix_unretained_creation_preserves_empty_residue_without_deletion_authority() {
    let fixture = Fixture::new("generation-unretained-empty");
    let mut product = fixture.product();
    let generation = "release-a";
    let path = fixture.paths.generation_dir(generation).unwrap();
    create_test_generation(&path);
    let open_error = product
        .generations
        .open_child(OsStr::new("absent-authority-probe"))
        .unwrap_err();
    let created = UnixUnretainedCreation {
        creation: creation_stage("post-mkdir no-follow open/fstat", open_error),
    };

    let CreateUnpublishedError::Indeterminate(indeterminate) =
        product.finalize_unretained_creation(generation, path.clone(), created)
    else {
        panic!("unretained empty residue was not preserved as indeterminate");
    };
    assert!(matches!(
        indeterminate.error(),
        GenerationError::IndeterminateCreation { creation, cleanup }
            if creation.contains("open/fstat")
                && cleanup.contains("exact retained child authority was never established")
    ));
    assert!(path.is_dir());
    drop(indeterminate);
    std::fs::remove_dir(path).unwrap();
}

#[cfg(unix)]
#[test]
fn unix_partial_writer_residue_survives_without_deletion_authority() {
    const CHILD_PATH_ENV: &str = "VAULTSPEC_S163_PARTIAL_WRITER_PATH";
    if let Some(path) = std::env::var_os(CHILD_PATH_ENV) {
        use std::io::Write;

        let mut payload = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(PathBuf::from(path).join("payload.partial"))
            .unwrap();
        payload.write_all(b"partial writer bytes").unwrap();
        payload.sync_all().unwrap();
        return;
    }

    let fixture = Fixture::new("generation-unretained-nonempty");
    let mut product = fixture.product();
    let generation = "release-a";
    let path = fixture.paths.generation_dir(generation).unwrap();
    create_test_generation(&path);
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "generation::tests::unix_partial_writer_residue_survives_without_deletion_authority",
            "--nocapture",
        ])
        .env(CHILD_PATH_ENV, &path);
    let status = run_bounded_test_child(&mut command);
    assert!(status.success(), "partial writer child failed: {status}");
    let partial = path.join("payload.partial");
    assert_eq!(std::fs::read(&partial).unwrap(), b"partial writer bytes");
    let open_error = product
        .generations
        .open_child(OsStr::new("absent-authority-probe"))
        .unwrap_err();
    let created = UnixUnretainedCreation {
        creation: creation_stage("post-mkdir no-follow open/fstat", open_error),
    };

    let CreateUnpublishedError::Indeterminate(indeterminate) =
        product.finalize_unretained_creation(generation, path.clone(), created)
    else {
        panic!("nonempty created residue was not retained as indeterminate");
    };
    assert_eq!(indeterminate.generation(), generation);
    assert_eq!(indeterminate.path(), path);
    assert!(matches!(
        indeterminate.error(),
        GenerationError::IndeterminateCreation { creation, cleanup }
            if creation.contains("open/fstat")
                && cleanup.contains("exact retained child authority was never established")
    ));
    assert_eq!(std::fs::read(&partial).unwrap(), b"partial writer bytes");
    drop(indeterminate);
    std::fs::remove_file(partial).unwrap();
    std::fs::remove_dir(path).unwrap();
}

#[cfg(unix)]
#[test]
fn unix_unretained_creation_preserves_empty_substituted_residue() {
    let fixture = Fixture::new("generation-unretained-substituted");
    let mut product = fixture.product();
    let generation = "release-a";
    let path = fixture.paths.generation_dir(generation).unwrap();
    let moved = fixture.paths.generations_dir().join("release-a-moved");
    create_test_generation(&path);
    std::fs::rename(&path, &moved).unwrap();
    create_test_generation(&path);
    let open_error = product
        .generations
        .open_child(OsStr::new("absent-authority-probe"))
        .unwrap_err();
    let created = UnixUnretainedCreation {
        creation: creation_stage("post-mkdir no-follow open/fstat", open_error),
    };

    let CreateUnpublishedError::Indeterminate(indeterminate) =
        product.finalize_unretained_creation(generation, path.clone(), created)
    else {
        panic!("substituted created residue was not retained as indeterminate");
    };
    assert!(matches!(
        indeterminate.error(),
        GenerationError::IndeterminateCreation { cleanup, .. }
            if cleanup.contains("exact retained child authority was never established")
    ));
    assert!(path.is_dir());
    assert!(moved.is_dir());
    drop(indeterminate);
    std::fs::remove_dir(path).unwrap();
    std::fs::remove_dir(moved).unwrap();
}

#[cfg(unix)]
#[test]
fn unix_unretained_creation_never_unlinks_permission_drifted_residue() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new("generation-unretained-permission-drift");
    let mut product = fixture.product();
    let generation = "release-a";
    let path = fixture.paths.generation_dir(generation).unwrap();
    create_test_generation(&path);
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o770)).unwrap();
    let open_error = product
        .generations
        .open_child(OsStr::new("absent-authority-probe"))
        .unwrap_err();
    let created = UnixUnretainedCreation {
        creation: creation_stage("post-mkdir no-follow open/fstat", open_error),
    };

    let CreateUnpublishedError::Indeterminate(indeterminate) =
        product.finalize_unretained_creation(generation, path.clone(), created)
    else {
        panic!("permission-drifted created residue was not indeterminate");
    };
    assert!(matches!(
        indeterminate.error(),
        GenerationError::IndeterminateCreation { cleanup, .. }
            if cleanup.contains("exact retained child authority was never established")
    ));
    assert!(path.is_dir());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
    drop(indeterminate);
    std::fs::remove_dir(path).unwrap();
}

#[test]
fn invalid_or_unsafe_entries_fail_closed_without_capacity_bypass() {
    let fixture = Fixture::new("generation-unsafe");
    std::fs::write(fixture.paths.generations_dir().join("unsafe-file"), b"file").unwrap();
    let mut product = fixture.product();
    assert!(matches!(
        product.create_unpublished("release-a"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::UnsafeFilesystemObject(_)
        ))
    ));

    std::fs::remove_file(fixture.paths.generations_dir().join("unsafe-file")).unwrap();
    create_test_generation(&fixture.paths.generations_dir().join("not valid"));
    assert!(matches!(
        product.create_unpublished("release-a"),
        Err(CreateUnpublishedError::Refused(GenerationError::Path(_)))
    ));
}

#[test]
fn exact_nonactive_count_boundary_allows_eight_and_refuses_nine() {
    let fixture = Fixture::new("generation-bound");
    for index in 0..7 {
        create_test_generation(
            &fixture
                .paths
                .generations_dir()
                .join(format!("release-{index}")),
        );
    }
    let mut product = fixture.product();
    let eighth = product.create_unpublished("release-7").unwrap();
    let eighth_path = eighth.path().to_path_buf();
    drop(eighth);
    assert!(matches!(
        product.create_unpublished("release-8"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::AbandonedGenerationLimit { limit: 8 }
        ))
    ));
    assert!(eighth_path.is_dir());
}

#[test]
fn retained_parent_relationship_rejects_substitution() {
    let fixture = Fixture::new("generation-parent");
    let mut product = fixture.product();
    let generations = fixture.paths.generations_dir();
    let moved = fixture.paths.root().join("generations-moved");
    #[cfg(unix)]
    {
        std::fs::rename(&generations, &moved).unwrap();
        create_test_generation(&generations);
        assert!(matches!(
            product.create_unpublished("release-a"),
            Err(CreateUnpublishedError::Refused(
                GenerationError::ParentIdentityChanged
                    | GenerationError::LockAuthority(_)
                    | GenerationError::ActiveReceiptAuthority(_)
            ))
        ));
    }
    #[cfg(windows)]
    {
        assert!(std::fs::rename(&generations, &moved).is_err());
        assert!(product.create_unpublished("release-a").is_ok());
    }
}

#[test]
fn empty_discard_consumes_only_the_exact_generation() {
    let fixture = Fixture::new("generation-discard-empty");
    let mut product = fixture.product();
    let sentinel = fixture.paths.generations_dir().join("sentinel");
    create_test_generation(&sentinel);
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();
    assert!(matches!(
        generation.discard(),
        DiscardOutcome::Removed { generation } if generation == "release-a"
    ));
    assert!(!path.exists());
    assert!(sentinel.is_dir());
}

#[test]
fn nonempty_discard_returns_diagnostic_authority_still_retained() {
    let fixture = Fixture::new("generation-discard-nonempty");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();
    let child = path.join("payload");
    std::fs::write(&child, b"real payload").unwrap();

    let DiscardOutcome::Retained(poisoned) = generation.discard() else {
        panic!("nonempty generation unexpectedly removed");
    };
    assert_eq!(poisoned.generation(), "release-a");
    assert_eq!(poisoned.path(), path);
    assert!(matches!(poisoned.error(), GenerationError::Io(_)));
    assert!(path.is_dir());
    std::fs::remove_file(child).unwrap();
    #[cfg(windows)]
    assert!(std::fs::remove_dir(&path).is_err());
    drop(poisoned);
    std::fs::remove_dir(&path).unwrap();
}

#[test]
fn retained_identity_prevents_substituted_name_cleanup() {
    let fixture = Fixture::new("generation-substitution");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();
    let moved = fixture.paths.generations_dir().join("release-a-moved");

    #[cfg(unix)]
    {
        std::fs::rename(&path, &moved).unwrap();
        create_test_generation(&path);
        let sentinel = path.join("sentinel");
        std::fs::write(&sentinel, b"replacement must survive").unwrap();
        let DiscardOutcome::Retained(poisoned) = generation.discard() else {
            panic!("substituted name unexpectedly removed");
        };
        assert!(matches!(
            poisoned.error(),
            GenerationError::IdentityChanged(name) if name == "release-a"
        ));
        assert_eq!(
            std::fs::read(&sentinel).unwrap(),
            b"replacement must survive"
        );
        drop(poisoned);
        std::fs::remove_file(sentinel).unwrap();
        std::fs::remove_dir(path).unwrap();
        std::fs::remove_dir(moved).unwrap();
    }
    #[cfg(windows)]
    {
        assert!(std::fs::rename(&path, &moved).is_err());
        assert!(matches!(
            generation.discard(),
            DiscardOutcome::Removed { generation } if generation == "release-a"
        ));
        assert!(!path.exists());
    }
}

#[test]
fn permission_drift_is_retained_and_never_removed() {
    let fixture = Fixture::new("generation-permission-drift");
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    let path = generation.path().to_path_buf();
    permit_test_peer(&path);

    let DiscardOutcome::Retained(poisoned) = generation.discard() else {
        panic!("permission-drifted generation unexpectedly removed");
    };
    assert!(matches!(
        poisoned.error(),
        GenerationError::UnsafeFilesystemObject(failed) if failed == &path
    ));
    assert!(path.is_dir());
    restrict_test_directory(&path);
    drop(poisoned);
    std::fs::remove_dir(path).unwrap();
}

#[test]
fn foreign_install_guard_is_rejected_before_tree_binding() {
    let first = Fixture::new("generation-first");
    let second = Fixture::new("generation-second");
    assert!(matches!(
        LockedProduct::bind(second.paths.clone(), &first.guard),
        Err(GenerationError::LockAuthority(_))
    ));
}

#[test]
fn legacy_receipt_json_never_selects_a_generation() {
    let fixture = Fixture::new("generation-legacy");
    std::fs::write(
        fixture.paths.receipt_path(),
        br#"{"state":"active","active_generation":"release-a"}"#,
    )
    .unwrap();
    let mut product = fixture.product();
    let generation = product.create_unpublished("release-a").unwrap();
    assert_eq!(generation.generation(), "release-a");
}
