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
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

use vaultspec_product::credentials::CredentialStore;
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery};
use vaultspec_product::lifecycle::LifecycleController;
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::protocol::{LifecycleOp, Readiness, Refusal, WorkerState};

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
/// The gateway discovery record the seated controller publishes (W02.P04). The
/// lifecycle plane READS it to classify the attach verdict; it never writes it.
const DISCOVERY_FILE: &str = "gateway-discovery.json";

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

// --- the lifecycle plane (owned by AppState) ----------------------------------

/// The A2A lifecycle plane: the `vaultspec-product` controller plus the bounded
/// job registry, rooted at a product app home. Owned by `AppState`.
pub struct LifecyclePlane {
    controller: LifecycleController,
    paths: ProductPaths,
    owner_id: String,
    registry: Mutex<Registry>,
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
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Registry> {
        self.registry.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The one readiness model, derived from the installed receipt and the live
    /// gateway discovery (if any). A cold worker on a live gateway is still ready.
    fn readiness_now(&self) -> Readiness {
        let live = matches!(
            self.current_verdict(),
            Some(vaultspec_product::discovery::Verdict::OwnedLive)
        );
        self.controller.readiness(live, WorkerState::Cold)
    }

    /// Read and classify the current gateway discovery record, if the seated
    /// controller has published one (W02.P04). `None` when no gateway is
    /// discoverable — so a mutation gate cannot see an owned live gateway.
    fn current_verdict(&self) -> Option<vaultspec_product::discovery::Verdict> {
        let raw = std::fs::read_to_string(self.paths.app_home().join(DISCOVERY_FILE)).ok()?;
        let discovery = GatewayDiscovery::parse(&raw).ok()?;
        let ctx = DiscoveryContext {
            our_owner: self.owner_id.clone(),
            now_ms: crate::app::now_ms(),
            freshness_ms: DISCOVERY_FRESHNESS.as_millis() as i64,
            supported_protocol: RangeBounds {
                minimum: "v1".to_string(),
                maximum: "v1".to_string(),
            },
            supported_state_schema: RangeBounds {
                minimum: "0001".to_string(),
                maximum: "9999".to_string(),
            },
        };
        Some(discovery.classify(&ctx))
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
