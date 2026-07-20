use super::*;
use crate::locking::{Actor, InstallLock, InstallLockGuard};

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
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::Installer, "snapshot-test")
            .unwrap()
            .unwrap();
        Self {
            paths,
            guard,
            _temp: temp,
        }
    }

    fn write_live(&self, segments: &[&str], bytes: &[u8]) {
        let mut path = self.paths.app_home();
        for segment in segments {
            path.push(segment);
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, bytes).unwrap();
    }

    fn read_live(&self, segments: &[&str]) -> Option<Vec<u8>> {
        let mut path = self.paths.app_home();
        for segment in segments {
            path.push(segment);
        }
        std::fs::read(path).ok()
    }

    fn store(&self, id: &str, file: &str, authority: &str, version: &str) -> SchemaBearingStore {
        SchemaBearingStore::new(id, ["data", file], authority, version).unwrap()
    }
}

fn primary(fixture: &Fixture) -> SchemaBearingStore {
    fixture.store(
        "primary-database",
        "primary.db",
        "alembic-migration-range",
        "0008",
    )
}

fn checkpoint(fixture: &Fixture) -> SchemaBearingStore {
    fixture.store(
        "checkpoint-database",
        "checkpoint.db",
        "checkpointer-schema",
        "1.0.0",
    )
}

fn seat() -> PriorSeatIdentity {
    PriorSeatIdentity {
        generation: "g-prior".to_string(),
        dashboard_version: "0.1.0".to_string(),
        pid: Some(4242),
    }
}

#[test]
fn store_grammar_rejects_escapes_and_bad_fields() {
    // A traversal segment, a separator, and an empty id are all refused before a
    // path is ever derived.
    assert!(SchemaBearingStore::new("primary", ["data", ".."], "a", "1").is_err());
    assert!(SchemaBearingStore::new("primary", ["data", "a/b"], "a", "1").is_err());
    assert!(SchemaBearingStore::new("primary", ["data", "a\\b"], "a", "1").is_err());
    assert!(SchemaBearingStore::new("", ["data", "primary.db"], "a", "1").is_err());
    assert!(SchemaBearingStore::new("bad..id", ["data"], "a", "1").is_err());
    assert!(SchemaBearingStore::new("primary", Vec::<String>::new(), "a", "1").is_err());
    // A well-formed store is accepted.
    assert!(
        SchemaBearingStore::new("primary-database", ["data", "primary.db"], "auth", "1").is_ok()
    );
}

#[test]
fn group_rejects_empty_and_duplicate_ids() {
    let fixture = Fixture::new();
    assert!(matches!(
        ConsistencyGroupSpec::new(Vec::new(), None),
        Err(SnapshotError::InvalidGroup { .. })
    ));
    assert!(matches!(
        ConsistencyGroupSpec::new([primary(&fixture), primary(&fixture)], None),
        Err(SnapshotError::InvalidGroup { .. })
    ));
    assert!(ConsistencyGroupSpec::new([primary(&fixture), checkpoint(&fixture)], None).is_ok());
}

#[test]
fn capture_and_restore_roundtrips_the_whole_group() {
    let fixture = Fixture::new();
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    fixture.write_live(&["data", "primary.db-wal"], b"primary-wal-1");
    fixture.write_live(&["data", "checkpoint.db"], b"checkpoint-v1");
    std::fs::write(
        fixture.paths.active_receipts_journal_path(),
        b"receipt-generation-1",
    )
    .unwrap();

    let spec =
        ConsistencyGroupSpec::new([primary(&fixture), checkpoint(&fixture)], Some(seat())).unwrap();
    let snapshot = capture_consistency_snapshot(&fixture.paths, &fixture.guard, 7, &spec).unwrap();
    assert_eq!(snapshot.consistency_generation(), 7);
    assert_eq!(snapshot.prior_seat(), Some(&seat()));
    assert!(snapshot.captured_receipt_journal());

    // Corrupt every live member, then restore the group.
    fixture.write_live(&["data", "primary.db"], b"CORRUPT");
    fixture.write_live(&["data", "primary.db-wal"], b"CORRUPT");
    fixture.write_live(&["data", "checkpoint.db"], b"CORRUPT");
    std::fs::write(fixture.paths.active_receipts_journal_path(), b"CORRUPT").unwrap();

    let reopened = open_consistency_snapshot(&fixture.paths, &fixture.guard, 7).unwrap();
    reopened.restore(&fixture.paths, &fixture.guard).unwrap();

    assert_eq!(
        fixture.read_live(&["data", "primary.db"]).unwrap(),
        b"primary-v1"
    );
    assert_eq!(
        fixture.read_live(&["data", "primary.db-wal"]).unwrap(),
        b"primary-wal-1"
    );
    assert_eq!(
        fixture.read_live(&["data", "checkpoint.db"]).unwrap(),
        b"checkpoint-v1"
    );
    assert_eq!(
        std::fs::read(fixture.paths.active_receipts_journal_path()).unwrap(),
        b"receipt-generation-1"
    );
}

