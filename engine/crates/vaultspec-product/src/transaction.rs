//! The ordered external-update transaction (a2a-product-provisioning W03.P06.S52).
//!
//! The copied external updater runs a fixed, durable, recoverable transaction.
//! The ordered phases — recorded in a durable descriptor so an interruption at
//! any boundary is resolvable (S53) — are:
//!
//! 1. **acquire the install lock** (`Actor::CopiedUpdater`) — done by the caller
//!    before `begin`, and reproven on every phase;
//! 2. **stage** the candidate (`Staged`);
//! 3. **drain and stop** the owned runtime (`Draining`), yielding proven
//!    [`Quiescence`];
//! 4. **snapshot and verify** the consistency group (`Snapshotted`, S49);
//! 5. **run the staged migration** under quiescence (`Migrating`, S50);
//! 6. **activate** the verified final-name generation (`Activated`) — atomic
//!    receipt selection is the commit;
//! 7. **relaunch and probe** acceptance (`Accepted`).
//!
//! Any failure before the receipt commits transitions to `RollingBack`: the
//! consistency snapshot is restored and the prior generation is re-selected,
//! leaving no split release set. Every phase transition is persisted to the
//! durable descriptor BEFORE the next effect, and the guard authority is reproven
//! at every step.
//!
//! Steps 6–7 (materialize the verified generation and select the fixed receipt)
//! consume the sealed release authority and are performed by the updater over the
//! materializer/receipt boundary; this module owns the ordered state machine, the
//! durable descriptor, and the real drain/stop, snapshot, migration, and rollback
//! effects, and hands off a [`ReadyToActivate`] token at the activation boundary.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::migration::{MigrationError, MigrationPlan, Quiescence, StagedMigration};
use crate::paths::ProductPaths;
use crate::process::{GatewayProcess, Termination};
use crate::receipt::{Channel, InterruptionMarker};
use crate::snapshot::{
    ConsistencyGroupSpec, ConsistencySnapshot, SnapshotError, capture_consistency_snapshot,
    open_consistency_snapshot, reclaim_consistency_snapshot,
};

const DESCRIPTOR_NAME: &str = "update.v1";
const DESCRIPTOR_TMP: &str = "update.v1.tmp";
const DESCRIPTOR_VERSION: u8 = 1;
const MAX_DESCRIPTOR_BYTES: u64 = 64 * 1024;

/// The immutable facts of one update transaction, recorded durably so recovery
/// can resume or roll back deterministically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdatePlan {
    consistency_generation: u64,
    candidate_generation: String,
    prior_generation: Option<String>,
    channel: Channel,
    target_head: String,
}

impl UpdatePlan {
    /// Assemble the plan facts. The candidate and prior generation identifiers are
    /// validated against the product path grammar so they can never escape the
    /// product root.
    pub fn new(
        consistency_generation: u64,
        candidate_generation: impl Into<String>,
        prior_generation: Option<String>,
        channel: Channel,
        target_head: impl Into<String>,
    ) -> Result<Self, TransactionError> {
        let candidate_generation = candidate_generation.into();
        crate::paths::validate_generation(&candidate_generation)
            .map_err(|error| TransactionError::InvalidPlan(error.to_string()))?;
        if let Some(prior) = &prior_generation {
            crate::paths::validate_generation(prior)
                .map_err(|error| TransactionError::InvalidPlan(error.to_string()))?;
        }
        let target_head = target_head.into();
        if target_head.is_empty() || target_head.len() > 64 {
            return Err(TransactionError::InvalidPlan(
                "target head must be non-empty and bounded".to_string(),
            ));
        }
        Ok(Self {
            consistency_generation,
            candidate_generation,
            prior_generation,
            channel,
            target_head,
        })
    }

    /// The consistency-group generation this transaction snapshots and restores.
    #[must_use]
    pub fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    /// The final-name candidate generation the transaction activates.
    #[must_use]
    pub fn candidate_generation(&self) -> &str {
        &self.candidate_generation
    }

    /// The retained prior generation a rollback re-selects, if any.
    #[must_use]
    pub fn prior_generation(&self) -> Option<&str> {
        self.prior_generation.as_deref()
    }

