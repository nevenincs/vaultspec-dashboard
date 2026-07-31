//! The bounded lifecycle job registry.
//!
//! Split out of `a2a_lifecycle.rs`: admission is the one piece of that file with
//! a self-contained correctness argument — every decision (de-dup, single-flight,
//! retention ceiling) is made inside ONE critical section, and that claim is much
//! easier to audit when the whole thing fits on a screen.
//!
//! Every bound is explicit at creation, per `resource-bounds`: `MAX_CONCURRENT`
//! single-flight, `MAX_RETAINED` retention, `JOB_TTL` expiry.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use serde_json::{Value, json};

use super::{JOB_TTL, MAX_CONCURRENT, MAX_RETAINED};

// --- job registry (bounded; atomic check-and-reserve) -------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum JobState {
    Running,
    Succeeded,
    Failed,
}

impl JobState {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            JobState::Running => "running",
            JobState::Succeeded => "succeeded",
            JobState::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct Job {
    pub(super) id: String,
    pub(super) op: &'static str,
    pub(super) state: JobState,
    pub(super) created: Instant,
    pub(super) outcome: Option<Value>,
}

impl Job {
    pub(super) fn to_wire(&self) -> Value {
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
pub(super) enum Admission {
    /// A fresh running job was reserved with this id.
    Reserved(String),
    /// An identical operation is already in flight; de-duplicated onto its id.
    Attached(String),
    /// The component is busy (single-flight) or the registry is full with
    /// nothing evictable — the hard admission ceiling refuses another mutation.
    AtCapacity,
}

/// The bounded lifecycle job registry. Held INSIDE `AppState` (never a global
/// static) so tests and seated instances cannot share mutation state.
/// All admission decisions are made in one critical section.
pub(super) struct Registry {
    pub(super) jobs: HashMap<String, Job>,
    pub(super) order: VecDeque<String>,
    seq: AtomicU64,
}

impl Registry {
    pub(super) fn new() -> Self {
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
    pub(super) fn prune(&mut self) {
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

    pub(super) fn running(&self) -> impl Iterator<Item = &Job> {
        self.jobs.values().filter(|j| j.state == JobState::Running)
    }

    /// THE atomic check-and-reserve critical section. Runs entirely under the
    /// caller's single lock hold: prune, then in one pass decide de-dup vs.
    /// component single-flight vs. ceiling vs. admit, inserting the reservation
    /// before the lock is released so no concurrent caller can over-admit.
    pub(super) fn reserve(&mut self, op: &'static str) -> Admission {
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

    pub(super) fn set_outcome(&mut self, id: &str, state: JobState, outcome: Value) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.state = state;
            job.outcome = Some(outcome);
        }
    }

    pub(super) fn wire(&self, id: &str) -> Option<Value> {
        self.jobs.get(id).map(Job::to_wire)
    }
}
