//! Certification cases about the RUNNING product: readiness, admission,
//! attachment, owned-process containment, and the caller-owned MCP surface.
//!
//! Each case binds to the real published artifact first, then drives the
//! product's own authority over real locks, real directories, real discovery
//! records, and real processes launched out of the installed tree. Nothing here
//! restates a decision the library owns, and every process the certifier starts
//! is supervised so it dies within a bound even on an early return.

use std::path::Path;
use std::time::Duration;

use vaultspec_product::a2a_contract::GATEWAY_DISCOVERY_FILE;
use vaultspec_product::credentials::DashboardCredentialStore;
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery, ReleaseSetRef, Verdict};
use vaultspec_product::gateway_drain::{DrainContext, GatewayDrainError};
use vaultspec_product::generation::{
    CreateUnpublishedError, DiscardOutcome, GenerationError, LockedProduct,
    MAX_ABANDONED_GENERATIONS,
};
use vaultspec_product::lifecycle::{
    AttachMode, LifecycleController, plan_transition, resolve_attach,
};
use vaultspec_product::manifest::{RangeBounds, Target};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::protocol::{LifecycleOp, Readiness, Refusal, WorkerState};

use crate::artifact::Artifact;
use crate::cases::{
    RUNNING_STATE, bootstrap_secrets, hold_installation, release_installation, run_frozen_verb,
};
use crate::command::{CommandFailure, SupervisedChild, execute_installed};
use crate::{
    CaseError, CaseResult, DESCENDANT_SETTLE, MCP_SETTLE, OWNED_GRACEFUL, WORKER_IPC_CREDENTIAL,
    display,
};

/// The gateway API range an installed dashboard release supports. Held here as
/// the classification context every attachment case is proven against.
fn supported_protocol() -> RangeBounds {
    RangeBounds {
        minimum: "v1".to_string(),
        maximum: "v1".to_string(),
    }
}

/// The state-schema range an installed dashboard release supports.
fn supported_state_schema() -> RangeBounds {
    RangeBounds {
        minimum: "0001".to_string(),
        maximum: "9999".to_string(),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
        })
}

// Cold readiness and lazy worker startup
// ---------------------------------------------------------------------------

/// A cold gateway is READY, a run demand attaches instead of multiplying
/// workers, and nothing eager is started.
///
/// The installed runtime's own preparation and status verbs are dispatched
/// against a fresh app home — real processes, not a manifest read — and the
/// filesystem is then examined for what an eager start would have left behind: a
/// published discovery record, or the gateway-created worker credential. Neither
/// may exist after a mere installation. The readiness authority is then driven to
/// prove a cold worker never collapses service readiness and that a second demand
/// resolves to the SAME single worker.
pub(crate) fn case_cold_gateway_readiness(artifact: &Artifact) -> CaseResult {
    let runtime = artifact.a2a_runtime()?;
    let paths = artifact.product_paths()?;
    let app_home = paths.app_home();

    let prepared = run_frozen_verb(&runtime, "setup", &app_home)?;
    let observed = run_frozen_verb(&runtime, "status", &app_home)?;
    if observed.state == RUNNING_STATE {
        return Err(CaseError::failed(
            "a freshly prepared installation reported a running service before anything started it"
                .to_string(),
        ));
    }

    let discovery = app_home.join(GATEWAY_DISCOVERY_FILE);
    if discovery.exists() {
        return Err(CaseError::failed(format!(
            "preparation advertised a gateway at {}; nothing may start eagerly",
            display(&discovery)
        )));
    }
    let worker = paths.credentials_dir().join(WORKER_IPC_CREDENTIAL);
    if worker.exists() {
        return Err(CaseError::failed(format!(
            "preparation created the worker credential at {}; the worker starts on first demand",
            display(&worker)
        )));
    }

    let readiness = drive_cold_readiness(&paths)?;
    Ok(format!(
        "setup dispatched reporting `{}`, status dispatched reporting `{}`, nothing advertised and no worker created, {readiness}",
        prepared.state, observed.state
    ))
}

