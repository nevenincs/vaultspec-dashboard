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

use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use vaultspec_distribution_authority::{
    DistributionTarget, MaterializationSource, VerificationError, VerificationRequest,
    verify_distribution,
};
use vaultspec_product::discovery::{
    DiscoveryContext, GatewayDiscovery, Verdict, handoff_is_owner_restricted,
};
use vaultspec_product::gateway_drain::{
    DrainContext, DrainDeadlines, GatewayDrainError, OwnedGatewayLease,
};
use vaultspec_product::generation::LockedProduct;
use vaultspec_product::locking::{Actor, InstallLock, InstallLockGuard};
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::materializer::{ActivationLimits, activate_update};
use vaultspec_product::migration::{
    MigrationLimits, MigrationPlan, MigrationRangeSpec, StagedMigration, plan_migration,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::recovery::{RecoveryError, RecoveryOutcome, recover};
use vaultspec_product::snapshot::{ConsistencyGroupSpec, SchemaBearingStore};
use vaultspec_product::transaction::{
    ReadyToActivate, TransactionError, UpdatePlan, UpdateTransaction,
};

/// The one-time dashboard→updater handoff CONTRACT lives product-side (dependency
/// direction: the dashboard WRITES it, the updater READS it, both over their
/// existing edge onto `vaultspec-product`). Re-exported here so the updater's
/// public API and call sites stay stable; the read/build/drive orchestration over
/// these types is below.
pub use vaultspec_product::handoff::{
    ExecuteIntent, HandoffError, RelaunchSpec, StoreIntent, UpdaterDescriptor, copy_updater_out,
    write_handoff_descriptor,
};

/// The exact target triple this updater was compiled for, surfaced by `build.rs`
/// from cargo's `TARGET`. The fresh-update verify anchors on THIS triple (the
/// closed [`DistributionTarget`]), never a triple carried in the descriptor.
const COMPILED_TARGET: &str = env!("UPDATER_TARGET");

/// The maximum owner-restricted descriptor size the updater will read.
const MAX_DESCRIPTOR_BYTES: u64 = 64 * 1024;
/// The byte bound on a discovery record read during the relaunch probe — the same
/// cap the drain enforces (`gateway_drain::MAX_DISCOVERY_BYTES`); a hostile or
/// runaway file is refused rather than allocated per poll.
const MAX_DISCOVERY_BYTES: u64 = 64 * 1024;
const DESCRIPTOR_VERSION: u8 = 1;
const MAX_OWNER_BYTES: usize = 1024;

/// Validate a handoff descriptor on READ (the updater side of the contract):
/// bounded, absolute app home, non-empty control-free owner, and — when present —
/// a non-empty relaunch workspace. The schema lives product-side; this read-time
/// grammar check stays with the updater that consumes it.
fn validate_descriptor(descriptor: &UpdaterDescriptor) -> Result<(), UpdaterError> {
    if descriptor.version != DESCRIPTOR_VERSION {
        return Err(UpdaterError::Descriptor("unsupported descriptor version"));
    }
    if !descriptor.app_home.is_absolute() {
        return Err(UpdaterError::Descriptor(
            "app home must be an absolute path",
        ));
    }
    let owner = descriptor.owner.trim();
    if owner.is_empty()
        || descriptor.owner.len() > MAX_OWNER_BYTES
        || descriptor.owner.chars().any(char::is_control)
    {
        return Err(UpdaterError::Descriptor(
            "owner must be non-empty, bounded, control-free text",
        ));
    }
    if let Some(relaunch) = &descriptor.relaunch
        && relaunch.workspace.as_os_str().is_empty()
    {
        return Err(UpdaterError::Descriptor("relaunch workspace is empty"));
    }
    Ok(())
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

/// Assemble the runtime [`ExecuteInputs`] plus the staged-bundle path from the
/// product-side [`ExecuteIntent`] facts. Every product-side validation —
/// generation grammar, deadline bounds, store segments, migration range and
/// compatibility — is delegated to the owning constructor, so a malformed or
/// stale intent is a TYPED refusal, never a silent build. The two runtime bits
/// are resolved here: the updater's current time (the drain freshness clock) and
/// the staged-bundle path (the migration capsule root).
///
/// This is a free function rather than a method because the [`ExecuteIntent`]
/// schema is a foreign (product-side) type; the read/build orchestration is the
/// updater's, over the shared contract.
pub fn build_execute_inputs(
    intent: ExecuteIntent,
) -> Result<(ExecuteInputs, PathBuf), UpdaterError> {
    let plan = UpdatePlan::new(
        intent.consistency_generation,
        intent.candidate_generation,
        intent.prior_generation,
        intent.channel,
        intent.target_head,
    )?;
    let drain_context = DrainContext {
        now_ms: now_ms(),
        freshness_ms: intent.freshness_ms,
        supported_protocol: intent.supported_protocol,
        supported_state_schema: intent.supported_state_schema,
    };
    let deadlines = DrainDeadlines::new(
        Duration::from_millis(intent.drain_call_ms),
        Duration::from_millis(intent.stop_ms),
        Duration::from_millis(intent.poll_ms),
    )?;
    let stores = intent
        .stores
        .into_iter()
        .map(|store| {
            SchemaBearingStore::new(
                store.id,
                store.segments,
                store.schema_authority,
                store.schema_version,
            )
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| UpdaterError::Intent(redact(&error.to_string())))?;
    let group = ConsistencyGroupSpec::new(stores, intent.prior_seat)
        .map_err(|error| UpdaterError::Intent(redact(&error.to_string())))?;
    let limits = MigrationLimits::new(
        usize::try_from(intent.migration_output_cap).unwrap_or(usize::MAX),
        Duration::from_millis(intent.migration_wall_ms),
    );
    let segments: Vec<&str> = intent
        .migration_program
        .iter()
        .map(String::as_str)
        .collect();
    let staged_migration = StagedMigration::from_capsule_relative(
        &intent.staged_bundle,
        &segments,
        intent.migration_args.into_iter().map(OsString::from),
        limits,
    )
    .map_err(|error| UpdaterError::Intent(redact(&error.to_string())))?;
    let range = MigrationRangeSpec::new(intent.migration_base, intent.migration_head)
        .map_err(|error| UpdaterError::Intent(redact(&error.to_string())))?;
    let migration_plan = plan_migration(intent.installed_schema_head.as_deref(), &range)
        .map_err(|error| UpdaterError::Intent(redact(&error.to_string())))?;
    Ok((
        ExecuteInputs {
            plan,
            drain_context,
            deadlines,
            group,
            staged_migration,
            migration_plan,
        },
        intent.staged_bundle,
    ))
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

/// Static configuration for the post-commit relaunch health probe. `now_ms` is
/// re-read at each poll, so only a genuinely fresh re-publish satisfies it.
#[derive(Debug, Clone)]
pub struct ProbeConfig {
    /// Our receipt owner identity (the relaunched seat must publish as US).
    pub our_owner: String,
    /// How recent the re-published heartbeat must be to count as fresh.
    pub freshness_ms: i64,
    /// The gateway API version range our installed release set supports.
    pub supported_protocol: RangeBounds,
    /// The state-schema range our installed release set supports.
    pub supported_state_schema: RangeBounds,
    /// Wall-clock bound on how long to wait for the seat to come back healthy.
    pub deadline: Duration,
    /// Poll interval while waiting.
    pub poll: Duration,
}

/// Relaunch the prior seat and confirm it came back healthy.
///
/// Spawns the STABLE front-door launcher (`<launcher> serve`, fully detached) in
/// the relaunch workspace, then waits for the relaunched seat to RE-PUBLISH a
/// fresh, owned, live, compatible discovery record ([`Verdict::OwnedLive`]) within
/// the deadline — the exact inverse of the drain's require-absent. This runs
/// POST-commit: a failure returns a bounded [`RelaunchError`] the caller maps to
/// [`ActivationOutcome::CommittedRelaunchPending`], NEVER a rollback.
pub fn relaunch_and_probe(
    launcher: &Path,
    workspace: &Path,
    discovery_path: &Path,
    config: &ProbeConfig,
) -> Result<(), RelaunchError> {
    // Capture the relaunch watermark BEFORE spawning: only a discovery record
    // published at or after this instant can prove the NEW seat is up, so a stale
    // pre-update record — even one whose pid was recycled by an unrelated live
    // process — can never masquerade as our healthy re-publish.
    let watermark_ms = now_ms();
    spawn_detached_front_door(launcher, workspace)
        .map_err(|error| RelaunchError::new(format!("front-door spawn failed: {error}")))?;
    probe_seat_republished(discovery_path, config, watermark_ms)
}

/// Spawn `<launcher> serve` fully detached — no console, no inherited stdio — so
/// the relaunched seat outlives this short-lived updater. The launcher is the
/// STABLE front door (it resolves the receipt-selected generation), never a
/// generation-specific binary.
fn spawn_detached_front_door(launcher: &Path, workspace: &Path) -> std::io::Result<u32> {
    let mut cmd = std::process::Command::new(launcher);
    cmd.arg("serve")
        .current_dir(workspace)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS (0x8) + CREATE_NO_WINDOW (0x0800_0000): the child owns
        // no console and outlives the launcher — mirrors the front-door spawn.
        cmd.creation_flags(0x0800_0008);
    }
    Ok(cmd.spawn()?.id())
}

/// Poll the discovery record until the relaunched seat is [`Verdict::OwnedLive`]
/// AND its heartbeat is at or after `watermark_ms` (the instant the relaunch
/// began), within the deadline.
///
/// The discovery read is bounded to [`MAX_DISCOVERY_BYTES`] per poll (a hostile or
/// runaway file is refused, never allocated). Freshness, live-pid, ownership, and
/// compatibility are re-evaluated at the CURRENT time each poll, and the watermark
/// requires the record to have been published AFTER the relaunch — so a stale
/// leftover record from before the update, even one whose pid was recycled by an
/// unrelated live process within the freshness window, never satisfies it. Only a
/// genuine post-relaunch re-publish does.
pub fn probe_seat_republished(
    discovery_path: &Path,
    config: &ProbeConfig,
    watermark_ms: i64,
) -> Result<(), RelaunchError> {
    let begun = Instant::now();
    loop {
        if let Some(raw) = read_bounded_nofollow(discovery_path, MAX_DISCOVERY_BYTES)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            && let Ok(discovery) = GatewayDiscovery::parse(&raw)
        {
            let context = DiscoveryContext {
                our_owner: config.our_owner.clone(),
                now_ms: now_ms(),
                freshness_ms: config.freshness_ms,
                supported_protocol: config.supported_protocol.clone(),
                supported_state_schema: config.supported_state_schema.clone(),
            };
            if discovery.heartbeat_ms >= watermark_ms
                && matches!(discovery.classify(&context), Verdict::OwnedLive)
            {
                return Ok(());
            }
        }
        if begun.elapsed() >= config.deadline {
            return Err(RelaunchError::new(
                "the relaunched seat did not re-publish a fresh owned discovery record within the deadline",
            ));
        }
        std::thread::sleep(config.poll);
    }
}

/// The current wall-clock time in epoch milliseconds, saturating on the
/// pre-epoch impossibility.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(i64::MAX)
}

/// Drive one complete fresh update end-to-end under a held installation lock.
///
/// The order is Fable's finalized drive contract:
/// 1. VERIFY the staged bundle IN-PROCESS against the updater's OWN compiled
///    triple and the CURRENT product root — `verify_distribution` re-derives the
///    embedded production root, enforces TUF version + latest-known-time
///    monotonicity anchored on the product root, and holds the product-root
///    verification lock for the release lifetime. The staged-bundle path carries
///    zero trust weight (a wrong path just fails TUF). This is done BEFORE the
///    seat is touched, so an untrustworthy candidate never drains the running
///    release. Note the ORDER is required, not merely preferred: verification
///    writes its trust datastore into the product root and must durably flush
///    the root to publish those names, and the product's root lease denies the
///    write sharing that flush's append-mode reopen needs. So verification
///    cannot overlap a bound product — it precedes one, as it does here.
/// 2. EXECUTE the transaction to the activation boundary (`execute_update`:
///    begin → drain-or-cold → snapshot → migrate → ready).
/// 3. Split the verified release into a `MaterializationSource` (the one async
///    touch) and run the swap tail (`activate_and_accept`): materialize, commit
///    the receipt, run the injected relaunch/probe, finalize.
///
/// The single async touch (verify + `materialization_source`) is hosted in a
/// current-thread runtime this call owns; the sync transaction drive runs between
/// the two awaits. The `relaunch_probe` seam is injected because the concrete
/// launcher and health predicate are front-door-coupled (S60).
pub fn drive_fresh_update(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    staged_bundle: &Path,
    inputs: ExecuteInputs,
    params: ActivationParams,
    relaunch: Option<&RelaunchSpec>,
    relaunch_probe: impl FnOnce(&RelaunchContext<'_>) -> Result<(), RelaunchError>,
) -> Result<ActivationOutcome, UpdaterError> {
    let target = DistributionTarget::parse(COMPILED_TARGET).map_err(UpdaterError::Verification)?;
    let request = VerificationRequest::for_product_root(staged_bundle, paths.root(), target)
        .map_err(UpdaterError::Verification)?;

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| UpdaterError::Io(redact(&error.to_string())))?;

    // VERIFY before touching the seat. Any refusal here leaves the prior release
    // running — the same fail-closed discipline as the DACL-gated write.
    let mut release = runtime
        .block_on(verify_distribution(request))
        .map_err(UpdaterError::Verification)?;

    // Verified: drain the discovered gateway (or mint the cold witness) and stage
    // the transaction to the activation boundary.
    let ready = execute_update(paths, guard, inputs)?;

    // The one async touch, then the synchronous swap tail — both inside the
    // runtime so the borrow of `release` by the source stays live across the swap.
    runtime.block_on(async move {
        let mut source = release
            .materialization_source()
            .await
            .map_err(UpdaterError::Verification)?;
        activate_and_accept(
            ready,
            paths,
            guard,
            &mut source,
            params,
            relaunch,
            relaunch_probe,
        )
    })
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
    validate_descriptor(&descriptor)?;
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
    /// The descriptor execute-intent could not be assembled into runtime inputs:
    /// a malformed store, group, migration program, or migration range (bounded,
    /// secret-free). A stale installed-schema head lands here as an incompatible
    /// range — fail-closed, never a silent proceed.
    Intent(String),
    /// In-process distribution verification (TUF + cohort, or the
    /// `materialization_source` split) refused.
    Verification(VerificationError),
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
            Self::Intent(detail) => write!(f, "execute-intent is invalid: {detail}"),
            Self::Verification(error) => write!(f, "distribution verification refused: {error}"),
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
            Self::Verification(error) => Some(error),
            Self::Transaction(error) => Some(error),
            Self::Recovery(error) => Some(error),
            Self::Descriptor(_)
            | Self::Busy
            | Self::Intent(_)
            | Self::Activation(_)
            | Self::Io(_) => None,
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
