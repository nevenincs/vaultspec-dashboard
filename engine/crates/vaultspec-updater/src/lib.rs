//! The copied external updater (a2a-product-provisioning W03.P07).
//!
//! The updater is a separate, target-specific executable copied OUT of the active
//! release so it can replace the release — including the dashboard binary and the
//! installed updater — while the seated processes are exited. It consumes one
//! owner-restricted descriptor, acquires the installation lock as the
//! `CopiedUpdater` (never delegating lock ownership to the gateway), recovers any
//! interrupted prior transaction, and — for a fresh update — executes the ordered
//! transaction, delegating every authority check to `vaultspec-product`.
//!
//! This module is the TESTABLE RUNNER (S58): it owns descriptor parsing, the
//! owner-restricted + one-time contract, installation-lock acquisition, and
//! deterministic interruption recovery. The fresh-update EXECUTE path
//! (authenticated drain of the discovered gateway -> snapshot -> migrate ->
//! materialize -> receipt-commit SWAP) is the activation seam owned by the
//! materializer; the runner reaches it via the transaction/activation contract and
//! never implements the swap here.

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use vaultspec_product::discovery::handoff_is_owner_restricted;
use vaultspec_product::gateway_drain::{
    DrainContext, DrainDeadlines, GatewayDrainError, OwnedGatewayLease,
};
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::migration::{MigrationPlan, StagedMigration};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::recovery::{RecoveryError, RecoveryOutcome, recover};
use vaultspec_product::snapshot::ConsistencyGroupSpec;
use vaultspec_product::transaction::{TransactionError, UpdatePlan, UpdateTransaction};

/// The maximum owner-restricted descriptor size the updater will read.
const MAX_DESCRIPTOR_BYTES: u64 = 64 * 1024;
const DESCRIPTOR_VERSION: u8 = 1;
const MAX_OWNER_BYTES: usize = 1024;

/// The one-time, owner-restricted handoff descriptor the dashboard writes for the
/// copied updater. It carries no secret: the machine app home the updater derives
/// its product paths from, the installation-lock owner id, and the optional
/// prior-seat relaunch instruction.
///
/// The fresh-update EXECUTE intent (candidate release, consistency group, channel)
/// is deliberately NOT part of this minimal contract yet — it is defined by the
/// materializer's activation-seam contract and joins the descriptor when that
/// lands, rather than being guessed here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdaterDescriptor {
    /// Descriptor grammar version.
    pub version: u8,
    /// The machine app home the updater derives its product paths from.
    pub app_home: PathBuf,
    /// The installation-lock owner id the updater acquires under.
    pub owner: String,
    /// How to relaunch the prior seat after the run, when one should be relaunched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relaunch: Option<RelaunchSpec>,
}

impl UpdaterDescriptor {
    fn validate(&self) -> Result<(), UpdaterError> {
        if self.version != DESCRIPTOR_VERSION {
            return Err(UpdaterError::Descriptor("unsupported descriptor version"));
        }
        if !self.app_home.is_absolute() {
            return Err(UpdaterError::Descriptor(
                "app home must be an absolute path",
            ));
        }
        let owner = self.owner.trim();
        if owner.is_empty()
            || self.owner.len() > MAX_OWNER_BYTES
            || self.owner.chars().any(char::is_control)
        {
            return Err(UpdaterError::Descriptor(
                "owner must be non-empty, bounded, control-free text",
            ));
        }
        if let Some(relaunch) = &self.relaunch {
            relaunch.validate()?;
        }
        Ok(())
    }
}

/// How the updater relaunches the prior seat after completing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelaunchSpec {
    /// The workspace directory to relaunch the seat in.
    pub workspace: PathBuf,
}

impl RelaunchSpec {
    fn validate(&self) -> Result<(), UpdaterError> {
        if self.workspace.as_os_str().is_empty() {
            return Err(UpdaterError::Descriptor("relaunch workspace is empty"));
        }
        Ok(())
    }
}

/// What one updater run resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdaterRun {
    /// The interruption-recovery outcome for any prior transaction.
    pub recovery: RecoveryOutcome,
    /// The validated relaunch instruction, if the descriptor carried one.
    pub relaunch: Option<RelaunchSpec>,
}

