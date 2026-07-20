use super::*;
use crate::locking::{Actor, InstallLock, InstallLockGuard};
use crate::paths::ProductPaths;
use std::path::Path;

struct Fixture {
    paths: ProductPaths,
    guard: InstallLockGuard,
    _temp: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().expect("real temporary product home");
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
            .acquire(Actor::Installer, "self-install-test")
            .unwrap()
            .unwrap();
        Self {
            paths,
            guard,
            _temp: temp,
        }
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

#[test]
fn adapter_reports_self_install_channel_facts() {
    let adapter = SelfInstallAuthority::new();
    assert_eq!(adapter.channel(), Channel::SelfInstall);
    assert!(!adapter.manager_owns_activation());

    let provenance = adapter.provenance();
    assert_eq!(provenance.channel(), Channel::SelfInstall);
    assert!(!provenance.manager_owns_activation());
}

#[test]
fn creates_final_name_generations_without_rename_and_retains_prior() {
    let fixture = Fixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let adapter = SelfInstallAuthority::new();

    // The first candidate is created at its exact final name directly.
    let g1 = adapter
        .create_candidate_generation(&mut product, "gen-1")
        .unwrap();
    assert_eq!(g1.generation(), "gen-1");
    assert_eq!(g1.path(), fixture.paths.generation_dir("gen-1").unwrap());
    assert!(fixture.paths.generation_dir("gen-1").unwrap().is_dir());
    // No staging tree was used — final-name creation never stages-then-renames.
    assert!(
        std::fs::read_dir(fixture.paths.staging_dir())
            .unwrap()
            .next()
            .is_none()
    );
    drop(g1);

    // A second candidate is created alongside; the prior generation is retained
    // untouched (no rename of the prior tree into or out of place).
    let g2 = adapter
        .create_candidate_generation(&mut product, "gen-2")
        .unwrap();
    assert_eq!(g2.path(), fixture.paths.generation_dir("gen-2").unwrap());
    drop(g2);

    assert!(fixture.paths.generation_dir("gen-1").unwrap().is_dir());
    assert!(fixture.paths.generation_dir("gen-2").unwrap().is_dir());
    assert!(
        std::fs::read_dir(fixture.paths.staging_dir())
            .unwrap()
            .next()
            .is_none()
    );
}

#[test]
fn a_foreign_guard_cannot_bind_a_product_for_the_adapter() {
    let fixture = Fixture::new();
    let other = Fixture::new();
    // A guard from a different product root is refused at bind, before any
    // generation is created.
    assert!(LockedProduct::bind(fixture.paths.clone(), &other.guard).is_err());
}
