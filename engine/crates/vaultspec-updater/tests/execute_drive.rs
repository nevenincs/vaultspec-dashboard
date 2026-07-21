//! Error-branch proofs for the fresh-update EXECUTE drive (W03.P07.S62 — the
//! activation-independent, platform-portable subset).
//!
//! These exercise `execute_update` against the REAL sealed `OwnedGatewayLease`
//! classification (commit `73541f0f6d`) over real discovery files: an absent
//! record is the valid cold state, and a foreign / stale / incompatible gateway
//! is a typed rollback with the durable descriptor cleared and the prior release
//! intact. These branches classify and fail BEFORE any credential is read, so
//! they run on every platform.
//!
//! The OwnedLive SUCCESS drive (drain → snapshot → migrate → ready) is
//! credential-gated — Windows credential bootstrap refuses until the
//! windows-private-file DACL authority lands — so it is a `#[cfg(unix)]` proof
//! plus reliance on the product's own transaction-level drain+Quiescence proof
//! (`gateway_drain::tests`). When the DACL authority lands, the live drive
//! becomes Windows-runnable too.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use vaultspec_product::gateway_drain::{DrainContext, DrainDeadlines};
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::migration::{
    MigrationLimits, MigrationPlan, MigrationRangeSpec, StagedMigration, plan_migration,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::receipt::Channel;
use vaultspec_product::snapshot::{ConsistencyGroupSpec, SchemaBearingStore};
use vaultspec_product::transaction::{UpdatePlan, read_descriptor};
use vaultspec_updater::{ExecuteInputs, UpdaterError, execute_update};

struct Installed {
    paths: ProductPaths,
    _temp: tempfile::TempDir,
}

fn installed() -> Installed {
    let temp = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(temp.path());
    paths.ensure().unwrap();
    Installed { paths, _temp: temp }
}

impl Installed {
    fn guard(&self) -> InstallLockGuard {
        InstallLock::new(self.paths.install_lock_path())
            .acquire(Actor::CopiedUpdater, "execute-drive-test")
            .unwrap()
            .unwrap()
    }

    fn our_owner(&self) -> String {
        self.paths.root().to_string_lossy().to_string()
    }

    fn write_discovery(&self, json: &str) {
        std::fs::write(self.paths.app_home().join("gateway-discovery.json"), json).unwrap();
    }
}

fn discovery_json(owner: &str, pid: u32, heartbeat_ms: i64) -> String {
    format!(
        "{{\"endpoint\":\"127.0.0.1:1\",\"pid\":{pid},\"owner\":{owner:?},\
         \"install_identity\":\"install-1\",\"generation\":\"gen-1\",\
         \"release_set\":{{\"name\":\"vaultspec\",\"version\":\"0.1.4\",\
         \"target\":\"x86_64-unknown-linux-gnu\"}},\
         \"protocol\":{{\"minimum\":\"v1\",\"maximum\":\"v1\"}},\
         \"state_schema\":{{\"minimum\":\"0001\",\"maximum\":\"9999\"}},\
         \"handoff_reference\":\"/nonexistent/attach.cred\",\"heartbeat_ms\":{heartbeat_ms}}}"
    )
}

fn range(min: &str, max: &str) -> RangeBounds {
    RangeBounds {
        minimum: min.to_string(),
        maximum: max.to_string(),
    }
}

fn drain_context() -> DrainContext {
    DrainContext {
        now_ms: 1_000_000,
        freshness_ms: 60_000,
        supported_protocol: range("v1", "v1"),
        supported_state_schema: range("0001", "9999"),
    }
}

fn execute_inputs(context: DrainContext, staged_migration: StagedMigration) -> ExecuteInputs {
    ExecuteInputs {
        plan: UpdatePlan::new(
            9,
            "cand-1",
            Some("prior-0".to_string()),
            Channel::SelfInstall,
            "0008",
        )
        .unwrap(),
        drain_context: context,
        deadlines: DrainDeadlines::new(
            Duration::from_secs(5),
            Duration::from_secs(5),
            Duration::from_millis(25),
        )
        .unwrap(),
        group: ConsistencyGroupSpec::new(
            [SchemaBearingStore::new(
                "primary-database",
                ["data", "primary.db"],
                "alembic-migration-range",
                "0008",
            )
            .unwrap()],
            None,
        )
        .unwrap(),
        staged_migration,
        migration_plan: forward_plan(),
    }
}

fn forward_plan() -> MigrationPlan {
    plan_migration(None, &MigrationRangeSpec::new("0001", "0008").unwrap()).unwrap()
}

/// A migration whose program cannot be spawned — unused on the branches that fail
/// at lease acquisition before migrate is reached.
fn unreachable_migration(capsule_root: &Path) -> StagedMigration {
    StagedMigration::from_capsule_relative(
        capsule_root,
        &["no-such-migrator"],
        Vec::<OsString>::new(),
        MigrationLimits::new(64 * 1024, Duration::from_secs(10)),
    )
    .unwrap()
}

/// A migration that runs to a successful exit: the test binary re-invoked with a
/// filter matching no test exits 0 with bounded output.
fn succeeding_migration() -> StagedMigration {
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

fn assert_descriptor_cleared(paths: &ProductPaths, guard: &InstallLockGuard) {
    assert!(read_descriptor(paths, guard).unwrap().is_none());
}

#[test]
fn absent_discovery_is_the_valid_cold_path_with_a_real_quiescence() {
    let product = installed();
    let guard = product.guard();
    // No discovery file: installed-but-cleanly-stopped valid cold state. The cold
    // predicate mints a REAL (never-faked) Quiescence and the drive reaches
    // ready_to_activate through a real snapshot + migration.
    let ready = execute_update(
        &product.paths,
        &guard,
        execute_inputs(drain_context(), succeeding_migration()),
    )
    .unwrap();
    // The swap tail is the unix/CI end-to-end proof; here we roll the reached
    // transaction back cleanly.
    ready.rollback().unwrap();
    assert_descriptor_cleared(&product.paths, &guard);
}

#[test]
fn a_foreign_gateway_rolls_back_and_is_never_drained() {
    let product = installed();
    let guard = product.guard();
    let capsule = product._temp.path().to_path_buf();
    product.write_discovery(&discovery_json(
        "someone-else",
        std::process::id(),
        1_000_000,
    ));

    let error = execute_update(
        &product.paths,
        &guard,
        execute_inputs(drain_context(), unreachable_migration(&capsule)),
    )
    .unwrap_err();
    assert!(matches!(
        error,
        UpdaterError::Drain(vaultspec_product::gateway_drain::GatewayDrainError::ForeignGateway)
    ));
    assert_descriptor_cleared(&product.paths, &guard);
}

#[test]
fn a_stale_owned_gateway_rolls_back() {
    let product = installed();
    let guard = product.guard();
    let capsule = product._temp.path().to_path_buf();
    // Ours, live pid, but the heartbeat is far outside the freshness window.
    product.write_discovery(&discovery_json(&product.our_owner(), std::process::id(), 1));

    let error = execute_update(
        &product.paths,
        &guard,
        execute_inputs(drain_context(), unreachable_migration(&capsule)),
    )
    .unwrap_err();
    assert!(matches!(
        error,
        UpdaterError::Drain(vaultspec_product::gateway_drain::GatewayDrainError::NotLive)
    ));
    assert_descriptor_cleared(&product.paths, &guard);
}

#[test]
fn an_incompatible_owned_gateway_rolls_back() {
    let product = installed();
    let guard = product.guard();
    let capsule = product._temp.path().to_path_buf();
    product.write_discovery(&discovery_json(
        &product.our_owner(),
        std::process::id(),
        1_000_000,
    ));

    let mut context = drain_context();
    context.supported_protocol = range("v2", "v2");
    let error = execute_update(
        &product.paths,
        &guard,
        execute_inputs(context, unreachable_migration(&capsule)),
    )
    .unwrap_err();
    assert!(matches!(
        error,
        UpdaterError::Drain(vaultspec_product::gateway_drain::GatewayDrainError::Incompatible)
    ));
    assert_descriptor_cleared(&product.paths, &guard);
}
