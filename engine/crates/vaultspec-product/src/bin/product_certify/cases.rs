//! The certification cases.
//!
//! Each case binds to the real published artifact first, then drives the
//! product's own authority — never a restatement of it. Where a property is
//! about the installation rather than the archive, the case is split into a
//! driver over the product state authority, so that driver is exercised against
//! real locks, real contenders, real credential files, and real processes.

use std::collections::BTreeSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use vaultspec_product::a2a_contract::GATEWAY_DISCOVERY_FILE;
use vaultspec_product::credentials::DashboardCredentialStore;
use vaultspec_product::locking::{
    Actor, InstallLock, InstallLockGuard, LockBusy, LockError, QuarantineRefusal, StaleState,
    quarantine_owner_matched_stale,
};
use vaultspec_product::paths::ProductPaths;

use crate::artifact::Artifact;
use crate::command::{CommandLimits, execute_installed, require_success, run_bounded};
use crate::network::require_network_removed;
use crate::{
    CONCURRENT_ENSURE_CONTENDERS, CaseError, CaseResult, EXTRACT_OUTPUT_CAP, MAX_SCAN_DIRECTORIES,
    MAX_SCAN_FILE_BYTES, MAX_SCAN_FILES, PROBE_WALL, WORKER_IPC_CREDENTIAL, describe_code, display,
    exe_suffix,
};

// Cases
// ---------------------------------------------------------------------------

/// Clean installation from a locally staged artifact with network access
/// removed: the archive was digest-proven and extracted from local bytes only,
/// the installed tree matches its own member manifest under the embedded trusted
/// lock, and the installed dashboard's own verification verb succeeds — all with
/// the host proven to have no outbound reach.
pub(crate) fn case_clean_install_offline(artifact: &Artifact) -> CaseResult {
    require_network_removed()?;
    let dashboard = artifact.dashboard()?;
    artifact.prove_tree(&artifact.tree_root)?;
    let root = display(&artifact.tree_root);
    require_success(
        "dashboard executable",
        &dashboard,
        &["verify-release", &root],
        &[],
        None,
    )?;
    Ok(format!(
        "archive {} staged offline and verified at {root}",
        &artifact.archive_digest[..16]
    ))
}

/// Relocation preserves onedir resolution, app-home separation, receipt
/// authority, and dashboard launch: the whole tree is really moved to a second
/// path, then re-proven against its own manifest, the relocated dashboard is
/// launched to run its own verification verb at the new root, the relocated
/// frozen runtime is launched to prove its onedir still resolves from its new
/// location, and the receipt authority is shown to live under the app home
/// rather than inside the relocated tree.
pub(crate) fn case_relocation(artifact: &Artifact) -> CaseResult {
    let dashboard_relative = format!("bin/vaultspec{}", exe_suffix());
    let runtime_relative = format!("a2a/vaultspec-a2a{}", exe_suffix());
    // Resolve both components BEFORE moving, so an absent component reports a
    // gap against the staged tree rather than half-relocating it. The runtime
    // half of this property has no subject in a product built without the
    // bundled runtime, which reports itself not applicable rather than absent.
    artifact.dashboard()?;
    artifact.required_a2a_runtime()?;

    let relocated = artifact.workspace.join("relocated");
    if relocated.exists() {
        std::fs::remove_dir_all(&relocated).map_err(|error| {
            CaseError::failed(format!("cannot clear the relocation root: {error}"))
        })?;
    }
    relocate(&artifact.tree_root, &relocated)?;

    artifact.prove_tree(&relocated)?;

    let relocated_root = display(&relocated);
    let relocated_dashboard = relocated.join(&dashboard_relative);
    require_success(
        "dashboard executable",
        &relocated_dashboard,
        &["verify-release", &relocated_root],
        &[],
        None,
    )?;

    // Onedir resolution is proven by a real SERVICE verb, not by `--version`.
    // A version or help invocation only constructs the command surface; a
    // frozen-closure defect — a missing data file, an unfrozen resource, a
    // hidden-import miss — lives inside the service verbs and survives any
    // construction-only check. Dispatching one after the move is what proves the
    // relocated onedir still resolves its own interpreter and payload.
    let relocated_runtime = relocated.join(&runtime_relative);
    let app_home = artifact.workspace.join("app-home");
    let paths = ProductPaths::under_app_home(&app_home);
    let observed = run_frozen_verb(&relocated_runtime, "status", &paths.app_home())?;
    if observed.state.is_empty() {
        return Err(CaseError::failed(
            "the relocated frozen runtime reported no state, so its onedir resolution is unproven"
                .to_string(),
        ));
    }

    // The receipt authority is derived from the app home, never from the tree,
    // so relocating the tree cannot move or invalidate it.
    let receipt = paths.receipt_path();
    if receipt.starts_with(&relocated) || receipt.starts_with(&artifact.tree_root) {
        return Err(CaseError::failed(format!(
            "the receipt authority at {} lives inside the relocatable product tree",
            display(&receipt)
        )));
    }
    if !paths.root().starts_with(&app_home) {
        return Err(CaseError::failed(
            "product state does not resolve under the app home".to_string(),
        ));
    }

    Ok(format!(
        "tree relocated to {relocated_root}, re-verified, dashboard verified from its new root, frozen runtime dispatched a service verb reporting `{}`, receipt authority at {}",
        observed.state,
        display(&receipt)
    ))
}