    /// The installer channel that owns activation.
    #[must_use]
    pub fn channel(&self) -> Channel {
        self.channel
    }
}

/// The durable transaction descriptor. Its presence and phase are the recovery
/// authority; it carries no secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateDescriptor {
    version: u8,
    phase: InterruptionMarker,
    consistency_generation: u64,
    candidate_generation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    prior_generation: Option<String>,
    channel: Channel,
    target_head: String,
}

impl UpdateDescriptor {
    /// The durable transaction phase.
    #[must_use]
    pub fn phase(&self) -> InterruptionMarker {
        self.phase
    }

    /// The consistency generation the transaction snapshots and restores.
    #[must_use]
    pub fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    /// The final-name candidate generation.
    #[must_use]
    pub fn candidate_generation(&self) -> &str {
        &self.candidate_generation
    }

    /// The retained prior generation a rollback re-selects, if any.
    #[must_use]
    pub fn prior_generation(&self) -> Option<&str> {
        self.prior_generation.as_deref()
    }

    /// The installer channel that owns activation.
    #[must_use]
    pub fn channel(&self) -> Channel {
        self.channel
    }

    fn from_plan(plan: &UpdatePlan, phase: InterruptionMarker) -> Self {
        Self {
            version: DESCRIPTOR_VERSION,
            phase,
            consistency_generation: plan.consistency_generation,
            candidate_generation: plan.candidate_generation.clone(),
            prior_generation: plan.prior_generation.clone(),
            channel: plan.channel,
            target_head: plan.target_head.clone(),
        }
    }
}

/// The pure result of one transaction step, fed to the phase planner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepResult {
    /// The step succeeded; advance to the next phase.
    Advanced,
    /// The step failed before the receipt committed; roll back.
    Failed,
}

/// Plan the next durable phase from the current phase and a step result.
///
/// Pure and total: forward on success through the fixed order, `RollingBack` on
/// any failure before the receipt commit, and terminal once accepted or rolling
/// back. A failure at or after `Accepted` cannot roll back a committed release —
/// the receipt has already selected the candidate — so it stays `Accepted`.
#[must_use]
pub fn plan_next(phase: InterruptionMarker, result: StepResult) -> InterruptionMarker {
    use InterruptionMarker::{
        Accepted, Activated, Draining, Migrating, RollingBack, Snapshotted, Staged,
    };
    match (phase, result) {
        (Accepted, _) => Accepted,
        (RollingBack, _) => RollingBack,
        (_, StepResult::Failed) => RollingBack,
        (Staged, StepResult::Advanced) => Draining,
        (Draining, StepResult::Advanced) => Snapshotted,
        (Snapshotted, StepResult::Advanced) => Migrating,
        (Migrating, StepResult::Advanced) => Activated,
        (Activated, StepResult::Advanced) => Accepted,
    }
}

/// The ordered update transaction bound to the held installation guard.
#[derive(Debug)]
pub struct UpdateTransaction<'guard> {
    paths: ProductPaths,
    guard: &'guard InstallLockGuard,
    plan: UpdatePlan,
    phase: InterruptionMarker,
    snapshot: Option<ConsistencySnapshot>,
}

impl<'guard> UpdateTransaction<'guard> {
    /// Begin a transaction: reprove the guard and durably record the `Staged`
    /// descriptor. The install lock must already be held by the caller.
    pub fn begin(
        paths: ProductPaths,
        guard: &'guard InstallLockGuard,
        plan: UpdatePlan,
    ) -> Result<Self, TransactionError> {
        guard.verify_for_product(&paths)?;
        let transaction = Self {
            paths,
            guard,
            plan,
            phase: InterruptionMarker::Staged,
            snapshot: None,
        };
        transaction.persist(InterruptionMarker::Staged)?;
        Ok(transaction)
    }

    /// The current durable phase.
    #[must_use]
    pub fn phase(&self) -> InterruptionMarker {
        self.phase
    }

    /// The retained validated plan (crate-internal: the materializer derives
    /// the candidate name and consistency generation from it, never from a
    /// caller).
    pub(crate) fn plan(&self) -> &UpdatePlan {
        &self.plan
    }

