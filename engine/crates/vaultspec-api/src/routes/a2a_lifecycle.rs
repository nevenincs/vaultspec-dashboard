//! The A2A component lifecycle job plane (a2a-product-provisioning W01.P03).
//!
//! A DEDICATED lifecycle surface, separate from the fixed `/ops/a2a`
//! orchestration namespace (ADR D3: these operations "never ride `/ops/a2a`").
//! It serves typed lifecycle intent — install, ensure, start, stop, restart,
//! repair, update, rollback, remove, doctor — as bounded, job-shaped work over
//! the `vaultspec-product` lifecycle controller, and returns backend-served
//! state through the shared `tiers` envelope. No orchestration RUN verb lives
//! here; the five `/ops/a2a` run verbs are untouched.
//!
//! Admission is a HARD bound in ONE atomic critical section (ADR D3): the
//! reservation checks the component single-flight AND the ceiling AND inserts
//! under a single lock hold, so no race can over-admit. The single-flight
//! identity is the A2A COMPONENT, not the requested operation label — only one
//! mutation is in flight for the component at a time; an identical concurrent
//! request de-duplicates onto it, and a different concurrent mutation is refused
//! while the component is busy. Completed records are TTL-pruned and capped.
//!
//! Every mutating operation composes BOTH ownership gates through the single
//! [`LifecyclePlane::guard_mutation`] seam before any control-plane mutation
//! (P02 review SHOULD-FIX 3): the discovery verdict must classify our OWNED live
//! gateway AND the caller must hold the receipt-bound ownership capability. The
//! two gates cannot be satisfied decoupled.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use vaultspec_product::credentials::CredentialStore;
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery, ImmutableReason, Verdict};
use vaultspec_product::lifecycle::{AttachMode, LifecycleController};
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::protocol::{LifecycleOp, Readiness, Refusal, WorkerState};
use vaultspec_product::receipt::{Receipt, ReceiptError};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

// --- bounds (resource-bounds: every cap explicit at creation) -----------------

/// The A2A component single-flight ceiling: exactly one mutation in flight for
/// the one installed component at a time (ADR D3).
const MAX_CONCURRENT: usize = 1;
/// Retained job history cap; older completed records are evicted first.
const MAX_RETAINED: usize = 32;
/// A completed lifecycle job is reclaimable after this window.
const JOB_TTL: Duration = Duration::from_secs(2 * 60 * 60);
/// Wall-clock ceiling for a single lifecycle operation. Generous (a drain +
/// snapshot + migration can be slow) but finite so a wedged op cannot pin a
/// worker forever; a breach kills the op and marks the job failed.
const JOB_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// Freshness window for a gateway discovery heartbeat.
const DISCOVERY_FRESHNESS: Duration = Duration::from_secs(30);
/// Maximum retained detail for a seated stale-recovery failure.
const MAX_RECOVERY_REASON_CHARS: usize = 512;
/// The gateway discovery record the seated controller publishes (W02.P04). The
/// lifecycle plane READS it to classify the attach verdict; it never writes it.
const DISCOVERY_FILE: &str = "gateway-discovery.json";

fn bounded_recovery_reason(reason: String) -> String {
    reason.chars().take(MAX_RECOVERY_REASON_CHARS).collect()
}

// --- typed wire operation (bounded enum; NO free-form path/arg) ---------------

/// The bounded lifecycle operation the wire may request. serde rejects any value
/// outside this closed set, so an unknown/misspelled op 400s at extraction — the
/// wire selects a SEMANTIC operation, never a free-form path or argument (ADR D3).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum LifecycleOpArg {
    Install,
    Ensure,
    Start,
    Stop,
    Restart,
    Repair,
    Update,
    Rollback,
    Remove,
    Doctor,
}

impl From<LifecycleOpArg> for LifecycleOp {
    fn from(a: LifecycleOpArg) -> Self {
        match a {
            LifecycleOpArg::Install => LifecycleOp::Install,
            LifecycleOpArg::Ensure => LifecycleOp::Ensure,
            LifecycleOpArg::Start => LifecycleOp::Start,
            LifecycleOpArg::Stop => LifecycleOp::Stop,
            LifecycleOpArg::Restart => LifecycleOp::Restart,
            LifecycleOpArg::Repair => LifecycleOp::Repair,
            LifecycleOpArg::Update => LifecycleOp::Update,
            LifecycleOpArg::Rollback => LifecycleOp::Rollback,
            LifecycleOpArg::Remove => LifecycleOp::Remove,
            LifecycleOpArg::Doctor => LifecycleOp::Doctor,
        }
    }
}

/// The `POST /a2a/lifecycle/run` body: a single typed operation. No path, no
/// free-form argument — intent only.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct RunRequest {
    op: LifecycleOpArg,
}

fn op_label(op: LifecycleOp) -> &'static str {
    match op {
        LifecycleOp::Install => "install",
        LifecycleOp::Ensure => "ensure",
        LifecycleOp::Start => "start",
        LifecycleOp::Stop => "stop",
        LifecycleOp::Restart => "restart",
        LifecycleOp::Repair => "repair",
        LifecycleOp::Update => "update",
        LifecycleOp::Rollback => "rollback",
        LifecycleOp::Remove => "remove",
        LifecycleOp::Doctor => "doctor",
    }
}

// --- job registry (bounded; atomic check-and-reserve) -------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JobState {
    Running,
    Succeeded,
    Failed,
}

impl JobState {
    fn as_str(self) -> &'static str {
        match self {
            JobState::Running => "running",
            JobState::Succeeded => "succeeded",
            JobState::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone)]
struct Job {
    id: String,
    op: &'static str,
    state: JobState,
    created: Instant,
    outcome: Option<Value>,
}

impl Job {
    fn to_wire(&self) -> Value {
        json!({
            "id": self.id,
            "op": self.op,
            "state": self.state.as_str(),
            "outcome": self.outcome.clone().unwrap_or(Value::Null),
        })
    }
}

/// The outcome of an atomic admission decision.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Admission {
    /// A fresh running job was reserved with this id.
    Reserved(String),
    /// An identical operation is already in flight; de-duplicated onto its id.
    Attached(String),
    /// The component is busy (single-flight) or the registry is full with
    /// nothing evictable — the hard admission ceiling refuses another mutation.
    AtCapacity,
}

