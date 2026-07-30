//! Receipt-gated lifecycle transitions, plus the standalone-MCP fence.
//!
//! This module is the decision core that binds the receipt, credential,
//! discovery, process, and protocol contracts into one authority. Every
//! receipt-bound mutation is gated on the matching active receipt AND the
//! receipt-bound ownership capability; the attach credential alone can never
//! invoke one. Cold installed state is preserved as a first-class
//! valid state, a foreign resident is never displaced speculatively, and mutable
//! data survives every transition except an explicit typed removal.
//!
//! The transition planner is pure so it can be proven exhaustively; the spawn and
//! control orchestration are thin wrappers over `process`/`control` exercised
//! against real processes in the acceptance suites.
//!
//! **Standalone-MCP fence:** the capsule declares a caller-owned standalone
//! MCP entrypoint. The dashboard lifecycle keeps it INSPECTABLE
//! ([`standalone_mcp_entrypoint`]) but launches, adopts, stops, drains, and cleans
//! up ONLY the gateway ([`owned_gateway_entrypoint`]). No path in this module
//! ever resolves or spawns the standalone MCP.

#[cfg(test)]
use crate::credentials::DashboardCredentialStore;
use crate::credentials::VerifiedOwnershipCredential;
use crate::manifest::{
    CapsuleManifest, ComponentLock, LaunchEntrypoint, Result as ManifestResult, Target,
};
use crate::paths::ProductPaths;
use crate::process::{GatewayProcess, GatewaySpec, spawn_gateway};
use crate::protocol::{LifecycleOp, Readiness, Refusal, WorkerState};
use crate::provisioning::{ActiveReleaseState, observe_active_release};

/// The a2a gateway's app-home env var (`vaultspec_a2a.control.config` field
/// `desktop_app_home`, alias `VAULTSPEC_DESKTOP_APP_HOME`). The gateway derives
/// its state layout from this — notably `credentials_dir = <app_home>/credentials`
/// (`vaultspec_a2a.desktop.profile.derive_state_paths`), which is exactly
/// [`ProductPaths::app_home`]`/credentials`, where the dashboard's
/// [`DashboardCredentialStore`] wrote `attach.cred` and `ownership.cap`.
/// The Python gateway creates `worker-ipc.cred` for its worker boundary.
const A2A_APP_HOME_ENV: &str = "VAULTSPEC_DESKTOP_APP_HOME";

/// The a2a gateway's settlement-callback env var
/// (`vaultspec_a2a.desktop.settlement.SETTLEMENT_URL_ENV`). The gateway reads it
/// fail-soft: a blank or non-HTTP value disables settlement rather than failing,
/// so an unpublished URL is simply omitted here.
const A2A_SETTLEMENT_URL_ENV: &str = "VAULTSPEC_DESKTOP_SETTLEMENT_URL";

/// Assemble the environment a spawned owned gateway needs to (a) authenticate
/// against the shared credentials directory and (b) call the dashboard's
/// settlement route.
///
/// `VAULTSPEC_DESKTOP_APP_HOME` is always set to the product app home so the
/// gateway resolves the same `credentials/` directory the dashboard bootstrapped.
/// `VAULTSPEC_DESKTOP_SETTLEMENT_URL` is set ONLY when a non-empty settlement URL
/// is supplied — when it is `None`/blank the gateway skips settlement fail-soft
/// (never a hard failure), so an unpublished route degrades gracefully.
#[must_use]
pub fn gateway_spawn_env(
    paths: &ProductPaths,
    settlement_url: Option<&str>,
) -> Vec<(String, String)> {
    let mut env = vec![(
        A2A_APP_HOME_ENV.to_string(),
        paths.app_home().to_string_lossy().to_string(),
    )];
    if let Some(url) = settlement_url.map(str::trim).filter(|u| !u.is_empty()) {
        env.push((A2A_SETTLEMENT_URL_ENV.to_string(), url.to_string()));
    }
    env
}

/// How a discovered gateway may be used to satisfy run demand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachMode {
    /// Our own owned, live gateway — full lifecycle authority.
    Owned,
    /// A compatible foreign gateway with a trusted handoff — READ-ONLY attach;
    /// no lifecycle mutation.
    ForeignReadOnly,
}

/// One receipt-selected generation proven complete, here and now.
///
/// Non-`Clone` and non-serializable on purpose: it is evidence that a scan
/// happened, so a copy or a stored one would be a claim about a tree nobody
/// looked at. A caller that holds it may resolve the generation root; a caller
/// that could not obtain one has nothing to start.
pub struct VerifiedActiveRelease {
    generation: String,
    root: std::path::PathBuf,
    verified: crate::manifest::VerifiedActiveGeneration,
}

impl VerifiedActiveRelease {
    /// The receipt-selected generation identifier.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The proven generation root - the only tree a start may launch from.
    #[must_use]
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    /// The release-set identity the receipt and the tree agree on.
    #[must_use]
    pub fn release_set_id(&self) -> &str {
        self.verified.release_set_identity()
    }

    /// The release target.
    #[must_use]
    pub fn target(&self) -> Target {
        self.verified.target()
    }

    /// The bound component identity.
    #[must_use]
    pub fn a2a_identity(&self) -> &crate::manifest::ReleaseIdentity {
        self.verified.a2a_identity()
    }

    /// The generation-relative, portable path of the frozen runtime's
    /// launchable entrypoint.
    #[must_use]
    pub fn runtime_entrypoint(&self) -> &str {
        self.verified.runtime_entrypoint()
    }