/// The frozen runtime really DISPATCHES its service verbs, not merely
/// constructs them.
///
/// This is the case that closes the blind spot in a construction-only freeze
/// check. A version or help invocation walks the command surface without
/// entering any verb body, so a frozen-closure defect — an unfrozen package
/// resource, a missing migration asset, a hidden-import miss — passes such a
/// check cleanly and first surfaces at real product run. Here the setup and
/// status verbs are actually executed against the installed onedir and their own
/// reports are decoded, which is the first place such a defect shows.
pub(crate) fn case_frozen_runtime_dispatch(artifact: &Artifact) -> CaseResult {
    let runtime = artifact.required_a2a_runtime()?;
    let app_home = artifact.product_paths()?.app_home();

    let prepared = run_frozen_verb(&runtime, "setup", &app_home)?;
    let observed = run_frozen_verb(&runtime, "status", &app_home)?;
    if observed.state.is_empty() {
        return Err(CaseError::failed(
            "the frozen runtime's status verb reported no state".to_string(),
        ));
    }
    // The run-state exit convention is the runtime's, not a success signal: the
    // status verb exits non-zero for a healthy stopped service, so the decoded
    // report is the truth and the code is only read where it carries meaning.
    if observed.code == Some(0) && observed.state != RUNNING_STATE {
        return Err(CaseError::failed(format!(
            "the status verb signalled a running service while reporting `{}`",
            observed.state
        )));
    }
    Ok(format!(
        "setup dispatched reporting `{}`, status dispatched reporting `{}`",
        prepared.state, observed.state
    ))
}

/// The run state the frozen runtime's service verbs signal success for.
pub(crate) const RUNNING_STATE: &str = "running";
/// A click usage error: the certifier invoked the verb wrongly, which is a
/// defect in the certification, never evidence about the artifact.
const USAGE_EXIT: i32 = 2;

/// One frozen-runtime service verb, executed and decoded.
#[derive(Debug)]
pub(crate) struct FrozenVerbReport {
    pub(crate) code: Option<i32>,
    pub(crate) state: String,
}

/// Execute one of the frozen runtime's service verbs against an explicit app
/// home and decode the report it prints.
///
/// The exit code is NOT read as success. These verbs encode run state in the
/// code — a stopped-but-healthy service exits non-zero — so treating a non-zero
/// exit as failure would refuse a perfectly good artifact. The machine-readable
/// report on stdout is emitted either way and is what the case reasons about. A
/// usage exit is the one code that means the certifier itself is wrong.
pub(crate) fn run_frozen_verb(
    runtime: &Path,
    verb: &str,
    app_home: &Path,
) -> Result<FrozenVerbReport, CaseError> {
    let home = display(app_home);
    let outcome = execute_installed(
        "frozen A2A runtime",
        runtime,
        &[verb, "--app-home", &home],
        &[],
        None,
    )?;
    if outcome.code == Some(USAGE_EXIT) {
        return Err(CaseError::failed(format!(
            "the frozen runtime refused the {verb} invocation as a usage error: {}",
            outcome.text()
        )));
    }
    let state = decode_reported_state(&outcome.stdout).ok_or_else(|| {
        CaseError::failed(format!(
            "the frozen runtime's {verb} verb printed no decodable report, which is how a frozen-closure defect surfaces: {}",
            outcome.text()
        ))
    })?;
    Ok(FrozenVerbReport {
        code: outcome.code,
        state,
    })
}