/// Run the copied external updater against its one-time owner-restricted
/// descriptor.
///
/// Reads and validates the descriptor (owner-restricted, bounded, no-follow),
/// derives the product paths, acquires the installation lock as the
/// `CopiedUpdater`, retires the descriptor so a replay finds nothing, and recovers
/// any interrupted prior transaction — delegating every authority check to
/// `vaultspec-product`. Executing a FRESH update (drain -> snapshot -> migrate ->
/// swap) is the activation seam and is invoked by the executable (S59) via the
/// transaction/activation contract, not here.
pub fn run(descriptor_path: &Path) -> Result<UpdaterRun, UpdaterError> {
    let descriptor = read_descriptor(descriptor_path)?;
    let paths = ProductPaths::under_app_home(&descriptor.app_home);

    let guard = match InstallLock::new(paths.install_lock_path())
        .acquire(Actor::CopiedUpdater, &descriptor.owner)
        .map_err(|error| UpdaterError::Io(redact(&error.to_string())))?
    {
        Ok(guard) => guard,
        Err(_busy) => return Err(UpdaterError::Busy),
    };

    // The descriptor is one-time: retire it now that this run owns the lock, so a
    // replay finds nothing. In-flight state is recovered from the DURABLE
    // transaction descriptor, never from a replayed handoff.
    retire_descriptor(descriptor_path)?;

    let recovery = recover(&paths, &guard)?;

    Ok(UpdaterRun {
        recovery,
        relaunch: descriptor.relaunch,
    })
}

/// The typed inputs the fresh-update EXECUTE drive consumes. Assembled from the
/// descriptor's execute-intent (which joins the descriptor with S60 once the
/// windows-private-file DACL authority lands) or supplied directly.
pub struct ExecuteInputs {
    /// The transaction plan facts (consistency generation, candidate/prior
    /// generation, channel, target head).
    pub plan: UpdatePlan,
    /// Classification context for the discovered gateway.
    pub drain_context: DrainContext,
    /// Bounds on the drain-and-stop drive.
    pub deadlines: DrainDeadlines,
    /// The consistency group to snapshot.
    pub group: ConsistencyGroupSpec,
    /// The staged migration to run under quiescence.
    pub staged_migration: StagedMigration,
    /// The validated migration plan.
    pub migration_plan: MigrationPlan,
}

/// How far the fresh-update EXECUTE drive reached.
#[derive(Debug, PartialEq, Eq)]
pub enum ExecuteOutcome {
    /// The drive drained the discovered gateway, snapshotted, and migrated, and
    /// reached the activation boundary. The materialize + receipt-commit SWAP is
    /// the materializer seam; until it lands the drive rolls back cleanly rather
    /// than leave a mid-flight transaction or fake an activation.
    ReadyToActivatePendingSwap,
    /// Discovery was absent — installed-but-cleanly-stopped, a valid cold state
    /// (per the accepted `guard_owned_mutation` D4 contract). Proceeding requires
    /// the cold `Quiescence` mint (`assert_cold_stopped`), which is pending in the
    /// materializer lane, so the drive rolled back rather than fake-mint a witness.
    ColdPathPendingMint,
}

/// Drive one fresh update against the discovered gateway.
///
/// Order (the recorded drive contract): begin the transaction, acquire the sealed
/// [`OwnedGatewayLease`] over the DISCOVERED gateway (only `OwnedLive` proceeds;
/// a foreign/stale/incompatible gateway is a typed rollback; absent discovery is
/// the valid cold state), drain-and-stop it (receiving the `Quiescence` witness —
/// never minting it), snapshot, migrate, and reach the activation boundary. The
/// materialize + receipt-commit swap is the materializer seam.
pub fn execute_update(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    inputs: ExecuteInputs,
) -> Result<ExecuteOutcome, UpdaterError> {
    let mut txn = UpdateTransaction::begin(paths.clone(), guard, inputs.plan)?;

    let lease = match OwnedGatewayLease::acquire(paths, guard, &inputs.drain_context) {
        Ok(lease) => lease,
        Err(GatewayDrainError::DiscoveryAbsent) => {
            // Installed-but-cleanly-stopped is a valid cold state, but the cold
            // Quiescence mint (`assert_cold_stopped`) is pending the materializer
            // lane; roll back rather than fake-mint a witness. Full cold-path
            // safety additionally requires the SEAT stopped (so nothing launches a
            // new gateway after the cold snapshot) — S60's seat-exit precondition.
            let _ = txn.rollback();
            return Ok(ExecuteOutcome::ColdPathPendingMint);
        }
        Err(error) => {
            // A foreign gateway is never drained (ADR D4); a stale one is the
            // quarantine flow; an incompatible one is refused. All roll back with
            // the prior release intact and still running.
            let _ = txn.rollback();
            return Err(UpdaterError::Drain(error));
        }
    };

    // The witness is minted INSIDE the transaction that performed the proven stop.
    let (quiescence, _evidence) = txn.drain_and_stop_discovered(lease, inputs.deadlines)?;
    txn.snapshot(&inputs.group)?;
    txn.migrate(
        &inputs.staged_migration,
        &inputs.migration_plan,
        &quiescence,
    )?;

    let ready = txn.ready_to_activate();
    // The materialize + receipt-commit SWAP is the materializer seam. Until it
    // lands, roll back cleanly (prior-or-complete, no partial active generation).
    ready.rollback()?;
    Ok(ExecuteOutcome::ReadyToActivatePendingSwap)
}

