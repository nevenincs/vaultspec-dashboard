//! Certification cases about the RELEASE SET: tamper detection, staged
//! migration, candidate failure, interruption recovery, consistency snapshots,
//! and removal.
//!
//! Every case drives the product's own transactional authority — the update
//! transaction, the consistency-snapshot group, the deterministic recovery
//! planner, the retained-generation authority — over real files under a real
//! held installation lock, and every process it starts comes out of the
//! installed tree.

use std::path::{Path, PathBuf};

use vaultspec_product::lifecycle::LifecycleController;
use vaultspec_product::locking::InstallLockGuard;
use vaultspec_product::migration::{
    MigrationDecision, MigrationLimits, MigrationOutcome, MigrationRangeSpec, StagedMigration,
    plan_migration,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::receipt::{Channel, InterruptionMarker, PriorSeatIdentity};
use vaultspec_product::recovery::{RecoveryAction, RecoveryOutcome, plan_recovery, recover};
use vaultspec_product::snapshot::{
    ConsistencyGroupSpec, SchemaBearingStore, capture_consistency_snapshot,
    open_consistency_snapshot,
};
use vaultspec_product::transaction::{UpdatePlan, UpdateTransaction, read_descriptor};

use crate::artifact::Artifact;
use crate::cases::{hold_installation, release_installation, run_frozen_verb};
use crate::command::{SupervisedChild, execute_installed, require_success};
use crate::network::require_network_removed;
use crate::{
    CaseError, CaseResult, EvidenceGap, GATEWAY_SETTLE, MIGRATION_OUTPUT_CAP, MIGRATION_WALL,
    RELEASE_MANIFEST, describe_code, display,
};

/// The mutable user data every release-set case proves survives its drive.
const MUTABLE_STORE_BYTES: &[u8] = b"certify-mutable-user-data";

// Tamper detection and repair
// ---------------------------------------------------------------------------

/// Digest tampering is DETECTED, and restoring the immutable file leaves mutable
/// state untouched.
///
/// The pristine tree is proven first, then one file the release manifest really
/// declares is altered on disk and both the shipped verification authority and
/// the installed dashboard's own verification verb must refuse it. Mutable user
/// data is written alongside and compared byte-for-byte across the whole drive,
/// and the product's repair authority is driven at a traversal path to prove it
/// can never write outside the generation tree it repairs.
pub(crate) fn case_tamper_detection(artifact: &Artifact) -> CaseResult {
    let dashboard = artifact.dashboard()?;
    let root = display(&artifact.tree_root);
    artifact.prove_tree(&artifact.tree_root)?;

    let paths = artifact.product_paths_named("tamper")?;
    let mutable = paths.data_dir().join("certify-user-store.db");
    std::fs::write(&mutable, MUTABLE_STORE_BYTES)
        .map_err(|error| CaseError::failed(format!("cannot write mutable state: {error}")))?;

    let declared = declared_file(artifact)?;
    let pristine = std::fs::read(&declared).map_err(|error| {
        CaseError::failed(format!(
            "cannot read the declared file {}: {error}",
            display(&declared)
        ))
    })?;
    let mut tampered = pristine.clone();
    match tampered.first_mut() {
        Some(byte) => *byte = byte.wrapping_add(1),
        None => tampered.push(b'x'),
    }
    std::fs::write(&declared, &tampered)
        .map_err(|error| CaseError::failed(format!("cannot alter the declared file: {error}")))?;

    let detected = artifact.prove_tree(&artifact.tree_root).is_err();
    let verb = execute_installed(
        "dashboard executable",
        &dashboard,
        &["verify-release", &root],
        &[],
        None,
    )?;
    let verb_refused = verb.code != Some(0);

    // The repair authority may never reach outside the generation tree, whatever
    // it is asked to replace.
    let controller = LifecycleController::new(paths.clone());
    let escaped = controller
        .repair_immutable(
            "certify-tamper-generation",
            Path::new("../../certify-escape"),
            b"escaped",
        )
        .is_ok();

    // Restore the immutable file. Detection must be specific: the same authority
    // that refused the altered tree accepts the restored one.
    std::fs::write(&declared, &pristine)
        .map_err(|error| CaseError::failed(format!("cannot restore the declared file: {error}")))?;
    artifact.prove_tree(&artifact.tree_root)?;
    require_success(
        "dashboard executable",
        &dashboard,
        &["verify-release", &root],
        &[],
        None,
    )?;

    let preserved = std::fs::read(&mutable).map_err(|error| {
        CaseError::failed(format!("cannot read mutable state after repair: {error}"))
    })?;
    if preserved != MUTABLE_STORE_BYTES {
        return Err(CaseError::failed(format!(
            "mutable state at {} was rewritten by the repair path",
            display(&mutable)
        )));
    }
    if escaped {
        return Err(CaseError::failed(
            "the repair authority accepted a path outside the generation tree".to_string(),
        ));
    }
    if !detected {
        return Err(CaseError::failed(format!(
            "altering {} did not fail verification against {RELEASE_MANIFEST}",
            display(&declared)
        )));
    }
    if !verb_refused {
        return Err(CaseError::failed(
            "the installed verification verb accepted a tampered tree".to_string(),
        ));
    }
    Ok(format!(
        "altering {} was refused by the release authority and by the installed verification verb (exit {}), restoring it re-verified the tree, and mutable state stayed byte-identical",
        display(&declared),
        describe_code(verb.code)
    ))
}

/// One file the installed tree's own member manifest declares a digest for. The
/// certifier never invents a target: a file nothing declares would prove nothing
/// about inventory-bound detection.
fn declared_file(artifact: &Artifact) -> Result<PathBuf, CaseError> {
    let manifest_path = artifact.tree_root.join(RELEASE_MANIFEST);
    let raw =
        std::fs::read_to_string(&manifest_path).map_err(|_| EvidenceGap::ComponentAbsent {
            component: "release member manifest",
            relative: RELEASE_MANIFEST.to_string(),
        })?;
    let manifest: serde_json::Value = serde_json::from_str(&raw).map_err(|error| {
        CaseError::failed(format!(
            "the installed member manifest is unparseable: {error}"
        ))
    })?;
    let digests = manifest
        .get("file_digests")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            CaseError::failed("the installed member manifest declares no file digests".to_string())
        })?;
    // Prefer the smallest declared file so the alteration is cheap and the
    // restore is exact; every candidate is equally covered by the inventory.
    let mut best: Option<(u64, PathBuf)> = None;
    for relative in digests.keys() {
        let path = artifact.tree_root.join(relative);
        let Ok(metadata) = std::fs::metadata(&path) else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let size = metadata.len();
        if best.as_ref().is_none_or(|(seen, _)| size < *seen) {
            best = Some((size, path));
        }
    }
    best.map(|(_, path)| path).ok_or_else(|| {
        CaseError::Unavailable(EvidenceGap::ComponentAbsent {
            component: "declared installed file",
            relative: "any path named by file_digests".to_string(),
        })
    })
}