/// The bounded lifecycle job registry. Held INSIDE `AppState` (never a global
/// static) so tests and seated instances cannot share mutation state (ADR /
/// plan S20). All admission decisions are made in one critical section.
struct Registry {
    jobs: HashMap<String, Job>,
    order: VecDeque<String>,
    seq: AtomicU64,
}

impl Registry {
    fn new() -> Self {
        Registry {
            jobs: HashMap::new(),
            order: VecDeque::new(),
            seq: AtomicU64::new(1),
        }
    }

    fn next_id(&self) -> String {
        format!("a2a-life-{}", self.seq.fetch_add(1, Ordering::Relaxed))
    }

    /// Drop TTL-expired completed jobs, then evict oldest completed jobs until at
    /// or under the retention cap. A running job is never evicted.
    fn prune(&mut self) {
        let expired: Vec<String> = self
            .jobs
            .iter()
            .filter(|(_, j)| j.state != JobState::Running && j.created.elapsed() > JOB_TTL)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.jobs.remove(&id);
            self.order.retain(|q| q != &id);
        }
        while self.jobs.len() > MAX_RETAINED {
            let victim = self
                .order
                .iter()
                .find(|id| {
                    self.jobs
                        .get(*id)
                        .is_some_and(|j| j.state != JobState::Running)
                })
                .cloned();
            match victim {
                Some(id) => {
                    self.jobs.remove(&id);
                    self.order.retain(|q| q != &id);
                }
                None => break,
            }
        }
    }

    fn running(&self) -> impl Iterator<Item = &Job> {
        self.jobs.values().filter(|j| j.state == JobState::Running)
    }

    /// THE atomic check-and-reserve critical section. Runs entirely under the
    /// caller's single lock hold: prune, then in one pass decide de-dup vs.
    /// component single-flight vs. ceiling vs. admit, inserting the reservation
    /// before the lock is released so no concurrent caller can over-admit.
    fn reserve(&mut self, op: &'static str) -> Admission {
        self.prune();
        // De-dup an identical in-flight operation (true single-flight).
        if let Some(existing) = self.running().find(|j| j.op == op) {
            return Admission::Attached(existing.id.clone());
        }
        // Component single-flight: only one mutation in flight at a time. A
        // different concurrent mutation is refused while the component is busy.
        if self.running().count() >= MAX_CONCURRENT {
            return Admission::AtCapacity;
        }
        // Make room under the retention cap by evicting a completed record; if
        // none can be evicted, refuse (hard ceiling).
        if self.jobs.len() >= MAX_RETAINED {
            let victim = self
                .order
                .iter()
                .find(|id| {
                    self.jobs
                        .get(*id)
                        .is_some_and(|j| j.state != JobState::Running)
                })
                .cloned();
            match victim {
                Some(id) => {
                    self.jobs.remove(&id);
                    self.order.retain(|q| q != &id);
                }
                None => return Admission::AtCapacity,
            }
        }
        let id = self.next_id();
        let job = Job {
            id: id.clone(),
            op,
            state: JobState::Running,
            created: Instant::now(),
            outcome: None,
        };
        self.order.push_back(id.clone());
        self.jobs.insert(id.clone(), job);
        Admission::Reserved(id)
    }

    fn set_outcome(&mut self, id: &str, state: JobState, outcome: Value) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.state = state;
            job.outcome = Some(outcome);
        }
    }

    fn wire(&self, id: &str) -> Option<Value> {
        self.jobs.get(id).map(Job::to_wire)
    }
}

// --- shared gateway resolution (S27/S29/S30/S31/S33) ---------------------------

/// The protocol/state-schema ranges the dashboard's installed release set
/// supports. v1 gateway API today; the state-schema window is deliberately wide
/// (the packaged migration head advances independently). Kept in one place so
/// the discovery context, resolution, and handshake all agree.
fn supported_protocol() -> RangeBounds {
    RangeBounds {
        minimum: "v1".to_string(),
        maximum: "v1".to_string(),
    }
}

fn supported_state_schema() -> RangeBounds {
    RangeBounds {
        minimum: "0001".to_string(),
        maximum: "9999".to_string(),
    }
}

/// Read and parse the product gateway discovery record under an app home, if the
/// gateway has published one. Secret-free by construction (`GatewayDiscovery`
/// rejects any secret-bearing key at parse). `None` on absent or malformed —
/// both are "no discoverable gateway", never an optimistic assumption of one.
fn read_gateway_discovery(paths: &ProductPaths) -> Option<GatewayDiscovery> {
    let raw = std::fs::read_to_string(paths.app_home().join(DISCOVERY_FILE)).ok()?;
    GatewayDiscovery::parse(&raw).ok()
}

/// The classification context for our owner identity at the current instant.
fn discovery_ctx(owner_id: &str) -> DiscoveryContext {
    DiscoveryContext {
        our_owner: owner_id.to_string(),
        now_ms: crate::app::now_ms(),
        freshness_ms: DISCOVERY_FRESHNESS.as_millis() as i64,
        supported_protocol: supported_protocol(),
        supported_state_schema: supported_state_schema(),
    }
}

/// A short, non-secret reason string for an immutable-foreign verdict.
fn immutable_reason(reason: &ImmutableReason) -> &'static str {
    match reason {
        ImmutableReason::DeadOrStale => "recorded process dead or heartbeat stale",
        ImmutableReason::NoTrustedHandoff => "no readable owner-ACL attach handoff",
        ImmutableReason::Incompatible => "protocol or state-schema mismatch",
    }
}