/// Drive the readiness authority over real product state: readiness is derived
/// from the receipt rather than from a caller's claim that a gateway is live,
/// a started gateway is service-ready with a COLD worker, and a further demand
/// attaches to that same worker rather than starting a second one.
pub(crate) fn drive_cold_readiness(paths: &ProductPaths) -> CaseResult {
    let guard = hold_installation(paths, "certify-cold-readiness")?;
    let controller = LifecycleController::new(paths.clone());

    // Readiness is receipt-derived: claiming a live gateway over an installation
    // that does not exist cannot manufacture readiness.
    let claimed = controller
        .guarded_readiness(&guard, true, WorkerState::Cold)
        .map_err(|refusal| {
            CaseError::failed(format!("readiness could not be observed: {refusal}"))
        })?;
    if claimed != Readiness::Uninstalled {
        release_installation(guard)?;
        return Err(CaseError::failed(format!(
            "an uninstalled product reported `{claimed:?}` when a live gateway was claimed"
        )));
    }
    release_installation(guard)?;

    let cold = WorkerState::Cold;
    let started = plan(Readiness::InstalledStopped, LifecycleOp::Start)?;
    if started != (Readiness::GatewayReady { worker: cold }) {
        return Err(CaseError::failed(format!(
            "a start produced `{started:?}` rather than a service-ready gateway with a cold worker"
        )));
    }
    if !started.service_ready() {
        return Err(CaseError::failed(
            "a gateway with a cold worker was not treated as service-ready".to_string(),
        ));
    }
    // A second demand attaches: the worker stays exactly as warm as it was, so
    // demand never starts a second one.
    let attached = plan(started, LifecycleOp::Ensure)?;
    if attached != started {
        return Err(CaseError::failed(format!(
            "a second demand produced `{attached:?}` rather than attaching to the running gateway"
        )));
    }
    let warm = Readiness::GatewayReady {
        worker: WorkerState::Ready,
    };
    let warm_attached = plan(warm, LifecycleOp::Ensure)?;
    if warm_attached != warm {
        return Err(CaseError::failed(format!(
            "a demand against a ready worker produced `{warm_attached:?}` rather than attaching to it"
        )));
    }
    Ok(
        "readiness derived from the receipt, a start yields a service-ready gateway with a cold worker, and further demand attaches to that one worker"
            .to_string(),
    )
}

fn plan(current: Readiness, op: LifecycleOp) -> Result<Readiness, CaseError> {
    plan_transition(current, op)
        .map_err(|refusal| CaseError::failed(format!("the transition was refused: {refusal}")))
}

// The hard admission ceiling
// ---------------------------------------------------------------------------

/// Admission is refused at the hard retained-generation ceiling when no record
/// can be evicted, and an authorized discard of a retained record is what makes
/// room again.
///
/// Real directories are created through the product's own retained-generation
/// authority under the real installation lock. The product never guesses a
/// directory safe to evict, so the ceiling is proven twice: a record the caller
/// still holds is discardable and admission resumes, and once the ceiling is
/// reached with nothing evictable the next admission is refused with NOTHING
/// removed.
pub(crate) fn case_lifecycle_admission_ceiling(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_admission_ceiling(&artifact.product_paths()?)
}

pub(crate) fn drive_admission_ceiling(paths: &ProductPaths) -> CaseResult {
    let guard = hold_installation(paths, "certify-admission")?;
    let outcome = drive_admission_ceiling_under(paths, &guard);
    release_installation(guard)?;
    outcome
}