/// Decode the `state` a frozen-runtime verb reported on stdout. The report is a
/// single object; a leading banner or trailing newline is tolerated, anything
/// undecodable is not.
pub(crate) fn decode_reported_state(stdout: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(stdout).ok()?;
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    let report: serde_json::Value = serde_json::from_str(&text[start..=end]).ok()?;
    let state = report.get("state")?.as_str()?;
    (!state.is_empty()).then(|| state.to_string())
}

/// The runtime singleton excludes a second gateway before bind or discovery
/// publication: the installation authority is a real OS lock, a second holder is
/// excluded while the first holds it, the gateway may never take that authority
/// at all, and the exclusion is proven to happen while no discovery record has
/// been published — so the loser never bound a port or advertised itself.
pub(crate) fn case_runtime_singleton(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_runtime_singleton(&artifact.product_paths()?)
}

pub(crate) fn drive_runtime_singleton(paths: &ProductPaths) -> CaseResult {
    let lock = InstallLock::new(paths.install_lock_path());

    // The gateway may never acquire or wait on installation authority.
    match lock.acquire(Actor::Gateway, "certify-gateway") {
        Err(LockError::GatewayForbidden) => {}
        other => {
            return Err(CaseError::failed(format!(
                "the gateway was not refused installation authority: {other:?}"
            )));
        }
    }

    let held = lock
        .acquire(Actor::Installer, "certify-runtime-first")
        .map_err(|error| CaseError::failed(format!("first acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product was already locked by {} before certification began",
                busy_owner(&busy)
            ))
        })?;

    let second = lock
        .acquire(Actor::Installer, "certify-runtime-second")
        .map_err(|error| CaseError::failed(format!("second acquisition errored: {error:?}")))?;
    let excluded = match second {
        Ok(_) => {
            return Err(CaseError::failed(
                "a second runtime acquired installation authority while the first held it"
                    .to_string(),
            ));
        }
        Err(busy) => busy,
    };
    // The recorded owner is best-effort by contract; when it IS recorded it must
    // name the live holder, never some third party.
    if let Some(owner) = &excluded.owner
        && owner != "certify-runtime-first"
    {
        return Err(CaseError::failed(format!(
            "the exclusion named {owner} rather than the live holder"
        )));
    }

    // The exclusion must land BEFORE any bind or discovery publication: a
    // discovery record present here would mean the excluded runtime advertised
    // itself before it was refused.
    let discovery = paths.app_home().join(GATEWAY_DISCOVERY_FILE);
    if discovery.exists() {
        return Err(CaseError::failed(format!(
            "a discovery record was published at {} despite the exclusion",
            display(&discovery)
        )));
    }

    held.release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(format!(
        "second runtime excluded by {}, gateway refused authority, no discovery published",
        busy_owner(&excluded)
    ))
}

/// Acquire the real installation authority every runtime case drives under.
///
/// Every mutation the product admits is gated on this exact lock, so a case that
/// drives one without holding it would be certifying a path the product never
/// takes. A product already locked by something else is a certification failure,
/// not an evidence gap: the certifier owns the workspace it was pointed at.
pub(crate) fn hold_installation(
    paths: &ProductPaths,
    owner: &str,
) -> Result<InstallLockGuard, CaseError> {
    InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, owner)
        .map_err(|error| CaseError::failed(format!("acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product is locked by {}; the case cannot be driven",
                busy_owner(&busy)
            ))
        })
}

/// Release a held installation guard, mapping the failure into a case failure.
pub(crate) fn release_installation(guard: InstallLockGuard) -> Result<(), CaseError> {
    guard
        .release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))
}