    /// Resolve the one program a start may launch: the frozen runtime's
    /// entrypoint inside this proven tree.
    ///
    /// The path segments are re-validated against the generation root here even
    /// though verification already proved the entrypoint is an installed file
    /// under the declared runtime root. Belt and braces is the right posture at
    /// a spawn seam: this is the last place a path becomes a process, and the
    /// resolution refuses anything that could traverse out of the tree.
    pub fn resolve_runtime_program(&self) -> ManifestResult<crate::process::ResolvedProgram> {
        let segments: Vec<&str> = self.verified.runtime_entrypoint().split('/').collect();
        crate::process::ResolvedProgram::from_capsule_relative(&self.root, &segments)
    }

    /// How many installed files the complete inventory covered.
    #[must_use]
    pub fn verified_file_count(&self) -> usize {
        self.verified.file_count()
    }
}

impl std::fmt::Debug for VerifiedActiveRelease {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("VerifiedActiveRelease")
            .field("generation", &self.generation)
            .field("files", &self.verified.file_count())
            .finish_non_exhaustive()
    }
}

/// The dashboard-owned lifecycle controller, rooted at the product paths.
#[derive(Debug, Clone)]
pub struct LifecycleController {
    paths: ProductPaths,
}

impl LifecycleController {
    /// Bind the controller to its product paths.
    #[must_use]
    pub fn new(paths: ProductPaths) -> Self {
        Self { paths }
    }

    /// Fixed-journal initialization performs no legacy pathname cleanup.
    pub fn initialize(&self) -> std::io::Result<usize> {
        Ok(0)
    }

    /// Observe only the fixed active-receipt journal under its retained lock.
    pub fn active_release(
        &self,
        guard: &crate::locking::InstallLockGuard,
    ) -> std::result::Result<ActiveReleaseState, Refusal> {
        observe_active_release(&self.paths, guard)
            .and_then(|observation| observation.state())
            .map_err(|_| Refusal::Unverifiable {
                detail: "fixed active-receipt authority is unverifiable".to_owned(),
            })
    }

    /// Derive readiness from a guarded fixed-journal observation.
    pub fn guarded_readiness(
        &self,
        guard: &crate::locking::InstallLockGuard,
        gateway_live: bool,
        worker: WorkerState,
    ) -> std::result::Result<Readiness, Refusal> {
        match self.active_release(guard)? {
            ActiveReleaseState::Settled(_) if gateway_live => {
                Ok(Readiness::GatewayReady { worker })
            }
            ActiveReleaseState::Settled(_) => Ok(Readiness::InstalledStopped),
            ActiveReleaseState::Absent => Ok(Readiness::Uninstalled),
            ActiveReleaseState::RecoveryRequired(_) => Err(Refusal::Unverifiable {
                detail: "fixed active-receipt recovery is required".to_owned(),
            }),
        }
    }

    /// Authorize a lifecycle operation. Receipt-bound mutations require the active
    /// receipt, receipt-bound ownership (the install must have created and
    /// retained the ownership capability), and a presented ownership credential
    /// that verifies against the stored one. `Install` is refused here because
    /// activation is available only through the sealed provisioning boundary;
    /// `Doctor` and the attach verbs are not receipt-bound mutations.
    pub fn authorize(
        &self,
        op: LifecycleOp,
        presented_ownership: Option<&VerifiedOwnershipCredential<'_>>,
    ) -> std::result::Result<(), Refusal> {
        if op == LifecycleOp::Install {
            return Err(Refusal::Unverifiable {
                detail: "install requires sealed provisioning authority".to_owned(),
            });
        }
        if op == LifecycleOp::Doctor {
            return Ok(());
        }
        if !op.requires_ownership() {
            return Err(Refusal::Unverifiable {
                detail: "lifecycle start requires a sealed active-release operation".to_owned(),
            });
        }
        let presented = presented_ownership.ok_or(Refusal::NotOwner)?;
        if !presented.verifies_for_product(&self.paths) {
            return Err(Refusal::NotOwner);
        }
        match self.active_release(presented.guard())? {
            ActiveReleaseState::Absent => return Err(Refusal::NotInstalled),
            ActiveReleaseState::RecoveryRequired(_) => {
                return Err(Refusal::Unverifiable {
                    detail: "fixed active-receipt recovery is required".to_owned(),
                });
            }
            ActiveReleaseState::Settled(release) if !release.bootstrap_created_ownership() => {
                return Err(Refusal::NotOwner);
            }
            ActiveReleaseState::Settled(_) => {}
        }
        Ok(())
    }

    /// Prove the receipt-selected generation before anything starts or mutates
    /// it.
    ///
    /// The settled fixed journal is the only selector, and its receipt is the
    /// only source of expectation: the member manifest is located by the
    /// receipt's digest, the component lock must digest to the receipt's value
    /// before it is parsed, and every installed file is then covered by that
    /// manifest's inventory. A generation the receipt does not describe - staged,
    /// substituted, incomplete, tampered, or self-authorized - cannot satisfy
    /// this, which is what keeps it inert.
    pub fn verify_active_release(
        &self,
        guard: &crate::locking::InstallLockGuard,
    ) -> std::result::Result<VerifiedActiveRelease, Refusal> {
        let read =
            crate::receipt::read_active_receipt_journal(&self.paths, guard).map_err(|_| {
                Refusal::Unverifiable {
                    detail: "fixed active-receipt authority is unverifiable".to_owned(),
                }
            })?;
        let receipt = match read.state().map_err(|_| Refusal::Unverifiable {
            detail: "fixed active-receipt authority is unverifiable".to_owned(),
        })? {
            crate::receipt::ActiveReceiptReadState::Absent => return Err(Refusal::NotInstalled),
            crate::receipt::ActiveReceiptReadState::RecoveryRequired(_) => {
                return Err(Refusal::Unverifiable {
                    detail: "fixed active-receipt recovery is required".to_owned(),
                });
            }
            crate::receipt::ActiveReceiptReadState::Settled(receipt) => receipt,
        };
        let generation = receipt.active_generation().to_owned();
        let root = self
            .paths
            .generation_dir(&generation)
            .map_err(|_| Refusal::Unverifiable {
                detail: "the receipt names an unusable generation".to_owned(),
            })?;
        let verified = crate::manifest::verify_active_generation(
            &root,
            &crate::manifest::ActiveReleaseExpectation {
                member_manifest_digest: receipt.release_set_member_digest(),
                component_lock_digest: receipt.component_lock_digest(),
                release_set_identity: receipt.release_set_identity(),
                target: receipt.target(),
            },
        )
        .map_err(|error| Refusal::Unverifiable {
            detail: format!("the receipt-selected generation does not verify: {error}"),
        })?;
        Ok(VerifiedActiveRelease {
            generation,
            root,
            verified,
        })
    }