fn drive_admission_ceiling_under(
    paths: &ProductPaths,
    guard: &vaultspec_product::locking::InstallLockGuard,
) -> CaseResult {
    let existing = retained_generations(paths)?;
    if existing > 0 {
        return Err(CaseError::failed(format!(
            "{existing} generation(s) are retained before certification began; the ceiling cannot be attributed"
        )));
    }

    let mut product = LockedProduct::bind(paths.clone(), guard)
        .map_err(|error| CaseError::failed(format!("cannot bind the product tree: {error}")))?;

    // Fill the retained set to one below the ceiling, releasing each record.
    for index in 0..MAX_ABANDONED_GENERATIONS - 1 {
        let name = format!("certify-admission-{index}");
        match product.create_unpublished(&name) {
            Ok(generation) => drop(generation),
            Err(error) => {
                return Err(CaseError::failed(format!(
                    "admission refused below the ceiling at {index}: {error}"
                )));
            }
        }
    }

    // One more record, still HELD by the caller: an authorized discard of it is
    // the only eviction the product performs, and it makes room again.
    let discarded = match product.create_unpublished("certify-admission-held") {
        Ok(generation) => generation.discard(),
        Err(error) => {
            return Err(CaseError::failed(format!(
                "the last admission below the ceiling was refused: {error}"
            )));
        }
    };
    match discarded {
        DiscardOutcome::Removed { .. } => {}
        DiscardOutcome::Retained(poisoned) => {
            return Err(CaseError::failed(format!(
                "a held record could not be discarded: {}",
                poisoned.error()
            )));
        }
    }

    // The room the discard made is real: admission resumes and reaches the
    // ceiling exactly.
    match product.create_unpublished("certify-admission-refilled") {
        Ok(generation) => drop(generation),
        Err(error) => {
            return Err(CaseError::failed(format!(
                "admission did not resume after an authorized discard: {error}"
            )));
        }
    }

    let at_ceiling = retained_generations(paths)?;
    if at_ceiling != MAX_ABANDONED_GENERATIONS {
        return Err(CaseError::failed(format!(
            "{at_ceiling} records are retained where the ceiling is {MAX_ABANDONED_GENERATIONS}"
        )));
    }

    // At the ceiling with nothing evictable, new work is REFUSED — and the
    // refusal evicts nothing.
    let refusal = match product.create_unpublished("certify-admission-overflow") {
        Ok(generation) => {
            drop(generation);
            return Err(CaseError::failed(format!(
                "a {}th record was admitted past the hard ceiling",
                MAX_ABANDONED_GENERATIONS + 1
            )));
        }
        Err(CreateUnpublishedError::Refused(GenerationError::AbandonedGenerationLimit {
            limit,
        })) => limit,
        Err(other) => {
            return Err(CaseError::failed(format!(
                "admission past the ceiling failed for the wrong reason: {other}"
            )));
        }
    };
    drop(product);

    let after = retained_generations(paths)?;
    if after != MAX_ABANDONED_GENERATIONS {
        return Err(CaseError::failed(format!(
            "the refusal changed the retained set from {MAX_ABANDONED_GENERATIONS} to {after}; nothing may be evicted"
        )));
    }
    Ok(format!(
        "an authorized discard made room, admission resumed to the hard ceiling of {refusal}, and the next admission was refused with all {after} records retained"
    ))
}

/// Count the retained generation directories, bounded by the ceiling itself: a
/// tree with more entries than the product could ever admit is a failure, never
/// an unbounded walk.
fn retained_generations(paths: &ProductPaths) -> Result<usize, CaseError> {
    let dir = paths.generations_dir();
    let entries = std::fs::read_dir(&dir)
        .map_err(|error| CaseError::failed(format!("cannot read {}: {error}", display(&dir))))?;
    let mut count = 0usize;
    for entry in entries.flatten() {
        count += 1;
        if count > MAX_ABANDONED_GENERATIONS * 4 {
            return Err(CaseError::failed(
                "the retained-generation set exceeded every bound the product admits".to_string(),
            ));
        }
        let _ = entry;
    }
    Ok(count)
}