// Staged migration under proven quiescence
// ---------------------------------------------------------------------------

/// A compatible staged migration runs only under proven quiescence, and the
/// receipt that would activate it is one complete release-set receipt.
///
/// The range authority is driven over real revisions, the transaction is driven
/// through its real boundaries — admission closed, consistency group captured —
/// and the staged migration program is resolved capsule-relative INSIDE the
/// installed tree and really invoked under the quiescence witness the transaction
/// minted. The activation that commits the one receipt is reachable only through
/// the sealed release authority, so a run without it reports that gap rather than
/// claiming a receipt nobody committed.
pub(crate) fn case_staged_migration(artifact: &Artifact) -> CaseResult {
    let runtime = artifact.a2a_runtime()?;
    let paths = artifact.product_paths_named("migration")?;
    let guard = hold_installation(&paths, "certify-migration")?;
    let outcome = drive_staged_migration(&paths, &guard, &artifact.tree_root, &runtime);
    release_installation(guard)?;
    outcome
}

fn drive_staged_migration(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    tree_root: &Path,
    runtime: &Path,
) -> CaseResult {
    // An incompatible move is refused by the range authority before anything is
    // staged, and a compatible one is planned.
    let installed_head = "0009";
    let candidate = MigrationRangeSpec::new("0009", "0012")
        .map_err(|error| CaseError::failed(format!("the candidate range was refused: {error}")))?;
    let forward = plan_migration(Some(installed_head), &candidate)
        .map_err(|error| CaseError::failed(format!("a compatible move was refused: {error}")))?;
    if forward.decision() != MigrationDecision::Forward {
        return Err(CaseError::failed(format!(
            "a compatible single-step move planned as {:?}",
            forward.decision()
        )));
    }
    let incompatible = MigrationRangeSpec::new("0100", "0120")
        .map_err(|error| CaseError::failed(format!("the range was refused: {error}")))?;
    if plan_migration(Some(installed_head), &incompatible).is_ok() {
        return Err(CaseError::failed(
            "a move the installed head cannot reach was planned rather than refused".to_string(),
        ));
    }

    let plan = UpdatePlan::new(
        9_101,
        "certify-migration-candidate",
        None,
        Channel::SelfInstall,
        "0012",
    )
    .map_err(|error| CaseError::failed(format!("the update plan was refused: {error}")))?;
    let mut transaction = UpdateTransaction::begin(paths.clone(), guard, plan)
        .map_err(|error| CaseError::failed(format!("the transaction could not begin: {error}")))?;
    let quiescence = transaction
        .assert_cold_stopped()
        .map_err(|error| CaseError::failed(format!("admission would not close: {error}")))?;
    transaction
        .snapshot(&certification_group(paths)?)
        .map_err(|error| CaseError::failed(format!("the consistency group failed: {error}")))?;

    // The staged program is the installed runtime, resolved capsule-relative
    // inside the candidate tree so it can never escape it, and really invoked
    // under the transaction's own quiescence witness.
    // The program is named by the installed runtime itself, so the resolution
    // can only ever land on the binary that is really there.
    let runtime_name = runtime
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            CaseError::failed("the installed runtime has no portable file name".to_string())
        })?;
    let staged = StagedMigration::from_capsule_relative(
        &tree_root.join("a2a"),
        &[runtime_name],
        [
            std::ffi::OsString::from("status"),
            std::ffi::OsString::from("--app-home"),
            std::ffi::OsString::from(paths.app_home()),
        ],
        MigrationLimits::new(MIGRATION_OUTPUT_CAP, MIGRATION_WALL),
    )
    .map_err(|error| {
        CaseError::failed(format!(
            "the staged migration program could not be resolved: {error}"
        ))
    })?;

    // An already-current plan runs nothing at all: a migration is never invoked
    // speculatively.
    let already = plan_migration(Some("0012"), &candidate)
        .map_err(|error| CaseError::failed(format!("the current plan was refused: {error}")))?;
    let skipped = staged
        .run(&already, &quiescence)
        .map_err(|error| CaseError::failed(format!("an already-current plan invoked: {error}")))?;
    if !matches!(skipped, MigrationOutcome::Skipped) {
        return Err(CaseError::failed(format!(
            "an already-current plan produced {skipped:?} rather than running nothing"
        )));
    }

    // The forward plan really invokes the staged program inside its bounds.
    let invoked = staged.run(&forward, &quiescence);
    let ran = match invoked {
        Ok(outcome) => format!("{outcome:?}"),
        Err(error) => {
            transaction.rollback().map_err(|unwind| {
                CaseError::failed(format!("the transaction did not unwind: {unwind}"))
            })?;
            return Err(CaseError::failed(format!(
                "the staged migration invocation failed: {error}"
            )));
        }
    };
    transaction
        .migrate(&staged, &already, &quiescence)
        .map_err(|error| CaseError::failed(format!("the migration boundary failed: {error}")))?;

    // Activation is the commit, and it is reachable only through the sealed
    // release authority a verified distribution supplies.
    transaction
        .rollback()
        .map_err(|error| CaseError::failed(format!("the transaction did not unwind: {error}")))?;
    Err(EvidenceGap::SealedActivationUnavailable {
        proven: format!(
            "the range authority planned a compatible move and refused an unreachable one, admission closed, the consistency group was captured, and the staged migration ran inside the candidate tree ({ran})"
        ),
    }
    .into())
}