    /// The product paths this transaction binds (crate-internal).
    pub(crate) fn paths(&self) -> &ProductPaths {
        &self.paths
    }

    /// The held installation guard, at its own lifetime so the materializer
    /// can use it alongside a mutable product loan (crate-internal).
    pub(crate) fn guard(&self) -> &'guard InstallLockGuard {
        self.guard
    }

    /// Advance `Migrating` → `Activated` after the fixed receipt committed
    /// (crate-internal: only the sealed activation calls this).
    pub(crate) fn advance_activated(&mut self) -> Result<(), TransactionError> {
        self.expect_phase(InterruptionMarker::Migrating)?;
        self.advance(InterruptionMarker::Activated)
    }

    /// Drain and stop the owned runtime, advancing to `Draining` and yielding
    /// proven [`Quiescence`]. The gateway is terminated within the bounded
    /// graceful window; the descriptor advances only after the tree is stopped.
    pub fn drain_and_stop(
        &mut self,
        mut gateway: GatewayProcess,
        graceful: std::time::Duration,
    ) -> Result<(Quiescence, Termination), TransactionError> {
        self.expect_phase(InterruptionMarker::Staged)?;
        let termination = gateway
            .terminate_tree(graceful)
            .map_err(|error| self.fail(TransactionError::Stop(error)))?;
        self.advance(InterruptionMarker::Draining)?;
        Ok((Quiescence::asserted_after_stop(), termination))
    }

    /// Drain and stop the DISCOVERED owned gateway (the copied-updater path,
    /// S62), advancing to `Draining` and yielding proven [`Quiescence`].
    ///
    /// The copied updater holds no child handle — the exiting dashboard
    /// spawned the gateway — so the drive goes through the sealed
    /// [`crate::gateway_drain::OwnedGatewayLease`]: authenticated drain,
    /// ownership-authorized shutdown, and a PROVEN exit (pid dead AND endpoint
    /// silent) within the bounded deadlines. Quiescence is minted here, by the
    /// transaction that performed the drain, and nowhere else. A drive failure
    /// rolls the transaction back with the prior release intact.
    pub fn drain_and_stop_discovered(
        &mut self,
        lease: crate::gateway_drain::OwnedGatewayLease<'_>,
        deadlines: crate::gateway_drain::DrainDeadlines,
    ) -> Result<(Quiescence, crate::gateway_drain::StopEvidence), TransactionError> {
        self.expect_phase(InterruptionMarker::Staged)?;
        let evidence = lease
            .drain_and_stop(deadlines)
            .map_err(|error| self.fail(TransactionError::Gateway(error)))?;
        self.advance(InterruptionMarker::Draining)?;
        Ok((Quiescence::asserted_after_stop(), evidence))
    }

    /// Assert quiescence over a provably COLD installed gateway (the
    /// proceed-cold arm of the discovered-drive: installed-but-cleanly-stopped
    /// is a valid state with nothing to drain), advancing to `Draining` and
    /// minting the same [`Quiescence`] witness the drain path mints.
    ///
    /// Fail-closed TOCTOU guard: the discovery record is re-read under the
    /// verified guard and must be ABSENT. Any present record — live,
    /// starting, stale, or foreign — is a typed refusal and rolls the
    /// transaction back; a discoverable gateway goes through
    /// [`Self::drain_and_stop_discovered`] or the quarantine flow, never the
    /// cold path. The mint stays inside the transaction, exactly as for the
    /// proven drain.
    pub fn assert_cold_stopped(&mut self) -> Result<Quiescence, TransactionError> {
        self.expect_phase(InterruptionMarker::Staged)?;
        self.guard.verify_for_product(&self.paths)?;
        crate::gateway_drain::require_discovery_absent(&self.paths)
            .map_err(|error| self.fail(TransactionError::Gateway(error)))?;
        self.advance(InterruptionMarker::Draining)?;
        Ok(Quiescence::asserted_after_stop())
    }

    /// Capture and verify the consistency-group snapshot (S49), advancing to
    /// `Snapshotted`. The captured snapshot is retained for rollback.
    pub fn snapshot(&mut self, group: &ConsistencyGroupSpec) -> Result<(), TransactionError> {
        self.expect_phase(InterruptionMarker::Draining)?;
        let snapshot = capture_consistency_snapshot(
            &self.paths,
            self.guard,
            self.plan.consistency_generation,
            group,
        )
        .map_err(|error| self.fail(TransactionError::Snapshot(error)))?;
        self.snapshot = Some(snapshot);
        self.advance(InterruptionMarker::Snapshotted)?;
        Ok(())
    }

    /// Run the staged migration under proven quiescence (S50), advancing to
    /// `Migrating`. A migration failure rolls the transaction back.
    pub fn migrate(
        &mut self,
        staged: &StagedMigration,
        plan: &MigrationPlan,
        quiescence: &Quiescence,
    ) -> Result<(), TransactionError> {
        self.expect_phase(InterruptionMarker::Snapshotted)?;
        staged
            .run(plan, quiescence)
            .map_err(|error| self.fail(TransactionError::Migration(error)))?;
        self.advance(InterruptionMarker::Migrating)?;
        Ok(())
    }

    /// Reach the activation boundary. Materializing the verified generation and
    /// atomically selecting the fixed receipt (the commit) is performed by the
    /// updater over the sealed release authority; this hands off a token bound to
    /// the retained snapshot so the downstream activation can roll back through
    /// this transaction on failure.
    pub fn ready_to_activate(self) -> ReadyToActivate<'guard> {
        ReadyToActivate { transaction: self }
    }

    /// Finalize the accepted update after relaunch and probe: `Activated` →
    /// `Accepted`, then retire the durable descriptor and reclaim the
    /// consistency snapshot — the committed release no longer needs its
    /// rollback material. Terminal: consumes the transaction. An interruption
    /// at any boundary here resolves as roll-forward under recovery, because
    /// the fixed receipt already selects the candidate.
    pub fn mark_accepted(mut self) -> Result<(), TransactionError> {
        self.expect_phase(InterruptionMarker::Activated)?;
        self.advance(InterruptionMarker::Accepted)?;
        clear_descriptor(&self.paths)?;
        reclaim_consistency_snapshot(&self.paths, self.guard, self.plan.consistency_generation)
            .map_err(TransactionError::Snapshot)?;
        Ok(())
    }

    /// Roll the transaction back: record `RollingBack`, restore the consistency
    /// snapshot if one was captured, and clear the descriptor on success. Safe to
    /// call from any pre-commit phase and idempotent under recovery.
    pub fn rollback(mut self) -> Result<(), TransactionError> {
        self.rollback_in_place()
    }

    fn rollback_in_place(&mut self) -> Result<(), TransactionError> {
        self.persist(InterruptionMarker::RollingBack)?;
        self.phase = InterruptionMarker::RollingBack;
        if let Some(snapshot) = &self.snapshot {
            snapshot
                .restore(&self.paths, self.guard)
                .map_err(TransactionError::Snapshot)?;
        } else if let Ok(snapshot) =
            open_consistency_snapshot(&self.paths, self.guard, self.plan.consistency_generation)
        {
            snapshot
                .restore(&self.paths, self.guard)
                .map_err(TransactionError::Snapshot)?;
        }
        clear_descriptor(&self.paths)?;
        // Reclaim the snapshot now that the rollback has restored from it, so it
        // neither accumulates nor wedges a retry at the same generation.
        reclaim_consistency_snapshot(&self.paths, self.guard, self.plan.consistency_generation)
            .map_err(TransactionError::Snapshot)?;
        Ok(())
    }

    fn advance(&mut self, next: InterruptionMarker) -> Result<(), TransactionError> {
        self.persist(next)?;
        self.phase = next;
        Ok(())
    }

    fn persist(&self, phase: InterruptionMarker) -> Result<(), TransactionError> {
        self.guard.verify_for_product(&self.paths)?;
        let descriptor = UpdateDescriptor::from_plan(&self.plan, phase);
        write_descriptor(&self.paths, &descriptor)
    }

    fn expect_phase(&self, expected: InterruptionMarker) -> Result<(), TransactionError> {
        if self.phase == expected {
            Ok(())
        } else {
            Err(TransactionError::WrongPhase {
                expected,
                found: self.phase,
            })
        }
    }

    /// Record a failure by rolling back, preserving the ORIGINAL error. If the
    /// rollback itself fails, the original error is still returned — recovery
    /// (S53) resumes the durable `RollingBack` descriptor.
    fn fail(&mut self, error: TransactionError) -> TransactionError {
        let _ = self.rollback_in_place();
        error
    }
}