// Compatible foreign attachment
// ---------------------------------------------------------------------------

/// A compatible foreign gateway may be RUN against and nothing more: it can
/// never be stopped, repaired, migrated, updated, rolled back, removed, or
/// adopted.
///
/// The record classified is a real discovery record on the real filesystem,
/// naming a foreign owner, a genuinely live process, and the real
/// owner-restricted handoff the product's own credential bootstrap wrote — the
/// exact shape the product classifies in production. Every mutation is then
/// attempted while presenting the REAL receipt-bound ownership capability, so the
/// refusals are proven to be about the foreign resident rather than about missing
/// authority, and the installed dashboard's own stop verb is executed against the
/// same state.
pub(crate) fn case_foreign_attachment_read_only(artifact: &Artifact) -> CaseResult {
    let dashboard = artifact.dashboard()?;
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths()?;
    let library = drive_foreign_attachment(&paths)?;

    // The shipped dashboard's own stop verb, executed against the same product
    // state: it may never report a stopped foreign gateway.
    let app_home = display(&paths.app_home());
    let outcome = execute_installed(
        "dashboard executable",
        &dashboard,
        &["a2a", "stop"],
        &[("VAULTSPEC_APP_HOME".to_string(), app_home)],
        None,
    )?;
    let reported = String::from_utf8_lossy(&outcome.stdout);
    if outcome.code == Some(0) && reported.contains("\"stopped\"") && reported.contains("true") {
        return Err(CaseError::failed(format!(
            "the installed dashboard reported stopping a foreign gateway: {}",
            outcome.text()
        )));
    }
    Ok(format!(
        "{library}, and the installed dashboard's stop verb refused with exit {}",
        outcome
            .code
            .map_or_else(|| "a signal".to_string(), |code| code.to_string())
    ))
}

pub(crate) fn drive_foreign_attachment(paths: &ProductPaths) -> CaseResult {
    let store = DashboardCredentialStore::for_product(paths);
    // The handoff a foreign gateway offers is a REAL owner-restricted credential
    // file, established by the product's own bootstrap.
    drop(bootstrap_secrets(paths, &store)?);
    let handoff = store.attach_control_reference();

    let guard = hold_installation(paths, "certify-foreign-attach")?;
    let outcome = drive_foreign_attachment_under(paths, &guard, &handoff);
    release_installation(guard)?;
    outcome
}