#[test]
fn restore_removes_a_sidecar_absent_from_the_snapshot() {
    let fixture = Fixture::new();
    // Capture a store with NO wal sidecar.
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    let snapshot = capture_consistency_snapshot(&fixture.paths, &fixture.guard, 1, &spec).unwrap();

    // A post-snapshot WAL would corrupt the restored database; restore removes it.
    fixture.write_live(&["data", "primary.db-wal"], b"post-snapshot-wal");
    snapshot.restore(&fixture.paths, &fixture.guard).unwrap();
    assert!(fixture.read_live(&["data", "primary.db-wal"]).is_none());
    assert_eq!(
        fixture.read_live(&["data", "primary.db"]).unwrap(),
        b"primary-v1"
    );
}

#[test]
fn restore_removes_a_store_absent_at_capture() {
    let fixture = Fixture::new();
    // The store file does not exist at capture time.
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    let snapshot = capture_consistency_snapshot(&fixture.paths, &fixture.guard, 3, &spec).unwrap();

    // A file created after capture is removed to restore the captured absence.
    fixture.write_live(&["data", "primary.db"], b"appeared-later");
    snapshot.restore(&fixture.paths, &fixture.guard).unwrap();
    assert!(fixture.read_live(&["data", "primary.db"]).is_none());
}

#[test]
fn open_rejects_an_incomplete_snapshot_with_no_manifest() {
    let fixture = Fixture::new();
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    capture_consistency_snapshot(&fixture.paths, &fixture.guard, 5, &spec).unwrap();

    let manifest = fixture
        .paths
        .snapshot_dir("5")
        .unwrap()
        .join(SNAPSHOT_MANIFEST_NAME);
    std::fs::remove_file(&manifest).unwrap();
    assert!(matches!(
        open_consistency_snapshot(&fixture.paths, &fixture.guard, 5),
        Err(SnapshotError::Incomplete)
    ));
}

#[test]
fn open_rejects_a_drifted_member() {
    let fixture = Fixture::new();
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    capture_consistency_snapshot(&fixture.paths, &fixture.guard, 9, &spec).unwrap();

    // Corrupt the captured member bytes; open must reject the group.
    let member = fixture
        .paths
        .snapshot_dir("9")
        .unwrap()
        .join(STORES_SUBDIR)
        .join("primary-database")
        .join(STORE_PRIMARY_NAME);
    std::fs::write(&member, b"tampered-and-longer").unwrap();
    assert!(matches!(
        open_consistency_snapshot(&fixture.paths, &fixture.guard, 9),
        Err(SnapshotError::Unverified { .. })
    ));
}

#[test]
fn capture_refuses_an_existing_generation() {
    let fixture = Fixture::new();
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    capture_consistency_snapshot(&fixture.paths, &fixture.guard, 2, &spec).unwrap();
    assert!(matches!(
        capture_consistency_snapshot(&fixture.paths, &fixture.guard, 2, &spec),
        Err(SnapshotError::AlreadyExists { .. })
    ));
}

#[test]
fn a_foreign_guard_cannot_capture_or_open() {
    let fixture = Fixture::new();
    let other = Fixture::new();
    fixture.write_live(&["data", "primary.db"], b"primary-v1");
    let spec = ConsistencyGroupSpec::new([primary(&fixture)], None).unwrap();
    // A guard bound to a different product root is refused before any capture.
    assert!(matches!(
        capture_consistency_snapshot(&fixture.paths, &other.guard, 4, &spec),
        Err(SnapshotError::LockAuthority(_))
    ));
}