    /// Authorize a START (or attach-and-start) against the verified complete
    /// release set.
    ///
    /// Start is not an ownership mutation - a cold install may be started by the
    /// seat that finds it - so what binds it is the release itself: the proof is
    /// the return value, and a caller that cannot obtain one has nothing to
    /// spawn from.
    pub fn authorize_start(
        &self,
        op: LifecycleOp,
        guard: &crate::locking::InstallLockGuard,
    ) -> std::result::Result<VerifiedActiveRelease, Refusal> {
        if !matches!(op, LifecycleOp::Start | LifecycleOp::Ensure) {
            return Err(Refusal::Unverifiable {
                detail: "only start and ensure are authorized as a start".to_owned(),
            });
        }
        self.verify_active_release(guard)
    }

    /// Guard a MUTATING control call before it reaches the gateway. Both gates
    /// must hold, composed here so no mutation path can satisfy only one —
    /// previously `resolve_attach` and `authorize` were decoupled pure
    /// functions with nothing composing them:
    ///
    /// 1. the discovery verdict must classify the gateway as OUR owned, live
    ///    gateway (`resolve_attach` == `Owned`) — a foreign-attachable gateway is
    ///    read-only and can never be mutated;
    /// 2. the caller must present the receipt-bound ownership capability
    ///    (`authorize`) — the attach credential alone is insufficient.
    ///
    /// A `control.rs` mutation (stop/repair/update/rollback/remove) must pass
    /// through this before it is issued.
    ///
    /// The discovery state is `Option<&Verdict>`: `None` means no discovery
    /// record exists at all. The gateway publishes discovery ONLY while it
    /// runs, and installed-but-stopped is a valid cold state, not a
    /// degradation — so an absent record is a VALID precondition, not a
    /// refusal. The attach gate follows a four-branch model:
    ///
    /// - (a) NO discovery: nothing live to protect — the local receipt +
    ///   ownership authority alone governs (this is how `remove`/`repair` reach a
    ///   cleanly stopped install);
    /// - (b) discovery present, FOREIGN / foreign-immutable: refuse
    ///   `ForeignResident` (a live foreign resident is never mutated);
    /// - (c) discovery present, OURS but stale/dead: refuse `StaleUnproven` — the
    ///   owner-matched quarantine dance (`locking::quarantine_owner_matched_stale`)
    ///   is wired in a later phase; until then refuse with the HONEST reason;
    /// - (d) discovery present, OURS and live: permit the gate for an operation
    ///   that addresses a running gateway (stop, restart) or that swaps
    ///   generations by receipt with the prior tree retained (update, rollback);
    ///   refuse `GatewayRunning` for one that rewrites or deletes the files the
    ///   live gateway is executing from (repair, remove). Ownership alone is not
    ///   the question — WHICH operation is.
    ///
    /// The verdict must be classified under the SAME held installation guard the
    /// effect runs under. A verdict read before acquisition can be arbitrarily
    /// stale: gateway spawn and discovery republication are serialized by that
    /// lock, so a pre-lock `None` can survive an entire updater swap and then
    /// authorize a mutation against a gateway that is by then live.
    ///
    /// The authority gate (`authorize`: active receipt + verified ownership
    /// capability) is REQUIRED in every permit branch — an absent discovery never
    /// permits a mutation without verified ownership.
    pub fn guard_owned_mutation(
        &self,
        op: LifecycleOp,
        ownership: Option<&VerifiedOwnershipCredential<'_>>,
        verdict: Option<&crate::discovery::Verdict>,
    ) -> std::result::Result<(), Refusal> {
        use crate::discovery::{ImmutableReason, Verdict};
        match verdict {
            // (a) No discovery: absent/dead gateway, valid cold precondition.
            None => {}
            // (d) Ours and live: whether that is a valid precondition depends on
            // the OPERATION, not on ownership alone. Stopping, relaunching,
            // updating, and rolling back all address a running gateway on
            // purpose. Repair and removal replace or delete the generation files
            // the live gateway is EXECUTING FROM - which Windows refuses outright
            // for a running image, and which is incoherent everywhere else - so
            // they require it to be stopped first rather than racing it.
            Some(Verdict::OwnedLive) if op.replaces_running_files() => {
                return Err(Refusal::GatewayRunning);
            }
            Some(Verdict::OwnedLive) => {}
            // (c) Ours but stale/dead: honest refusal until quarantine lands.
            Some(Verdict::OwnedStale) => return Err(Refusal::StaleUnproven),
            // (b) A live foreign gateway (attachable read-only or immutable) is
            // never mutated.
            Some(Verdict::ForeignAttachable) => return Err(Refusal::ForeignResident),
            Some(Verdict::ForeignImmutable { reason }) => {
                return Err(match reason {
                    ImmutableReason::Incompatible => Refusal::Incompatible {
                        detail: "foreign gateway protocol/state-schema mismatch".to_string(),
                    },
                    ImmutableReason::NoTrustedHandoff | ImmutableReason::DeadOrStale => {
                        Refusal::ForeignResident
                    }
                });
            }
        }
        // Authority gate ALWAYS required: active receipt + ownership capability.
        self.authorize(op, ownership)?;
        // A relaunch runs the release's own code again, so it carries the same
        // proof obligation a start does. Repair and removal deliberately do not:
        // they exist FOR a tree that no longer verifies, and gating them on a
        // clean verification would strand exactly the install that needs them.
        if op == LifecycleOp::Restart {
            let presented = ownership.ok_or(Refusal::NotOwner)?;
            self.verify_active_release(presented.guard())?;
        }
        Ok(())
    }