/// The activation-boundary handoff. The sealed activation (materialize the
/// verified generation, select the fixed receipt, relaunch, probe) consumes this;
/// on failure it rolls back through the retained transaction.
#[derive(Debug)]
pub struct ReadyToActivate<'guard> {
    transaction: UpdateTransaction<'guard>,
}

impl<'guard> ReadyToActivate<'guard> {
    /// Roll back the transaction if activation could not complete.
    pub fn rollback(self) -> Result<(), TransactionError> {
        self.transaction.rollback()
    }

    /// The retained transaction, for the sealed activation to advance to
    /// `Activated`/`Accepted` once it commits the receipt.
    #[must_use]
    pub fn into_transaction(self) -> UpdateTransaction<'guard> {
        self.transaction
    }
}

/// Read the durable transaction descriptor under the held guard, if one exists.
pub fn read_descriptor(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<Option<UpdateDescriptor>, TransactionError> {
    guard.verify_for_product(paths)?;
    let path = descriptor_path(paths);
    let bytes = match read_bounded_nofollow(&path, MAX_DESCRIPTOR_BYTES)? {
        Some(bytes) => bytes,
        None => return Ok(None),
    };
    let descriptor: UpdateDescriptor = serde_json::from_slice(&bytes)
        .map_err(|error| TransactionError::InvalidDescriptor(error.to_string()))?;
    if descriptor.version != DESCRIPTOR_VERSION {
        return Err(TransactionError::InvalidDescriptor(
            "unsupported descriptor version".to_string(),
        ));
    }
    Ok(Some(descriptor))
}

fn descriptor_path(paths: &ProductPaths) -> PathBuf {
    paths.transaction_dir().join(DESCRIPTOR_NAME)
}

impl UpdateTransaction<'_> {
    /// Drive the in-memory and durable phase directly, for tests that must
    /// arrange the activation boundary without re-running the real drain,
    /// snapshot, and migration effects (those have their own proofs).
    #[cfg(test)]
    pub(crate) fn force_phase_for_test(
        &mut self,
        phase: InterruptionMarker,
    ) -> Result<(), TransactionError> {
        self.persist(phase)?;
        self.phase = phase;
        Ok(())
    }
}

