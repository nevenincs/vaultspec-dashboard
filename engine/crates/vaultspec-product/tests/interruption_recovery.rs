//! Integration proof for interruption recovery (W03.P06.S56).
//!
//! A transaction is driven to a durable phase and then "crashed" (the transaction
//! and its installation guard are dropped, as on process death, freeing the OS
//! lock). A fresh guard is acquired — as a restarted process would — and recovery
//! reopens the REAL transaction directory and receipt journal to resolve the
//! outcome deterministically. Every phase reachable through the public transaction
//! API is covered; the committed roll-forward and the downstream Activated/Accepted
//! phases (which require the sealed activation) are proven at the unit level (S53).

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;
use vaultspec_product::locking::{Actor, InstallLock};
use vaultspec_product::migration::{
    MigrationLimits, MigrationRangeSpec, StagedMigration, plan_migration,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewayProcess, GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::receipt::Channel;
use vaultspec_product::recovery::{RecoveryOutcome, recover};
use vaultspec_product::snapshot::{ConsistencyGroupSpec, SchemaBearingStore};
use vaultspec_product::transaction::{UpdatePlan, UpdateTransaction, read_descriptor};

struct Product {
    paths: ProductPaths,
    lock: InstallLock,
    _temp: tempfile::TempDir,
}

fn product() -> Product {
    let temp = tempfile::tempdir().expect("real temporary product home");
    let paths = ProductPaths::under_app_home(temp.path());
    paths.ensure().unwrap();
    let lock = InstallLock::new(paths.install_lock_path());
    Product {
        paths,
        lock,
        _temp: temp,
    }
}

impl Product {
    fn db_path(&self, name: &str) -> std::path::PathBuf {
        self.paths.app_home().join("data").join(name)
    }
}

fn plan() -> UpdatePlan {
    UpdatePlan::new(
        5,
        "cand-1",
        Some("prior-0".to_string()),
        Channel::SelfInstall,
        "0008",
    )
    .unwrap()
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

fn resolved_self() -> ResolvedProgram {
    let exe = std::env::current_exe().unwrap();
    let dir = exe.parent().unwrap();
    let name = exe.file_name().unwrap().to_str().unwrap();
    ResolvedProgram::from_capsule_relative(dir, &[name]).unwrap()
}

fn stub_gateway() -> GatewayProcess {
    let spec = GatewaySpec::from_resolved(
        resolved_self(),
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
    );
    spawn_gateway(&spec).unwrap()
}

fn successful_migration() -> StagedMigration {
    let exe = std::env::current_exe().unwrap();
    StagedMigration::from_capsule_relative(
        exe.parent().unwrap(),
        &[exe.file_name().unwrap().to_str().unwrap()],
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
        MigrationLimits::new(64 * 1024, Duration::from_secs(10)),
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

#[test]
fn no_transaction_is_a_noop() {
    let product = product();
    let guard = product
        .lock
        .acquire(Actor::CopiedUpdater, "restart")
        .unwrap()
        .unwrap();
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::NoTransaction
    );
}

#[test]
fn a_staged_crash_recovers_by_aborting() {
    let product = product();
    {
        let guard = product
            .lock
            .acquire(Actor::CopiedUpdater, "crash")
            .unwrap()
            .unwrap();
        let _txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan()).unwrap();
        // Crash: the transaction and guard drop at scope end.
    }
    let guard = product
        .lock
        .acquire(Actor::CopiedUpdater, "restart")
        .unwrap()
        .unwrap();
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::Aborted
    );
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
}

#[test]
fn a_draining_crash_recovers_by_aborting() {
    let product = product();
    {
        let guard = product
            .lock
            .acquire(Actor::CopiedUpdater, "crash")
            .unwrap()
            .unwrap();
        let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan()).unwrap();
        let (_q, _t) = txn
            .drain_and_stop(stub_gateway(), Duration::from_secs(5))
            .unwrap();
    }
    let guard = product
        .lock
        .acquire(Actor::CopiedUpdater, "restart")
        .unwrap()
        .unwrap();
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::Aborted
    );
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
}

#[test]
fn a_snapshotted_crash_recovers_by_rolling_back() {
    let product = product();
    create_db(&product.db_path("primary.db"), &[(1, "alpha")]);
    {
        let guard = product
            .lock
            .acquire(Actor::CopiedUpdater, "crash")
            .unwrap()
            .unwrap();
        let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan()).unwrap();
        let (_q, _t) = txn
            .drain_and_stop(stub_gateway(), Duration::from_secs(5))
            .unwrap();
        txn.snapshot(&group()).unwrap();
        // A partial mutation lands, then the process crashes.
        let conn = Connection::open(product.db_path("primary.db")).unwrap();
        conn.execute("DELETE FROM runs", []).unwrap();
        conn.close().unwrap();
    }
    let guard = product
        .lock
        .acquire(Actor::CopiedUpdater, "restart")
        .unwrap()
        .unwrap();
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert_eq!(
        read_rows(&product.db_path("primary.db")),
        vec![(1, "alpha".to_string())]
    );
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
    // Idempotent: a second recovery finds nothing to do.
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::NoTransaction
    );
}

#[test]
fn a_migrating_crash_recovers_by_rolling_back() {
    let product = product();
    create_db(&product.db_path("primary.db"), &[(1, "alpha"), (2, "beta")]);
    {
        let guard = product
            .lock
            .acquire(Actor::CopiedUpdater, "crash")
            .unwrap()
            .unwrap();
        let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan()).unwrap();
        let (quiescence, _t) = txn
            .drain_and_stop(stub_gateway(), Duration::from_secs(5))
            .unwrap();
        txn.snapshot(&group()).unwrap();
        let forward =
            plan_migration(None, &MigrationRangeSpec::new("0001", "0008").unwrap()).unwrap();
        txn.migrate(&successful_migration(), &forward, &quiescence)
            .unwrap();
        // The migration ran; a mutation lands, then the process crashes before the
        // receipt commits.
        let conn = Connection::open(product.db_path("primary.db")).unwrap();
        conn.execute("DELETE FROM runs", []).unwrap();
        conn.close().unwrap();
    }
    let guard = product
        .lock
        .acquire(Actor::CopiedUpdater, "restart")
        .unwrap()
        .unwrap();
    assert_eq!(
        recover(&product.paths, &guard).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert_eq!(
        read_rows(&product.db_path("primary.db")),
        vec![(1, "alpha".to_string()), (2, "beta".to_string())]
    );
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
}