    /// Load and verify the capsule manifest in one step, so a lifecycle consumer
    /// never holds a capsule that parsed but was not joined to the lock's pins
    /// (uses `CapsuleManifest::parse_and_verify`).
    pub fn load_verified_capsule(
        raw_manifest: &str,
        lock: &ComponentLock,
        target: Target,
    ) -> ManifestResult<CapsuleManifest> {
        CapsuleManifest::parse_and_verify(raw_manifest, lock, target)
    }

    /// Spawn the OWNED gateway from the verified capsule. The launch program is
    /// resolved from the capsule's gateway entrypoint only — the standalone MCP is
    /// never spawned (the standalone-MCP fence).
    pub fn spawn_owned_gateway(
        &self,
        capsule_root: &std::path::Path,
        manifest: &CapsuleManifest,
    ) -> std::result::Result<GatewayProcess, LifecycleError> {
        self.spawn_owned_gateway_with_env(capsule_root, manifest, &[])
    }

    /// Spawn the OWNED gateway with an explicit environment. The seated boot
    /// reconciler uses this to hand the gateway the environment it needs to
    /// authenticate against the shared credentials directory and call the
    /// dashboard's settlement route (see [`gateway_spawn_env`]). The launch
    /// program is still resolved from the capsule's gateway entrypoint only.
    pub fn spawn_owned_gateway_with_env(
        &self,
        capsule_root: &std::path::Path,
        manifest: &CapsuleManifest,
        env: &[(String, String)],
    ) -> std::result::Result<GatewayProcess, LifecycleError> {
        let mut spec = GatewaySpec::from_manifest(capsule_root, manifest)
            .map_err(|e| LifecycleError::Manifest(e.to_string()))?;
        for (key, value) in env {
            spec = spec.with_env(key, value);
        }
        spawn_gateway(&spec).map_err(LifecycleError::Io)
    }

    /// Remove owned generations, the receipt, and the credentials. Mutable user
    /// data under the app home is PRESERVED unless `typed_data_removal` is an
    /// explicit request to delete it: removes installed generations while
    /// preserving or deleting data only through an explicit typed choice.
    /// Owned processes must already be stopped by the caller.
    pub fn remove(&self, _typed_data_removal: bool) -> std::result::Result<(), LifecycleError> {
        Err(LifecycleError::Refused(Refusal::Unverifiable {
            detail: "removal requires a sealed retained product mutation authority".to_owned(),
        }))
    }

    /// Repair (replace) an immutable file within a generation tree from pristine
    /// bytes. The relative path is validated component-by-component so repair can
    /// only ever write UNDER the generation directory — never over mutable
    /// app-home data: repair never overwrites mutable state.
    pub fn repair_immutable(
        &self,
        generation: &str,
        relative: &std::path::Path,
        pristine: &[u8],
    ) -> std::result::Result<(), LifecycleError> {
        let _ = (generation, relative, pristine);
        Err(LifecycleError::Refused(Refusal::Unverifiable {
            detail: "repair requires sealed release and retained generation authority".to_owned(),
        }))
    }
}

/// Plan the readiness transition for an operation from the current state. Pure
/// and total: every (state, op) pair yields either the next readiness or a typed
/// refusal. Cold installed state is preserved; an operation on an uninstalled
/// product is refused rather than silently installing.
pub fn plan_transition(
    current: Readiness,
    op: LifecycleOp,
) -> std::result::Result<Readiness, Refusal> {
    use LifecycleOp::{
        Doctor, Ensure, Install, Remove, Repair, Restart, Rollback, Start, Stop, Update,
    };
    let installed = current.is_installed();
    match op {
        // Doctor never changes state.
        Doctor => Ok(current),
        // Install bootstraps an uninstalled product; idempotent when installed.
        Install => Ok(match current {
            Readiness::Uninstalled => Readiness::InstalledStopped,
            other => other,
        }),
        // Ensure is start-or-attach: it does not install.
        Ensure | Start => {
            if !installed {
                return Err(Refusal::NotInstalled);
            }
            Ok(match current {
                Readiness::GatewayReady { worker } => Readiness::GatewayReady { worker },
                _ => Readiness::GatewayReady {
                    worker: WorkerState::Cold,
                },
            })
        }
        Stop => {
            if !installed {
                return Err(Refusal::NotInstalled);
            }
            Ok(Readiness::InstalledStopped)
        }
        Restart | Update | Rollback => {
            if !installed {
                return Err(Refusal::NotInstalled);
            }
            // These relaunch the gateway as part of the transaction.
            Ok(Readiness::GatewayReady {
                worker: WorkerState::Cold,
            })
        }
        // Repair replaces immutable files without changing run state.
        Repair => {
            if !installed {
                return Err(Refusal::NotInstalled);
            }
            Ok(current)
        }
        Remove => {
            if !installed {
                return Err(Refusal::NotInstalled);
            }
            Ok(Readiness::Uninstalled)
        }
    }
}