/// Persist a descriptor directly at a chosen phase, for recovery tests that must
/// reproduce an interruption at every declared boundary (including the downstream
/// `Activated`/`Accepted` phases this module hands off).
#[cfg(test)]
pub(crate) fn persist_descriptor_for_test(
    paths: &ProductPaths,
    plan: &UpdatePlan,
    phase: InterruptionMarker,
) -> Result<(), TransactionError> {
    write_descriptor(paths, &UpdateDescriptor::from_plan(plan, phase))
}

fn write_descriptor(
    paths: &ProductPaths,
    descriptor: &UpdateDescriptor,
) -> Result<(), TransactionError> {
    let bytes = serde_json::to_vec(descriptor)
        .map_err(|error| TransactionError::InvalidDescriptor(error.to_string()))?;
    if bytes.len() as u64 > MAX_DESCRIPTOR_BYTES {
        return Err(TransactionError::InvalidDescriptor(
            "descriptor exceeds byte bound".to_string(),
        ));
    }
    let dir = paths.transaction_dir();
    let tmp = dir.join(DESCRIPTOR_TMP);
    write_new_nofollow(&tmp, &bytes)?;
    std::fs::rename(&tmp, dir.join(DESCRIPTOR_NAME))
        .map_err(|error| TransactionError::io("descriptor commit rename", error))?;
    sync_dir(&dir)?;
    Ok(())
}

pub(crate) fn clear_descriptor(paths: &ProductPaths) -> Result<(), TransactionError> {
    match std::fs::remove_file(descriptor_path(paths)) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(TransactionError::io("descriptor clear", error)),
    }
    sync_dir(&paths.transaction_dir())
}

