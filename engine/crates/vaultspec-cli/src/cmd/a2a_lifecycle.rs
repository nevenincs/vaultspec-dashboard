//! One-shot `vaultspec a2a` lifecycle verbs (a2a-product-provisioning
//! W02.P04.S45).
//!
//! These are MACHINE verbs — like `stop`/`restart`, they read the machine-global
//! product state under the app home (`~/.vaultspec/a2a/`), never a workspace
//! scope, and are handled before scope resolution in `main`. They reuse the SAME
//! typed product lifecycle authority the seated dashboard's lifecycle plane uses
//! (`vaultspec_product::lifecycle::LifecycleController` and its ownership gates),
//! so the one-shot and seated surfaces can never diverge in what they permit.
//!
//! The action surface is BOUNDED and one-shot-safe (S47): `status`/`doctor` read
//! the product projection; `stop` authenticates and shuts the running owned
//! gateway down over its loopback control endpoint; `remove` removes owned
//! generations while preserving data. Process-spawning operations (start/restart)
//! are NOT exposed here: the gateway process is owned for its lifetime by the
//! SEATED dashboard (ADR D4), and a one-shot verb that spawned then exited would
//! orphan it — so the CLI never ships that as a permanently-half-working verb.

use std::time::Duration;

use serde_json::{Value, json};
use vaultspec_product::control::ControlClient;
use vaultspec_product::credentials::{CredentialError, DashboardCredentialStore};
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery, Verdict};
use vaultspec_product::lifecycle::LifecycleController;
use vaultspec_product::locking::{Actor, InstallLock};
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::protocol::{LifecycleOp, WorkerState};
use vaultspec_product::provisioning::{
    ActiveReleaseState, ProvisioningErrorKind, observe_active_release,
};

/// The published gateway discovery filename under the product app home.
const DISCOVERY_FILE: &str = "gateway-discovery.json";
/// Freshness window for a discovery heartbeat (matches the seated plane).
const DISCOVERY_FRESHNESS_MS: i64 = 30_000;
/// Bounded loopback control budget for the `stop` shutdown call.
const CONTROL_TIMEOUT: Duration = Duration::from_secs(10);

/// The bounded A2A lifecycle action the CLI exposes (S47): intent only, never a
/// free-form path or executable operand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// The product status + ownership projection (read-only).
    Status,
    /// Read-only readiness and ownership diagnosis.
    Doctor,
    /// Authenticate and shut the running owned gateway down.
    Stop,
    /// Remove owned generations, receipt, and credentials (data preserved).
    Remove,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Resolve the product paths from the machine app home and the stable owner id.
fn resolve() -> Result<(ProductPaths, String), String> {
    let paths = ProductPaths::derive().map_err(|e| format!("a2a product paths unresolved: {e}"))?;
    let owner = paths.root().to_string_lossy().to_string();
    Ok((paths, owner))
}

/// Read and parse the secret-free gateway discovery record, if one is published.
fn read_discovery(paths: &ProductPaths) -> Option<GatewayDiscovery> {
    let raw = std::fs::read_to_string(paths.app_home().join(DISCOVERY_FILE)).ok()?;
    GatewayDiscovery::parse(&raw).ok()
}

/// The classification context for the current owner and instant. The supported
/// ranges match the seated plane's (v1 gateway API; wide state-schema window).
fn ctx(owner: &str) -> DiscoveryContext {
    DiscoveryContext {
        our_owner: owner.to_string(),
        now_ms: now_ms(),
        freshness_ms: DISCOVERY_FRESHNESS_MS,
        supported_protocol: RangeBounds {
            minimum: "v1".to_string(),
            maximum: "v1".to_string(),
        },
        supported_state_schema: RangeBounds {
            minimum: "0001".to_string(),
            maximum: "9999".to_string(),
        },
    }
}

fn ownership_error(error: &CredentialError) -> &'static str {
    match error {
        CredentialError::PlatformAuthorityUnavailable(_) => {
            "platform ownership authority is unavailable"
        }
        CredentialError::Missing(_) | CredentialError::Invalid { .. } => {
            "ownership capability is absent or invalid"
        }
        CredentialError::Io(_)
        | CredentialError::AlreadyExists(_)
        | CredentialError::RecoveryRequired(_)
        | CredentialError::BootstrapAuthorityInUse => "ownership authority is unverifiable",
    }
}

