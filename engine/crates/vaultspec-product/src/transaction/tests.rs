use super::*;
use crate::locking::{Actor, InstallLock, InstallLockGuard};
use crate::migration::{MigrationLimits, MigrationRangeSpec, plan_migration};
use crate::process::{GatewaySpec, spawn_gateway};
use crate::snapshot::SchemaBearingStore;
use std::ffi::OsString;
use std::time::Duration;

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
            .acquire(Actor::CopiedUpdater, "transaction-test")
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

fn plan() -> UpdatePlan {
    UpdatePlan::new(
        7,
        "cand-1",
        Some("prior-0".to_string()),
        Channel::SelfInstall,
        "0008",
    )
    .unwrap()
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

fn exiting_gateway() -> GatewaySpec {
    // A real child that runs no test and exits 0 immediately — a stand-in owned
    // runtime the transaction stops.
    let exe = std::env::current_exe().unwrap();
    GatewaySpec::from_program_unchecked(
        exe,
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
    )
}

fn successful_migration() -> StagedMigration {
    // The test binary run with a filter that matches no test exits 0 with bounded
    // output — a real successful migration invocation.
    let exe = std::env::current_exe().unwrap();
    StagedMigration::from_program(
        exe,
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
        MigrationLimits::new(64 * 1024, Duration::from_secs(10)),
    )
}

fn failing_migration() -> StagedMigration {
    // A non-existent program: a real spawn failure the transaction rolls back on.
    StagedMigration::from_program(
        std::path::PathBuf::from("/no/such/migration/program/anywhere"),
        Vec::<OsString>::new(),
        MigrationLimits::new(64 * 1024, Duration::from_secs(10)),
    )
}

fn forward_plan() -> MigrationPlan {
    plan_migration(None, &MigrationRangeSpec::new("0001", "0008").unwrap()).unwrap()
}

#[test]
fn phase_planner_advances_forward_and_rolls_back_on_failure() {
    use InterruptionMarker::*;
    assert_eq!(plan_next(Staged, StepResult::Advanced), Draining);
    assert_eq!(plan_next(Draining, StepResult::Advanced), Snapshotted);
    assert_eq!(plan_next(Snapshotted, StepResult::Advanced), Migrating);
    assert_eq!(plan_next(Migrating, StepResult::Advanced), Activated);
    assert_eq!(plan_next(Activated, StepResult::Advanced), Accepted);
    // Any pre-commit failure rolls back.
    for phase in [Staged, Draining, Snapshotted, Migrating, Activated] {
        assert_eq!(plan_next(phase, StepResult::Failed), RollingBack);
    }
    // A committed release cannot be rolled back by a later failure.
    assert_eq!(plan_next(Accepted, StepResult::Failed), Accepted);
    assert_eq!(plan_next(RollingBack, StepResult::Advanced), RollingBack);
}

#[test]
fn ordered_transaction_persists_each_phase_marker() {
    let fixture = Fixture::new();
    fixture.write_live("primary.db", b"primary-v1");
    fixture.write_live("checkpoint.db", b"checkpoint-v1");

    let mut txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    assert_eq!(txn.phase(), InterruptionMarker::Staged);
    assert_eq!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .unwrap()
            .phase(),
        InterruptionMarker::Staged
    );

    let gateway = spawn_gateway(&exiting_gateway()).unwrap();
    let (quiescence, _termination) = txn.drain_and_stop(gateway, Duration::from_secs(2)).unwrap();
    assert_eq!(txn.phase(), InterruptionMarker::Draining);

    txn.snapshot(&group()).unwrap();
    assert_eq!(txn.phase(), InterruptionMarker::Snapshotted);

    txn.migrate(&successful_migration(), &forward_plan(), &quiescence)
        .unwrap();
    assert_eq!(txn.phase(), InterruptionMarker::Migrating);
    assert_eq!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .unwrap()
            .phase(),
        InterruptionMarker::Migrating
    );

    let ready = txn.ready_to_activate();
    // The activation seam is downstream; the descriptor is still at Migrating.
    assert_eq!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .unwrap()
            .phase(),
        InterruptionMarker::Migrating
    );
    // The transaction can still be rolled back from the activation boundary.
    ready.rollback().unwrap();
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
}

#[test]
fn rollback_restores_the_consistency_group_and_clears_the_descriptor() {
    let fixture = Fixture::new();
    fixture.write_live("primary.db", b"primary-v1");
    fixture.write_live("checkpoint.db", b"checkpoint-v1");

    let mut txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let gateway = spawn_gateway(&exiting_gateway()).unwrap();
    let (_q, _t) = txn.drain_and_stop(gateway, Duration::from_secs(2)).unwrap();
    txn.snapshot(&group()).unwrap();

    // Corrupt the live stores, then roll back.
    fixture.write_live("primary.db", b"CORRUPT");
    fixture.write_live("checkpoint.db", b"CORRUPT");
    txn.rollback().unwrap();

    assert_eq!(fixture.read_live("primary.db").unwrap(), b"primary-v1");
    assert_eq!(
        fixture.read_live("checkpoint.db").unwrap(),
        b"checkpoint-v1"
    );
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
}