/// Read and validate the owner-restricted descriptor.
pub fn read_descriptor(descriptor_path: &Path) -> Result<UpdaterDescriptor, UpdaterError> {
    if !handoff_is_owner_restricted(descriptor_path) {
        return Err(UpdaterError::Descriptor(
            "descriptor is absent or not owner-restricted",
        ));
    }
    let bytes = read_bounded_nofollow(descriptor_path, MAX_DESCRIPTOR_BYTES)?;
    let descriptor: UpdaterDescriptor = serde_json::from_slice(&bytes)
        .map_err(|_| UpdaterError::Descriptor("descriptor grammar is invalid"))?;
    descriptor.validate()?;
    Ok(descriptor)
}

/// Retire the one-time descriptor. Removal is idempotent so a crash between
/// removal and the transaction is resolved by durable recovery, not a replay.
fn retire_descriptor(descriptor_path: &Path) -> Result<(), UpdaterError> {
    match std::fs::remove_file(descriptor_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(UpdaterError::Io(redact(&error.to_string()))),
    }
}

fn read_bounded_nofollow(path: &Path, cap: u64) -> Result<Vec<u8>, UpdaterError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // O_NOFOLLOW | O_CLOEXEC as stable libc constants; the updater avoids a
        // platform dependency for one descriptor read.
        const O_NOFOLLOW: i32 = 0o0400000;
        const O_CLOEXEC: i32 = 0o2000000;
        options.custom_flags(O_NOFOLLOW | O_CLOEXEC);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let mut file = options
        .open(path)
        .map_err(|error| UpdaterError::Io(redact(&error.to_string())))?;
    let metadata = file
        .metadata()
        .map_err(|error| UpdaterError::Io(redact(&error.to_string())))?;
    if !metadata.is_file() {
        return Err(UpdaterError::Descriptor("descriptor is not a regular file"));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(cap + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| UpdaterError::Io(redact(&error.to_string())))?;
    if bytes.len() as u64 > cap {
        return Err(UpdaterError::Descriptor("descriptor exceeds byte bound"));
    }
    Ok(bytes)
}

/// Redact a diagnostic string to a bounded, secret-free form. The updater's
/// descriptor and credentials never appear in its output; only a bounded shape of
/// the underlying error is retained.
fn redact(detail: &str) -> String {
    const MAX: usize = 200;
    let mut out: String = detail
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX)
        .collect();
    if detail.chars().count() > MAX {
        out.push('…');
    }
    out
}

/// Why the external updater could not complete its run. Diagnostics are bounded
/// and carry no secret.
#[derive(Debug)]
pub enum UpdaterError {
    /// The owner-restricted descriptor was absent, unreadable, or malformed.
    Descriptor(&'static str),
    /// Another installer or updater already holds the installation lock.
    Busy,
    /// The discovered gateway could not be drained and stopped (foreign, stale,
    /// incompatible, or the stop was unproven within the deadline).
    Drain(GatewayDrainError),
    /// The ordered update transaction failed.
    Transaction(TransactionError),
    /// Interruption recovery failed.
    Recovery(RecoveryError),
    /// A bounded, secret-redacted I/O error.
    Io(String),
}

impl std::fmt::Display for UpdaterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Descriptor(detail) => write!(f, "updater descriptor error: {detail}"),
            Self::Busy => write!(
                f,
                "the installation lock is held by another installer or updater"
            ),
            Self::Drain(error) => write!(f, "gateway drain failed: {error}"),
            Self::Transaction(error) => write!(f, "update transaction failed: {error}"),
            Self::Recovery(error) => write!(f, "interruption recovery failed: {error}"),
            Self::Io(detail) => write!(f, "updater io error: {detail}"),
        }
    }
}

impl std::error::Error for UpdaterError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Drain(error) => Some(error),
            Self::Transaction(error) => Some(error),
            Self::Recovery(error) => Some(error),
            Self::Descriptor(_) | Self::Busy | Self::Io(_) => None,
        }
    }
}

impl From<TransactionError> for UpdaterError {
    fn from(error: TransactionError) -> Self {
        Self::Transaction(error)
    }
}

impl From<GatewayDrainError> for UpdaterError {
    fn from(error: GatewayDrainError) -> Self {
        Self::Drain(error)
    }
}

impl From<RecoveryError> for UpdaterError {
    fn from(error: RecoveryError) -> Self {
        Self::Recovery(error)
    }
}