fn observation_error(kind: ProvisioningErrorKind) -> String {
    match kind {
        ProvisioningErrorKind::RecoveryRequired => {
            "fixed active-receipt recovery is required".to_owned()
        }
        ProvisioningErrorKind::AdapterUnavailable
        | ProvisioningErrorKind::FirstInstallAdapterUnavailable
        | ProvisioningErrorKind::Indeterminate => {
            "fixed active-receipt authority is unverifiable".to_owned()
        }
    }
}

fn guarded_release_state(
    paths: &ProductPaths,
    guard: &vaultspec_product::locking::InstallLockGuard,
) -> Result<ActiveReleaseState, String> {
    observe_active_release(paths, guard)
        .and_then(|observation| observation.state())
        .map_err(|error| observation_error(error.kind()))
}

/// The status + ownership projection: installed release set, the one readiness
/// model, ownership retention, and the owned-or-foreign gateway identity.
fn projection(
    paths: &ProductPaths,
    owner: &str,
    controller: &LifecycleController,
) -> Result<Value, String> {
    let _ = controller.initialize();
    let lock = InstallLock::new(paths.install_lock_path());
    let guard = lock
        .acquire(Actor::Installer, owner)
        .map_err(|_| "installation authority unavailable".to_owned())?
        .map_err(|_| "installation authority busy".to_owned())?;
    let release = guarded_release_state(paths, &guard)?;
    let settled = match &release {
        ActiveReleaseState::Settled(release) => Some(release),
        ActiveReleaseState::Absent => None,
        ActiveReleaseState::RecoveryRequired(_) => {
            return Err("fixed active-receipt recovery is required".to_owned());
        }
    };
    let discovery = read_discovery(paths);
    let verdict = discovery.as_ref().map(|d| d.classify(&ctx(owner)));
    let readiness = controller
        .guarded_readiness(
            &guard,
            matches!(verdict, Some(Verdict::OwnedLive)),
            WorkerState::Cold,
        )
        .map_err(|_| "fixed active-receipt authority is unverifiable".to_owned())?;
    Ok(json!({
        "installed": settled.is_some(),
        "installed_known": true,
        "install_state": if settled.is_some() { "settled" } else { "absent" },
        "recovery_required": false,
        "degraded": false,
        "release_set": settled.map(|r| json!({
            "name": r.a2a_identity().name,
            "version": r.a2a_identity().version,
            "target": r.target().triple(),
            "active_generation": r.active_generation(),
        })),
        "readiness": readiness,
        "ownership": {
            "owner": owner,
            "retained": settled
                .map(|r| r.bootstrap_created_ownership())
                .unwrap_or(false),
        },
        "gateway": discovery.as_ref().map(|d| json!({
            "endpoint": d.endpoint,
            "pid": d.pid,
            "generation": d.generation,
            "ownership": match verdict {
                Some(Verdict::OwnedLive) => "owned",
                Some(Verdict::OwnedStale) => "owned-stale",
                Some(Verdict::ForeignAttachable) => "foreign-attachable",
                Some(Verdict::ForeignImmutable { .. }) => "foreign-immutable",
                None => "unknown",
            },
        })),
    }))
}

/// The A2A product + ownership projection for the one-shot `status` backends
/// block (a2a-product-provisioning W02.P04.S33). Degrades honestly to an error
/// object when the product paths cannot be resolved — never a fabricated state.
pub fn facts() -> Value {
    match run(Action::Status) {
        Ok(v) => v,
        Err(reason) => {
            let install_state = if reason.contains("busy") {
                "busy"
            } else if reason.contains("recovery") {
                "recovery-required"
            } else {
                "unverifiable"
            };
            json!({
                "installed": null,
                "installed_known": false,
                "install_state": install_state,
                "recovery_required": install_state == "recovery-required",
                "degraded": true,
                "readiness": null,
                "reason": reason,
            })
        }
    }
}