#[test]
fn rollback_reclaims_the_snapshot_and_a_retry_at_the_same_generation_succeeds() {
    let fixture = Fixture::new();
    fixture.write_live("primary.db", b"primary-v1");
    fixture.write_live("checkpoint.db", b"checkpoint-v1");

    // First attempt: snapshot then roll back.
    let mut txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let gateway = spawn_gateway(&exiting_gateway()).unwrap();
    let (_q, _t) = txn.drain_and_stop(gateway, Duration::from_secs(2)).unwrap();
    txn.snapshot(&group()).unwrap();
    txn.rollback().unwrap();

    // The snapshot at this consistency generation is reclaimed (no accumulation,
    // no wedge).
    assert!(open_consistency_snapshot(&fixture.paths, &fixture.guard, 7).is_err());

    // A retry at the SAME consistency generation captures cleanly.
    let mut retry =
        UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let gateway = spawn_gateway(&exiting_gateway()).unwrap();
    let (_q, _t) = retry
        .drain_and_stop(gateway, Duration::from_secs(2))
        .unwrap();
    retry.snapshot(&group()).unwrap();
    assert_eq!(retry.phase(), InterruptionMarker::Snapshotted);
    retry.rollback().unwrap();
}

#[test]
fn a_migration_failure_auto_rolls_back_the_group() {
    let fixture = Fixture::new();
    fixture.write_live("primary.db", b"primary-v1");
    fixture.write_live("checkpoint.db", b"checkpoint-v1");

    let mut txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let gateway = spawn_gateway(&exiting_gateway()).unwrap();
    let (quiescence, _t) = txn.drain_and_stop(gateway, Duration::from_secs(2)).unwrap();
    txn.snapshot(&group()).unwrap();

    // Corrupt the live stores; the failing migration must restore them.
    fixture.write_live("primary.db", b"CORRUPT");
    let error = txn
        .migrate(&failing_migration(), &forward_plan(), &quiescence)
        .unwrap_err();
    assert!(matches!(error, TransactionError::Migration(_)));

    assert_eq!(fixture.read_live("primary.db").unwrap(), b"primary-v1");
    assert!(
        read_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );
}

#[test]
fn drain_and_stop_terminates_a_live_owned_runtime() {
    let fixture = Fixture::new();
    let exe = std::env::current_exe().unwrap();
    let spec = GatewaySpec::from_program_unchecked(
        exe,
        vec![
            OsString::from("transaction_sleeper_process"),
            OsString::from("--nocapture"),
            OsString::from("--test-threads=1"),
        ],
    )
    .with_env("TXN_SLEEPER", "1");
    let gateway = spawn_gateway(&spec).unwrap();
    let pid = gateway.pid();
    assert!(crate::locking::process_is_alive(pid));

    let mut txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let (_q, _termination) = txn
        .drain_and_stop(gateway, Duration::from_millis(500))
        .unwrap();
    assert_eq!(txn.phase(), InterruptionMarker::Draining);
    // The owned runtime is no longer alive after the bounded stop.
    assert!(!crate::locking::process_is_alive(pid));
}

#[test]
fn descriptor_survives_a_round_trip_and_a_foreign_guard_is_refused() {
    let fixture = Fixture::new();
    let other = Fixture::new();
    let _txn = UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan()).unwrap();
    let descriptor = read_descriptor(&fixture.paths, &fixture.guard)
        .unwrap()
        .unwrap();
    assert_eq!(descriptor.consistency_generation(), 7);
    assert_eq!(descriptor.candidate_generation(), "cand-1");
    assert_eq!(descriptor.prior_generation(), Some("prior-0"));
    assert_eq!(descriptor.channel(), Channel::SelfInstall);
    // A foreign guard cannot read this product's descriptor.
    assert!(read_descriptor(&fixture.paths, &other.guard).is_err());
}

/// A hidden helper the drain/stop proof re-invokes as a REAL long-lived child. In
/// a normal `cargo test` run (no `TXN_SLEEPER` env) it is a no-op; otherwise it
/// sleeps well past the test's stop window so termination is observable.
#[test]
fn transaction_sleeper_process() {
    if std::env::var("TXN_SLEEPER").is_err() {
        return;
    }
    std::thread::sleep(Duration::from_secs(30));
}