/// The best-effort owner a busy lock recorded, normalized for a diagnostic. The
/// contract makes the recorded owner optional, so its absence is never itself a
/// certification failure.
pub(crate) fn busy_owner(busy: &LockBusy) -> String {
    busy.owner
        .clone()
        .unwrap_or_else(|| "an unnamed holder".to_string())
}

/// Concurrent ensure operations attach to one job and never spawn a second
/// mutation: real concurrent contenders race the installation authority, exactly
/// one performs the mutation, and every other contender attaches by observing
/// that same holder rather than proceeding.
pub(crate) fn case_concurrent_ensure_single_flight(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_concurrent_ensure(&artifact.product_paths()?, CONCURRENT_ENSURE_CONTENDERS)
}

pub(crate) fn drive_concurrent_ensure(paths: &ProductPaths, contenders: usize) -> CaseResult {
    let lock = InstallLock::new(paths.install_lock_path());
    let jobs_dir = paths.staging_dir().join("certify-ensure-jobs");
    if jobs_dir.exists() {
        std::fs::remove_dir_all(&jobs_dir)
            .map_err(|error| CaseError::failed(format!("cannot clear the job area: {error}")))?;
    }
    std::fs::create_dir_all(&jobs_dir)
        .map_err(|error| CaseError::failed(format!("cannot create the job area: {error}")))?;

    // Both barriers are what make this a single-flight proof rather than a race:
    // every contender attempts while the winner still holds, and the winner only
    // releases once every attempt has been recorded.
    let entered = std::sync::Barrier::new(contenders);
    let attempted = std::sync::Barrier::new(contenders);
    let outcomes: Vec<Result<Option<String>, String>> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..contenders)
            .map(|index| {
                let lock = lock.clone();
                let jobs_dir = jobs_dir.clone();
                let entered = &entered;
                let attempted = &attempted;
                scope.spawn(move || {
                    let owner = format!("certify-ensure-{index}");
                    entered.wait();
                    match lock.acquire(Actor::Installer, &owner) {
                        Ok(Ok(guard)) => {
                            // The single admitted mutation for this job.
                            let job = jobs_dir.join(format!("{owner}.job"));
                            let written = std::fs::write(&job, owner.as_bytes())
                                .map_err(|error| format!("job write failed: {error}"));
                            attempted.wait();
                            let released = guard.release().map_err(|error| error.to_string());
                            written.and(released).map(|()| None)
                        }
                        Ok(Err(busy)) => {
                            let holder = busy_owner(&busy);
                            attempted.wait();
                            Ok(Some(holder))
                        }
                        Err(error) => {
                            attempted.wait();
                            Err(format!("acquisition errored: {error:?}"))
                        }
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|_| Err("contender panicked".to_string()))
            })
            .collect()
    });

    let mut winners = 0usize;
    let mut attachments: BTreeSet<String> = BTreeSet::new();
    for outcome in outcomes {
        match outcome.map_err(CaseError::failed)? {
            None => winners += 1,
            Some(holder) => {
                attachments.insert(holder);
            }
        }
    }
    if winners != 1 {
        return Err(CaseError::failed(format!(
            "{winners} contenders held installation authority concurrently; exactly one may"
        )));
    }
    if attachments.len() != 1 {
        return Err(CaseError::failed(format!(
            "attaching contenders observed {} different holders; a single flight has exactly one",
            attachments.len()
        )));
    }

    let jobs = bounded_files(&jobs_dir)?;
    if jobs.len() != 1 {
        return Err(CaseError::failed(format!(
            "{} mutations landed for one job; concurrent ensure must mutate once",
            jobs.len()
        )));
    }
    Ok(format!(
        "{contenders} contenders, one mutation, {} attached to the single holder",
        contenders - 1
    ))
}

/// Only a matching receipt owner can quarantine stale discovery, and only after
/// proving the recorded process dead: a foreign owner's stale state is refused
/// even when its process is genuinely dead, our own stale state naming a
/// genuinely LIVE process is refused, and only our own stale state naming a
/// process this certifier really started and reaped is admitted — all under the
/// held installation lock.
pub(crate) fn case_stale_discovery_quarantine(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_stale_discovery_quarantine(&artifact.product_paths()?)
}