fn drive_foreign_attachment_under(
    paths: &ProductPaths,
    guard: &vaultspec_product::locking::InstallLockGuard,
    handoff: &Path,
) -> CaseResult {
    let ours = paths.root().to_string_lossy().to_string();
    let record = foreign_discovery_record(&ours, handoff);
    let raw = serde_json::to_string(&record)
        .map_err(|error| CaseError::failed(format!("cannot render a discovery record: {error}")))?;
    let discovery_path = paths.app_home().join(GATEWAY_DISCOVERY_FILE);
    std::fs::write(&discovery_path, raw.as_bytes()).map_err(|error| {
        CaseError::failed(format!("cannot publish the discovery record: {error}"))
    })?;

    let parsed = GatewayDiscovery::parse(&raw).map_err(|error| {
        CaseError::failed(format!("the discovery record was rejected: {error}"))
    })?;
    let context = DiscoveryContext {
        our_owner: ours,
        now_ms: now_ms(),
        freshness_ms: 30_000,
        supported_protocol: supported_protocol(),
        supported_state_schema: supported_state_schema(),
    };
    let verdict = parsed.classify(&context);
    if verdict != Verdict::ForeignAttachable {
        cleanup_discovery(&discovery_path);
        return Err(CaseError::failed(format!(
            "a live, fresh, compatible foreign gateway offering a trusted handoff classified as {verdict:?}"
        )));
    }
    // It CAN be run against — read-only.
    match resolve_attach(&verdict) {
        Ok(AttachMode::ForeignReadOnly) => {}
        other => {
            cleanup_discovery(&discovery_path);
            return Err(CaseError::failed(format!(
                "a compatible foreign gateway did not resolve to a read-only attachment: {other:?}"
            )));
        }
    }

    // Every mutation is refused, with the real ownership capability presented.
    let controller = LifecycleController::new(paths.clone());
    let ownership = DashboardCredentialStore::for_product(paths)
        .verify_ownership(guard)
        .map_err(|error| {
            CaseError::failed(format!("the ownership capability does not verify: {error}"))
        })?;
    let mutations = [
        LifecycleOp::Stop,
        LifecycleOp::Repair,
        LifecycleOp::Update,
        LifecycleOp::Rollback,
        LifecycleOp::Remove,
        LifecycleOp::Restart,
    ];
    for op in mutations {
        match controller.guard_owned_mutation(op, Some(&ownership), Some(&verdict)) {
            Err(Refusal::ForeignResident) => {}
            other => {
                cleanup_discovery(&discovery_path);
                return Err(CaseError::failed(format!(
                    "{op:?} against a foreign resident was not refused: {other:?}"
                )));
            }
        }
    }

    // It can never be ADOPTED: the drain authority refuses to lease a gateway
    // that is not ours, before any credential is read.
    let drain_context = DrainContext {
        now_ms: now_ms(),
        freshness_ms: 30_000,
        supported_protocol: supported_protocol(),
        supported_state_schema: supported_state_schema(),
    };
    let adoption =
        vaultspec_product::gateway_drain::OwnedGatewayLease::acquire(paths, guard, &drain_context);
    let refused = matches!(adoption, Err(GatewayDrainError::ForeignGateway));
    cleanup_discovery(&discovery_path);
    if !refused {
        return Err(CaseError::failed(
            "the drain authority leased a foreign gateway; a foreign resident is never adopted"
                .to_string(),
        ));
    }
    Ok(format!(
        "a live compatible foreign gateway attached read-only, {} mutations were refused as a foreign resident, and adoption was refused",
        mutations.len()
    ))
}

/// A real, secret-free discovery record for a compatible FOREIGN gateway: a
/// foreign owner, this certifier's own genuinely live process, a fresh
/// heartbeat, overlapping ranges, and the real owner-restricted handoff.
fn foreign_discovery_record(ours: &str, handoff: &Path) -> GatewayDiscovery {
    GatewayDiscovery {
        endpoint: "127.0.0.1:1".to_string(),
        pid: std::process::id(),
        owner: format!("{ours}-another-installation"),
        install_identity: "certify-foreign-install".to_string(),
        generation: "certify-foreign-generation".to_string(),
        release_set: ReleaseSetRef {
            name: "vaultspec-a2a".to_string(),
            version: "0.0.0".to_string(),
            target: Target::X86_64PcWindowsMsvc,
        },
        protocol: supported_protocol(),
        state_schema: supported_state_schema(),
        handoff_reference: handoff.to_string_lossy().to_string(),
        heartbeat_ms: now_ms(),
    }
}

fn cleanup_discovery(path: &Path) {
    let _ = std::fs::remove_file(path);
}

/// A foreign record that offers no readable handoff is not even attachable —
/// the negative control the read-only verdict is meaningful against.
#[cfg(test)]
fn classify_without_handoff(ours: &str) -> Verdict {
    let record = foreign_discovery_record(ours, Path::new("/no/such/handoff"));
    record.classify(&DiscoveryContext {
        our_owner: ours.to_string(),
        now_ms: now_ms(),
        freshness_ms: 30_000,
        supported_protocol: supported_protocol(),
        supported_state_schema: supported_state_schema(),
    })
}

// Owned-process containment
// ---------------------------------------------------------------------------

