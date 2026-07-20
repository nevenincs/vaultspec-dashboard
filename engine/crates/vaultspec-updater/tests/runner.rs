//! Integration proofs for the copied-updater runner (W03.P07.S58).
//!
//! Real filesystem + the production `vaultspec-product` authority (no fakes): the
//! runner consumes a one-time owner-restricted descriptor, acquires the
//! installation lock as the copied updater, retires the descriptor so a replay
//! fails, and recovers any interrupted transaction. Executing a fresh update is
//! the activation seam and is not exercised here.

use std::path::Path;

use vaultspec_product::locking::{Actor, InstallLock};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::recovery::RecoveryOutcome;
use vaultspec_updater::{UpdaterError, read_descriptor, run};

struct Installed {
    paths: ProductPaths,
    descriptor: std::path::PathBuf,
    _temp: tempfile::TempDir,
}

fn installed_product() -> Installed {
    let temp = tempfile::tempdir().expect("real temporary app home");
    let paths = ProductPaths::under_app_home(temp.path());
    // Simulate an installed product tree the updater operates on.
    paths.ensure().unwrap();
    let descriptor = temp.path().join("updater-descriptor.json");
    Installed {
        paths,
        descriptor,
        _temp: temp,
    }
}

impl Installed {
    fn app_home(&self) -> &Path {
        // ProductPaths roots at <app_home>/a2a; recover the app home from the temp.
        self._temp.path()
    }

    fn write_descriptor(&self, json: &str) {
        std::fs::write(&self.descriptor, json).unwrap();
        restrict_test_file(&self.descriptor);
    }

    fn valid_descriptor_json(&self) -> String {
        format!(
            "{{\"version\":1,\"app_home\":{:?},\"owner\":\"copied-updater\"}}",
            self.app_home()
        )
    }
}

fn restrict_test_file(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        assert!(whoami.status.success());
        let user = String::from_utf8(whoami.stdout).unwrap();
        let user_grant = format!("{}:F", user.trim());
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &user_grant,
                "/grant",
                "*S-1-5-18:F",
                "/grant",
                "*S-1-5-32-544:F",
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
fn a_valid_descriptor_locks_recovers_and_retires_itself() {
    let product = installed_product();
    product.write_descriptor(&product.valid_descriptor_json());

    let run = run(&product.descriptor).unwrap();
    // No prior transaction was in flight.
    assert_eq!(run.recovery, RecoveryOutcome::NoTransaction);
    // The one-time descriptor was retired.
    assert!(!product.descriptor.exists());
}

#[test]
fn a_consumed_descriptor_cannot_be_replayed() {
    let product = installed_product();
    product.write_descriptor(&product.valid_descriptor_json());

    run(&product.descriptor).unwrap();
    // A second run finds no descriptor and refuses.
    assert!(matches!(
        run(&product.descriptor),
        Err(UpdaterError::Descriptor(_))
    ));
}

#[test]
fn a_world_readable_descriptor_is_refused() {
    let product = installed_product();
    std::fs::write(&product.descriptor, product.valid_descriptor_json()).unwrap();
    // Deliberately NOT owner-restricted.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&product.descriptor, std::fs::Permissions::from_mode(0o644))
            .unwrap();
        assert!(matches!(
            read_descriptor(&product.descriptor),
            Err(UpdaterError::Descriptor(_))
        ));
    }
    #[cfg(windows)]
    {
        // Grant an ordinary peer group access; the owner-restricted check refuses.
        let output = std::process::Command::new("icacls.exe")
            .arg(&product.descriptor)
            .args(["/grant", "*S-1-5-32-545:R"])
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(matches!(
            read_descriptor(&product.descriptor),
            Err(UpdaterError::Descriptor(_))
        ));
    }
}

#[test]
fn malformed_and_wrong_version_descriptors_are_refused() {
    let product = installed_product();

    product.write_descriptor("{ not json");
    assert!(matches!(
        read_descriptor(&product.descriptor),
        Err(UpdaterError::Descriptor(_))
    ));

    product.write_descriptor(&format!(
        "{{\"version\":2,\"app_home\":{:?},\"owner\":\"x\"}}",
        product.app_home()
    ));
    assert!(matches!(
        read_descriptor(&product.descriptor),
        Err(UpdaterError::Descriptor(_))
    ));

    // A relative app home is refused.
    product.write_descriptor("{\"version\":1,\"app_home\":\"relative/home\",\"owner\":\"x\"}");
    assert!(matches!(
        read_descriptor(&product.descriptor),
        Err(UpdaterError::Descriptor(_))
    ));
}

#[test]
fn a_held_installation_lock_makes_the_updater_report_busy() {
    let product = installed_product();
    product.write_descriptor(&product.valid_descriptor_json());

    // Another installer holds the lock for the duration of the run.
    let _held = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Installer, "other-installer")
        .unwrap()
        .unwrap();

    assert!(matches!(run(&product.descriptor), Err(UpdaterError::Busy)));
    // A refused run must NOT retire the descriptor — a later legitimate retry works.
    assert!(product.descriptor.exists());
}