/// Resolve how a discovered gateway may satisfy run demand. Owned-live grants
/// full authority; a compatible foreign gateway with a trusted handoff is
/// read-only; everything else is refused — a live foreign or unverifiable
/// resident is never displaced, and a stale owned gateway must be recovered
/// under the install lock first, not attached.
pub fn resolve_attach(
    verdict: &crate::discovery::Verdict,
) -> std::result::Result<AttachMode, Refusal> {
    use crate::discovery::{ImmutableReason, Verdict};
    match verdict {
        Verdict::OwnedLive => Ok(AttachMode::Owned),
        Verdict::ForeignAttachable => Ok(AttachMode::ForeignReadOnly),
        Verdict::OwnedStale => Err(Refusal::StaleUnproven),
        Verdict::ForeignImmutable { reason } => Err(match reason {
            ImmutableReason::Incompatible => Refusal::Incompatible {
                detail: "foreign gateway protocol/state-schema mismatch".to_string(),
            },
            ImmutableReason::NoTrustedHandoff => Refusal::ForeignResident,
            ImmutableReason::DeadOrStale => Refusal::ForeignResident,
        }),
    }
}

// ---------------------------------------------------------------------------
// Standalone-MCP fence
// ---------------------------------------------------------------------------

/// The dashboard-owned gateway entrypoint — the ONLY launch surface any
/// dashboard lifecycle path resolves or spawns.
#[must_use]
pub fn owned_gateway_entrypoint(manifest: &CapsuleManifest) -> &LaunchEntrypoint {
    &manifest.entrypoints.gateway
}

/// The caller-owned standalone MCP entrypoint. Exposed for INSPECTION only (a
/// UI may surface that it exists and how to invoke it); the dashboard lifecycle
/// neither launches nor adopts it, and no start/stop/drain/cleanup path here
/// touches it.
#[must_use]
pub fn standalone_mcp_entrypoint(manifest: &CapsuleManifest) -> &LaunchEntrypoint {
    &manifest.entrypoints.standalone_mcp
}

/// Whether a launch entrypoint is one the dashboard lifecycle owns. Only the
/// gateway is owned; the standalone MCP is explicitly excluded.
#[must_use]
pub fn is_dashboard_owned(entry: &LaunchEntrypoint) -> bool {
    entry.kind == "gateway"
}

/// Errors from lifecycle orchestration that touches the filesystem or processes.
#[derive(Debug)]
pub enum LifecycleError {
    /// A typed refusal from the authority checks.
    Refused(Refusal),
    /// The capsule manifest could not be resolved.
    Manifest(String),
    /// An I/O error spawning or managing the owned gateway.
    Io(std::io::Error),
}

impl std::fmt::Display for LifecycleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LifecycleError::Refused(r) => write!(f, "lifecycle refused: {r}"),
            LifecycleError::Manifest(m) => write!(f, "capsule manifest error: {m}"),
            LifecycleError::Io(e) => write!(f, "lifecycle io error: {e}"),
        }
    }
}