/// Drain closes admission, and the bounded cleanup terminates the whole owned
/// tree — the launched process and every descendant it created.
///
/// Two real drives: a real descendant tree spawned through the product's OWN
/// owned-process authority is terminated within the bound and every recorded
/// descendant is then proven dead through the product's liveness authority; and
/// the admission gate is driven over real discovery state, where a discoverable
/// gateway refuses the cold path outright and only a provably record-free product
/// closes admission.
pub(crate) fn case_owned_tree_bounded_cleanup(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths()?;
    drive_owned_tree_cleanup(&paths, &artifact.workspace)
}

pub(crate) fn drive_owned_tree_cleanup(paths: &ProductPaths, workspace: &Path) -> CaseResult {
    let descendant_pid_file = workspace.join("certify-descendant.pid");
    let _ = std::fs::remove_file(&descendant_pid_file);

    let (root, segments, args) = descendant_tree_command(&descendant_pid_file);
    let program = ResolvedProgram::from_capsule_relative(&root, &segments).map_err(|error| {
        CaseError::failed(format!("the tree launcher could not be resolved: {error}"))
    })?;
    let spec = GatewaySpec::from_resolved(program, args);
    let mut owned = spawn_gateway(&spec).map_err(|error| {
        CaseError::failed(format!("the owned tree could not be spawned: {error}"))
    })?;

    let descendant =
        wait_for_descendant(&descendant_pid_file, DESCENDANT_SETTLE).ok_or_else(|| {
            CaseError::failed(
                "the owned tree never recorded a descendant, so containment cannot be certified"
                    .to_string(),
            )
        })?;
    if !vaultspec_product::locking::process_is_alive(descendant) {
        return Err(CaseError::failed(format!(
            "the recorded descendant {descendant} was already dead before termination"
        )));
    }

    let termination = owned
        .terminate_tree(OWNED_GRACEFUL)
        .map_err(|error| CaseError::failed(format!("the bounded cleanup failed: {error}")))?;
    if owned.is_alive() {
        return Err(CaseError::failed(format!(
            "the owned process {} outlived its bounded cleanup",
            owned.pid()
        )));
    }
    // The descendant is the point: killing only the launched process would leave
    // the worker and provider trees behind.
    let deadline = std::time::Instant::now() + OWNED_GRACEFUL;
    while vaultspec_product::locking::process_is_alive(descendant)
        && std::time::Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(50));
    }
    if vaultspec_product::locking::process_is_alive(descendant) {
        return Err(CaseError::failed(format!(
            "descendant {descendant} survived the bounded cleanup of the owned tree"
        )));
    }
    let _ = std::fs::remove_file(&descendant_pid_file);

    let admission = drive_admission_close(paths)?;
    Ok(format!(
        "the owned tree and its descendant {descendant} were terminated within the bound ({}), {admission}",
        if termination.forced {
            "forced at the deadline"
        } else {
            "exited in the graceful window"
        }
    ))
}