/// `vaultspec a2a <action>` — the one-shot product lifecycle verb.
pub fn run(action: Action) -> Result<Value, String> {
    let (paths, owner) = resolve()?;
    let controller = LifecycleController::new(paths.clone());
    match action {
        Action::Status => projection(&paths, &owner, &controller),
        Action::Doctor => {
            let mut out = projection(&paths, &owner, &controller)?;
            if let Some(obj) = out.as_object_mut() {
                obj.insert("doctor".into(), json!({ "read_only": true }));
            }
            Ok(out)
        }
        Action::Stop => stop(&paths, &owner, &controller),
        Action::Remove => remove(&paths, &owner, &controller),
    }
}

/// Authenticate the running OWNED gateway and shut it down over its loopback
/// control endpoint. Refuses (typed) when nothing is installed, when we do not
/// own the live gateway, or when the ownership capability is absent — the attach
/// credential alone can never invoke shutdown (ADR D5).
fn stop(
    paths: &ProductPaths,
    owner: &str,
    controller: &LifecycleController,
) -> Result<Value, String> {
    let lock = InstallLock::new(paths.install_lock_path());
    let guard = lock
        .acquire(Actor::Installer, owner)
        .map_err(|_| "installation authority unavailable".to_owned())?
        .map_err(|_| "installation authority busy".to_owned())?;
    match guarded_release_state(paths, &guard)? {
        ActiveReleaseState::Absent => return Err("a2a is not installed".to_owned()),
        ActiveReleaseState::RecoveryRequired(_) => {
            return Err("fixed active-receipt recovery is required".to_owned());
        }
        ActiveReleaseState::Settled(_) => {}
    }
    let Some(discovery) = read_discovery(paths) else {
        return Ok(
            json!({ "stopped": false, "reason": "gateway already stopped (installed, cold)" }),
        );
    };
    let verdict = discovery.classify(&ctx(owner));
    let store = DashboardCredentialStore::for_product(paths);
    let ownership = store
        .verify_ownership(&guard)
        .map_err(|error| ownership_error(&error).to_owned())?;
    // Compose BOTH ownership gates through the shared product authority before any
    // control effect (same seam the seated plane uses).
    controller
        .guard_owned_mutation(LifecycleOp::Stop, Some(&ownership), Some(&verdict))
        .map_err(|refusal| refusal.to_string())?;
    let attach = store
        .read_attach_control()
        .map_err(|e| format!("attach-control credential unreadable: {e}"))?;
    let client = ControlClient::new(discovery.endpoint.clone(), attach.secret())
        .with_timeouts(CONTROL_TIMEOUT, CONTROL_TIMEOUT);
    client
        .shutdown(ownership.credential())
        .map_err(|e| format!("gateway shutdown failed: {e}"))?;
    Ok(json!({
        "stopped": true,
        "endpoint": discovery.endpoint,
        "generation": discovery.generation,
    }))
}

/// Remove owned generations, the receipt, and credentials while PRESERVING user
/// data (ADR D6). Gated through the same typed ownership authority; a live
/// foreign resident stays immutable.
fn remove(
    paths: &ProductPaths,
    owner: &str,
    controller: &LifecycleController,
) -> Result<Value, String> {
    let verdict = read_discovery(paths).map(|d| d.classify(&ctx(owner)));
    let lock = InstallLock::new(paths.install_lock_path());
    let guard = lock
        .acquire(Actor::Installer, owner)
        .map_err(|error| format!("install lock error: {error}"))?
        .map_err(|busy| format!("install lock busy: {busy:?}"))?;
    match guarded_release_state(paths, &guard)? {
        ActiveReleaseState::Absent => return Err("a2a is not installed".to_owned()),
        ActiveReleaseState::RecoveryRequired(_) => {
            return Err("fixed active-receipt recovery is required".to_owned());
        }
        ActiveReleaseState::Settled(_) => {}
    }
    let store = DashboardCredentialStore::for_product(paths);
    let ownership = store
        .verify_ownership(&guard)
        .map_err(|error| ownership_error(&error).to_owned())?;
    controller
        .guard_owned_mutation(LifecycleOp::Remove, Some(&ownership), verdict.as_ref())
        .map_err(|refusal| refusal.to_string())?;
    controller
        .remove(false)
        .map_err(|e| format!("remove failed: {e}"))?;
    Ok(json!({ "removed": true, "data_preserved": true }))
}