pub(crate) fn read_bounded_nofollow(
    path: &Path,
    cap: u64,
) -> Result<Option<Vec<u8>>, TransactionError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(TransactionError::io("descriptor open", error)),
    };
    let metadata = file
        .metadata()
        .map_err(|error| TransactionError::io("descriptor stat", error))?;
    if !metadata.is_file() {
        return Err(TransactionError::InvalidDescriptor(
            "descriptor is not a regular file".to_string(),
        ));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(cap + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| TransactionError::io("descriptor read", error))?;
    if bytes.len() as u64 > cap {
        return Err(TransactionError::InvalidDescriptor(
            "descriptor exceeds byte bound".to_string(),
        ));
    }
    Ok(Some(bytes))
}

pub(crate) fn write_new_nofollow(path: &Path, bytes: &[u8]) -> Result<(), TransactionError> {
    // Overwrite any stale temp from a prior interrupted write.
    match std::fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(TransactionError::io("descriptor temp clear", error)),
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC);
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|error| TransactionError::io("descriptor temp create", error))?;
    file.write_all(bytes)
        .map_err(|error| TransactionError::io("descriptor temp write", error))?;
    file.sync_all()
        .map_err(|error| TransactionError::io("descriptor temp sync", error))?;
    Ok(())
}

pub(crate) fn sync_dir(path: &Path) -> Result<(), TransactionError> {
    #[cfg(unix)]
    {
        let dir = std::fs::File::open(path)
            .map_err(|error| TransactionError::io("transaction directory open", error))?;
        dir.sync_all()
            .map_err(|error| TransactionError::io("transaction directory sync", error))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Why an update transaction step failed.
#[derive(Debug)]
pub enum TransactionError {
    /// The plan facts were invalid.
    InvalidPlan(String),
    /// A transaction step was invoked from the wrong durable phase.
    WrongPhase {
        /// The phase the step required.
        expected: InterruptionMarker,
        /// The phase the transaction was actually in.
        found: InterruptionMarker,
    },
    /// The durable descriptor was malformed.
    InvalidDescriptor(String),
    /// Draining/stopping the owned runtime failed.
    Stop(std::io::Error),
    /// Draining/stopping the DISCOVERED gateway failed (the updater path).
    Gateway(crate::gateway_drain::GatewayDrainError),
    /// A consistency-snapshot operation failed.
    Snapshot(SnapshotError),
    /// The staged migration failed.
    Migration(MigrationError),
    /// The held guard is not the canonical product installation authority.
    LockAuthority(LockAuthorityError),
    /// A filesystem operation on the descriptor failed.
    Io {
        /// The bounded stage.
        stage: &'static str,
        /// The operating-system error.
        source: std::io::Error,
    },
}

impl TransactionError {
    fn io(stage: &'static str, source: std::io::Error) -> Self {
        Self::Io { stage, source }
    }
}

impl From<LockAuthorityError> for TransactionError {
    fn from(error: LockAuthorityError) -> Self {
        Self::LockAuthority(error)
    }
}

impl std::fmt::Display for TransactionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPlan(detail) => write!(f, "invalid update plan: {detail}"),
            Self::WrongPhase { expected, found } => {
                write!(
                    f,
                    "transaction step requires phase {expected:?} but was {found:?}"
                )
            }
            Self::InvalidDescriptor(detail) => {
                write!(f, "invalid transaction descriptor: {detail}")
            }
            Self::Stop(error) => write!(f, "draining the owned runtime failed: {error}"),
            Self::Gateway(error) => {
                write!(f, "draining the discovered gateway failed: {error}")
            }
            Self::Snapshot(error) => write!(f, "consistency snapshot failed: {error}"),
            Self::Migration(error) => write!(f, "staged migration failed: {error}"),
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::Io { stage, source } => write!(f, "transaction {stage}: {source}"),
        }
    }
}

impl std::error::Error for TransactionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Stop(error) | Self::Io { source: error, .. } => Some(error),
            Self::Gateway(error) => Some(error),
            Self::Snapshot(error) => Some(error),
            Self::Migration(error) => Some(error),
            Self::LockAuthority(error) => Some(error),
            _ => None,
        }
    }
}

#[cfg(test)]
#[path = "transaction/tests.rs"]
mod tests;
