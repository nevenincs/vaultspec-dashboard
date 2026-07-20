//! Real-executable proofs for the copied updater (a2a-product-provisioning
//! W03.P07.S62 — the activation-independent subset).
//!
//! These invoke the REAL built `vaultspec-updater` binary and the production
//! `vaultspec-product` authority (no fakes): the gateway can never acquire the
//! install lock, a concurrent holder makes the updater report busy, a consumed
//! descriptor cannot be replayed, a descriptor error echoes no descriptor content,
//! and the updater recovers a real interrupted transaction from a durable
//! descriptor + real SQLite snapshot.
//!
//! The drain-of-discovered-gateway / snapshot-migration-swap / prior-seat-relaunch
//! proofs are the activation-seam half of S62 and are added when Fable's
//! drain+activation+relaunch contract lands; S62 is not ticked until then.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::Duration;

use rusqlite::Connection;
use vaultspec_product::locking::{Actor, InstallLock, LockError};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::receipt::Channel;
use vaultspec_product::snapshot::{ConsistencyGroupSpec, SchemaBearingStore};
use vaultspec_product::transaction::{UpdatePlan, UpdateTransaction, read_descriptor};

struct Installed {
    paths: ProductPaths,
    descriptor: PathBuf,
    temp: tempfile::TempDir,
}

fn installed_product() -> Installed {
    let temp = tempfile::tempdir().expect("real temporary app home");
    let paths = ProductPaths::under_app_home(temp.path());
    paths.ensure().unwrap();
    let descriptor = temp.path().join("updater-descriptor.json");
    Installed {
        paths,
        descriptor,
        temp,
    }
}

impl Installed {
    fn app_home(&self) -> &Path {
        self.temp.path()
    }

    fn db_path(&self, name: &str) -> PathBuf {
        self.paths.app_home().join("data").join(name)
    }

    fn write_owner_restricted_descriptor(&self, json: &str) {
        std::fs::write(&self.descriptor, json).unwrap();
        restrict_test_file(&self.descriptor);
    }

    fn valid_descriptor(&self) -> String {
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
        assert!(output.status.success());
    }
}

fn run_updater(descriptor: &Path) -> Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_vaultspec-updater"))
        .arg(descriptor)
        .output()
        .expect("spawn the real updater binary")
}

fn code(output: &Output) -> i32 {
    output.status.code().unwrap_or(-1)
}

// Exit-code contract mirrored from the executable (main.rs).
const EXIT_OK: i32 = 0;
const EXIT_BUSY: i32 = 3;
const EXIT_DESCRIPTOR: i32 = 4;

#[test]
fn the_gateway_can_never_acquire_the_install_lock() {
    let product = installed_product();
    let result = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Gateway, "gateway-must-not-lock");
    assert!(matches!(result, Err(LockError::GatewayForbidden)));
}

#[test]
fn a_concurrent_lock_holder_makes_the_updater_report_busy() {
    let product = installed_product();
    product.write_owner_restricted_descriptor(&product.valid_descriptor());

    // Another installer holds the lock across the updater run.
    let _held = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Installer, "other-installer")
        .unwrap()
        .unwrap();

    let output = run_updater(&product.descriptor);
    assert_eq!(code(&output), EXIT_BUSY);
    // A busy run must not consume the one-time descriptor.
    assert!(product.descriptor.exists());
}

#[test]
fn a_consumed_descriptor_cannot_be_replayed() {
    let product = installed_product();
    product.write_owner_restricted_descriptor(&product.valid_descriptor());

    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_OK);
    // The one-time descriptor was retired; a replay is refused.
    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_DESCRIPTOR);
}

#[test]
fn a_descriptor_error_echoes_no_descriptor_content() {
    let product = installed_product();
    // A malformed descriptor carrying a recognizable marker.
    let marker = "SUPER-SECRET-MARKER-0xDEADBEEF";
    product.write_owner_restricted_descriptor(&format!("{{ not json {marker}"));

    let output = run_updater(&product.descriptor);
    assert_eq!(code(&output), EXIT_DESCRIPTOR);
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        !combined.contains(marker),
        "updater output must not echo descriptor content: {combined}"
    );
}

#[test]
fn the_updater_recovers_an_interrupted_transaction() {
    let product = installed_product();
    create_db(&product.db_path("primary.db"), &[(1, "alpha"), (2, "beta")]);

    // Drive a real transaction to Snapshotted, corrupt the store, then "crash"
    // (drop the transaction and its guard, freeing the OS lock).
    {
        let guard = InstallLock::new(product.paths.install_lock_path())
            .acquire(Actor::CopiedUpdater, "setup")
            .unwrap()
            .unwrap();
        let plan = UpdatePlan::new(
            5,
            "cand-1",
            Some("prior-0".to_string()),
            Channel::SelfInstall,
            "0008",
        )
        .unwrap();
        let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan).unwrap();
        let (_q, _t) = txn
            .drain_and_stop(stub_gateway(), Duration::from_secs(5))
            .unwrap();
        txn.snapshot(&group()).unwrap();
        let conn = Connection::open(product.db_path("primary.db")).unwrap();
        conn.execute("DELETE FROM runs", []).unwrap();
        conn.close().unwrap();
    }

    // The real updater binary acquires its own lock and recovers.
    product.write_owner_restricted_descriptor(&product.valid_descriptor());
    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_OK);

    // The store was rolled back to its captured state.
    assert_eq!(
        read_rows(&product.db_path("primary.db")),
        vec![(1, "alpha".to_string()), (2, "beta".to_string())]
    );
    // The durable transaction descriptor was cleared.
    let guard = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::CopiedUpdater, "verify")
        .unwrap()
        .unwrap();
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
}

fn stub_gateway() -> vaultspec_product::process::GatewayProcess {
    let exe = std::env::current_exe().unwrap();
    let program = ResolvedProgram::from_capsule_relative(
        exe.parent().unwrap(),
        &[exe.file_name().unwrap().to_str().unwrap()],
    )
    .unwrap();
    let spec = GatewaySpec::from_resolved(
        program,
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
    );
    spawn_gateway(&spec).unwrap()
}

fn group() -> ConsistencyGroupSpec {
    ConsistencyGroupSpec::new(
        [SchemaBearingStore::new(
            "primary-database",
            ["data", "primary.db"],
            "alembic-migration-range",
            "0008",
        )
        .unwrap()],
        None,
    )
    .unwrap()
}

fn create_db(path: &Path, rows: &[(i64, &str)]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(path).unwrap();
    conn.execute(
        "CREATE TABLE runs (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )
    .unwrap();
    for (id, value) in rows {
        conn.execute(
            "INSERT INTO runs (id, value) VALUES (?1, ?2)",
            rusqlite::params![id, value],
        )
        .unwrap();
    }
    conn.close().unwrap();
}

fn read_rows(path: &Path) -> Vec<(i64, String)> {
    let conn = Connection::open(path).unwrap();
    let mut stmt = conn
        .prepare("SELECT id, value FROM runs ORDER BY id")
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}
