use super::*;
use crate::locking::{Actor, InstallLock, InstallLockGuard};
use crate::receipt::Channel;
use crate::snapshot::{ConsistencyGroupSpec, SchemaBearingStore, capture_consistency_snapshot};
use crate::transaction::{UpdatePlan, persist_descriptor_for_test, read_descriptor};

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
            .acquire(Actor::CopiedUpdater, "recovery-test")
            .unwrap()
            .unwrap();
        Self {
            paths,
            guard,
            _temp: temp,
        }
    }

    fn write_live(&self, name: &str, bytes: &[u8]) {
        let path = self.paths.app_home().join("data").join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn read_live(&self, name: &str) -> Option<Vec<u8>> {
        std::fs::read(self.paths.app_home().join("data").join(name)).ok()
    }
}

fn plan(candidate: &str) -> UpdatePlan {
    UpdatePlan::new(
        3,
        candidate.to_string(),
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

#[test]
fn planner_covers_every_phase_and_commit_state() {
    use InterruptionMarker::*;
    for phase in [
        Staged,
        Draining,
        Snapshotted,
        Migrating,
        Activated,
        Accepted,
        RollingBack,
    ] {
        // A committed candidate always rolls forward, regardless of phase.
        assert_eq!(plan_recovery(phase, true), RecoveryAction::RollForward);
    }
    // Not committed: the pre-snapshot phases abort, the rest roll back.
    assert_eq!(plan_recovery(Staged, false), RecoveryAction::Abort);
    assert_eq!(plan_recovery(Draining, false), RecoveryAction::Abort);
    for phase in [Snapshotted, Migrating, Activated, Accepted, RollingBack] {
        assert_eq!(plan_recovery(phase, false), RecoveryAction::RollBack);
    }
}

#[test]
fn no_descriptor_is_a_noop() {
    let fixture = Fixture::new();
    assert_eq!(
        recover(&fixture.paths, &fixture.guard).unwrap(),
        RecoveryOutcome::NoTransaction
    );
}

#[test]
fn a_staged_interruption_aborts_and_clears_the_descriptor() {
    let fixture = Fixture::new();
    persist_descriptor_for_test(&fixture.paths, &plan("cand-1"), InterruptionMarker::Staged)
        .unwrap();
    assert_eq!(
        recover(&fixture.paths, &fixture.guard).unwrap(),
        RecoveryOutcome::Aborted
    );
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
}

#[test]
fn a_snapshotted_interruption_rolls_back_the_group() {
    let fixture = Fixture::new();
    fixture.write_live("primary.db", b"primary-v1");
    // Capture the snapshot at the plan's consistency generation, then simulate an
    // interruption after migration corrupted the live store.
    capture_consistency_snapshot(&fixture.paths, &fixture.guard, 3, &group()).unwrap();
    fixture.write_live("primary.db", b"CORRUPT");
    persist_descriptor_for_test(
        &fixture.paths,
        &plan("cand-1"),
        InterruptionMarker::Migrating,
    )
    .unwrap();

    assert_eq!(
        recover(&fixture.paths, &fixture.guard).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert_eq!(fixture.read_live("primary.db").unwrap(), b"primary-v1");
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
    // Recovery is idempotent.
    assert_eq!(
        recover(&fixture.paths, &fixture.guard).unwrap(),
        RecoveryOutcome::NoTransaction
    );
}

#[test]
fn a_committed_candidate_rolls_forward() {
    // Build a real settled receipt selecting "generation-1" via the manifest
    // fixture, then interrupt at Activated with that candidate.
    use crate::generation::LockedProduct;
    use crate::manifest::tests::Fixture as ManifestFixture;
    use crate::receipt::publish_active_receipt;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut generation = product.create_unpublished("generation-1").unwrap();
    fixture.populate(generation.path());
    let verified = fixture.verify(&mut generation).unwrap();
    drop(publish_active_receipt(verified).unwrap());

    persist_descriptor_for_test(
        &fixture.paths,
        &plan("generation-1"),
        InterruptionMarker::Activated,
    )
    .unwrap();

    assert_eq!(
        recover(&fixture.paths, &fixture.guard).unwrap(),
        RecoveryOutcome::RolledForward
    );
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
}
