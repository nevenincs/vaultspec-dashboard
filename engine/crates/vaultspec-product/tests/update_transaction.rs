//! Integration proof for the ordered update transaction (W03.P06.S55).
//!
//! A candidate failure restores the whole consistency group — real SQLite
//! primary and checkpoint databases, the fixed receipt-journal generation, and
//! the retained prior seat — and clears the durable descriptor, so no split
//! release set is left behind. Uses the production transaction API, real SQLite,
//! and a real spawned owned-runtime child (no fakes).

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::migration::{
    MigrationLimits, MigrationRangeSpec, StagedMigration, plan_migration,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::receipt::{Channel, PriorSeatIdentity};
use vaultspec_product::snapshot::{
    ConsistencyGroupSpec, SchemaBearingStore, open_consistency_snapshot,
};
use vaultspec_product::transaction::{
    TransactionError, UpdatePlan, UpdateTransaction, read_descriptor,
};

struct Harness {
    paths: ProductPaths,
    guard: InstallLockGuard,
    _temp: tempfile::TempDir,
}

fn harness() -> Harness {
    let temp = tempfile::tempdir().expect("real temporary product home");
    let paths = ProductPaths::under_app_home(temp.path());
    paths.ensure().unwrap();
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::CopiedUpdater, "update-transaction-it")
        .unwrap()
        .unwrap();
    Harness {
        paths,
        guard,
        _temp: temp,
    }
}

impl Harness {
    fn db_path(&self, name: &str) -> std::path::PathBuf {
        self.paths.app_home().join("data").join(name)
    }
}

/// Spawn a real, quick-exiting child as the owned runtime, resolved through the
/// public capsule-relative program authority (the child is this test binary run
/// with a filter matching no test, so it exits 0 immediately).
fn spawn_stub_gateway() -> vaultspec_product::process::GatewayProcess {
    let exe = std::env::current_exe().unwrap();
    let dir = exe.parent().unwrap();
    let name = exe.file_name().unwrap().to_str().unwrap();
    let program = ResolvedProgram::from_capsule_relative(dir, &[name]).unwrap();
    let spec = GatewaySpec::from_resolved(
        program,
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
    );
    spawn_gateway(&spec).unwrap()
}

/// A migration whose program cannot be spawned — a real failure the transaction
/// rolls back on. Resolved capsule-relative so it stays within the public API.
fn failing_migration(capsule_root: &Path) -> StagedMigration {
    StagedMigration::from_capsule_relative(
        capsule_root,
        &["no-such-migrator-binary"],
        Vec::<OsString>::new(),
        MigrationLimits::new(64 * 1024, Duration::from_secs(10)),
    )
    .unwrap()
}

fn create_db(path: &Path, table: &str, rows: &[(i64, &str)]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(path).unwrap();
    conn.execute(
        &format!("CREATE TABLE {table} (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"),
        [],
    )
    .unwrap();
    for (id, value) in rows {
        conn.execute(
            &format!("INSERT INTO {table} (id, value) VALUES (?1, ?2)"),
            rusqlite::params![id, value],
        )
        .unwrap();
    }
    conn.close().unwrap();
}

fn read_rows(path: &Path, table: &str) -> Vec<(i64, String)> {
    let conn = Connection::open(path).unwrap();
    let mut stmt = conn
        .prepare(&format!("SELECT id, value FROM {table} ORDER BY id"))
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

fn group(prior_seat: PriorSeatIdentity) -> ConsistencyGroupSpec {
    ConsistencyGroupSpec::new(
        [
            SchemaBearingStore::new(
                "primary-database",
                ["data", "primary.db"],
                "alembic-migration-range",
                "0008",
            )
            .unwrap(),
            SchemaBearingStore::new(
                "checkpoint-database",
                ["data", "checkpoint.db"],
                "checkpointer-schema",
                "1.0.0",
            )
            .unwrap(),
        ],
        Some(prior_seat),
    )
    .unwrap()
}

#[test]
fn candidate_failure_restores_the_whole_consistency_group() {
    let harness = harness();
    create_db(
        &harness.db_path("primary.db"),
        "runs",
        &[(1, "alpha"), (2, "beta")],
    );
    create_db(
        &harness.db_path("checkpoint.db"),
        "checkpoints",
        &[(1, "ckpt-1")],
    );
    // A real fixed receipt-journal generation captured as a group member.
    std::fs::write(
        harness.paths.active_receipts_journal_path(),
        b"active-receipt-generation-bytes",
    )
    .unwrap();

    let prior_seat = PriorSeatIdentity {
        generation: "prior-0".to_string(),
        dashboard_version: "0.1.0".to_string(),
        pid: Some(4242),
    };
    let plan = UpdatePlan::new(
        11,
        "cand-1",
        Some("prior-0".to_string()),
        Channel::SelfInstall,
        "0008",
    )
    .unwrap();

    let mut txn = UpdateTransaction::begin(harness.paths.clone(), &harness.guard, plan).unwrap();
    let (quiescence, _termination) = txn
        .drain_and_stop(spawn_stub_gateway(), Duration::from_secs(5))
        .unwrap();
    txn.snapshot(&group(prior_seat.clone())).unwrap();

    // Corrupt every mutable store and the receipt generation, then hit a real
    // migration failure that must roll the whole group back.
    let conn = Connection::open(harness.db_path("primary.db")).unwrap();
    conn.execute("DELETE FROM runs", []).unwrap();
    conn.close().unwrap();
    let conn = Connection::open(harness.db_path("checkpoint.db")).unwrap();
    conn.execute("DROP TABLE checkpoints", []).unwrap();
    conn.close().unwrap();
    std::fs::write(harness.paths.active_receipts_journal_path(), b"CORRUPT").unwrap();

    let forward = plan_migration(None, &MigrationRangeSpec::new("0001", "0008").unwrap()).unwrap();
    let error = txn
        .migrate(
            &failing_migration(harness._temp.path()),
            &forward,
            &quiescence,
        )
        .unwrap_err();
    assert!(matches!(error, TransactionError::Migration(_)));

    // Files, all schema-bearing state, checkpoints, and the receipt generation are
    // restored together; the descriptor is cleared (no split release set).
    assert_eq!(
        read_rows(&harness.db_path("primary.db"), "runs"),
        vec![(1, "alpha".to_string()), (2, "beta".to_string())]
    );
    assert_eq!(
        read_rows(&harness.db_path("checkpoint.db"), "checkpoints"),
        vec![(1, "ckpt-1".to_string())]
    );
    assert_eq!(
        std::fs::read(harness.paths.active_receipts_journal_path()).unwrap(),
        b"active-receipt-generation-bytes"
    );
    assert!(
        read_descriptor(&harness.paths, &harness.guard)
            .unwrap()
            .is_none()
    );

    // The retained prior seat was captured as part of the consistency group.
    let snapshot = open_consistency_snapshot(&harness.paths, &harness.guard, 11).unwrap();
    assert_eq!(snapshot.prior_seat(), Some(&prior_seat));
}