/// Admission closes only over a provably record-free product: a discoverable
/// gateway refuses the cold path rather than being assumed stopped.
fn drive_admission_close(paths: &ProductPaths) -> Result<String, CaseError> {
    use vaultspec_product::receipt::Channel;
    use vaultspec_product::transaction::{UpdatePlan, UpdateTransaction};

    let discovery_path = paths.app_home().join(GATEWAY_DISCOVERY_FILE);
    let handoff = DashboardCredentialStore::for_product(paths).attach_control_reference();
    let record = foreign_discovery_record(&paths.root().to_string_lossy(), &handoff);
    let raw = serde_json::to_string(&record)
        .map_err(|error| CaseError::failed(format!("cannot render a discovery record: {error}")))?;
    std::fs::write(&discovery_path, raw.as_bytes()).map_err(|error| {
        CaseError::failed(format!("cannot publish the discovery record: {error}"))
    })?;

    let guard = hold_installation(paths, "certify-admission-close")?;
    let plan = UpdatePlan::new(
        7_001,
        "certify-admission-candidate",
        None,
        Channel::SelfInstall,
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the plan was refused: {error}")))?;
    let mut transaction = UpdateTransaction::begin(paths.clone(), &guard, plan)
        .map_err(|error| CaseError::failed(format!("the transaction could not begin: {error}")))?;
    let discoverable = transaction.assert_cold_stopped();
    if discoverable.is_ok() {
        cleanup_discovery(&discovery_path);
        release_installation(guard)?;
        return Err(CaseError::failed(
            "admission was declared closed while a gateway was still discoverable".to_string(),
        ));
    }
    cleanup_discovery(&discovery_path);

    // Record-free: admission closes and the transaction may proceed.
    let plan = UpdatePlan::new(
        7_002,
        "certify-admission-candidate",
        None,
        Channel::SelfInstall,
        "0009",
    )
    .map_err(|error| CaseError::failed(format!("the plan was refused: {error}")))?;
    let mut cold = UpdateTransaction::begin(paths.clone(), &guard, plan)
        .map_err(|error| CaseError::failed(format!("the transaction could not begin: {error}")))?;
    let closed = cold.assert_cold_stopped();
    let admitted = closed.is_ok();
    let rolled = cold.rollback();
    release_installation(guard)?;
    rolled
        .map_err(|error| CaseError::failed(format!("the transaction did not unwind: {error}")))?;
    if !admitted {
        return Err(CaseError::failed(
            "admission would not close over a provably record-free product".to_string(),
        ));
    }
    Ok("a discoverable gateway refused the admission close and only a record-free product admitted it"
        .to_string())
}

/// A host command that starts a real child, records THAT child's pid where the
/// certifier can read it, and then keeps both alive. It is the descendant that
/// matters: the containment contract is about the whole tree, and a cleanup that
/// killed only the launched process would leave the worker and provider trees
/// running.
fn descendant_tree_command(
    pid_file: &Path,
) -> (
    std::path::PathBuf,
    Vec<&'static str>,
    Vec<std::ffi::OsString>,
) {
    let recorded = display(pid_file);
    if cfg!(windows) {
        let root = std::path::PathBuf::from(
            std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()),
        )
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0");
        let script = format!(
            "$child = Start-Process -PassThru -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 600'; \
             $child.Id | Out-File -Encoding ascii -NoNewline -FilePath '{recorded}'; Start-Sleep -Seconds 600"
        );
        (
            root,
            vec!["powershell.exe"],
            vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-Command".into(),
                std::ffi::OsString::from(script),
            ],
        )
    } else {
        let script = format!("sh -c 'sleep 600' & echo $! > '{recorded}'; sleep 600");
        (
            std::path::PathBuf::from("/bin"),
            vec!["sh"],
            vec!["-c".into(), std::ffi::OsString::from(script)],
        )
    }
}