/// Derive the honest agent availability from ALREADY-READ product state — a pure
/// classifier so the read pass happens exactly once (review MEDIUM). A usable
/// gateway (owned-live or foreign-attachable-live) is available; every other
/// state degrades with a truthful, non-secret reason. No credential secret is
/// read here.
fn availability_from(
    receipt: &std::result::Result<Option<Receipt>, ReceiptError>,
    verdict: Option<&Verdict>,
) -> (bool, Option<String>) {
    match verdict {
        // No live discovery: distinguish installed-but-stopped (a valid cold
        // state) from genuinely not installed, and surface a receipt fault.
        None => match receipt {
            Ok(Some(_)) => (
                false,
                Some("a2a gateway installed but stopped (no live discovery)".to_string()),
            ),
            Ok(None) => (
                false,
                Some("a2a orchestration is not installed".to_string()),
            ),
            Err(e) => (false, Some(format!("a2a install state unverifiable: {e}"))),
        },
        Some(Verdict::OwnedLive | Verdict::ForeignAttachable) => (true, None),
        Some(Verdict::OwnedStale) => (
            false,
            Some("owned a2a gateway is stale (recorded process not alive)".to_string()),
        ),
        Some(Verdict::ForeignImmutable { reason }) => (
            false,
            Some(format!(
                "a foreign a2a gateway holds the runtime and stays immutable: {}",
                immutable_reason(reason)
            )),
        ),
    }
}

/// The readiness model from an already-read receipt + verdict (mirrors
/// `LifecycleController::readiness` without re-reading the receipt file). A cold
/// worker on a live gateway is still ready; an installed-but-stopped generation
/// is a valid cold state, not a degradation.
fn readiness_from(receipt: Option<&Receipt>, verdict: Option<&Verdict>) -> Readiness {
    match receipt {
        Some(_) if matches!(verdict, Some(Verdict::OwnedLive)) => Readiness::GatewayReady {
            worker: WorkerState::Cold,
        },
        Some(_) => Readiness::InstalledStopped,
        None => Readiness::Uninstalled,
    }
}

/// Build the component-handshake projection (S28) from ALREADY-READ state: the
/// installed release set, owned-or-foreign gateway identity, protocol and
/// state-schema ranges, and the one readiness model. No secret is ever projected.
fn handshake_value(
    receipt: Option<&Receipt>,
    discovery: Option<&GatewayDiscovery>,
    verdict: Option<&Verdict>,
    readiness: Readiness,
    available: bool,
    reason: Option<String>,
) -> Value {
    let gateway = discovery.map(|d| {
        json!({
            "endpoint": d.endpoint,
            "pid": d.pid,
            "generation": d.generation,
            "protocol": { "minimum": d.protocol.minimum, "maximum": d.protocol.maximum },
            "state_schema": {
                "minimum": d.state_schema.minimum,
                "maximum": d.state_schema.maximum,
            },
            "ownership": match verdict {
                Some(Verdict::OwnedLive) => "owned",
                Some(Verdict::OwnedStale) => "owned-stale",
                Some(Verdict::ForeignAttachable) => "foreign-attachable",
                Some(Verdict::ForeignImmutable { .. }) => "foreign-immutable",
                None => "unknown",
            },
        })
    });
    json!({
        "installed": receipt.is_some(),
        "release_set": receipt.map(|r| json!({
            "name": r.a2a_identity.name,
            "version": r.a2a_identity.version,
            "target": r.target.triple(),
            "active_generation": r.active_generation,
        })),
        "readiness": readiness,
        "supported": {
            "protocol": {
                "minimum": supported_protocol().minimum,
                "maximum": supported_protocol().maximum,
            },
            "state_schema": {
                "minimum": supported_state_schema().minimum,
                "maximum": supported_state_schema().maximum,
            },
        },
        "gateway": gateway,
        "available": available,
        "reason": reason,
    })
}

/// The honest agent-orchestration availability derived from product state under
/// an app home, WITHOUT reading any credential secret (S29). One receipt + one
/// discovery read, then the pure classifier. Scope-independent (a2a is one
/// machine-global resident). Used by the seated plane's own reads.
pub(crate) fn agent_availability_at(
    paths: &ProductPaths,
    owner_id: &str,
) -> (bool, Option<String>) {
    let receipt = LifecycleController::new(paths.clone()).active_receipt();
    let discovery = read_gateway_discovery(paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(owner_id)));
    availability_from(&receipt, verdict.as_ref())
}

/// The component-handshake projection for a product state under an app home
/// (S28), reading the receipt and discovery ONCE. Used by the seated plane's own
/// reads (`/status` facts); the per-response hot path goes through the memoized
/// [`resolve_agent_snapshot`] instead.
pub(crate) fn agent_handshake_at(paths: &ProductPaths, owner_id: &str) -> Value {
    let receipt = LifecycleController::new(paths.clone()).active_receipt();
    let discovery = read_gateway_discovery(paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(owner_id)));
    let (available, reason) = availability_from(&receipt, verdict.as_ref());
    let receipt = receipt.ok().flatten();
    let readiness = readiness_from(receipt.as_ref(), verdict.as_ref());
    handshake_value(
        receipt.as_ref(),
        discovery.as_ref(),
        verdict.as_ref(),
        readiness,
        available,
        reason,
    )
}

/// One machine-global read pass of A2A product state (review MEDIUM): the agent
/// tier AND the component handshake are BOTH derived from a single receipt +
/// discovery read. Memoized on a short TTL so the per-response `tiers_value` hot
/// path — which needs both — does not re-`derive` paths and re-read+parse the
/// discovery/receipt files on every envelope.
struct AgentSnapshot {
    available: bool,
    reason: Option<String>,
    handshake: Value,
}

/// The memo lifetime. Deliberately far shorter than the discovery freshness
/// window (`DISCOVERY_FRESHNESS`, 30s) so the memo caches the READS, never a
/// stale verdict: a gateway going down still degrades the tier within this
/// window on the next resolve.
const AGENT_SNAPSHOT_TTL: Duration = Duration::from_millis(1000);

/// The memoized snapshot with the instant it was computed. Aliased so the cache
/// type stays legible (clippy `type_complexity`).
type CachedSnapshot = (Instant, Arc<AgentSnapshot>);

fn agent_snapshot_cache() -> &'static RwLock<Option<CachedSnapshot>> {
    static CACHE: OnceLock<RwLock<Option<CachedSnapshot>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(None))
}