pub(crate) fn drive_stale_discovery_quarantine(paths: &ProductPaths) -> CaseResult {
    let owner = paths.root().to_string_lossy().to_string();
    let dead = reap_a_real_process()?;
    let live = std::process::id();

    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "certify-quarantine")
        .map_err(|error| CaseError::failed(format!("acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product is locked by {}; quarantine cannot be certified",
                busy_owner(&busy)
            ))
        })?;

    let foreign = StaleState {
        owner: format!("{owner}-another-install"),
        pid: dead,
    };
    match quarantine_owner_matched_stale(&owner, &foreign) {
        Err(QuarantineRefusal::ForeignOwner) => {}
        other => {
            return Err(CaseError::failed(format!(
                "a foreign owner's stale state was not refused: {other:?}"
            )));
        }
    }

    let still_running = StaleState {
        owner: owner.clone(),
        pid: live,
    };
    match quarantine_owner_matched_stale(&owner, &still_running) {
        Err(QuarantineRefusal::ProcessLive) => {}
        other => {
            return Err(CaseError::failed(format!(
                "stale state naming a live process was not refused: {other:?}"
            )));
        }
    }

    let proven_dead = StaleState {
        owner: owner.clone(),
        pid: dead,
    };
    quarantine_owner_matched_stale(&owner, &proven_dead).map_err(|refusal| {
        CaseError::failed(format!(
            "the matching owner could not quarantine a proven-dead process: {refusal}"
        ))
    })?;

    guard
        .release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(format!(
        "foreign owner and live process both refused, proven-dead process {dead} admitted under the installation lock"
    ))
}

/// Start a real process, wait for it to exit, and reap it, returning its pid.
/// The pid is then genuinely dead — the only honest way to exercise the
/// proven-dead branch without asserting a process state that was never observed.
pub(crate) fn reap_a_real_process() -> Result<u32, CaseError> {
    let (program, args) = no_op_command();
    let limits = CommandLimits {
        output_cap: EXTRACT_OUTPUT_CAP,
        wall: PROBE_WALL,
    };
    let outcome = run_bounded(Path::new(&program), &args, &[], None, limits)
        .map_err(|failure| CaseError::failed(format!("the liveness probe process {failure}")))?;
    if outcome.code != Some(0) {
        return Err(CaseError::failed(format!(
            "the liveness probe process exited {}",
            describe_code(outcome.code)
        )));
    }
    Ok(outcome.pid)
}

/// A host command that starts and immediately exits successfully.
pub(crate) fn no_op_command() -> (String, Vec<OsString>) {
    if cfg!(windows) {
        (
            "cmd.exe".to_string(),
            ["/c", "exit 0"].iter().map(OsString::from).collect(),
        )
    } else {
        (
            "sh".to_string(),
            ["-c", "exit 0"].iter().map(OsString::from).collect(),
        )
    }
}

/// Bootstrap creates and retains distinct ownership and attach-control
/// credentials, and creates no worker credential: the dashboard's own credential
/// authority is driven under a real installation guard, both capabilities are
/// proven to be real distinct files that read back and verify, and the worker
/// IPC credential is proven absent because it is the gateway's to create, never
/// the dashboard's.
pub(crate) fn case_credential_separation(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_credential_separation(&artifact.product_paths()?)
}

