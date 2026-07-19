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
use vaultspec_product::credentials::CredentialStore;
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery, Verdict};
use vaultspec_product::lifecycle::LifecycleController;
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::protocol::{LifecycleOp, WorkerState};

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

/// The status + ownership projection: installed release set, the one readiness
/// model, ownership retention, and the owned-or-foreign gateway identity.
fn projection(paths: &ProductPaths, owner: &str, controller: &LifecycleController) -> Value {
    let _ = controller.initialize();
    let receipt = controller.active_receipt().ok().flatten();
    let discovery = read_discovery(paths);
    let verdict = discovery.as_ref().map(|d| d.classify(&ctx(owner)));
    let readiness = controller.readiness(
        matches!(verdict, Some(Verdict::OwnedLive)),
        WorkerState::Cold,
    );
    json!({
        "installed": receipt.is_some(),
        "release_set": receipt.as_ref().map(|r| json!({
            "name": r.a2a_identity.name,
            "version": r.a2a_identity.version,
            "target": r.target.triple(),
            "active_generation": r.active_generation,
        })),
        "readiness": readiness,
        "ownership": {
            "owner": owner,
            "retained": receipt
                .as_ref()
                .map(|r| r.bootstrap_created_ownership)
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
    })
}

/// The A2A product + ownership projection for the one-shot `status` backends
/// block (a2a-product-provisioning W02.P04.S33). Degrades honestly to an error
/// object when the product paths cannot be resolved — never a fabricated state.
pub fn facts() -> Value {
    match run(Action::Status) {
        Ok(v) => v,
        Err(reason) => json!({ "installed": false, "reason": reason }),
    }
}

/// `vaultspec a2a <action>` — the one-shot product lifecycle verb.
pub fn run(action: Action) -> Result<Value, String> {
    let (paths, owner) = resolve()?;
    let controller = LifecycleController::new(paths.clone());
    match action {
        Action::Status => Ok(projection(&paths, &owner, &controller)),
        Action::Doctor => {
            let mut out = projection(&paths, &owner, &controller);
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
    let Some(discovery) = read_discovery(paths) else {
        // No live discovery: nothing to stop. Distinguish cold-installed from
        // not-installed honestly.
        return match controller.active_receipt() {
            Ok(Some(_)) => Ok(
                json!({ "stopped": false, "reason": "gateway already stopped (installed, cold)" }),
            ),
            Ok(None) => Ok(json!({ "stopped": false, "reason": "a2a is not installed" })),
            Err(e) => Err(format!("a2a receipt unverifiable: {e}")),
        };
    };
    let verdict = discovery.classify(&ctx(owner));
    let store = CredentialStore::new(paths.credentials_dir());
    let ownership = store.read_ownership().ok();
    // Compose BOTH ownership gates through the shared product authority before any
    // control effect (same seam the seated plane uses).
    controller
        .guard_owned_mutation(LifecycleOp::Stop, ownership.as_ref(), Some(&verdict))
        .map_err(|refusal| refusal.to_string())?;
    let ownership = ownership.ok_or_else(|| "missing ownership capability".to_string())?;
    let attach = store
        .read_attach_control()
        .map_err(|e| format!("attach-control credential unreadable: {e}"))?;
    let client = ControlClient::new(discovery.endpoint.clone(), attach.secret())
        .with_timeouts(CONTROL_TIMEOUT, CONTROL_TIMEOUT);
    client
        .shutdown(&ownership)
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
    let store = CredentialStore::new(paths.credentials_dir());
    let ownership = store.read_ownership().ok();
    controller
        .guard_owned_mutation(LifecycleOp::Remove, ownership.as_ref(), verdict.as_ref())
        .map_err(|refusal| refusal.to_string())?;
    controller
        .remove(false)
        .map_err(|e| format!("remove failed: {e}"))?;
    Ok(json!({ "removed": true, "data_preserved": true }))
}
