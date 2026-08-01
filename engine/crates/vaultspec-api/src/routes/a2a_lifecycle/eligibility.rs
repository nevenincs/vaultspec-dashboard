//! Which lifecycle operations a client may OFFER.
//!
//! Split out of `a2a_lifecycle.rs` because it answers one question with one
//! rule, and that rule is the fix for a real defect: eligibility is the
//! INTERSECTION of what the current state permits and what is actually
//! implemented. A browser can compute the first half and cannot see the second,
//! so when it derived offers locally it advertised stop and restart against a
//! plane that refused all eight. The engine knows both halves; this module is
//! where they meet.

use vaultspec_product::lifecycle::plan_transition;
use vaultspec_product::protocol::{LifecycleOp, Readiness};

use super::op_label;

/// What actually happens when an operation is applied.
///
/// The single source both [`LifecyclePlane::apply`] and the served eligibility
/// read. Two agreeing lists would be one refactor away from disagreeing, and the
/// way that disagreement presents is the worst kind: a control the product
/// offers and then refuses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OpEffect {
    /// Carried out for real by code that ships today.
    Applied,
    /// Accepted by the job plane but with no effect behind it yet — the seated
    /// gateway controller, or a sealed authority, still owes the implementation.
    PendingImplementation,
}

/// The effect each typed operation has TODAY.
///
/// Deliberately not "what the state permits" — that is `plan_transition`'s job,
/// and the two are different questions. A stopped install permits `start`; that
/// says nothing about whether starting is wired.
///
/// `Remove` is `PendingImplementation` despite being wired at the job plane: its
/// primitive (`LifecycleController::remove`) is sealed shut behind the retained
/// product mutation authority, so the operation always fails. Wired is not
/// implemented, and only the second one is a capability.
pub(super) fn op_effect(op: LifecycleOp) -> OpEffect {
    match op {
        // A pure read over the current observation — no authority needed.
        LifecycleOp::Doctor => OpEffect::Applied,
        LifecycleOp::Install
        | LifecycleOp::Ensure
        | LifecycleOp::Start
        | LifecycleOp::Stop
        | LifecycleOp::Restart
        | LifecycleOp::Repair
        | LifecycleOp::Update
        | LifecycleOp::Rollback
        | LifecycleOp::Remove => OpEffect::PendingImplementation,
    }
}

/// Every typed operation, in the order the product reasons about them.
pub(super) const ALL_OPS: &[LifecycleOp] = &[
    LifecycleOp::Install,
    LifecycleOp::Ensure,
    LifecycleOp::Start,
    LifecycleOp::Stop,
    LifecycleOp::Restart,
    LifecycleOp::Repair,
    LifecycleOp::Update,
    LifecycleOp::Rollback,
    LifecycleOp::Remove,
    LifecycleOp::Doctor,
];

/// The operations a client may offer: permitted by the CURRENT state and backed
/// by an implementation.
///
/// Both halves are required and neither is derivable by a client. A client can
/// reason about state — that is why this used to be computed in the browser —
/// but it cannot know what is wired, so it advertised controls that always
/// failed. Serving the intersection is what makes the rendered set honest.
///
/// An unknown readiness yields nothing but the read-only operations: with no
/// state to transition from, offering a mutation would be a guess.
pub(super) fn eligible_ops(readiness: Option<Readiness>) -> Vec<&'static str> {
    ALL_OPS
        .iter()
        .copied()
        .filter(|op| op_effect(*op) == OpEffect::Applied)
        .filter(|op| match readiness {
            Some(current) => plan_transition(current, *op).is_ok(),
            None => op.is_read_only(),
        })
        .map(op_label)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::a2a_lifecycle::LifecyclePlane;
    use serde_json::Value;
    use vaultspec_product::protocol::WorkerState;

    /// Every readiness a client can be shown, so eligibility is exercised over
    /// the whole state space rather than one convenient point in it.
    fn every_readiness() -> Vec<Readiness> {
        vec![
            Readiness::Uninstalled,
            Readiness::InstalledStopped,
            Readiness::GatewayReady {
                worker: WorkerState::Cold,
            },
            Readiness::GatewayReady {
                worker: WorkerState::Ready,
            },
        ]
    }

    /// THE property. Every offered operation, actually APPLIED, produces a real
    /// outcome rather than the "not yet wired" refusal.
    ///
    /// This is the defect the served eligibility exists to kill: the browser
    /// derived offers from readiness alone, could not know what was wired, and
    /// so advertised stop and restart against a plane that refused all eight.
    ///
    /// Note what this deliberately does NOT assert. Checking `op_effect(op) ==
    /// Applied` here would be tautological — `eligible_ops` already filters on
    /// exactly that, so the assertion could never fail and would prove nothing.
    /// Mislabelling an unimplemented op as `Applied` has to be caught by RUNNING
    /// it, which is what this does.
    #[test]
    fn every_offered_operation_actually_applies() {
        let home = tempfile::tempdir().unwrap();
        let plane = LifecyclePlane::testonly_new(home.path());
        for readiness in every_readiness() {
            for label in eligible_ops(Some(readiness)) {
                let op = ALL_OPS
                    .iter()
                    .copied()
                    .find(|candidate| op_label(*candidate) == label)
                    .expect("every served label names a typed op");
                let (_state, outcome) = plane.apply(op);
                assert!(
                    outcome.get("pending").is_none(),
                    "{label} is offered at {readiness:?} but applying it answers \
                     pending: {outcome}"
                );
            }
        }
    }

    /// The state half of the intersection is real: eligibility never contradicts
    /// `plan_transition`, which is the engine's own authority on what a state
    /// permits.
    #[test]
    fn eligibility_never_contradicts_the_transition_authority() {
        for readiness in every_readiness() {
            for label in eligible_ops(Some(readiness)) {
                let op = ALL_OPS
                    .iter()
                    .copied()
                    .find(|candidate| op_label(*candidate) == label)
                    .expect("every served label names a typed op");
                assert!(
                    plan_transition(readiness, op).is_ok(),
                    "{label} is offered at {readiness:?} but the transition authority refuses it"
                );
            }
        }
    }

    /// With no readiness there is no state to transition from, so only read-only
    /// operations may be offered. Guessing a mutation here would be the same
    /// class of lie in a different costume.
    #[test]
    fn unknown_readiness_offers_only_read_only_operations() {
        for label in eligible_ops(None) {
            let op = ALL_OPS
                .iter()
                .copied()
                .find(|candidate| op_label(*candidate) == label)
                .expect("every served label names a typed op");
            assert!(
                op.is_read_only(),
                "{label} was offered without a known readiness"
            );
        }
    }

    /// The set is SERVED, which is the whole point — a client that has to derive
    /// it is back to guessing at what is wired.
    #[test]
    fn the_status_projection_carries_the_eligible_set() {
        let home = tempfile::tempdir().unwrap();
        let plane = LifecyclePlane::testonly_new(home.path());
        let projection = plane.status_projection();
        let served = projection
            .get("eligible_ops")
            .and_then(Value::as_array)
            .expect("status serves eligible_ops");
        assert!(
            served.iter().all(|entry| entry.is_string()),
            "eligible_ops is a list of operation tokens"
        );
    }
}
