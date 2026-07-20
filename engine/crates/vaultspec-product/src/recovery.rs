//! Deterministic interruption recovery (a2a-product-provisioning W03.P06.S53).
//!
//! An external-update transaction can be interrupted at any declared boundary.
//! Recovery resolves the outcome deterministically from two durable authorities:
//! the transaction descriptor's phase (S52) and the fixed active-receipt journal
//! (the commit authority). It never guesses.
//!
//! The fixed receipt is the sole commit point: the candidate is committed iff it
//! is the live active generation the receipt journal selects. Given that fact and
//! the durable phase, the recovery decision is total:
//!
//! - **committed** (the receipt selects the candidate) → roll FORWARD: the release
//!   is live; clear the descriptor.
//! - **not committed**, `Staged`/`Draining` → ABORT: nothing durable was mutated
//!   (no snapshot yet); clear the descriptor, leaving the prior release intact.
//! - **not committed**, `Snapshotted`/`Migrating`/`Activated`/`Accepted`/
//!   `RollingBack` → roll BACK: restore the consistency snapshot to undo any store
//!   or activation mutation, then clear the descriptor.
//!
//! Recovery is idempotent: snapshot restore and descriptor clear can be re-run, so
//! a crash during recovery is resolved by re-running it. A receipt journal that is
//! itself recovery-required cannot confirm a commit, so recovery conservatively
//! rolls back (restoring the snapshot is always safe) and defers the receipt
//! journal's own normalization to its writer.

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::paths::ProductPaths;
use crate::provisioning::{ActiveReleaseState, observe_active_release};
use crate::receipt::InterruptionMarker;
use crate::snapshot::{SnapshotError, open_consistency_snapshot, reclaim_consistency_snapshot};
use crate::transaction::{TransactionError, clear_descriptor, read_descriptor};

/// The deterministic action recovery takes for one interrupted transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryAction {
    /// The committed release is live; clear the descriptor.
    RollForward,
    /// Restore the consistency snapshot, then clear the descriptor.
    RollBack,
    /// Nothing durable was mutated; clear the descriptor and leave the prior
    /// release intact.
    Abort,
}

/// Decide the recovery action from the durable phase and whether the fixed
/// receipt has committed the candidate. Pure and total.
#[must_use]
pub fn plan_recovery(phase: InterruptionMarker, candidate_committed: bool) -> RecoveryAction {
    if candidate_committed {
        return RecoveryAction::RollForward;
    }
    match phase {
        InterruptionMarker::Staged | InterruptionMarker::Draining => RecoveryAction::Abort,
        InterruptionMarker::Snapshotted
        | InterruptionMarker::Migrating
        | InterruptionMarker::Activated
        | InterruptionMarker::Accepted
        | InterruptionMarker::RollingBack => RecoveryAction::RollBack,
    }
}

/// The outcome of resolving an interrupted transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryOutcome {
    /// No durable transaction descriptor exists; nothing to recover.
    NoTransaction,
    /// The committed release was rolled forward (descriptor cleared).
    RolledForward,
    /// The consistency snapshot was restored and the descriptor cleared.
    RolledBack,
    /// Nothing durable was mutated; the descriptor was cleared.
    Aborted,
}

/// Recover any interrupted update transaction under the held installation guard.
///
/// Reads the durable descriptor and the fixed active-receipt journal, decides the
/// deterministic action, and executes it. Idempotent.
pub fn recover(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<RecoveryOutcome, RecoveryError> {
    guard.verify_for_product(paths)?;
    let Some(descriptor) = read_descriptor(paths, guard)? else {
        return Ok(RecoveryOutcome::NoTransaction);
    };

    let candidate_committed = candidate_is_live(paths, guard, descriptor.candidate_generation())?;
    let generation = descriptor.consistency_generation();
    match plan_recovery(descriptor.phase(), candidate_committed) {
        RecoveryAction::RollForward => {
            clear_descriptor(paths)?;
            reclaim_consistency_snapshot(paths, guard, generation)?;
            Ok(RecoveryOutcome::RolledForward)
        }
        RecoveryAction::RollBack => {
            let snapshot = open_consistency_snapshot(paths, guard, generation)?;
            snapshot.restore(paths, guard)?;
            clear_descriptor(paths)?;
            reclaim_consistency_snapshot(paths, guard, generation)?;
            Ok(RecoveryOutcome::RolledBack)
        }
        RecoveryAction::Abort => {
            clear_descriptor(paths)?;
            reclaim_consistency_snapshot(paths, guard, generation)?;
            Ok(RecoveryOutcome::Aborted)
        }
    }
}

/// Whether the fixed receipt journal selects `candidate` as the live active
/// generation. A recovery-required or unverifiable journal cannot confirm a
/// commit, so it is treated as not committed (a conservative roll back).
fn candidate_is_live(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    candidate: &str,
) -> Result<bool, RecoveryError> {
    let observation =
        observe_active_release(paths, guard).map_err(|_| RecoveryError::ReceiptAuthority)?;
    match observation
        .state()
        .map_err(|_| RecoveryError::ReceiptAuthority)?
    {
        ActiveReleaseState::Settled(release) => Ok(release.active_generation() == candidate),
        ActiveReleaseState::Absent | ActiveReleaseState::RecoveryRequired(_) => Ok(false),
    }
}

/// Why interruption recovery could not complete.
#[derive(Debug)]
pub enum RecoveryError {
    /// The held guard is not the canonical product installation authority.
    LockAuthority(LockAuthorityError),
    /// The fixed receipt authority could not be observed.
    ReceiptAuthority,
    /// A durable descriptor operation failed.
    Transaction(TransactionError),
    /// Restoring the consistency snapshot failed.
    Snapshot(SnapshotError),
}

impl From<LockAuthorityError> for RecoveryError {
    fn from(error: LockAuthorityError) -> Self {
        Self::LockAuthority(error)
    }
}

impl From<TransactionError> for RecoveryError {
    fn from(error: TransactionError) -> Self {
        Self::Transaction(error)
    }
}

impl From<SnapshotError> for RecoveryError {
    fn from(error: SnapshotError) -> Self {
        Self::Snapshot(error)
    }
}

impl std::fmt::Display for RecoveryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::ReceiptAuthority => write!(f, "fixed receipt authority could not be observed"),
            Self::Transaction(error) => {
                write!(f, "transaction descriptor recovery failed: {error}")
            }
            Self::Snapshot(error) => write!(f, "consistency snapshot restore failed: {error}"),
        }
    }
}

impl std::error::Error for RecoveryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::LockAuthority(error) => Some(error),
            Self::Transaction(error) => Some(error),
            Self::Snapshot(error) => Some(error),
            Self::ReceiptAuthority => None,
        }
    }
}

#[cfg(test)]
#[path = "recovery/tests.rs"]
mod tests;