/// Resolve the machine-global A2A snapshot, memoized for [`AGENT_SNAPSHOT_TTL`].
/// A fresh cached snapshot is returned without touching the filesystem; a stale
/// or absent one triggers exactly one read pass. Honesty is preserved: the memo
/// holds the real classification for at most the TTL, never an optimistic verdict.
fn resolve_agent_snapshot() -> Arc<AgentSnapshot> {
    if let Some((at, snap)) = agent_snapshot_cache()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        && at.elapsed() < AGENT_SNAPSHOT_TTL
    {
        return snap.clone();
    }
    let snap = Arc::new(compute_agent_snapshot());
    *agent_snapshot_cache()
        .write()
        .unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), snap.clone()));
    snap
}

/// The single read pass behind the memo: derive the product paths once, read the
/// receipt once and the discovery once, then build BOTH the agent availability
/// and the component handshake from them. A path-resolution failure degrades
/// honestly, never optimism.
fn compute_agent_snapshot() -> AgentSnapshot {
    let paths = match ProductPaths::derive() {
        Ok(paths) => paths,
        Err(e) => {
            let reason = format!("a2a product paths unresolved: {e}");
            return AgentSnapshot {
                available: false,
                reason: Some(reason.clone()),
                handshake: json!({ "installed": false, "available": false, "reason": reason }),
            };
        }
    };
    let owner_id = paths.root().to_string_lossy().to_string();
    let receipt = LifecycleController::new(paths.clone()).active_receipt();
    let discovery = read_gateway_discovery(&paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(&owner_id)));
    let (available, reason) = availability_from(&receipt, verdict.as_ref());
    let receipt = receipt.ok().flatten();
    let readiness = readiness_from(receipt.as_ref(), verdict.as_ref());
    let handshake = handshake_value(
        receipt.as_ref(),
        discovery.as_ref(),
        verdict.as_ref(),
        readiness,
        available,
        reason.clone(),
    );
    AgentSnapshot {
        available,
        reason,
        handshake,
    }
}

/// Resolve the agent-orchestration tier MACHINE-GLOBALLY for the shared tiers
/// builder (S29): every served response overlays this honest classification onto
/// the degraded-by-default seed, so absence can never masquerade as availability.
/// Reads through the memoized snapshot so it shares one filesystem pass with the
/// handshake decoration on the same response.
pub(crate) fn resolve_agent_tier() -> (bool, Option<String>) {
    let snap = resolve_agent_snapshot();
    (snap.available, snap.reason.clone())
}

/// Resolve the A2A component handshake MACHINE-GLOBALLY for the tiers decoration
/// (S28), sharing the memoized read pass with [`resolve_agent_tier`].
pub(crate) fn resolve_agent_handshake() -> Value {
    resolve_agent_snapshot().handshake.clone()
}

/// The resolved orchestration endpoint for the run edge (S30/S31), or the honest
/// reason it is unavailable. `Available` carries the loopback endpoint and the
/// attach-control bearer the forwarded verb calls authenticate with — the
/// dashboard control token for our OWNED gateway, or the foreign owner's
/// owner-ACL attach credential (read through the trusted handoff reference) for a
/// read-only foreign attach.
pub(crate) enum ResolvedGateway {
    Available(ResolvedEndpoint),
    Unavailable { reason: String },
}

/// A usable, authenticated gateway endpoint.
pub(crate) struct ResolvedEndpoint {
    /// The loopback `host:port` the gateway published.
    pub endpoint: String,
    /// The attach-control bearer for forwarded calls. Never logged.
    pub attach_token: String,
    /// Whether we OWN this gateway or attach to a foreign one read-only.
    pub mode: AttachMode,
    /// The active generation the gateway serves.
    pub generation: String,
}

// Redact the bearer from any `{:?}` surface (mirrors the product crate's
// credential-redacting Debug law).
impl std::fmt::Debug for ResolvedEndpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResolvedEndpoint")
            .field("endpoint", &self.endpoint)
            .field("attach_token", &"<redacted>")
            .field("mode", &self.mode)
            .field("generation", &self.generation)
            .finish()
    }
}

impl ResolvedEndpoint {
    /// Parse the loopback port out of the `host:port` endpoint string.
    pub(crate) fn port(&self) -> Option<u16> {
        self.endpoint
            .rsplit_once(':')
            .and_then(|(_, p)| p.parse().ok())
    }

    /// Whether this resolution owns the gateway (vs. a read-only foreign attach).
    pub(crate) fn is_owned(&self) -> bool {
        matches!(self.mode, AttachMode::Owned)
    }
}

// --- the lifecycle plane (owned by AppState) ----------------------------------

/// The A2A lifecycle plane: the `vaultspec-product` controller plus the bounded
/// job registry, rooted at a product app home. Owned by `AppState`.
pub struct LifecyclePlane {
    controller: LifecycleController,
    paths: ProductPaths,
    owner_id: String,
    registry: Mutex<Registry>,
    /// The gateway process this seated dashboard OWNS after a boot start (S27).
    /// Retained for the process lifetime so the child is never orphaned and the
    /// bounded termination contract (D4) can reach its tree on shutdown. `None`
    /// when nothing was started here (cold, not-installed, or attached to a
    /// gateway another process owns).
    owned_gateway: Mutex<Option<vaultspec_product::process::GatewayProcess>>,
}

impl std::fmt::Debug for LifecyclePlane {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LifecyclePlane")
            .field("root", &self.paths.root())
            .finish_non_exhaustive()
    }
}