// Candidate failure and rollback
// ---------------------------------------------------------------------------

/// A candidate failure restores the prior files, the receipt journal, the state
/// snapshot, and leaves the prior dashboard runnable.
///
/// A real transaction captures a real consistency group, the stores and the
/// receipt journal are then really overwritten the way a failing candidate
/// overwrites them, and the transaction's own rollback is what restores them.
/// The restoration is proven byte-for-byte, the durable descriptor is proven
/// cleared, the snapshot is proven reclaimed, and the prior dashboard is proven
/// still verifiable from its own installed tree.
pub(crate) fn case_candidate_failure_rollback(artifact: &Artifact) -> CaseResult {
    let dashboard = artifact.dashboard()?;
    let paths = artifact.product_paths_named("rollback")?;
    let restored = drive_candidate_rollback(&paths)?;
    let root = display(&artifact.tree_root);
    require_success(
        "dashboard executable",
        &dashboard,
        &["verify-release", &root],
        &[],
        None,
    )?;
    Ok(format!(
        "{restored}, and the prior dashboard still verifies its own installed tree at {root}"
    ))
}

pub(crate) fn drive_candidate_rollback(paths: &ProductPaths) -> CaseResult {
    let guard = hold_installation(paths, "certify-rollback")?;
    let outcome = drive_candidate_rollback_under(paths, &guard);
    release_installation(guard)?;
    outcome
}

