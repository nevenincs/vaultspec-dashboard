//! Receipt-gated lifecycle transitions (a2a-product-provisioning W01.P02.S16,
//! plus the standalone-MCP fence S86).
//!
//! This module is the decision core that binds the receipt, credential,
//! discovery, process, and protocol contracts into one authority. Every
//! receipt-bound mutation is gated on the matching active receipt AND the
//! receipt-bound ownership capability; the attach credential alone can never
//! invoke one (ADR D3/D5). Cold installed state is preserved as a first-class
//! valid state, a foreign resident is never displaced speculatively, and mutable
//! data survives every transition except an explicit typed removal.
//!
//! The transition planner is pure so it can be proven exhaustively; the spawn and
//! control orchestration are thin wrappers over `process`/`control` exercised
//! against real processes in the acceptance suites.
//!
//! **Standalone-MCP fence (S86):** the capsule declares a caller-owned standalone
//! MCP entrypoint. The dashboard lifecycle keeps it INSPECTABLE
//! ([`standalone_mcp_entrypoint`]) but launches, adopts, stops, drains, and cleans
//! up ONLY the gateway ([`owned_gateway_entrypoint`]). No path in this module
//! ever resolves or spawns the standalone MCP.

use crate::credentials::{Credential, CredentialStore};
use crate::manifest::{
    CapsuleManifest, ComponentLock, LaunchEntrypoint, Result as ManifestResult, Target,
};
use crate::paths::ProductPaths;
use crate::process::{GatewayProcess, GatewaySpec, spawn_gateway};
use crate::protocol::{LifecycleOp, Readiness, Refusal, WorkerState};
use crate::receipt::{Receipt, sweep_orphan_tmp};

/// How a discovered gateway may be used to satisfy run demand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachMode {
    /// Our own owned, live gateway — full lifecycle authority.
    Owned,
    /// A compatible foreign gateway with a trusted handoff — READ-ONLY attach;
    /// no lifecycle mutation (ADR D4).
    ForeignReadOnly,
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

    /// Initialize lifecycle state at boot: sweep any orphaned receipt temp files
    /// a crash left between write and rename (resource-bounds fold-in). Returns
    /// the number of orphaned temps reclaimed.
    pub fn initialize(&self) -> std::io::Result<usize> {
        sweep_orphan_tmp(&self.paths.receipt_path())
    }

    /// The active receipt, if a generation is installed. A malformed receipt is a
    /// hard error, not a silent "uninstalled".
    pub fn active_receipt(
        &self,
    ) -> std::result::Result<Option<Receipt>, crate::receipt::ReceiptError> {
        let path = self.paths.receipt_path();
        if !path.exists() {
            return Ok(None);
        }
        Receipt::load(&path).map(Some)
    }

    /// Derive the one readiness model from the installed receipt and whether the
    /// owned gateway is live (and its worker warmth). A cold worker on a live
    /// gateway is still `GatewayReady`, and an installed-but-stopped generation is
    /// a valid cold state — never a degradation.
    #[must_use]
    pub fn readiness(&self, gateway_live: bool, worker: WorkerState) -> Readiness {
        match self.active_receipt() {
            Ok(Some(_)) if gateway_live => Readiness::GatewayReady { worker },
            Ok(Some(_)) => Readiness::InstalledStopped,
            _ => Readiness::Uninstalled,
        }
    }

    /// Authorize a lifecycle operation. Receipt-bound mutations require the active
    /// receipt, receipt-bound ownership (the install must have created and
    /// retained the ownership capability), and a presented ownership credential
    /// that verifies against the stored one. `Install` bootstraps rather than
    /// requiring an existing capability; `Doctor` and the attach verbs are not
    /// receipt-bound mutations.
    pub fn authorize(
        &self,
        op: LifecycleOp,
        presented_ownership: Option<&Credential>,
    ) -> std::result::Result<(), Refusal> {
        let receipt = self.active_receipt().map_err(|e| Refusal::Unverifiable {
            detail: e.to_string(),
        })?;

        if op == LifecycleOp::Install {
            return Ok(());
        }
        let Some(receipt) = receipt else {
            return Err(Refusal::NotInstalled);
        };

        if op.requires_ownership() {
            // A foreign-adopted install never created ownership, so it can be
            // read but never mutated by us.
            if !receipt.bootstrap_created_ownership {
                return Err(Refusal::NotOwner);
            }
            let presented = presented_ownership.ok_or(Refusal::NotOwner)?;
            let stored = CredentialStore::new(self.paths.credentials_dir())
                .read_ownership()
                .map_err(|_| Refusal::NotOwner)?;
            if !stored.verify(presented.secret()) {
                return Err(Refusal::NotOwner);
            }
        }
        Ok(())
    }

    /// Load and verify the capsule manifest in one step, so a lifecycle consumer
    /// never holds a capsule that parsed but was not joined to the lock's pins
    /// (P01 review fold-in — uses `CapsuleManifest::parse_and_verify`).
    pub fn load_verified_capsule(
        raw_manifest: &str,
        lock: &ComponentLock,
        target: Target,
    ) -> ManifestResult<CapsuleManifest> {
        CapsuleManifest::parse_and_verify(raw_manifest, lock, target)
    }

    /// Spawn the OWNED gateway from the verified capsule. The launch program is
    /// resolved from the capsule's gateway entrypoint only — the standalone MCP is
    /// never spawned (S86 fence).
    pub fn spawn_owned_gateway(
        &self,
        capsule_root: &std::path::Path,
        manifest: &CapsuleManifest,
    ) -> std::result::Result<GatewayProcess, LifecycleError> {
        let spec = GatewaySpec::from_manifest(capsule_root, manifest)
            .map_err(|e| LifecycleError::Manifest(e.to_string()))?;
        spawn_gateway(&spec).map_err(LifecycleError::Io)
    }

    /// Remove owned generations, the receipt, and the credentials. Mutable user
    /// data under the app home is PRESERVED unless `typed_data_removal` is an
    /// explicit request to delete it (ADR D6: "removes installed generations
    /// while preserving or deleting data only through an explicit typed choice").
    /// Owned processes must already be stopped by the caller.
    pub fn remove(&self, typed_data_removal: bool) -> std::io::Result<()> {
        remove_dir_all_if_exists(&self.paths.generations_dir())?;
        remove_file_if_exists(&self.paths.receipt_path())?;
        remove_dir_all_if_exists(&self.paths.credentials_dir())?;
        if typed_data_removal {
            remove_dir_all_if_exists(&self.paths.data_dir())?;
        }
        Ok(())
    }

    /// Repair (replace) an immutable file within a generation tree from pristine
    /// bytes. The relative path is validated component-by-component so repair can
    /// only ever write UNDER the generation directory — never over mutable
    /// app-home data (ADR D6: "Repair never overwrites mutable state").
    pub fn repair_immutable(
        &self,
        generation: &str,
        relative: &std::path::Path,
        pristine: &[u8],
    ) -> std::result::Result<(), LifecycleError> {
        let gen_dir = self
            .paths
            .generation_dir(generation)
            .map_err(|e| LifecycleError::Manifest(e.to_string()))?;
        let target = safe_join_under(&gen_dir, relative)
            .ok_or_else(|| LifecycleError::Manifest("repair path escapes the generation".into()))?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(LifecycleError::Io)?;
        }
        std::fs::write(&target, pristine).map_err(LifecycleError::Io)
    }
}

