//! Typed lifecycle protocol contracts.
//!
//! The lifecycle plane accepts typed intent, not free-form paths or arguments,
//! and it distinguishes a service-ready cold gateway from execution
//! readiness. This module is the shared, transport-free vocabulary
//! the discovery, control, and lifecycle modules speak: the ten lifecycle
//! operations, the one readiness model the dashboard and A2A both expose, and
//! the closed set of typed refusals. No free-form string ever stands in for a
//! decision here.

use serde::{Deserialize, Serialize};

/// The ten lifecycle operations the A2A component surface exposes. These never
/// ride `/ops/a2a` — that namespace keeps its orchestration verbs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LifecycleOp {
    /// First install: create the initial receipt and ownership capability.
    Install,
    /// Reconcile to a running, owned gateway (idempotent start-or-attach).
    Ensure,
    /// Start the receipt-owned gateway.
    Start,
    /// Stop the owned gateway and its process tree.
    Stop,
    /// Stop then start the owned gateway.
    Restart,
    /// Replace immutable files for the active generation without touching state.
    Repair,
    /// Transactionally advance to a staged candidate release set.
    Update,
    /// Restore the retained prior generation and receipt.
    Rollback,
    /// Remove owned generations and receipts, preserving data unless typed
    /// removal is requested.
    Remove,
    /// Read-only health and ownership diagnosis.
    Doctor,
}

impl LifecycleOp {
    /// Whether the operation mutates installed product state. `Doctor` is the
    /// only pure read; `Ensure` may start a process but performs no install
    /// mutation, so it is not receipt-bound in the same way as the rest.
    #[must_use]
    pub fn is_read_only(self) -> bool {
        matches!(self, LifecycleOp::Doctor)
    }

    /// Whether the operation is a receipt-bound mutation that requires the
    /// matching active receipt AND the receipt-bound ownership capability.
    /// `Install` bootstraps the receipt, so it is gated by the
    /// bootstrap descriptor rather than an existing capability; `Doctor` and a
    /// bare `Ensure`/`Start` attach are not install mutations.
    /// Whether the operation replaces or deletes the generation files a running
    /// gateway executes from.
    ///
    /// Repair rewrites immutable files inside the generation tree and removal
    /// deletes it, so a live owned gateway is a hard precondition failure for
    /// both: Windows refuses to replace a running image outright, and no
    /// platform makes it coherent. Stop and restart address the running process
    /// deliberately, while update and rollback stage a NEW generation and swap
    /// by receipt with the prior tree retained - none of those four rewrite the
    /// files underneath a process still executing them.
    #[must_use]
    pub fn replaces_running_files(self) -> bool {
        matches!(self, LifecycleOp::Repair | LifecycleOp::Remove)
    }

    #[must_use]
    pub fn requires_ownership(self) -> bool {
        matches!(
            self,
            LifecycleOp::Stop
                | LifecycleOp::Restart
                | LifecycleOp::Repair
                | LifecycleOp::Update
                | LifecycleOp::Rollback
                | LifecycleOp::Remove
        )
    }
}

/// The worker's execution state. The gateway lazily starts its worker on first
/// run demand, so a running gateway with a cold worker is still ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerState {
    /// No worker yet — first run demand will start it.
    Cold,
    /// A worker is up and serving.
    Ready,
}

/// The single readiness model the dashboard and A2A both expose — one
/// readiness model rather than contradictory health summaries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "state")]
pub enum Readiness {
    /// No installed generation.
    Uninstalled,
    /// Installed but the gateway is stopped — a VALID cold state, not a
    /// degradation.
    InstalledStopped,
    /// The gateway is up and service-ready; the worker may still be cold.
    GatewayReady {
        /// The worker's execution state.
        worker: WorkerState,
    },
}

impl Readiness {
    /// Whether the gateway is service-ready (up and answering), regardless of
    /// worker warmth. A cold worker does NOT collapse this to degradation.
    #[must_use]
    pub fn service_ready(self) -> bool {
        matches!(self, Readiness::GatewayReady { .. })
    }

    /// Whether a generation is installed at all (stopped or running).
    #[must_use]
    pub fn is_installed(self) -> bool {
        !matches!(self, Readiness::Uninstalled)
    }
}

