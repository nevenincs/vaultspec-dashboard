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

use vaultspec_distribution_authority::MaterializationSource;
use vaultspec_product::discovery::handoff_is_owner_restricted;
use vaultspec_product::gateway_drain::{
    DrainContext, DrainDeadlines, GatewayDrainError, OwnedGatewayLease,
};
use vaultspec_product::generation::LockedProduct;
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::materializer::{ActivationLimits, activate_update};
use vaultspec_product::migration::{MigrationPlan, StagedMigration};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::recovery::{RecoveryError, RecoveryOutcome, recover};
use vaultspec_product::snapshot::ConsistencyGroupSpec;
use vaultspec_product::transaction::{
    ReadyToActivate, TransactionError, UpdatePlan, UpdateTransaction,
};

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

/// Drive one fresh update to the activation boundary.
///
/// Order (the recorded drive contract): begin the transaction, acquire the sealed
/// [`OwnedGatewayLease`] over the DISCOVERED gateway (only `OwnedLive` proceeds;
/// a foreign/stale/incompatible gateway is a typed rollback), OR — for absent
/// discovery — mint the cold witness via `assert_cold_stopped` (installed-but-
/// cleanly-stopped is a valid cold state; a gateway that reappears in the window
/// rolls back). Both branches converge on a real, never-faked `Quiescence`, then
/// snapshot, migrate, and reach `ready_to_activate`.
///
/// The returned [`ReadyToActivate`] MUST be consumed by the caller: either
/// [`activate_and_accept`] (the swap tail) or `rollback`. Dropping it leaves the
/// transaction mid-flight at `Migrating`, which the next `recover` rolls back.
pub fn execute_update<'guard>(
    paths: &ProductPaths,
    guard: &'guard InstallLockGuard,
    inputs: ExecuteInputs,
) -> Result<ReadyToActivate<'guard>, UpdaterError> {
    let mut txn = UpdateTransaction::begin(paths.clone(), guard, inputs.plan)?;

    // Both branches converge on a real, never-faked `Quiescence` before snapshot.
    let quiescence = match OwnedGatewayLease::acquire(paths, guard, &inputs.drain_context) {
        Ok(lease) => {
            // The witness is minted INSIDE the transaction that performed the
            // proven discovered stop.
            let (quiescence, _evidence) = txn.drain_and_stop_discovered(lease, inputs.deadlines)?;
            quiescence
        }
        Err(GatewayDrainError::DiscoveryAbsent) => {
            // Installed-but-cleanly-stopped is a valid cold state. `assert_cold_stopped`
            // re-reads discovery (pure record-absence), requires it STILL absent — a
            // gateway that began publishing in the window → `GatewayDiscoverable` →
            // rollback — and mints the `Quiescence` inside the transaction. The
            // seat-stopped cold precondition is satisfied by construction: the
            // updater runs POST-seat-exit (S60 stops the seat, then launches it).
            txn.assert_cold_stopped()?
        }
        Err(error) => {
            // A foreign gateway is never drained (ADR D4); a stale one is the
            // quarantine flow; an incompatible one is refused. All roll back with
            // the prior release intact and still running.
            let _ = txn.rollback();
            return Err(UpdaterError::Drain(error));
        }
    };

    txn.snapshot(&inputs.group)?;
    txn.migrate(
        &inputs.staged_migration,
        &inputs.migration_plan,
        &quiescence,
    )?;
    Ok(txn.ready_to_activate())
}

/// Context handed to the injected relaunch/probe seam AFTER the receipt commit.
pub struct RelaunchContext<'a> {
    /// The product paths.
    pub paths: &'a ProductPaths,
    /// The receipt-selected (now active) generation identifier.
    pub generation: &'a str,
    /// The relaunch instruction from the descriptor, if one was carried.
    pub relaunch: Option<&'a RelaunchSpec>,
}

/// Why the injected relaunch/probe seam reported failure. Bounded and
/// secret-free. Post-commit this NEVER rolls back — the release is committed.
#[derive(Debug)]
pub struct RelaunchError(String);