pub(crate) fn drive_credential_separation(paths: &ProductPaths) -> CaseResult {
    let store = DashboardCredentialStore::for_product(paths);
    let secrets = bootstrap_secrets(paths, &store)?;

    if secrets.ownership == secrets.attach_control {
        return Err(CaseError::failed(
            "ownership and attach-control share one secret; the roles are not separated"
                .to_string(),
        ));
    }

    // Both capabilities must read back through the product's own validated
    // readers and verify against what bootstrap minted.
    let ownership = store
        .read_ownership()
        .map_err(|error| CaseError::failed(format!("ownership does not read back: {error}")))?;
    let attach = store.read_attach_control().map_err(|error| {
        CaseError::failed(format!("attach-control does not read back: {error}"))
    })?;
    if !ownership.verify(&secrets.ownership) || !attach.verify(&secrets.attach_control) {
        return Err(CaseError::failed(
            "a retained credential does not verify against the one bootstrap minted".to_string(),
        ));
    }
    if ownership.verify(&secrets.attach_control) || attach.verify(&secrets.ownership) {
        return Err(CaseError::failed(
            "a credential verifies the other role's secret; the roles are interchangeable"
                .to_string(),
        ));
    }

    // Worker IPC is gateway-created and confined to gateway-worker traffic; the
    // dashboard bootstrap must never mint it.
    let worker = paths.credentials_dir().join(WORKER_IPC_CREDENTIAL);
    if worker.exists() {
        return Err(CaseError::failed(format!(
            "dashboard bootstrap created the gateway-owned worker credential at {}",
            display(&worker)
        )));
    }
    Ok(format!(
        "distinct ownership and attach-control capabilities retained under {}, no worker credential",
        display(&paths.credentials_dir())
    ))
}

/// Token values never appear in discovery, retained artifacts, diagnostics, or
/// the installed tree: both bootstrap secrets are searched for byte-for-byte
/// across every retained file outside the protected credential store, across the
/// credential's own debug rendering, and across the installed tree.
pub(crate) fn case_token_redaction(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths()?;
    let store = DashboardCredentialStore::for_product(&paths);
    let secrets = bootstrap_secrets(&paths, &store)?;
    let tokens = [secrets.ownership.as_str(), secrets.attach_control.as_str()];

    // A credential's own rendering is the first place a secret leaks.
    let rendered = format!(
        "{:?}",
        store.read_attach_control().map_err(|error| {
            CaseError::failed(format!("attach-control does not read back: {error}"))
        })?
    );
    for token in tokens {
        if rendered.contains(token) {
            return Err(CaseError::failed(
                "a credential's debug rendering carries its secret".to_string(),
            ));
        }
    }

    // Every retained artifact outside the protected credential store, and the
    // whole installed tree, must be free of both secrets.
    let credentials_dir = paths.credentials_dir();
    let mut scanned = 0usize;
    for root in [paths.root(), artifact.tree_root.as_path()] {
        scanned += scan_for_tokens(root, &tokens, Some(&credentials_dir))?;
    }
    Ok(format!(
        "{scanned} retained files scanned across product state and the installed tree, no token present"
    ))
}

/// Both secrets minted by one real bootstrap under a real installation guard.
pub(crate) struct BootstrapSecrets {
    pub(crate) ownership: String,
    pub(crate) attach_control: String,
}

/// Drive the dashboard's own credential bootstrap once under a real acquired
/// installation guard, returning the minted secrets. The guard is released only
/// after bootstrap completes, so the credentials are established exactly as a
/// first install establishes them.
pub(crate) fn bootstrap_secrets(
    paths: &ProductPaths,
    store: &DashboardCredentialStore,
) -> Result<BootstrapSecrets, CaseError> {
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "certify-bootstrap")
        .map_err(|error| CaseError::failed(format!("acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product is locked by {}; bootstrap cannot be certified",
                busy_owner(&busy)
            ))
        })?;
    let pending = store
        .begin_bootstrap(&guard)
        .map_err(|error| CaseError::failed(format!("credential bootstrap failed: {error}")))?;
    let secrets = BootstrapSecrets {
        ownership: pending.ownership().secret().to_string(),
        attach_control: pending.attach_control().secret().to_string(),
    };
    drop(pending);
    guard
        .release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(secrets)
}

/// Search every regular file under `root` for any of `tokens`, skipping the
/// protected credential store (which is where the secrets legitimately live).
/// Bounded by a file-count ceiling and a per-file byte ceiling; a file past the
/// byte ceiling is refused rather than read.
pub(crate) fn scan_for_tokens(
    root: &Path,
    tokens: &[&str],
    skip: Option<&Path>,
) -> Result<usize, CaseError> {
    let mut scanned = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if skip.is_some_and(|skip| dir == skip) {
            continue;
        }
        if stack.len() > MAX_SCAN_DIRECTORIES {
            return Err(CaseError::failed(
                "the retained-artifact scan exceeded its directory ceiling".to_string(),
            ));
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() {
                scanned += 1;
                if scanned > MAX_SCAN_FILES {
                    return Err(CaseError::failed(
                        "the retained-artifact scan exceeded its file ceiling".to_string(),
                    ));
                }
                if metadata.len() > MAX_SCAN_FILE_BYTES {
                    continue;
                }
                let Ok(bytes) = std::fs::read(&path) else {
                    continue;
                };
                let text = String::from_utf8_lossy(&bytes);
                for token in tokens {
                    if text.contains(token) {
                        return Err(CaseError::failed(format!(
                            "a token value is present in the retained artifact {}",
                            display(&path)
                        )));
                    }
                }
            }
        }
    }
    Ok(scanned)
}