fn drive_candidate_rollback_under(paths: &ProductPaths, guard: &InstallLockGuard) -> CaseResult {
    let prior = seed_consistency_state(paths)?;
    let plan = UpdatePlan::new(
        9_201,
        "certify-rollback-candidate",
        Some("certify-rollback-prior".to_string()),
        Channel::SelfInstall,
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the update plan was refused: {error}")))?;
    let mut transaction = UpdateTransaction::begin(paths.clone(), guard, plan)
        .map_err(|error| CaseError::failed(format!("the transaction could not begin: {error}")))?;
    let _quiescence = transaction
        .assert_cold_stopped()
        .map_err(|error| CaseError::failed(format!("admission would not close: {error}")))?;
    transaction
        .snapshot(&certification_group(paths)?)
        .map_err(|error| CaseError::failed(format!("the consistency group failed: {error}")))?;

    // The candidate writes over every member, then fails.
    for member in &prior {
        std::fs::write(&member.path, b"candidate-overwrote-this").map_err(|error| {
            CaseError::failed(format!(
                "cannot simulate the candidate write at {}: {error}",
                display(&member.path)
            ))
        })?;
    }
    transaction
        .rollback()
        .map_err(|error| CaseError::failed(format!("the rollback failed: {error}")))?;

    for member in &prior {
        let observed = std::fs::read(&member.path).map_err(|error| {
            CaseError::failed(format!(
                "{} was not restored: {error}",
                display(&member.path)
            ))
        })?;
        if observed != member.bytes {
            return Err(CaseError::failed(format!(
                "{} did not come back with its prior bytes",
                display(&member.path)
            )));
        }
    }
    let descriptor = read_descriptor(paths, guard)
        .map_err(|error| CaseError::failed(format!("the descriptor is unreadable: {error}")))?;
    if descriptor.is_some() {
        return Err(CaseError::failed(
            "the durable transaction descriptor survived the rollback".to_string(),
        ));
    }
    let snapshot_dir = paths
        .snapshot_dir("9201")
        .map_err(|error| CaseError::failed(format!("the snapshot path is invalid: {error}")))?;
    if snapshot_dir.exists() {
        return Err(CaseError::failed(format!(
            "the consistency snapshot at {} was not reclaimed",
            display(&snapshot_dir)
        )));
    }
    Ok(format!(
        "{} restored members, the receipt journal among them, with the descriptor cleared and the snapshot reclaimed",
        prior.len()
    ))
}

// Interruption recovery
// ---------------------------------------------------------------------------

/// Interruption at every declared transaction boundary recovers deterministically
/// under the installation lock, with no split activation.
///
/// The recovery decision is proven total over EVERY declared boundary and both
/// commit states, and it is then really executed: a transaction is driven to a
/// boundary and abandoned exactly as an interrupted process abandons it — the
/// durable descriptor is what survives — and recovery resolves it under the held
/// lock. After each resolution the receipt journal is proven not to select the
/// candidate, so no interruption leaves a half-activated release, and re-running
/// recovery is proven idempotent.
pub(crate) fn case_interruption_recovery(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths_named("recovery")?;
    drive_interruption_recovery(&paths)
}

pub(crate) fn drive_interruption_recovery(paths: &ProductPaths) -> CaseResult {
    // Every declared boundary, both commit states: the decision is total and
    // deterministic before any of it is executed.
    let boundaries = [
        InterruptionMarker::Staged,
        InterruptionMarker::Draining,
        InterruptionMarker::Snapshotted,
        InterruptionMarker::Migrating,
        InterruptionMarker::Activated,
        InterruptionMarker::Accepted,
        InterruptionMarker::RollingBack,
    ];
    for boundary in boundaries {
        if plan_recovery(boundary, true) != RecoveryAction::RollForward {
            return Err(CaseError::failed(format!(
                "a committed candidate at {boundary:?} did not roll forward"
            )));
        }
        let expected = match boundary {
            InterruptionMarker::Staged | InterruptionMarker::Draining => RecoveryAction::Abort,
            _ => RecoveryAction::RollBack,
        };
        if plan_recovery(boundary, false) != expected {
            return Err(CaseError::failed(format!(
                "an uncommitted candidate at {boundary:?} did not resolve as {expected:?}"
            )));
        }
    }

    let guard = hold_installation(paths, "certify-recovery")?;
    let outcome = drive_interruption_recovery_under(paths, &guard, boundaries.len());
    release_installation(guard)?;
    outcome
}

fn drive_interruption_recovery_under(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    declared: usize,
) -> CaseResult {
    // No stand-in receipt journal here: recovery reads the receipt authority
    // itself, and an installation whose journal selects nothing is exactly the
    // state whose interruption must still resolve deterministically.
    seed_stores(paths)?;
    let executed = [
        (InterruptionMarker::Staged, RecoveryOutcome::Aborted),
        (InterruptionMarker::Draining, RecoveryOutcome::Aborted),
        (InterruptionMarker::Snapshotted, RecoveryOutcome::RolledBack),
    ];
    for (index, (boundary, expected)) in executed.iter().enumerate() {
        let generation = 9_300 + u64::try_from(index).unwrap_or(0);
        interrupt_at(paths, guard, generation, *boundary)?;

        let resolved = recover(paths, guard)
            .map_err(|error| CaseError::failed(format!("recovery at {boundary:?}: {error}")))?;
        if resolved != *expected {
            return Err(CaseError::failed(format!(
                "an interruption at {boundary:?} resolved as {resolved:?} rather than {expected:?}"
            )));
        }
        // No split activation: nothing selected the candidate.
        if selects_a_release(paths, guard)? {
            return Err(CaseError::failed(format!(
                "an interruption at {boundary:?} left an activated release behind"
            )));
        }
        if read_descriptor(paths, guard)
            .map_err(|error| CaseError::failed(format!("the descriptor is unreadable: {error}")))?
            .is_some()
        {
            return Err(CaseError::failed(format!(
                "the durable descriptor survived recovery at {boundary:?}"
            )));
        }
        // Idempotent: a crash DURING recovery is resolved by re-running it.
        let again = recover(paths, guard).map_err(|error| {
            CaseError::failed(format!("re-running recovery at {boundary:?}: {error}"))
        })?;
        if again != RecoveryOutcome::NoTransaction {
            return Err(CaseError::failed(format!(
                "re-running recovery at {boundary:?} produced {again:?} rather than nothing to do"
            )));
        }
    }
    Ok(format!(
        "{declared} declared boundaries resolve deterministically, {} were driven to real interruption and recovered under the installation lock with no activated release left behind",
        executed.len()
    ))
}

/// Drive a real transaction to `boundary` and abandon it, leaving exactly the
/// durable state an interrupted process leaves.
fn interrupt_at(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    generation: u64,
    boundary: InterruptionMarker,
) -> Result<(), CaseError> {
    let plan = UpdatePlan::new(
        generation,
        "certify-recovery-candidate",
        None,
        Channel::SelfInstall,
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the update plan was refused: {error}")))?;
    let mut transaction = UpdateTransaction::begin(paths.clone(), guard, plan)
        .map_err(|error| CaseError::failed(format!("the transaction could not begin: {error}")))?;
    if boundary == InterruptionMarker::Staged {
        std::mem::drop(transaction);
        return Ok(());
    }
    let _quiescence = transaction
        .assert_cold_stopped()
        .map_err(|error| CaseError::failed(format!("admission would not close: {error}")))?;
    if boundary == InterruptionMarker::Draining {
        std::mem::drop(transaction);
        return Ok(());
    }
    transaction
        .snapshot(&certification_group(paths)?)
        .map_err(|error| CaseError::failed(format!("the consistency group failed: {error}")))?;
    std::mem::drop(transaction);
    Ok(())
}

/// Whether the fixed receipt journal selects any release at all.
fn selects_a_release(paths: &ProductPaths, guard: &InstallLockGuard) -> Result<bool, CaseError> {
    use vaultspec_product::provisioning::{ActiveReleaseState, observe_active_release};

    let state = observe_active_release(paths, guard)
        .and_then(|observation| observation.state())
        .map_err(|error| {
            CaseError::failed(format!("the receipt authority is unobservable: {error}"))
        })?;
    Ok(matches!(state, ActiveReleaseState::Settled(_)))
}

// The one consistency snapshot generation
// ---------------------------------------------------------------------------

/// The primary store, its sidecars, every other schema-bearing store, the
/// receipt journal, and the prior seat are captured and restored as ONE
/// consistent generation.
///
/// Real files are written for every member, one snapshot generation captures
/// them together, all of them are then mutated, and the restore is proven to
/// bring every member back at once — not a subset. A member of the snapshot
/// itself is then altered to prove the group fails closed rather than restoring
/// a drifted generation.
pub(crate) fn case_consistency_snapshot(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths_named("snapshot")?;
    drive_consistency_snapshot(&paths)
}

pub(crate) fn drive_consistency_snapshot(paths: &ProductPaths) -> CaseResult {
    let guard = hold_installation(paths, "certify-snapshot")?;
    let outcome = drive_consistency_snapshot_under(paths, &guard);
    release_installation(guard)?;
    outcome
}

fn drive_consistency_snapshot_under(paths: &ProductPaths, guard: &InstallLockGuard) -> CaseResult {
    let members = seed_consistency_state(paths)?;
    let generation = 9_401_u64;
    let snapshot =
        capture_consistency_snapshot(paths, guard, generation, &certification_group(paths)?)
            .map_err(|error| {
                CaseError::failed(format!("the group could not be captured: {error}"))
            })?;
    if !snapshot.captured_receipt_journal() {
        return Err(CaseError::failed(
            "the receipt journal was not captured with the group".to_string(),
        ));
    }
    let seat = snapshot
        .prior_seat()
        .ok_or_else(|| {
            CaseError::failed("the prior seat was not captured with the group".to_string())
        })?
        .clone();
    let captured_stores = snapshot.store_ids().len();

    for member in &members {
        std::fs::write(&member.path, b"a later generation wrote this").map_err(|error| {
            CaseError::failed(format!("cannot mutate {}: {error}", display(&member.path)))
        })?;
    }
    snapshot
        .restore(paths, guard)
        .map_err(|error| CaseError::failed(format!("the group could not be restored: {error}")))?;
    for member in &members {
        let observed = std::fs::read(&member.path).map_err(|error| {
            CaseError::failed(format!(
                "{} was not restored: {error}",
                display(&member.path)
            ))
        })?;
        if observed != member.bytes {
            return Err(CaseError::failed(format!(
                "{} did not come back with the captured bytes",
                display(&member.path)
            )));
        }
    }

    // Reopened, the generation is the same one — and a drifted member makes the
    // whole group refuse rather than partially restore.
    let reopened = open_consistency_snapshot(paths, guard, generation)
        .map_err(|error| CaseError::failed(format!("the group could not be reopened: {error}")))?;
    if reopened.prior_seat() != Some(&seat) {
        return Err(CaseError::failed(
            "the reopened generation lost the prior seat it captured".to_string(),
        ));
    }
    let drifted = paths
        .snapshot_dir(&generation.to_string())
        .map_err(|error| CaseError::failed(format!("the snapshot path is invalid: {error}")))?
        .join("stores")
        .join("primary-store")
        .join("primary");
    std::fs::write(&drifted, b"a drifted snapshot member")
        .map_err(|error| CaseError::failed(format!("cannot alter a snapshot member: {error}")))?;
    if open_consistency_snapshot(paths, guard, generation).is_ok() {
        return Err(CaseError::failed(
            "a drifted snapshot generation reopened rather than failing closed".to_string(),
        ));
    }
    Ok(format!(
        "{captured_stores} schema-bearing stores, their sidecars, the receipt journal, and the prior seat for generation {} were captured and restored as one generation, and a drifted member failed closed",
        seat.generation
    ))
}

// Removal
// ---------------------------------------------------------------------------

/// Removal deletes the owned generations and receipts while PRESERVING mutable
/// data unless an explicit typed data removal is requested.
///
/// Real generation trees, a real receipt, and real mutable user data are laid
/// down, and the product's own removal authority is driven over them. Data
/// preservation is proven byte-for-byte across the untyped removal; a removal
/// that cannot delete the owned generations it is asked to delete is reported as
/// a failure of the property, never as a pass.
pub(crate) fn case_removal_preserves_data(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths_named("removal")?;
    drive_removal(&paths)
}

pub(crate) fn drive_removal(paths: &ProductPaths) -> CaseResult {
    let generation = paths
        .generation_dir("certify-removal-generation")
        .map_err(|error| CaseError::failed(format!("the generation path is invalid: {error}")))?;
    std::fs::create_dir_all(&generation)
        .map_err(|error| CaseError::failed(format!("cannot lay down a generation: {error}")))?;
    std::fs::write(generation.join("immutable.bin"), b"installed release bytes")
        .map_err(|error| CaseError::failed(format!("cannot lay down release bytes: {error}")))?;
    let data = paths.data_dir().join("certify-user-store.db");
    std::fs::write(&data, MUTABLE_STORE_BYTES)
        .map_err(|error| CaseError::failed(format!("cannot lay down user data: {error}")))?;

    let controller = LifecycleController::new(paths.clone());
    let untyped = controller.remove(false);

    // Whatever the removal did, the untyped request may never have deleted data.
    let preserved = std::fs::read(&data).map_err(|error| {
        CaseError::failed(format!(
            "mutable user data did not survive removal: {error}"
        ))
    })?;
    if preserved != MUTABLE_STORE_BYTES {
        return Err(CaseError::failed(format!(
            "an untyped removal rewrote the mutable store at {}",
            display(&data)
        )));
    }
    match untyped {
        Ok(()) => {}
        Err(error) => {
            return Err(CaseError::failed(format!(
                "removal preserved data but did not delete the owned generation it was asked to remove: {error}"
            )));
        }
    }
    if generation.exists() {
        return Err(CaseError::failed(format!(
            "the owned generation at {} survived removal",
            display(&generation)
        )));
    }
    if paths.receipt_path().exists() || paths.active_receipts_journal_path().exists() {
        return Err(CaseError::failed(
            "an owned receipt survived removal".to_string(),
        ));
    }
    Ok(format!(
        "the owned generation and receipts were removed while the mutable store at {} stayed byte-identical",
        display(&data)
    ))
}

// The offline default execution path
// ---------------------------------------------------------------------------

/// The installed runtime's default execution path really runs OFFLINE, with no
/// repository dependency tree in reach and no runtime acquisition.
///
/// The host is proven to have no outbound reach first, so nothing can be
/// acquired mid-run. The runtime is then dispatched from a working directory
/// that carries no installed dependency tree, and its resident service surface is
/// really started out of the installed tree and proven to stay up — a frozen
/// closure that needed an acquisition or a repository dependency tree cannot do
/// that on an isolated host.
pub(crate) fn case_offline_default_provider_run(artifact: &Artifact) -> CaseResult {
    require_network_removed()?;
    let runtime = artifact.a2a_runtime()?;
    let paths = artifact.product_paths_named("offline-run")?;
    let cwd = artifact.workspace.join("certify-offline-cwd");
    std::fs::create_dir_all(&cwd)
        .map_err(|error| CaseError::failed(format!("cannot create the run directory: {error}")))?;
    if cwd.join("node_modules").exists() {
        return Err(CaseError::failed(format!(
            "the run directory {} carries an installed dependency tree",
            display(&cwd)
        )));
    }

    // Dispatch the runtime's own verbs from that directory: a real execution,
    // offline, with nothing to acquire from.
    let prepared = run_frozen_verb(&runtime, "setup", &paths.app_home())?;

    // The resident service surface, really started out of the installed tree.
    let app_home = display(&paths.app_home());
    let resident = SupervisedChild::spawn(
        &runtime,
        &["serve"],
        &[
            ("VAULTSPEC_DESKTOP_APP_HOME".to_string(), app_home.clone()),
            ("VAULTSPEC_APP_HOME".to_string(), app_home),
        ],
        Some(&cwd),
    )
    .map_err(|failure| CaseError::failed(format!("the resident service surface {failure}")))?;
    let up = resident.settle(GATEWAY_SETTLE);
    let pid = resident.pid();
    drop(resident);
    if !up {
        return Err(CaseError::failed(
            "the resident service surface exited inside its own startup on an isolated host"
                .to_string(),
        ));
    }
    if cwd.join("node_modules").exists() {
        return Err(CaseError::failed(
            "the offline run materialized a dependency tree in its working directory".to_string(),
        ));
    }
    Ok(format!(
        "offline preparation dispatched reporting `{}` and the resident service surface ran as process {pid} from a directory with no dependency tree, on a host with no outbound reach",
        prepared.state
    ))
}

// Shared real state
// ---------------------------------------------------------------------------

/// One captured member and the exact bytes it must come back with.
pub(crate) struct SeededMember {
    pub(crate) path: PathBuf,
    pub(crate) bytes: Vec<u8>,
}

/// The consistency group every release-set case is proven over: a primary store
/// with both SQLite sidecars, a second schema-bearing store, and the prior seat.
fn certification_group(paths: &ProductPaths) -> Result<ConsistencyGroupSpec, CaseError> {
    let primary = SchemaBearingStore::new(
        "primary-store",
        ["data", "certify-primary.db"],
        "vaultspec-a2a",
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the primary store was refused: {error}")))?;
    let checkpoint = SchemaBearingStore::new(
        "checkpoint-store",
        ["data", "certify-checkpoint.db"],
        "vaultspec-a2a",
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the checkpoint store was refused: {error}")))?;
    let _ = paths;
    ConsistencyGroupSpec::new(
        [primary, checkpoint],
        Some(PriorSeatIdentity {
            generation: "certify-prior-generation".to_string(),
            dashboard_version: "0.0.0".to_string(),
            pid: Some(std::process::id()),
        }),
    )
    .map_err(|error| CaseError::failed(format!("the consistency group was refused: {error}")))
}

/// Write the real files the consistency group covers, plus a retained receipt
/// journal, returning each member with the bytes a restore must reproduce.
fn seed_consistency_state(paths: &ProductPaths) -> Result<Vec<SeededMember>, CaseError> {
    let mut members = seed_stores(paths)?;
    let journal = paths.active_receipts_journal_path();
    let journal_bytes = b"certify-retained-receipt-journal".to_vec();
    std::fs::write(&journal, &journal_bytes)
        .map_err(|error| CaseError::failed(format!("cannot seed the receipt journal: {error}")))?;
    members.push(SeededMember {
        path: journal,
        bytes: journal_bytes,
    });
    Ok(members)
}

/// Write the real store files the consistency group covers, leaving the receipt
/// journal to the authority that owns it.
fn seed_stores(paths: &ProductPaths) -> Result<Vec<SeededMember>, CaseError> {
    let data = paths.data_dir();
    std::fs::create_dir_all(&data)
        .map_err(|error| CaseError::failed(format!("cannot create the data directory: {error}")))?;
    let mut members = Vec::new();
    for (name, marker) in [
        ("certify-primary.db", b"primary" as &[u8]),
        ("certify-checkpoint.db", b"checkpoint"),
    ] {
        for suffix in ["", "-wal", "-shm"] {
            let path = data.join(format!("{name}{suffix}"));
            let mut bytes = marker.to_vec();
            bytes.extend_from_slice(suffix.as_bytes());
            bytes.extend_from_slice(MUTABLE_STORE_BYTES);
            std::fs::write(&path, &bytes).map_err(|error| {
                CaseError::failed(format!("cannot seed {}: {error}", display(&path)))
            })?;
            members.push(SeededMember { path, bytes });
        }
    }
    Ok(members)
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A real product state root, established exactly as a case establishes one
    /// against a published artifact: the product's own path authority plus the
    /// owner-private directories its retained authority requires.
    fn real_product_paths(temp: &tempfile::TempDir) -> ProductPaths {
        crate::artifact::establish_product_state(temp.path(), "test").unwrap()
    }

    /// Every member of one real consistency group is captured and restored
    /// together, and a drifted snapshot member fails closed.
    #[test]
    fn one_generation_captures_and_restores_every_member() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_consistency_snapshot(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("one generation"),
            "the group must restore as one generation: {evidence}"
        );
    }

    /// A candidate that overwrites every member is undone by the transaction's
    /// own rollback, with the descriptor cleared and the snapshot reclaimed.
    #[test]
    fn a_failed_candidate_is_rolled_back_to_its_prior_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_candidate_rollback(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("restored members"),
            "the restoration must be proven: {evidence}"
        );
    }

    /// Interruption at each executed boundary recovers deterministically, leaves
    /// no activated release, and re-running recovery is a no-op.
    #[test]
    fn interruption_at_each_boundary_recovers_deterministically() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_interruption_recovery(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("no activated release"),
            "no split activation must be proven: {evidence}"
        );
    }

    /// The removal drive never deletes mutable data, and reports the removal it
    /// could not perform as a failure rather than a pass.
    #[test]
    fn removal_never_deletes_data_without_a_typed_request() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let outcome = drive_removal(&paths);
        let data = paths.data_dir().join("certify-user-store.db");
        assert_eq!(
            std::fs::read(&data).unwrap(),
            MUTABLE_STORE_BYTES,
            "mutable data survives every removal that was not typed"
        );
        if let Err(CaseError::Failed(detail)) = outcome {
            assert!(
                detail.contains("preserved data"),
                "a refused removal is reported as the property failing: {detail}"
            );
        }
    }
}
