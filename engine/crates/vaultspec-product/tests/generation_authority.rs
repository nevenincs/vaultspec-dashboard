//! Unpublished-generation authority acceptance (W01.P01.S163).
//!
//! These tests exercise the production API against real filesystem objects and
//! installation locks. A directory is inert namespace state until a settled
//! receipt selects it, while cleanup is permitted only through an exact
//! retained generation authority.

use std::path::Path;

use vaultspec_product::generation::{
    CreateUnpublishedError, DiscardOutcome, GenerationError, LockedProduct,
    MAX_ABANDONED_GENERATIONS,
};
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::paths::ProductPaths;

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

fn create_generation_directory(path: &Path) {
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
fn directory_presence_is_inert_and_same_name_creation_refuses() {
    let fixture = Fixture::new("s163-directory-inert");
    let inert = fixture.paths.generation_dir("release-inert").unwrap();
    create_generation_directory(&inert);

    let mut product = fixture.product();
    assert!(matches!(
        product.create_unpublished("release-inert"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::AlreadyExists(generation)
        )) if generation == "release-inert"
    ));
    assert!(inert.is_dir());
    assert!(!fixture.paths.active_receipts_journal_path().exists());

    let candidate = product.create_unpublished("release-candidate").unwrap();
    assert_eq!(candidate.generation(), "release-candidate");
    assert!(!fixture.paths.active_receipts_journal_path().exists());
}

#[test]
fn file_collision_fails_closed_and_preserves_occupant() {
    let fixture = Fixture::new("s163-file-collision");
    let collision = fixture.paths.generations_dir().join("release-collision");
    std::fs::write(&collision, b"occupant bytes").unwrap();

    let mut product = fixture.product();
    assert!(matches!(
        product.create_unpublished("release-candidate"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::UnsafeFilesystemObject(path)
        )) if path == collision
    ));
    assert_eq!(std::fs::read(&collision).unwrap(), b"occupant bytes");
}

#[cfg(unix)]
#[test]
fn symlink_collision_fails_closed_and_preserves_target() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new("s163-symlink-collision");
    let target = fixture.paths.root().join("outside-sentinel");
    std::fs::write(&target, b"outside bytes").unwrap();
    let collision = fixture.paths.generations_dir().join("release-collision");
    symlink(&target, &collision).unwrap();

    let mut product = fixture.product();
    assert!(matches!(
        product.create_unpublished("release-candidate"),
        Err(CreateUnpublishedError::Refused(
            GenerationError::UnsafeFilesystemObject(path)
        )) if path == collision
    ));
    assert_eq!(std::fs::read(&target).unwrap(), b"outside bytes");
    assert!(
        std::fs::symlink_metadata(&collision)
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[test]
fn exact_empty_discard_removes_only_the_retained_generation() {
    let fixture = Fixture::new("s163-exact-discard");
    let neighbor = fixture.paths.generation_dir("release-neighbor").unwrap();
    create_generation_directory(&neighbor);
    let mut product = fixture.product();
    let candidate = product.create_unpublished("release-candidate").unwrap();
    let candidate_path = candidate.path().to_path_buf();

    assert!(matches!(
        candidate.discard(),
        DiscardOutcome::Removed { generation } if generation == "release-candidate"
    ));
    assert!(!candidate_path.exists());
    assert!(neighbor.is_dir());
}

#[test]
fn partial_writer_residue_survives_failed_discard() {
    const CHILD_PATH_ENV: &str = "VAULTSPEC_S163_PUBLIC_PARTIAL_WRITER_PATH";
    if let Some(path) = std::env::var_os(CHILD_PATH_ENV) {
        use std::io::Write;

        let mut payload = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(std::path::PathBuf::from(path).join("payload.partial"))
            .unwrap();
        payload.write_all(b"public partial writer bytes").unwrap();
        payload.sync_all().unwrap();
        return;
    }

    let fixture = Fixture::new("s163-partial-writer");
    let mut product = fixture.product();
    let candidate = product.create_unpublished("release-candidate").unwrap();
    let path = candidate.path().to_path_buf();
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "partial_writer_residue_survives_failed_discard",
            "--nocapture",
        ])
        .env(CHILD_PATH_ENV, &path);
    let status = run_bounded_test_child(&mut command);
    assert!(status.success(), "partial writer child failed: {status}");

    let partial = path.join("payload.partial");
    assert_eq!(
        std::fs::read(&partial).unwrap(),
        b"public partial writer bytes"
    );
    let DiscardOutcome::Retained(poisoned) = candidate.discard() else {
        panic!("nonempty partial-writer residue was removed");
    };
    assert_eq!(
        std::fs::read(&partial).unwrap(),
        b"public partial writer bytes"
    );
    drop(poisoned);

    std::fs::remove_file(partial).unwrap();
    std::fs::remove_dir(path).unwrap();
}

#[cfg(unix)]
#[test]
fn substituted_name_is_never_removed_by_retained_discard() {
    let fixture = Fixture::new("s163-substituted-discard");
    let mut product = fixture.product();
    let candidate = product.create_unpublished("release-candidate").unwrap();
    let path = candidate.path().to_path_buf();
    let moved = fixture.paths.generations_dir().join("release-moved");
    std::fs::rename(&path, &moved).unwrap();
    create_generation_directory(&path);
    let replacement = path.join("replacement-sentinel");
    std::fs::write(&replacement, b"replacement bytes").unwrap();

    let DiscardOutcome::Retained(poisoned) = candidate.discard() else {
        panic!("substituted final name was removed");
    };
    assert!(matches!(
        poisoned.error(),
        GenerationError::IdentityChanged(generation) if generation == "release-candidate"
    ));
    assert_eq!(std::fs::read(&replacement).unwrap(), b"replacement bytes");
    assert!(moved.is_dir());
    drop(poisoned);

    std::fs::remove_file(replacement).unwrap();
    std::fs::remove_dir(path).unwrap();
    std::fs::remove_dir(moved).unwrap();
}

#[test]
fn eight_nonactive_generations_are_allowed_and_the_ninth_is_refused() {
    let fixture = Fixture::new("s163-generation-bound");
    for index in 0..(MAX_ABANDONED_GENERATIONS - 1) {
        create_generation_directory(
            &fixture
                .paths
                .generation_dir(&format!("release-{index}"))
                .unwrap(),
        );
    }
    let mut product = fixture.product();
    let eighth = product
        .create_unpublished(&format!("release-{}", MAX_ABANDONED_GENERATIONS - 1))
        .unwrap();
    let eighth_path = eighth.path().to_path_buf();
    drop(eighth);

    assert!(matches!(
        product.create_unpublished(&format!("release-{MAX_ABANDONED_GENERATIONS}")),
        Err(CreateUnpublishedError::Refused(
            GenerationError::AbandonedGenerationLimit { limit }
        )) if limit == MAX_ABANDONED_GENERATIONS
    ));
    assert!(eighth_path.is_dir());
}