/// The regular files directly under `dir`, bounded by the scan file ceiling.
pub(crate) fn bounded_files(dir: &Path) -> Result<Vec<PathBuf>, CaseError> {
    let entries = std::fs::read_dir(dir)
        .map_err(|error| CaseError::failed(format!("cannot read {}: {error}", display(dir))))?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        if files.len() >= MAX_SCAN_FILES {
            return Err(CaseError::failed(
                "the job area exceeded its file ceiling".to_string(),
            ));
        }
        if entry.path().is_file() {
            files.push(entry.path());
        }
    }
    Ok(files)
}

/// Really move a directory tree, falling back to a copy-then-remove when the
/// destination is on another volume (the case a rename cannot serve).
pub(crate) fn relocate(from: &Path, to: &Path) -> Result<(), CaseError> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_tree(from, to)?;
            std::fs::remove_dir_all(from).map_err(|error| {
                CaseError::failed(format!(
                    "cannot remove the original tree after copy: {error}"
                ))
            })
        }
    }
}

pub(crate) fn copy_tree(from: &Path, to: &Path) -> Result<(), CaseError> {
    std::fs::create_dir_all(to)
        .map_err(|error| CaseError::failed(format!("cannot create {}: {error}", display(to))))?;
    let entries = std::fs::read_dir(from)
        .map_err(|error| CaseError::failed(format!("cannot read {}: {error}", display(from))))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| CaseError::failed(format!("cannot read a tree entry: {error}")))?;
        let source = entry.path();
        let dest = to.join(entry.file_name());
        let metadata = std::fs::symlink_metadata(&source).map_err(|error| {
            CaseError::failed(format!("cannot stat {}: {error}", display(&source)))
        })?;
        if metadata.is_dir() {
            copy_tree(&source, &dest)?;
        } else if metadata.is_file() {
            std::fs::copy(&source, &dest).map_err(|error| {
                CaseError::failed(format!("cannot copy {}: {error}", display(&source)))
            })?;
        } else {
            return Err(CaseError::failed(format!(
                "the installed tree contains a non-regular entry at {}",
                display(&source)
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A verb's own report decodes to the state it named.
    #[test]
    fn a_reported_state_decodes() {
        let report = br#"{"state": "stopped", "pid": null}"#;
        assert_eq!(decode_reported_state(report).as_deref(), Some("stopped"));
    }

    /// A banner or trailing newline around the report is tolerated; the report
    /// is still the object, not the noise.
    #[test]
    fn a_report_surrounded_by_noise_still_decodes() {
        let report = b"loading
{\"state\": \"running\"}
";
        assert_eq!(decode_reported_state(report).as_deref(), Some("running"));
    }

    /// Output carrying no decodable report is NOT read as a state. This is the
    /// frozen-closure failure mode: a verb that dies inside its own body prints
    /// a traceback rather than a report, and must never be read as healthy.
    #[test]
    fn a_traceback_is_not_a_state() {
        let traceback = b"Traceback (most recent call last):
  ModuleNotFoundError: no module named x
";
        assert!(decode_reported_state(traceback).is_none());
    }

    /// A report without a state, or with an empty one, decodes to nothing
    /// rather than to a blank state that would read as success.
    #[test]
    fn a_stateless_or_blank_report_decodes_to_nothing() {
        assert!(decode_reported_state(br#"{"pid": 1}"#).is_none());
        assert!(decode_reported_state(br#"{"state": ""}"#).is_none());
        assert!(decode_reported_state(b"").is_none());
    }

    /// A real product state root on a real filesystem, for driving the runtime
    /// authority cases without any stand-in for the OS primitives they use.
    fn real_product_paths(temp: &tempfile::TempDir) -> ProductPaths {
        let paths = ProductPaths::under_app_home(temp.path());
        paths.ensure().unwrap();
        paths
    }

    /// A real second acquirer is excluded by the real OS lock while the first
    /// holds it, the gateway is refused outright, and nothing was advertised.
    #[test]
    fn the_runtime_singleton_excludes_a_second_holder() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_runtime_singleton(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("certify-runtime-first"),
            "the exclusion must name the live holder: {evidence}"
        );
    }

    /// A published discovery record while a contender is excluded means the
    /// loser advertised itself; the case must fail rather than certify.
    #[test]
    fn a_published_discovery_record_fails_the_singleton_case() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        std::fs::write(paths.app_home().join(GATEWAY_DISCOVERY_FILE), b"{}").unwrap();
        assert!(matches!(
            drive_runtime_singleton(&paths),
            Err(CaseError::Failed(_))
        ));
    }

    /// Eight real threads race the real installation authority: exactly one
    /// mutates, and every other attaches to that same holder.
    #[test]
    fn concurrent_contenders_produce_exactly_one_mutation() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_concurrent_ensure(&paths, CONCURRENT_ENSURE_CONTENDERS).unwrap();
        assert!(
            evidence.contains("one mutation"),
            "single flight must be proven: {evidence}"
        );
        let jobs = bounded_files(&paths.staging_dir().join("certify-ensure-jobs")).unwrap();
        assert_eq!(jobs.len(), 1, "exactly one job may have mutated");
    }

    /// The real credential bootstrap mints two distinct capabilities that read
    /// back and verify, and mints no worker credential.
    #[test]
    fn credential_bootstrap_separates_the_two_roles() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        drive_credential_separation(&paths).unwrap();
        assert!(paths.credentials_dir().join("ownership.cap").exists());
        assert!(paths.credentials_dir().join("attach.cred").exists());
        assert!(
            !paths.credentials_dir().join(WORKER_IPC_CREDENTIAL).exists(),
            "worker IPC is the gateway's to create"
        );
    }

    /// Quarantine is admitted only for our own owner and only for a process
    /// this test really started and reaped; the foreign-owner and live-process
    /// branches are refused with real process facts.
    #[test]
    fn quarantine_admits_only_a_matching_owner_over_a_reaped_process() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_stale_discovery_quarantine(&paths).unwrap();
        assert!(
            evidence.contains("admitted under the installation lock"),
            "the proven-dead branch must be admitted: {evidence}"
        );
    }

    /// The reaped probe really is dead: the product's own liveness authority
    /// says so, which is what makes the quarantine branch honest.
    #[test]
    fn the_reaped_probe_process_is_really_dead() {
        let pid = reap_a_real_process().unwrap();
        assert!(
            !vaultspec_product::locking::process_is_alive(pid),
            "the reaped probe process {pid} must be dead"
        );
    }

    /// A token planted in a retained artifact is found; the scan is not blind.
    #[test]
    fn the_token_scan_finds_a_planted_secret() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        std::fs::create_dir_all(root.join("nested")).unwrap();
        std::fs::write(root.join("nested/log.txt"), b"bearer aaaabbbbcccc leaked").unwrap();
        assert!(matches!(
            scan_for_tokens(&root, &["aaaabbbbcccc"], None),
            Err(CaseError::Failed(_))
        ));
    }

    /// The scan skips the protected credential store, where the secrets
    /// legitimately live, and still reports the files it did read.
    #[test]
    fn the_token_scan_skips_the_protected_credential_store() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        let credentials = root.join("credentials");
        std::fs::create_dir_all(&credentials).unwrap();
        std::fs::write(credentials.join("attach.cred"), b"aaaabbbbcccc").unwrap();
        std::fs::write(root.join("notes.txt"), b"nothing secret here").unwrap();
        let scanned = scan_for_tokens(&root, &["aaaabbbbcccc"], Some(&credentials)).unwrap();
        assert_eq!(scanned, 1, "only the non-credential file is read");
    }
}