impl RelaunchError {
    /// Build a bounded, secret-free relaunch failure.
    #[must_use]
    pub fn new(detail: impl Into<String>) -> Self {
        Self(redact(&detail.into()))
    }
}

impl std::fmt::Display for RelaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "relaunch/probe failed: {}", self.0)
    }
}

impl std::error::Error for RelaunchError {}

/// Bounds and provenance for the activation swap.
#[derive(Debug, Clone, Copy)]
pub struct ActivationParams {
    /// Wall-clock bound on the whole materialize-and-activate drive.
    pub limits: ActivationLimits,
    /// Wall-clock creation time recorded in the receipt (epoch milliseconds).
    pub created_ms: i64,
}

/// The terminal outcome of the activation swap.
#[derive(Debug, PartialEq, Eq)]
pub enum ActivationOutcome {
    /// The receipt committed the candidate, the seat relaunched and probed
    /// healthy, and the transaction advanced to `Accepted` — the clean terminal.
    Accepted,
    /// The receipt committed the candidate (the release is LIVE and cannot roll
    /// back), but the relaunch/probe did not confirm. Recovery — or the next
    /// stable-launcher start — resolves it roll-forward; there is no rollback
    /// after the commit.
    CommittedRelaunchPending,
}

/// Materialize the verified release into the candidate generation, commit it
/// through the fixed receipt, run the injected relaunch/probe, and finalize.
///
/// The one post-commit rule is absolute: after `activate_update` commits the
/// receipt the candidate is selected and CANNOT roll back — a relaunch/probe
/// failure returns [`ActivationOutcome::CommittedRelaunchPending`] (recovery
/// resolves roll-forward), never a rollback. A PRE-commit failure rolls back
/// through the retained `ReadyToActivate`.
///
/// The `relaunch_probe` seam is injected because the concrete launcher command
/// and health predicate are S60/front-door-coupled; the orchestration
/// (mark-accepted-after-probe, committed-relaunch-pending) is complete here.
pub fn activate_and_accept<'guard>(
    ready: ReadyToActivate<'guard>,
    paths: &ProductPaths,
    guard: &'guard InstallLockGuard,
    source: &mut MaterializationSource<'_>,
    params: ActivationParams,
    relaunch: Option<&RelaunchSpec>,
    relaunch_probe: impl FnOnce(&RelaunchContext<'_>) -> Result<(), RelaunchError>,
) -> Result<ActivationOutcome, UpdaterError> {
    let mut product = LockedProduct::bind(paths.clone(), guard)
        .map_err(|error| UpdaterError::Activation(redact(&error.to_string())))?;

    let activated = match activate_update(
        ready,
        &mut product,
        source,
        params.limits,
        params.created_ms,
    ) {
        Ok(activated) => activated,
        Err(failure) => {
            if failure.is_committed() {
                // Committed mid-activation: no rollback; recovery resolves forward.
                return Ok(ActivationOutcome::CommittedRelaunchPending);
            }
            let detail = redact(&failure.error().to_string());
            failure.rollback().map_err(UpdaterError::Transaction)?;
            return Err(UpdaterError::Activation(detail));
        }
    };

    // The receipt is COMMITTED here — past this point there is no rollback.
    let generation = activated.generation().to_string();
    let transaction = activated.into_transaction();
    let context = RelaunchContext {
        paths,
        generation: &generation,
        relaunch,
    };
    match relaunch_probe(&context) {
        Ok(()) => {
            transaction
                .mark_accepted()
                .map_err(UpdaterError::Transaction)?;
            Ok(ActivationOutcome::Accepted)
        }
        Err(_relaunch_error) => Ok(ActivationOutcome::CommittedRelaunchPending),
    }
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
    /// The materialize + receipt-commit activation failed before the commit
    /// (bounded, secret-redacted). Post-commit failures are never this variant —
    /// they are `CommittedRelaunchPending`.
    Activation(String),
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
            Self::Activation(detail) => write!(f, "activation failed pre-commit: {detail}"),
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
            Self::Descriptor(_) | Self::Busy | Self::Activation(_) | Self::Io(_) => None,
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
