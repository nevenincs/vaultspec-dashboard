//! Integration proof for the consistency-group snapshot (W03.P06.S54).
//!
//! Uses REAL SQLite primary and checkpoint databases and the production snapshot
//! API (no fakes): a captured group restores both databases together, and an
//! incomplete or unverified group is rejected.

use std::path::Path;

use rusqlite::Connection;
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::snapshot::{
    ConsistencyGroupSpec, SchemaBearingStore, capture_consistency_snapshot,
    open_consistency_snapshot,
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
        .acquire(Actor::Installer, "snapshot-group-it")
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

fn create_db(path: &Path, table: &str, seed_rows: &[(i64, &str)]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(path).unwrap();
    conn.execute(
        &format!("CREATE TABLE {table} (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"),
        [],
    )
    .unwrap();
    for (id, value) in seed_rows {
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

fn group() -> ConsistencyGroupSpec {
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
        None,
    )
    .unwrap()
}

#[test]
fn snapshot_restores_real_sqlite_primary_and_checkpoint_together() {
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

    let snapshot =
        capture_consistency_snapshot(&harness.paths, &harness.guard, 42, &group()).unwrap();

    // Mutate BOTH real databases after the snapshot.
    let conn = Connection::open(harness.db_path("primary.db")).unwrap();
    conn.execute("DELETE FROM runs", []).unwrap();
    conn.execute("INSERT INTO runs (id, value) VALUES (99, 'corrupted')", [])
        .unwrap();
    conn.close().unwrap();
    let conn = Connection::open(harness.db_path("checkpoint.db")).unwrap();
    conn.execute("DROP TABLE checkpoints", []).unwrap();
    conn.close().unwrap();

    // Restore the whole group together, then reopen both real databases.
    snapshot.restore(&harness.paths, &harness.guard).unwrap();
    assert_eq!(
        read_rows(&harness.db_path("primary.db"), "runs"),
        vec![(1, "alpha".to_string()), (2, "beta".to_string())]
    );
    assert_eq!(
        read_rows(&harness.db_path("checkpoint.db"), "checkpoints"),
        vec![(1, "ckpt-1".to_string())]
    );
}

#[test]
fn an_incomplete_group_with_no_manifest_is_rejected() {
    let harness = harness();
    create_db(&harness.db_path("primary.db"), "runs", &[(1, "alpha")]);
    let spec = ConsistencyGroupSpec::new(
        [SchemaBearingStore::new(
            "primary-database",
            ["data", "primary.db"],
            "alembic-migration-range",
            "0008",
        )
        .unwrap()],
        None,
    )
    .unwrap();
    capture_consistency_snapshot(&harness.paths, &harness.guard, 7, &spec).unwrap();

    // Removing the committed manifest makes the capture incomplete.
    std::fs::remove_file(
        harness
            .paths
            .snapshot_dir("7")
            .unwrap()
            .join("snapshot.json"),
    )
    .unwrap();
    assert!(open_consistency_snapshot(&harness.paths, &harness.guard, 7).is_err());
}

#[test]
fn a_drifted_member_is_rejected() {
    let harness = harness();
    create_db(&harness.db_path("primary.db"), "runs", &[(1, "alpha")]);
    let spec = ConsistencyGroupSpec::new(
        [SchemaBearingStore::new(
            "primary-database",
            ["data", "primary.db"],
            "alembic-migration-range",
            "0008",
        )
        .unwrap()],
        None,
    )
    .unwrap();
    capture_consistency_snapshot(&harness.paths, &harness.guard, 9, &spec).unwrap();

    // Tampering with a captured member's bytes must fail verification on reopen.
    let member = harness
        .paths
        .snapshot_dir("9")
        .unwrap()
        .join("stores")
        .join("primary-database")
        .join("primary");
    std::fs::write(&member, b"tampered snapshot bytes").unwrap();
    assert!(open_consistency_snapshot(&harness.paths, &harness.guard, 9).is_err());
}