/// Wait, bounded, for the descendant to record its pid.
fn wait_for_descendant(pid_file: &Path, budget: Duration) -> Option<u32> {
    let deadline = std::time::Instant::now() + budget;
    while std::time::Instant::now() < deadline {
        if let Ok(text) = std::fs::read_to_string(pid_file)
            && let Ok(pid) = text.trim().parse::<u32>()
            && pid != 0
        {
            return Some(pid);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    None
}

// The caller-owned standalone MCP surface
// ---------------------------------------------------------------------------

/// The frozen runtime's standalone MCP surface starts and stops under ITS
/// caller, and the dashboard's owned-process cleanup leaves it untouched.
///
/// The MCP surface is really started out of the installed tree and proven up,
/// the dashboard's own owned-tree cleanup is then driven to completion, and the
/// MCP process is proven still alive across it — the fence is observed on real
/// processes rather than asserted from a manifest. The caller then closes the
/// stream it owns and the surface is proven to exit.
pub(crate) fn case_standalone_mcp_fence(artifact: &Artifact) -> CaseResult {
    let runtime = artifact.a2a_runtime()?;
    let paths = artifact.product_paths()?;
    let app_home = display(&paths.app_home());

    let mut mcp = SupervisedChild::spawn(
        &runtime,
        &[
            "run-module",
            "vaultspec_a2a.protocols.mcp.authoring_stdio",
            "--app-home",
            &app_home,
        ],
        &[],
        None,
    )
    .map_err(|failure| match failure {
        CommandFailure::Spawn(error) => CaseError::from(crate::EvidenceGap::ComponentAbsent {
            component: "standalone MCP surface",
            relative: format!("{} ({error})", display(&runtime)),
        }),
        other => CaseError::failed(format!("the standalone MCP surface {other}")),
    })?;
    if !mcp.settle(MCP_SETTLE) {
        return Err(CaseError::failed(
            "the standalone MCP surface exited inside its own startup".to_string(),
        ));
    }
    let mcp_pid = mcp.pid();

    // The dashboard's owned cleanup runs to completion over its OWN tree.
    let owned = drive_owned_tree_cleanup(&paths, &artifact.workspace)?;
    if !vaultspec_product::locking::process_is_alive(mcp_pid) {
        return Err(CaseError::failed(format!(
            "the standalone MCP process {mcp_pid} died across a dashboard lifecycle cleanup that never owned it"
        )));
    }

    // Its caller — and only its caller — stops it.
    let stopped = mcp.stop_from_caller(MCP_SETTLE);
    drop(mcp);
    if !stopped {
        return Err(CaseError::failed(format!(
            "the standalone MCP process {mcp_pid} did not exit when its caller closed the stream"
        )));
    }
    Ok(format!(
        "the standalone MCP surface started as process {mcp_pid}, survived a dashboard lifecycle cleanup ({owned}), and exited under its caller"
    ))
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

    /// Readiness is receipt-derived, a cold worker is service-ready, and demand
    /// attaches rather than multiplying workers.
    #[test]
    fn cold_readiness_never_claims_more_than_the_receipt_supports() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_cold_readiness(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("cold worker"),
            "the cold-worker readiness must be proven: {evidence}"
        );
    }

    /// The real retained-generation authority admits up to its hard ceiling,
    /// refuses past it, and evicts nothing in the refusal.
    #[test]
    fn admission_stops_at_the_hard_ceiling_without_evicting() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_admission_ceiling(&paths).unwrap();
        assert!(
            evidence.contains("refused"),
            "the ceiling refusal must be proven: {evidence}"
        );
        assert_eq!(
            retained_generations(&paths).unwrap(),
            MAX_ABANDONED_GENERATIONS,
            "the refusal must leave every retained record in place"
        );
    }

    /// A real compatible foreign record attaches read-only and refuses every
    /// mutation and adoption.
    #[test]
    fn a_compatible_foreign_gateway_is_read_only() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_foreign_attachment(&paths).unwrap();
        assert!(
            evidence.contains("adoption was refused"),
            "adoption must be refused: {evidence}"
        );
    }

    /// The read-only verdict is meaningful: without a readable owner-restricted
    /// handoff the same foreign gateway is not attachable at all.
    #[test]
    fn a_foreign_gateway_without_a_trusted_handoff_is_not_attachable() {
        use vaultspec_product::discovery::ImmutableReason;

        assert_eq!(
            classify_without_handoff("certify-owner"),
            Verdict::ForeignImmutable {
                reason: ImmutableReason::NoTrustedHandoff
            }
        );
    }

    /// The product's owned-process authority really terminates a descendant
    /// tree within its bound, and admission closes only over a record-free
    /// product.
    #[test]
    fn the_owned_tree_cleanup_terminates_every_descendant() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let evidence = drive_owned_tree_cleanup(&paths, &workspace).unwrap();
        assert!(
            evidence.contains("terminated within the bound"),
            "the bounded termination must be proven: {evidence}"
        );
    }
}