/// The closed set of typed lifecycle refusals. A refusal is always one of these
/// — never a free-form string — so a client can branch on the cause and render
/// its own localized remediation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "refusal")]
pub enum Refusal {
    /// No installed generation to operate on.
    NotInstalled,
    /// No active receipt authorizes a receipt-bound mutation.
    NoActiveReceipt,
    /// The caller lacks the receipt-bound ownership capability. The attach
    /// credential alone cannot invoke a receipt-bound operation.
    NotOwner,
    /// A live foreign or unverifiable resident holds the runtime; it stays
    /// immutable and is never displaced speculatively.
    ForeignResident,
    /// The gateway or staged release declares an incompatible protocol or
    /// state-schema range.
    Incompatible {
        /// A short, non-secret detail naming the incompatibility.
        detail: String,
    },
    /// Discovery could not be authenticated or verified.
    Unverifiable {
        /// A short, non-secret detail naming what could not be verified.
        detail: String,
    },
    /// The job registry is at its hard admission ceiling with nothing evictable.
    AtCapacity,
    /// Stale discovery exists but the recorded process was not proven dead, so
    /// quarantine is refused: prove absence first.
    StaleUnproven,
    /// Our own gateway is live, and the requested operation replaces or removes
    /// the very files it is executing from. Stop it first.
    GatewayRunning,
}

impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refusal::NotInstalled => write!(f, "no installed A2A generation"),
            Refusal::NoActiveReceipt => write!(f, "no active receipt authorizes this mutation"),
            Refusal::NotOwner => {
                write!(f, "caller lacks the receipt-bound ownership capability")
            }
            Refusal::ForeignResident => {
                write!(
                    f,
                    "a live foreign gateway holds the runtime and stays immutable"
                )
            }
            Refusal::Incompatible { detail } => write!(f, "incompatible: {detail}"),
            Refusal::Unverifiable { detail } => write!(f, "unverifiable: {detail}"),
            Refusal::AtCapacity => write!(f, "lifecycle registry is at its hard admission ceiling"),
            Refusal::StaleUnproven => {
                write!(
                    f,
                    "stale discovery is not proven dead; refusing to quarantine"
                )
            }
            Refusal::GatewayRunning => {
                write!(
                    f,
                    "the owned gateway is running and executing from these files; stop it first"
                )
            }
        }
    }
}

impl std::error::Error for Refusal {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ownership_gating_covers_every_state_mutation() {
        // Every receipt-bound mutation requires ownership; doctor and the
        // start/attach verbs do not gate an install mutation on it.
        for op in [
            LifecycleOp::Stop,
            LifecycleOp::Restart,
            LifecycleOp::Repair,
            LifecycleOp::Update,
            LifecycleOp::Rollback,
            LifecycleOp::Remove,
        ] {
            assert!(op.requires_ownership(), "{op:?} must require ownership");
        }
        for op in [
            LifecycleOp::Install,
            LifecycleOp::Ensure,
            LifecycleOp::Start,
            LifecycleOp::Doctor,
        ] {
            assert!(
                !op.requires_ownership(),
                "{op:?} is not a receipt-bound mutation"
            );
        }
        assert!(LifecycleOp::Doctor.is_read_only());
    }

    #[test]
    fn readiness_treats_a_cold_worker_as_ready_and_survives_a_roundtrip() {
        let cold = Readiness::GatewayReady {
            worker: WorkerState::Cold,
        };
        assert!(cold.service_ready(), "a cold worker is still service-ready");
        assert!(Readiness::InstalledStopped.is_installed());
        assert!(!Readiness::InstalledStopped.service_ready());
        assert!(!Readiness::Uninstalled.is_installed());
        // The tagged representation round-trips for the wire.
        let json = serde_json::to_string(&cold).unwrap();
        assert_eq!(cold, serde_json::from_str(&json).unwrap());
    }

    #[test]
    fn refusal_is_a_closed_tagged_set() {
        let r = Refusal::Incompatible {
            detail: "api v2 > v1".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"refusal\":\"incompatible\""));
        assert_eq!(r, serde_json::from_str(&json).unwrap());
    }
}