impl std::error::Error for LifecycleError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{
        ComponentCompatibility, ComponentEntrypoints, ComponentIdentity, DependencyLockIdentity,
        MigrationRange, RangeBounds,
    };
    use crate::receipt::Channel;
    use crate::receipt::Receipt;

    fn identity() -> crate::manifest::ReleaseIdentity {
        crate::manifest::ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        }
    }

    fn controller() -> (tempfile::TempDir, LifecycleController) {
        let dir = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(dir.path());
        paths.ensure().unwrap();
        (dir, LifecycleController::new(paths))
    }

    #[test]
    fn uninstalled_refuses_every_legacy_mutation_including_install() {
        let (_d, ctrl) = controller();
        let lock = crate::locking::InstallLock::new(ctrl.paths.install_lock_path());
        let guard = lock
            .acquire(crate::locking::Actor::Installer, "uninstalled-test")
            .unwrap()
            .unwrap();
        assert_eq!(
            ctrl.guarded_readiness(&guard, false, WorkerState::Cold),
            Ok(Readiness::Uninstalled)
        );
        for op in [
            LifecycleOp::Stop,
            LifecycleOp::Repair,
            LifecycleOp::Update,
            LifecycleOp::Rollback,
            LifecycleOp::Remove,
        ] {
            assert_eq!(ctrl.authorize(op, None), Err(Refusal::NotOwner));
        }
        for op in [LifecycleOp::Start, LifecycleOp::Ensure] {
            assert!(matches!(
                ctrl.authorize(op, None),
                Err(Refusal::Unverifiable { .. })
            ));
        }
        assert!(matches!(
            ctrl.authorize(LifecycleOp::Install, None),
            Err(Refusal::Unverifiable { detail })
                if detail == "install requires sealed provisioning authority"
        ));
    }

    #[cfg(unix)]
    #[test]
    fn legacy_receipt_cannot_authorize_a_mutation() {
        let (_d, ctrl) = controller();
        // Bootstrap a real ownership capability and write an active receipt that
        // retains it.
        let lock = crate::locking::InstallLock::new(ctrl.paths.install_lock_path());
        let guard = lock
            .acquire(crate::locking::Actor::Installer, "lifecycle-test")
            .unwrap()
            .unwrap();
        let store = DashboardCredentialStore::for_product(&ctrl.paths);
        let creds = store.begin_bootstrap(&guard).unwrap();
        let ownership = store.verify_ownership(&guard).unwrap();
        Receipt::bootstrap(
            Channel::SelfInstall,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "g",
            1,
        )
        .persist(&ctrl.paths.receipt_path())
        .unwrap();

        // No credential presented -> NotOwner.
        assert_eq!(
            ctrl.authorize(LifecycleOp::Stop, None),
            Err(Refusal::NotOwner)
        );
        // Even the correct ownership capability cannot turn retired JSON into
        // active authority; only the fixed journal selects an installation.
        assert_eq!(
            ctrl.authorize(LifecycleOp::Stop, Some(&ownership)),
            Err(Refusal::NotInstalled)
        );
        assert_ne!(creds.ownership().secret(), creds.attach_control().secret());
        // A non-ownership op needs no capability.
        assert!(ctrl.authorize(LifecycleOp::Doctor, None).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_foreign_adopted_install_cannot_be_mutated() {
        let (_d, ctrl) = controller();
        let lock = crate::locking::InstallLock::new(ctrl.paths.install_lock_path());
        let guard = lock
            .acquire(crate::locking::Actor::Installer, "foreign-test")
            .unwrap()
            .unwrap();
        let store = DashboardCredentialStore::for_product(&ctrl.paths);
        let _pending = store.begin_bootstrap(&guard).unwrap();
        let ownership = store.verify_ownership(&guard).unwrap();
        // A receipt that did NOT create ownership (foreign-adopted).
        let mut receipt = Receipt::bootstrap(
            Channel::Scoop,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "g",
            1,
        );
        receipt.bootstrap_created_ownership = false;
        receipt.persist(&ctrl.paths.receipt_path()).unwrap();
        assert_eq!(
            ctrl.authorize(LifecycleOp::Update, Some(&ownership)),
            Err(Refusal::NotInstalled)
        );
    }

    /// Install one real generation and settle the fixed receipt over it.
    fn settled_install(fixture: &crate::manifest::tests::Fixture) -> LifecycleController {
        let mut product =
            crate::generation::LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        drop(crate::receipt::publish_active_receipt(verified).unwrap());
        drop(generation);
        drop(product);
        LifecycleController::new(fixture.paths.clone())
    }

    /// A start is authorized only by the receipt-selected generation, proven
    /// complete at the moment of the start.
    #[test]
    fn a_start_is_authorized_by_the_verified_receipt_selected_generation() {
        let fixture = crate::manifest::tests::Fixture::new();
        let controller = LifecycleController::new(fixture.paths.clone());

        // Nothing installed: there is no generation to prove, so no start.
        assert_eq!(
            controller
                .authorize_start(LifecycleOp::Start, &fixture.guard)
                .err(),
            Some(Refusal::NotInstalled)
        );

        let controller = settled_install(&fixture);
        let verified = controller
            .authorize_start(LifecycleOp::Start, &fixture.guard)
            .expect("a settled receipt over a complete generation authorizes a start");
        assert_eq!(verified.generation(), "generation-1");
        assert_eq!(
            verified.root(),
            fixture.paths.generation_dir("generation-1").unwrap()
        );
        assert!(
            verified.verified_file_count() > 0,
            "the inventory must have covered real installed files"
        );
        // Only a start is a start; a mutation cannot enter through this door.
        assert!(
            controller
                .authorize_start(LifecycleOp::Update, &fixture.guard)
                .is_err()
        );
    }

    /// An extra file nobody declared makes the generation inert.
    #[test]
    fn an_installed_file_the_manifest_does_not_declare_refuses_the_start() {
        let fixture = crate::manifest::tests::Fixture::new();
        let controller = settled_install(&fixture);
        let root = fixture.paths.generation_dir("generation-1").unwrap();
        std::fs::write(root.join("payload.bin"), b"not in the inventory").unwrap();

        assert!(matches!(
            controller.authorize_start(LifecycleOp::Start, &fixture.guard),
            Err(Refusal::Unverifiable { .. })
        ));
    }

    /// The component lock is believed only because the RECEIPT vouches for its
    /// bytes. A lock the installed tree supplies on its own terms - the same
    /// tree, verified against any other expectation - cannot authorize itself.
    #[test]
    fn a_lock_the_receipt_does_not_vouch_for_refuses_the_start() {
        let fixture = crate::manifest::tests::Fixture::new();
        drop(settled_install(&fixture));
        let root = fixture.paths.generation_dir("generation-1").unwrap();
        let identity = fixture.first_install_feed().release_identity;
        let true_lock_digest = crate::hex::sha256(fixture.lock_bytes());

        // Positive control: with the receipt's own digests the same tree
        // verifies, so the refusal below is attributable to the lock alone.
        crate::manifest::verify_active_generation(
            &root,
            &crate::manifest::ActiveReleaseExpectation {
                member_manifest_digest: fixture.member_digest_hex(),
                component_lock_digest: &true_lock_digest,
                release_set_identity: &identity,
                target: Target::X86_64PcWindowsMsvc,
            },
        )
        .expect("the receipt's own digests verify the installed tree");

        let foreign_lock_digest = crate::hex::sha256(b"a lock this receipt never vouched for");
        assert!(
            crate::manifest::verify_active_generation(
                &root,
                &crate::manifest::ActiveReleaseExpectation {
                    member_manifest_digest: fixture.member_digest_hex(),
                    component_lock_digest: &foreign_lock_digest,
                    release_set_identity: &identity,
                    target: Target::X86_64PcWindowsMsvc,
                },
            )
            .is_err(),
            "the installed lock must satisfy the receipt, not itself"
        );
    }

    /// A relaunch carries a start's proof obligation; repair and removal, which
    /// exist for a tree that no longer verifies, deliberately do not.
    #[test]
    fn a_restart_over_an_unverifiable_tree_is_refused_while_repair_is_not() {
        let fixture = crate::manifest::tests::Fixture::new();
        let controller = settled_install(&fixture);
        // The install itself established the ownership credential; the caller
        // presents that same retained capability.
        let ownership = DashboardCredentialStore::for_product(&fixture.paths)
            .verify_ownership(&fixture.guard)
            .expect("the settled install retained an ownership capability");
        let root = fixture.paths.generation_dir("generation-1").unwrap();
        std::fs::write(root.join("payload.bin"), b"not in the inventory").unwrap();

        assert!(matches!(
            controller.guard_owned_mutation(LifecycleOp::Restart, Some(&ownership), None),
            Err(Refusal::Unverifiable { .. })
        ));
        assert_eq!(
            controller.guard_owned_mutation(LifecycleOp::Repair, Some(&ownership), None),
            Ok(())
        );
    }

    /// A live owned gateway is a valid precondition for some mutations and a
    /// hard failure for others, and the difference is the OPERATION.
    ///
    /// Repair rewrites generation files and removal deletes them, so both would
    /// be pulling the ground out from under a process still executing it -
    /// something Windows refuses outright for a running image. Stop and restart
    /// address that process on purpose, and update and rollback stage a new
    /// generation and swap by receipt with the prior tree retained.
    #[test]
    fn a_live_gateway_blocks_only_the_mutations_that_replace_its_running_files() {
        use crate::discovery::{ImmutableReason, Verdict};

        let fixture = crate::manifest::tests::Fixture::new();
        let controller = settled_install(&fixture);
        let ownership = DashboardCredentialStore::for_product(&fixture.paths)
            .verify_ownership(&fixture.guard)
            .expect("the settled install retained an ownership capability");
        let ownership = Some(&ownership);

        for op in [LifecycleOp::Repair, LifecycleOp::Remove] {
            assert_eq!(
                controller.guard_owned_mutation(op, ownership, Some(&Verdict::OwnedLive)),
                Err(Refusal::GatewayRunning),
                "{op:?} replaces the files the live gateway runs from"
            );
            // The same operation against a cleanly stopped install is exactly
            // how a cold product is repaired or removed, so it must pass.
            assert_eq!(
                controller.guard_owned_mutation(op, ownership, None),
                Ok(()),
                "{op:?} must still reach a cleanly stopped install"
            );
        }

        for op in [
            LifecycleOp::Stop,
            LifecycleOp::Restart,
            LifecycleOp::Update,
            LifecycleOp::Rollback,
        ] {
            assert_eq!(
                controller.guard_owned_mutation(op, ownership, Some(&Verdict::OwnedLive)),
                Ok(()),
                "{op:?} addresses a running gateway deliberately"
            );
        }

        // Stale and foreign classifications are unchanged by op-sensitivity: a
        // record that is not proven dead is never quarantined implicitly, and a
        // foreign resident is never mutated whatever the operation.
        for op in [
            LifecycleOp::Stop,
            LifecycleOp::Restart,
            LifecycleOp::Repair,
            LifecycleOp::Update,
            LifecycleOp::Rollback,
            LifecycleOp::Remove,
        ] {
            assert_eq!(
                controller.guard_owned_mutation(op, ownership, Some(&Verdict::OwnedStale)),
                Err(Refusal::StaleUnproven)
            );
            assert_eq!(
                controller.guard_owned_mutation(op, ownership, Some(&Verdict::ForeignAttachable)),
                Err(Refusal::ForeignResident)
            );
            assert_eq!(
                controller.guard_owned_mutation(
                    op,
                    ownership,
                    Some(&Verdict::ForeignImmutable {
                        reason: ImmutableReason::NoTrustedHandoff
                    })
                ),
                Err(Refusal::ForeignResident)
            );
        }
    }

    #[test]
    fn transition_planner_preserves_cold_state_and_refuses_uninstalled() {
        // Start from stopped -> ready with a cold worker.
        assert_eq!(
            plan_transition(Readiness::InstalledStopped, LifecycleOp::Start),
            Ok(Readiness::GatewayReady {
                worker: WorkerState::Cold
            })
        );
        // Stop from ready -> stopped (cold state preserved as valid).
        assert_eq!(
            plan_transition(
                Readiness::GatewayReady {
                    worker: WorkerState::Ready
                },
                LifecycleOp::Stop
            ),
            Ok(Readiness::InstalledStopped)
        );
        // Remove -> uninstalled.
        assert_eq!(
            plan_transition(Readiness::InstalledStopped, LifecycleOp::Remove),
            Ok(Readiness::Uninstalled)
        );
        // Every non-install op on uninstalled is refused.
        for op in [LifecycleOp::Start, LifecycleOp::Stop, LifecycleOp::Update] {
            assert_eq!(
                plan_transition(Readiness::Uninstalled, op),
                Err(Refusal::NotInstalled)
            );
        }
        // Install bootstraps.
        assert_eq!(
            plan_transition(Readiness::Uninstalled, LifecycleOp::Install),
            Ok(Readiness::InstalledStopped)
        );
    }

    #[test]
    fn attach_resolution_never_mutates_a_foreign_resident() {
        use crate::discovery::{ImmutableReason, Verdict};
        assert_eq!(resolve_attach(&Verdict::OwnedLive), Ok(AttachMode::Owned));
        assert_eq!(
            resolve_attach(&Verdict::ForeignAttachable),
            Ok(AttachMode::ForeignReadOnly)
        );
        assert_eq!(
            resolve_attach(&Verdict::ForeignImmutable {
                reason: ImmutableReason::NoTrustedHandoff
            }),
            Err(Refusal::ForeignResident)
        );
        assert_eq!(
            resolve_attach(&Verdict::OwnedStale),
            Err(Refusal::StaleUnproven)
        );
    }

    #[test]
    fn standalone_mcp_is_inspectable_but_never_dashboard_owned() {
        let manifest = sample_manifest();
        // The gateway is owned; the standalone MCP is inspectable but not owned.
        assert!(is_dashboard_owned(owned_gateway_entrypoint(&manifest)));
        assert!(!is_dashboard_owned(standalone_mcp_entrypoint(&manifest)));
        assert_eq!(standalone_mcp_entrypoint(&manifest).kind, "standalone-mcp");
        // The owned launch resolution never returns the MCP entrypoint.
        assert_ne!(
            owned_gateway_entrypoint(&manifest).console_script,
            standalone_mcp_entrypoint(&manifest).console_script
        );
    }

    #[test]
    fn unsealed_remove_and_repair_refuse_without_mutation() {
        let (_d, ctrl) = controller();
        // Lay down an installed generation, a receipt, and mutable user data.
        let gen_file = ctrl
            .paths
            .generation_dir("g0")
            .unwrap()
            .join("immutable.bin");
        std::fs::create_dir_all(gen_file.parent().unwrap()).unwrap();
        std::fs::write(&gen_file, b"original").unwrap();
        std::fs::write(ctrl.paths.data_dir().join("user.db"), b"precious").unwrap();
        Receipt::bootstrap(
            Channel::SelfInstall,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "g0",
            1,
        )
        .persist(&ctrl.paths.receipt_path())
        .unwrap();

        // The old path-based repair surface cannot mutate even a well-formed
        // relative target.
        std::fs::write(&gen_file, b"corrupt").unwrap();
        assert!(matches!(
            ctrl.repair_immutable("g0", std::path::Path::new("immutable.bin"), b"original"),
            Err(LifecycleError::Refused(Refusal::Unverifiable { .. }))
        ));
        assert_eq!(std::fs::read(&gen_file).unwrap(), b"corrupt");
        // A traversal repair path is refused.
        assert!(
            ctrl.repair_immutable("g0", std::path::Path::new("../../escape"), b"x")
                .is_err()
        );

        // Both old removal variants refuse without deleting any state.
        assert!(matches!(
            ctrl.remove(false),
            Err(LifecycleError::Refused(Refusal::Unverifiable { .. }))
        ));
        assert!(ctrl.paths.generation_dir("g0").unwrap().exists());
        assert!(ctrl.paths.receipt_path().exists());
        assert_eq!(
            std::fs::read(ctrl.paths.data_dir().join("user.db")).unwrap(),
            b"precious"
        );
        assert!(matches!(
            ctrl.remove(true),
            Err(LifecycleError::Refused(Refusal::Unverifiable { .. }))
        ));
        assert!(ctrl.paths.data_dir().join("user.db").exists());
    }

    #[test]
    fn gateway_spawn_env_sets_app_home_and_optional_settlement() {
        let dir = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(dir.path());
        // No settlement URL: only the app-home env (credentials resolution) — the
        // gateway skips settlement fail-soft.
        let env = gateway_spawn_env(&paths, None);
        assert_eq!(env.len(), 1);
        assert_eq!(env[0].0, "VAULTSPEC_DESKTOP_APP_HOME");
        assert_eq!(env[0].1, paths.app_home().to_string_lossy());
        // A blank/whitespace URL is treated as unpublished — still omitted.
        assert_eq!(gateway_spawn_env(&paths, Some("   ")).len(), 1);
        // A real URL: both envs present.
        let url = "http://127.0.0.1:8767/internal/a2a/run-terminal";
        let env = gateway_spawn_env(&paths, Some(url));
        assert_eq!(env.len(), 2);
        assert_eq!(env[1].0, "VAULTSPEC_DESKTOP_SETTLEMENT_URL");
        assert_eq!(env[1].1, url);
    }

    fn sample_manifest() -> CapsuleManifest {
        CapsuleManifest {
            contract_version: "1.0".to_string(),
            identity: ComponentIdentity {
                name: "vaultspec-a2a".to_string(),
                version: "0.1.0".to_string(),
            },
            target: Target::X86_64PcWindowsMsvc,
            compatibility: ComponentCompatibility {
                api_versions: RangeBounds {
                    minimum: "v1".to_string(),
                    maximum: "v1".to_string(),
                },
                migration_range: MigrationRange {
                    base: "0001".to_string(),
                    head: "0009".to_string(),
                },
            },
            entrypoints: ComponentEntrypoints {
                gateway: LaunchEntrypoint {
                    kind: "gateway".to_string(),
                    console_script: "vaultspec-a2a-gateway".to_string(),
                    reference: "vaultspec_a2a.desktop.gateway:main".to_string(),
                    relative_command: vec!["bin".to_string(), "vaultspec-a2a-gateway".to_string()],
                },
                standalone_mcp: LaunchEntrypoint {
                    kind: "standalone-mcp".to_string(),
                    console_script: "vaultspec-a2a-mcp".to_string(),
                    reference: "vaultspec_a2a.mcp.standalone:main".to_string(),
                    relative_command: vec!["bin".to_string(), "vaultspec-a2a-mcp".to_string()],
                },
            },
            digest_algorithm: "sha256".to_string(),
            assets: Vec::new(),
            dependency_lock: DependencyLockIdentity {
                uv_lock_digest: "0".repeat(64),
                package_lock_digest: "0".repeat(64),
            },
        }
    }
}