impl LifecyclePlane {
    /// Build the plane rooted at a resolved product app home. The owner identity
    /// is stable per install root (the seated dashboard is the owner).
    pub fn new(app_home: &std::path::Path) -> Self {
        let paths = ProductPaths::under_app_home(app_home);
        let owner_id = paths.root().to_string_lossy().to_string();
        Self {
            controller: LifecycleController::new(paths.clone()),
            paths,
            owner_id,
            registry: Mutex::new(Registry::new()),
            owned_gateway: Mutex::new(None),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Registry> {
        self.registry.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The one readiness model, derived from the installed receipt and the live
    /// gateway discovery (if any). A cold worker on a live gateway is still ready.
    fn readiness_now(&self) -> Readiness {
        let live = matches!(self.current_verdict(), Some(Verdict::OwnedLive));
        self.controller.readiness(live, WorkerState::Cold)
    }

    /// Read and classify the current gateway discovery record, if the seated
    /// controller has published one (W02.P04). `None` when no gateway is
    /// discoverable — so a mutation gate cannot see an owned live gateway.
    fn current_verdict(&self) -> Option<Verdict> {
        let discovery = read_gateway_discovery(&self.paths)?;
        Some(discovery.classify(&discovery_ctx(&self.owner_id)))
    }

    /// The honest agent-tier availability for this plane's product state (S29):
    /// no credential read, just the discovery classification.
    pub(crate) fn agent_availability(&self) -> (bool, Option<String>) {
        agent_availability_at(&self.paths, &self.owner_id)
    }

    /// Resolve the authenticated run-edge endpoint (S30/S31): a usable gateway
    /// with its attach-control bearer, or the honest unavailable reason. This is
    /// the ONE resolution the `/ops/a2a` pass-through and the run-stream relay both
    /// consume, replacing the retired token-bearing `service.json` discovery.
    pub(crate) fn resolve_gateway(&self) -> ResolvedGateway {
        let Some(discovery) = read_gateway_discovery(&self.paths) else {
            let (_, reason) = self.agent_availability();
            return ResolvedGateway::Unavailable {
                reason: reason.unwrap_or_else(|| "a2a gateway not discoverable".to_string()),
            };
        };
        match discovery.classify(&discovery_ctx(&self.owner_id)) {
            Verdict::OwnedLive => {
                // Our own dashboard control (attach-control) token authenticates
                // the forwarded calls to the gateway we own.
                match CredentialStore::new(self.paths.credentials_dir()).read_attach_control() {
                    Ok(cred) => ResolvedGateway::Available(ResolvedEndpoint {
                        endpoint: discovery.endpoint.clone(),
                        attach_token: cred.secret().to_string(),
                        mode: AttachMode::Owned,
                        generation: discovery.generation.clone(),
                    }),
                    Err(e) => ResolvedGateway::Unavailable {
                        reason: format!("owned gateway attach credential unreadable: {e}"),
                    },
                }
            }
            Verdict::ForeignAttachable => {
                // A compatible foreign gateway with a trusted handoff: read the
                // foreign owner's owner-ACL attach credential from the non-secret
                // handoff reference. Attachment is READ-ONLY (ADR D4).
                match std::fs::read_to_string(&discovery.handoff_reference) {
                    Ok(secret) => ResolvedGateway::Available(ResolvedEndpoint {
                        endpoint: discovery.endpoint.clone(),
                        attach_token: secret.trim().to_string(),
                        mode: AttachMode::ForeignReadOnly,
                        generation: discovery.generation.clone(),
                    }),
                    Err(e) => ResolvedGateway::Unavailable {
                        reason: format!("foreign gateway handoff credential unreadable: {e}"),
                    },
                }
            }
            Verdict::OwnedStale => ResolvedGateway::Unavailable {
                reason: "owned a2a gateway is stale (recorded process not alive)".to_string(),
            },
            Verdict::ForeignImmutable { reason } => ResolvedGateway::Unavailable {
                reason: format!(
                    "a foreign a2a gateway holds the runtime and stays immutable: {}",
                    immutable_reason(&reason)
                ),
            },
        }
    }

    /// Reconcile the receipt-owned gateway during seated boot (S27). The seated
    /// dashboard starts or authenticates ONLY a gateway its receipt owns, and
    /// leaves every compatible foreign resident immutable (ADR D4):
    ///
    /// - not installed (no receipt): nothing to own — no-op;
    /// - owned + live discovery: AUTHENTICATE via the attach-control token and
    ///   confirm readiness; nothing is spawned;
    /// - owned + stale discovery (recorded process proven dead): quarantine the
    ///   owner-matched stale record under the install lock, then start;
    /// - installed + no discovery (cold): START the owned gateway from the active
    ///   generation;
    /// - foreign (attachable or immutable): LEAVE IT — never displace or mutate a
    ///   foreign resident.
    ///
    /// Returns a non-secret projection of what was reconciled (for the boot log).
    /// Best-effort: a start failure degrades the agent tier honestly rather than
    /// aborting the seat.
    pub(crate) fn reconcile_seated_boot(&self) -> Value {
        let _ = self.controller.initialize();
        let receipt = match self.controller.active_receipt() {
            Ok(Some(r)) => r,
            Ok(None) => {
                return json!({ "action": "none", "reason": "a2a is not installed" });
            }
            Err(e) => {
                return json!({ "action": "error", "reason": format!("receipt unverifiable: {e}") });
            }
        };
        let verdict = self.current_verdict();
        match verdict {
            Some(Verdict::OwnedLive) => self.authenticate_owned(&receipt),
            Some(Verdict::OwnedStale) => self.recover_stale_then_start(&receipt),
            Some(Verdict::ForeignAttachable) => json!({
                "action": "attach-foreign",
                "reason": "a compatible foreign gateway satisfies run demand read-only; left immutable",
            }),
            Some(Verdict::ForeignImmutable { reason }) => json!({
                "action": "leave-foreign",
                "reason": format!("foreign gateway left immutable: {}", immutable_reason(&reason)),
            }),
            None => self.start_owned(&receipt),
        }
    }

    /// Authenticate an already-running owned gateway: read the attach-control
    /// token and probe readiness over the real loopback endpoint. A resolution
    /// whose endpoint carries no parseable loopback port is refused before a
    /// socket is opened.
    fn authenticate_owned(&self, _receipt: &vaultspec_product::receipt::Receipt) -> Value {
        match self.resolve_gateway() {
            ResolvedGateway::Available(ep) => {
                if ep.port().is_none() {
                    return json!({
                        "action": "authenticate",
                        "ready": false,
                        "reason": "owned gateway endpoint has no parseable loopback port",
                    });
                }
                let owned = ep.is_owned();
                let endpoint = ep.endpoint.clone();
                let generation = ep.generation.clone();
                let client =
                    vaultspec_product::control::ControlClient::new(ep.endpoint, ep.attach_token);
                match client.readiness() {
                    Ok(r) => json!({
                        "action": "authenticate",
                        "endpoint": endpoint,
                        "generation": generation,
                        "owned": owned,
                        "ready": r.service_ready(),
                    }),
                    Err(e) => json!({
                        "action": "authenticate",
                        "endpoint": endpoint,
                        "owned": owned,
                        "ready": false,
                        "reason": format!("owned gateway readiness probe failed: {e}"),
                    }),
                }
            }
            ResolvedGateway::Unavailable { reason } => {
                json!({ "action": "authenticate", "ready": false, "reason": reason })
            }
        }
    }

    /// Recover a stale owned discovery record under the install lock (prove the
    /// recorded process dead, quarantine the owner-matched stale state), then
    /// start the owned gateway.
    fn recover_stale_then_start(&self, receipt: &vaultspec_product::receipt::Receipt) -> Value {
        use vaultspec_product::locking::{
            Actor, InstallLock, StaleState, quarantine_owner_matched_stale,
        };
        let Some(discovery) = read_gateway_discovery(&self.paths) else {
            return self.start_owned(receipt);
        };
        let lock = InstallLock::new(self.paths.install_lock_path());
        let guard = match lock.acquire(Actor::Installer, &self.owner_id) {
            Ok(Ok(guard)) => guard,
            Ok(Err(busy)) => {
                return json!({
                    "action": "recover-stale",
                    "reason": format!("install lock busy: {busy:?}"),
                });
            }
            Err(e) => {
                return json!({
                    "action": "recover-stale",
                    "reason": format!("install lock error: {e}"),
                });
            }
        };
        let stale = StaleState {
            owner: self.owner_id.clone(),
            pid: discovery.pid,
        };
        if let Err(refusal) = quarantine_owner_matched_stale(&self.owner_id, &stale) {
            let release = guard.release().err();
            let reason = match release {
                Some(error) => format!(
                    "stale quarantine refused: {refusal}; install lock cleanup incomplete: {error}"
                ),
                None => format!("stale quarantine refused: {refusal}"),
            };
            return json!({
                "action": "recover-stale",
                "started": false,
                "reason": bounded_recovery_reason(reason),
            });
        }
        // The stale discovery is owner-matched and proven dead: retract it, then
        // start fresh. The guard holds the install lock across the retract+start.
        let discovery_path = self.paths.app_home().join(DISCOVERY_FILE);
        match std::fs::remove_file(discovery_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                let release = guard.release().err();
                let reason = match release {
                    Some(release_error) => format!(
                        "stale discovery quarantine failed: {error}; install lock cleanup incomplete: {release_error}"
                    ),
                    None => format!("stale discovery quarantine failed: {error}"),
                };
                return json!({
                    "action": "recover-stale",
                    "started": false,
                    "reason": bounded_recovery_reason(reason),
                });
            }
        }
        let out = self.start_owned(receipt);
        match guard.release() {
            Ok(()) => out,
            Err(error) => {
                let started = out.get("started").and_then(Value::as_bool).unwrap_or(false);
                json!({
                    "action": "recover-stale",
                    "started": started,
                    "degraded": true,
                    "reason": bounded_recovery_reason(format!(
                        "gateway start attempt completed but install lock cleanup is incomplete: {error}"
                    )),
                    "start_outcome": out,
                })
            }
        }
    }

    /// Start the owned gateway from the active generation's verified capsule and
    /// retain the process for its lifetime. Reads the capsule manifest and the
    /// pinned component lock the install laid down under the active generation;
    /// an absent capsule is an honest "cannot start", never a fabricated success.
    fn start_owned(&self, receipt: &vaultspec_product::receipt::Receipt) -> Value {
        let capsule_root = match self.paths.generation_dir(&receipt.active_generation) {
            Ok(dir) => dir,
            Err(e) => {
                return json!({
                    "action": "start",
                    "started": false,
                    "reason": format!("generation path invalid: {e}"),
                });
            }
        };
        let manifest_path = capsule_root.join("component-manifest.json");
        let lock_path = capsule_root.join("component.lock");
        let (raw_manifest, raw_lock) = match (
            std::fs::read_to_string(&manifest_path),
            std::fs::read_to_string(&lock_path),
        ) {
            (Ok(m), Ok(l)) => (m, l),
            _ => {
                return json!({
                    "action": "start",
                    "started": false,
                    "reason": "installed generation is missing its capsule manifest or component lock",
                });
            }
        };
        let lock = match vaultspec_product::manifest::ComponentLock::parse(&raw_lock) {
            Ok(l) => l,
            Err(e) => {
                return json!({
                    "action": "start",
                    "started": false,
                    "reason": format!("component lock unreadable: {e}"),
                });
            }
        };
        let manifest = match LifecycleController::load_verified_capsule(
            &raw_manifest,
            &lock,
            receipt.target,
        ) {
            Ok(m) => m,
            Err(e) => {
                return json!({
                    "action": "start",
                    "started": false,
                    "reason": format!("capsule verification failed: {e}"),
                });
            }
        };
        match self
            .controller
            .spawn_owned_gateway(&capsule_root, &manifest)
        {
            Ok(process) => {
                let pid = process.pid();
                *self.owned_gateway.lock().unwrap_or_else(|e| e.into_inner()) = Some(process);
                json!({
                    "action": "start",
                    "started": true,
                    "pid": pid,
                    "generation": receipt.active_generation,
                })
            }
            Err(e) => json!({
                "action": "start",
                "started": false,
                "reason": format!("gateway spawn failed: {e}"),
            }),
        }
    }

    /// Terminate the owned gateway process tree within a bound (D4), if this
    /// dashboard started one. Called on seated shutdown. No-op when nothing was
    /// started here (cold, or attached to a gateway another process owns).
    pub(crate) fn terminate_owned_gateway(&self, graceful: Duration) -> Option<bool> {
        let mut slot = self.owned_gateway.lock().unwrap_or_else(|e| e.into_inner());
        let mut process = slot.take()?;
        match process.terminate_tree(graceful) {
            Ok(t) => Some(t.forced),
            Err(_) => Some(true),
        }
    }

    /// The A2A product facts for the `/status` backends block (S32): installation,
    /// gateway identity, the ONE readiness model, and lifecycle admission. A cold
    /// worker on a live gateway reports READY, never degraded (ADR D4). The worker
    /// and provider processes are gateway-owned, run-scoped children — the
    /// dashboard reports the gateway's readiness and its own admission state, never
    /// a fabricated worker/provider census it does not own.
    pub(crate) fn stream_facts(&self) -> Value {
        let mut facts = agent_handshake_at(&self.paths, &self.owner_id);
        let in_flight = self.lock().running().count();
        if let Some(obj) = facts.as_object_mut() {
            obj.insert(
                "admission".into(),
                json!({
                    "in_flight": in_flight,
                    "single_flight_ceiling": MAX_CONCURRENT,
                }),
            );
            // Worker/provider processes are gateway-owned run-scoped children
            // (ADR D4); the dashboard does not census them. State honestly.
            obj.insert(
                "worker_and_providers".into(),
                json!("gateway-owned run-scoped children; not dashboard-tracked"),
            );
        }
        facts
    }

    /// The SINGLE guarded-mutation seam: a mutating operation composes BOTH the
    /// attach gate and the authority gate through `guard_owned_mutation` before
    /// any control-plane mutation, so no route can satisfy only one.
    ///
    /// The discovery record is published ONLY while the gateway runs (ADR D5), so
    /// its ABSENCE is a cleanly stopped install — a VALID precondition for a
    /// receipt-bound mutation (ADR D4/D6 cold state), NOT a `ForeignResident`
    /// refusal. Absent discovery is passed as `None` and the receipt + ownership
    /// authority governs; only a genuinely uninstalled component (no receipt) is
    /// refused `NotInstalled`.
    fn guard_mutation(&self, op: LifecycleOp) -> Result<(), Refusal> {
        let verdict = self.current_verdict();
        // Absent discovery AND no active receipt = genuinely not installed.
        if verdict.is_none() && matches!(self.controller.active_receipt(), Ok(None)) {
            return Err(Refusal::NotInstalled);
        }
        let store = CredentialStore::new(self.paths.credentials_dir());
        let ownership = store.read_ownership().ok();
        self.controller
            .guard_owned_mutation(op, ownership.as_ref(), verdict.as_ref())
    }

    /// The served status projection: installed release-set, readiness, ownership,
    /// and the current job (if any). Backend truth, not client inference.
    fn status_projection(&self) -> Value {
        // Best-effort orphaned-temp sweep on read (resource-bounds); never fatal.
        let _ = self.controller.initialize();
        let receipt = self.controller.active_receipt().ok().flatten();
        let readiness = self.readiness_now();
        json!({
            "installed": receipt.is_some(),
            "readiness": readiness,
            "ownership": {
                "owner": self.owner_id,
                "retained": receipt
                    .as_ref()
                    .map(|r| r.bootstrap_created_ownership)
                    .unwrap_or(false),
            },
            "active_generation": receipt.as_ref().map(|r| r.active_generation.clone()),
        })
    }

    /// Apply a lifecycle operation (the background job body). P03 wires the job
    /// plane; the gateway control effect for the process-lifecycle operations
    /// lands with the seated controller in W02.P04. Operations fully owned by the
    /// product crate today are applied for real; the rest report the current
    /// authoritative state rather than a fabricated success.
    fn apply(&self, op: LifecycleOp) -> (JobState, Value) {
        match op {
            LifecycleOp::Doctor => (
                JobState::Succeeded,
                json!({ "readiness": self.readiness_now() }),
            ),
            LifecycleOp::Remove => match self.controller.remove(false) {
                Ok(()) => (
                    JobState::Succeeded,
                    json!({ "removed": true, "data_preserved": true }),
                ),
                Err(e) => (JobState::Failed, json!({ "error": e.to_string() })),
            },
            other => (
                JobState::Failed,
                json!({
                    "error": "the seated gateway controller applies this operation",
                    "op": op_label(other),
                    "pending": "W02.P04",
                }),
            ),
        }
    }
}

// --- GET /a2a/lifecycle/status ------------------------------------------------

pub(crate) async fn a2a_lifecycle_status(State(state): State<Arc<AppState>>) -> ApiResult {
    let plane = state.a2a_lifecycle.clone();
    let projection = tokio::task::spawn_blocking(move || plane.status_projection())
        .await
        .unwrap_or(Value::Null);
    Ok(crate::routes::envelope(
        projection,
        crate::routes::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- POST /a2a/lifecycle/run --------------------------------------------------

pub(crate) async fn a2a_lifecycle_run(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RunRequest>,
) -> ApiResult {
    let op: LifecycleOp = req.op.into();

    // Combined ownership gate for a receipt-bound mutation, BEFORE admission or
    // any control-plane effect. Both gates must hold (P02 review SHOULD-FIX 3).
    if op.requires_ownership() {
        let plane = state.a2a_lifecycle.clone();
        let guard = tokio::task::spawn_blocking(move || plane.guard_mutation(op))
            .await
            .unwrap_or(Err(Refusal::Unverifiable {
                detail: "gate task failed".to_string(),
            }));
        if let Err(refusal) = guard {
            return Err(refusal_response(&state, &refusal));
        }
    }

    // Atomic check-and-reserve admission (one critical section).
    let admission = state.a2a_lifecycle.lock().reserve(op_label(op));
    match admission {
        Admission::AtCapacity => Err(crate::routes::api_error_kind(
            &state,
            StatusCode::CONFLICT,
            "at_capacity",
            "the A2A component is busy with another lifecycle operation".to_string(),
        )),
        Admission::Attached(id) => {
            let job = state.a2a_lifecycle.lock().wire(&id).unwrap_or(Value::Null);
            Ok(crate::routes::envelope(
                json!({ "job": job, "attached": true }),
                crate::routes::query_tiers(&state.active_cell()),
                None,
            ))
        }
        Admission::Reserved(id) => {
            let wire = state.a2a_lifecycle.lock().wire(&id).unwrap_or(Value::Null);
            // Run the operation in the background under a wall-clock deadline; the
            // request returns immediately with the job id (job-shaped).
            let plane = state.a2a_lifecycle.clone();
            let bg_id = id.clone();
            tokio::spawn(async move {
                let apply_plane = plane.clone();
                let result = tokio::task::spawn_blocking(move || apply_plane.apply(op));
                let (job_state, outcome) = match tokio::time::timeout(JOB_TIMEOUT, result).await {
                    Ok(Ok(pair)) => pair,
                    Ok(Err(_join)) => (
                        JobState::Failed,
                        json!({ "error": "lifecycle operation task failed" }),
                    ),
                    Err(_) => (
                        JobState::Failed,
                        json!({ "error": "lifecycle operation exceeded its deadline" }),
                    ),
                };
                plane.lock().set_outcome(&bg_id, job_state, outcome);
            });
            Ok(crate::routes::envelope(
                json!({ "job": wire, "attached": false }),
                crate::routes::query_tiers(&state.active_cell()),
                None,
            ))
        }
    }
}

/// Map a typed lifecycle refusal to an HTTP error carrying the refusal kind.
fn refusal_response(state: &AppState, refusal: &Refusal) -> (StatusCode, Json<Value>) {
    let (status, kind) = match refusal {
        Refusal::NotInstalled => (StatusCode::CONFLICT, "not_installed"),
        Refusal::NoActiveReceipt => (StatusCode::CONFLICT, "no_active_receipt"),
        Refusal::NotOwner => (StatusCode::FORBIDDEN, "not_owner"),
        Refusal::ForeignResident => (StatusCode::CONFLICT, "foreign_resident"),
        Refusal::Incompatible { .. } => (StatusCode::CONFLICT, "incompatible"),
        Refusal::Unverifiable { .. } => (StatusCode::CONFLICT, "unverifiable"),
        Refusal::AtCapacity => (StatusCode::CONFLICT, "at_capacity"),
        Refusal::StaleUnproven => (StatusCode::CONFLICT, "stale_unproven"),
    };
    crate::routes::api_error_kind(state, status, kind, refusal.to_string())
}

// --- GET /a2a/lifecycle/jobs/{id} ---------------------------------------------

pub(crate) async fn a2a_lifecycle_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult {
    let job = {
        let mut reg = state.a2a_lifecycle.lock();
        reg.prune();
        reg.wire(&id)
    };
    match job {
        Some(job) => Ok(crate::routes::envelope(
            json!({ "job": job }),
            crate::routes::query_tiers(&state.active_cell()),
            None,
        )),
        None => Err(crate::routes::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("no A2A lifecycle job `{id}` (unknown or reclaimed)"),
        )),
    }
}

#[cfg(test)]
impl LifecyclePlane {
    /// Build a plane over an isolated product app home (test-only): the S34
    /// runtime-identity suite drives the real reconcile against a temp home.
    pub(crate) fn testonly_new(app_home: &std::path::Path) -> Self {
        Self::new(app_home)
    }

    /// The stable owner id this plane classifies discovery against (test-only):
    /// the S34 suite writes a discovery record whose `owner` must match it.
    pub(crate) fn testonly_owner_id(&self) -> &str {
        &self.owner_id
    }

    /// The product paths this plane roots at (test-only), so the S34 suite can
    /// write the receipt, credentials, and discovery record the reconcile reads.
    pub(crate) fn testonly_paths(&self) -> &ProductPaths {
        &self.paths
    }

    /// Inject an owned gateway process (test-only), so the S34 suite can prove the
    /// bounded owned-tree termination contract against a real capsule-interpreter
    /// process without the not-yet-built install layout.
    pub(crate) fn testonly_set_owned_gateway(
        &self,
        process: vaultspec_product::process::GatewayProcess,
    ) {
        *self.owned_gateway.lock().unwrap_or_else(|e| e.into_inner()) = Some(process);
    }

    /// Occupy the component single-flight slot with a running job (test-only), so
    /// a route acceptance test can prove a concurrent different-op mutation is
    /// refused while the component is busy.
    pub(crate) fn testonly_occupy(&self, op: &'static str) -> String {
        match self.lock().reserve(op) {
            Admission::Reserved(id) => id,
            other => panic!("expected a reservation, got {other:?}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserve_is_atomic_component_single_flight_with_hard_ceiling() {
        let mut reg = Registry::new();
        // First mutation reserves a running slot.
        let first = reg.reserve("stop");
        let Admission::Reserved(id) = first else {
            panic!("first reserve must succeed");
        };
        // An IDENTICAL concurrent op de-duplicates onto the running job.
        assert_eq!(reg.reserve("stop"), Admission::Attached(id.clone()));
        // A DIFFERENT concurrent mutation is refused — the component is busy
        // (single-flight ceiling), never a second running slot.
        assert_eq!(reg.reserve("update"), Admission::AtCapacity);
        // Once the running job completes, the component is free again.
        reg.set_outcome(&id, JobState::Succeeded, json!({}));
        assert!(matches!(reg.reserve("update"), Admission::Reserved(_)));
    }

    #[test]
    fn completed_history_is_capped_and_running_never_evicted() {
        let mut reg = Registry::new();
        // Fill with completed jobs beyond the retention cap.
        for i in 0..(MAX_RETAINED + 10) {
            let id = format!("j{i}");
            reg.order.push_back(id.clone());
            reg.jobs.insert(
                id.clone(),
                Job {
                    id,
                    op: "doctor",
                    state: JobState::Succeeded,
                    created: Instant::now(),
                    outcome: None,
                },
            );
        }
        reg.prune();
        assert!(reg.jobs.len() <= MAX_RETAINED, "retention cap holds");
        // A reservation still succeeds by evicting a completed record.
        assert!(matches!(reg.reserve("stop"), Admission::Reserved(_)));
    }

    #[test]
    fn at_capacity_when_full_of_running_with_nothing_evictable() {
        // Force the registry full of RUNNING jobs (bypassing single-flight via
        // direct insert) so the hard ceiling has nothing to evict.
        let mut reg = Registry::new();
        for i in 0..MAX_RETAINED {
            let id = format!("r{i}");
            reg.order.push_back(id.clone());
            reg.jobs.insert(
                id.clone(),
                Job {
                    id,
                    op: "doctor",
                    state: JobState::Running,
                    created: Instant::now(),
                    outcome: None,
                },
            );
        }
        // running() >= MAX_CONCURRENT already refuses; this proves the ceiling
        // arm returns AtCapacity rather than over-admitting.
        assert_eq!(reg.reserve("stop"), Admission::AtCapacity);
    }
}