/// Join a relative path under a base, rejecting any component that would escape
/// (`..`, an absolute prefix, or a root/prefix component). Returns `None` on any
/// escaping component so a repair target can never leave the generation tree.
fn safe_join_under(
    base: &std::path::Path,
    relative: &std::path::Path,
) -> Option<std::path::PathBuf> {
    use std::path::Component;
    let mut out = base.to_path_buf();
    for comp in relative.components() {
        match comp {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

fn remove_dir_all_if_exists(path: &std::path::Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

fn remove_file_if_exists(path: &std::path::Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
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
// Standalone-MCP fence (S86)
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
/// touches it (ADR D4, S86).
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
    fn uninstalled_refuses_every_mutation_but_install() {
        let (_d, ctrl) = controller();
        assert_eq!(
            ctrl.readiness(false, WorkerState::Cold),
            Readiness::Uninstalled
        );
        for op in [
            LifecycleOp::Start,
            LifecycleOp::Stop,
            LifecycleOp::Repair,
            LifecycleOp::Update,
            LifecycleOp::Rollback,
            LifecycleOp::Remove,
            LifecycleOp::Ensure,
        ] {
            assert_eq!(ctrl.authorize(op, None), Err(Refusal::NotInstalled));
        }
        assert!(ctrl.authorize(LifecycleOp::Install, None).is_ok());
    }

    #[test]
    fn receipt_bound_mutation_requires_the_ownership_capability() {
        let (_d, ctrl) = controller();
        // Bootstrap a real ownership capability and write an active receipt that
        // retains it.
        let store = CredentialStore::new(ctrl.paths.credentials_dir());
        let creds = store.bootstrap().unwrap();
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
        // The correct ownership capability authorizes the mutation.
        assert!(
            ctrl.authorize(LifecycleOp::Stop, Some(&creds.ownership))
                .is_ok()
        );
        // The attach-control credential is NOT the ownership capability.
        assert_eq!(
            ctrl.authorize(LifecycleOp::Stop, Some(&creds.attach_control)),
            Err(Refusal::NotOwner)
        );
        // A non-ownership op needs no capability.
        assert!(ctrl.authorize(LifecycleOp::Doctor, None).is_ok());
    }

    #[test]
    fn a_foreign_adopted_install_cannot_be_mutated() {
        let (_d, ctrl) = controller();
        let store = CredentialStore::new(ctrl.paths.credentials_dir());
        let creds = store.bootstrap().unwrap();
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
            ctrl.authorize(LifecycleOp::Update, Some(&creds.ownership)),
            Err(Refusal::NotOwner)
        );
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
    fn remove_preserves_data_unless_typed_and_repair_stays_in_generation() {
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

        // Repair replaces an immutable file; mutable data is untouched.
        std::fs::write(&gen_file, b"corrupt").unwrap();
        ctrl.repair_immutable("g0", std::path::Path::new("immutable.bin"), b"original")
            .unwrap();
        assert_eq!(std::fs::read(&gen_file).unwrap(), b"original");
        // A traversal repair path is refused.
        assert!(
            ctrl.repair_immutable("g0", std::path::Path::new("../../escape"), b"x")
                .is_err()
        );

        // Remove without typed data removal keeps the mutable data.
        ctrl.remove(false).unwrap();
        assert!(!ctrl.paths.generation_dir("g0").unwrap().exists());
        assert!(!ctrl.paths.receipt_path().exists());
        assert_eq!(
            std::fs::read(ctrl.paths.data_dir().join("user.db")).unwrap(),
            b"precious"
        );
        // Typed data removal clears the data too.
        ctrl.remove(true).unwrap();
        assert!(!ctrl.paths.data_dir().join("user.db").exists());
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
