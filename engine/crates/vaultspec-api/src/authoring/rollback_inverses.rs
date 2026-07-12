//! Rollback inverse construction (authoring-surface ADR D1, W04.P09.S33).
//!
//! Extracted from [`super::rollback`] so that grandfathered module stays within
//! its size ratchet. Hosts the plan-step OPPOSITE-STATE inverse builder plus the
//! deterministic rollback-id helpers the generator keys on. It never applies a
//! rollback — [`super::rollback::generate_rollback`] owns the lifecycle; this
//! module only constructs the inverse child + the identity a repeat request
//! replays against.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, DraftMutation, PlanStepEdit,
    PlanStepState, TargetRevisionFence,
};
use super::ledger::ChangesetChildOperationRecord;
use super::model::{ChangesetId, IdempotencyKey};
use super::operations::MaterializedProposalOperation;
use super::snapshots::{PreimageRecord, RevisionSnapshot};
use super::store::{Result as StoreResult, StoreError};

/// The redacted reason a plan-tick rollback is unavailable because the applied
/// source carries no recorded step edit (structurally unreachable for a valid
/// applied `SetPlanStepState`, whose materialize step requires the payload).
pub(super) const PLAN_STEP_NO_EDIT_REASON: &str =
    "rollback_unavailable: plan-tick source carries no recorded step edit";

/// Build the OPPOSITE-STATE inverse of an applied `SetPlanStepState` child: the
/// opposite `set-plan-step-state` (check→uncheck, uncheck→check) against the
/// SAME plan node + canonical step id — NEVER a whole-document preimage restore.
/// A preimage restore would rewrite the ENTIRE plan body back to its pre-tick
/// bytes, clobbering every OTHER step ticked since; the state-flip inverse
/// touches only the one step. It rides the same core capability with the same
/// engine-side stale-base fence + core-authoritative post-verify the forward
/// tick uses, so the `inverse_preimage` captured by the generator is inert
/// (never consumed), exactly as on the forward path.
///
/// `Ok(None)` signals the source carries no recorded step edit — the caller
/// surfaces the honest [`PLAN_STEP_NO_EDIT_REASON`] as an unavailable outcome
/// with a manual-repair hook, never a guessed inverse.
pub(super) fn plan_step_inverse(
    source_child: &ChangesetChildOperationRecord,
    child_key: &str,
    target: &TargetRevisionFence,
    base_snapshot: &RevisionSnapshot,
    inverse_preimage: &PreimageRecord,
    rollback_id: &ChangesetId,
) -> StoreResult<Option<(ChangesetOperationKind, MaterializedProposalOperation)>> {
    let Some(plan_step) = source_child
        .materialized_operation
        .as_ref()
        .and_then(|operation| operation.plan_step_edit.clone())
    else {
        return Ok(None);
    };
    let inverse_state = match plan_step.state {
        PlanStepState::Checked => PlanStepState::Unchecked,
        PlanStepState::Unchecked => PlanStepState::Checked,
    };
    let draft = ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::SetPlanStepState,
        target: target.clone(),
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: Some(PlanStepEdit {
                step_id: plan_step.step_id.clone(),
                state: inverse_state,
            }),
        },
    };
    let materialized = MaterializedProposalOperation::materialize_set_plan_step_state(
        rollback_id,
        draft,
        base_snapshot,
        inverse_preimage,
    )
    .map_err(|err| StoreError::Validation(err.to_string()))?;
    Ok(Some((
        ChangesetOperationKind::SetPlanStepState,
        materialized,
    )))
}

/// The deterministic rollback changeset id for a (source, idempotency key) pair —
/// the idempotency identity, so a repeated request replays instead of duplicating.
///
/// The inputs are HASHED (not embedded) — mirroring `apply::receipt_id_for`: a
/// long-but-legal idempotency key would overflow the `ChangesetId` byte cap and
/// fail a legitimate request on SHAPE alone, and a client-chosen opaque key would
/// otherwise leak into every projection / event / audit surface as a public entity
/// id. `blob_oid` is 40-hex — always a valid, bounded authoring token — so the id
/// is infallible; determinism and replay are unchanged (same inputs → same id).
pub(super) fn rollback_changeset_id(
    source: &ChangesetId,
    idempotency_key: &IdempotencyKey,
) -> ChangesetId {
    let digest = blob_oid(format!("{source}|{idempotency_key}").as_bytes());
    ChangesetId::new(format!("rollback:{digest}"))
        .expect("rollback changeset id is a valid authoring token")
}

pub(super) fn rollback_preimage_id(rollback_id: &ChangesetId, child_key: &str) -> String {
    format!("preimage:{}:{}", rollback_id.as_str(), child_key)
}

/// Whether the preimage material a `child`'s rollback inverse needs is present.
/// Every kind gates on the WHOLE-document preimage `whole_document_present`
/// names; a `SectionEdit` child ALSO requires the SELECTED preimage its own
/// materialized operation carries (section-scoped-operations ADR: the inverse
/// restores the selected preimage, never the whole-document one) — an applied
/// record from before this feature landed carries no `section_edit` payload
/// and is honestly unavailable rather than silently falling back to a
/// whole-document restore that would clobber unrelated content.
///
/// A `SetPlanStepState` child is preimage-INDEPENDENT for correctness (its
/// inverse is a state flip, never a restore), but is still gated on the
/// captured whole-document preimage here for uniformity with the shared
/// generation path, which always has one for a fresh changeset.
pub(super) fn preimage_available(
    child: &ChangesetChildOperationRecord,
    whole_document_present: bool,
) -> bool {
    if child.operation != ChangesetOperationKind::SectionEdit {
        return whole_document_present;
    }
    whole_document_present
        && child
            .materialized_operation
            .as_ref()
            .is_some_and(|operation| operation.section_edit.is_some())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::api::ChangesetChildOperationDraft;
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::ledger::ChangesetChildOperationInput;
    use crate::authoring::model::{
        ActorKind, ActorRef, ChangesetKind, ChangesetStatus, CommandKind,
    };
    use crate::authoring::rollback::tests::{
        actor, generate, seed_applied_source, source_preimage_record, temp_store, write_doc,
    };
    use crate::authoring::snapshots::SnapshotReader;
    use crate::authoring::store::Store;

    /// Build an applied `SetPlanStepState` source (a forward tick of `step_id`
    /// to `state`) over a real plan doc, returning the source id. The plan body
    /// need not carry the real step row: the materializer validates only the
    /// canonical `S##` shape, and this is a GENERATION test (core existence
    /// checks run at apply time, exercised separately by the real-core tests).
    fn seed_applied_plan_tick(
        store: &mut Store,
        root: &Path,
        stem: &str,
        step_id: &str,
        state: PlanStepState,
    ) -> ChangesetId {
        let source = ChangesetId::new("changeset_plan_tick_1").unwrap();
        write_doc(
            root,
            stem,
            "---\ntags:\n  - '#plan'\n  - '#rollback-tick'\n---\n\n# plan\n\nbody\n",
        );
        let doc = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
            .unwrap();
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&doc)
            .unwrap();
        let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
        let forward_draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::SetPlanStepState,
            target: TargetRevisionFence {
                document: doc.clone(),
                base_revision: Some(base_snapshot.revision.clone()),
                current_revision: Some(base_snapshot.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: Some(PlanStepEdit {
                    step_id: step_id.to_string(),
                    state,
                }),
            },
        };
        let forward_materialized = MaterializedProposalOperation::materialize_set_plan_step_state(
            &source,
            forward_draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let forward_child = ChangesetChildOperationInput::from_materialized(
            forward_materialized,
            "material:child_1".to_string(),
            "validation:child_1".to_string(),
        );
        let author: ActorRef = actor("agent:author", ActorKind::Agent);
        let reviewer: ActorRef = actor("human:reviewer", ActorKind::Human);
        seed_applied_source(
            store,
            &source,
            &author,
            &reviewer,
            || forward_child.clone(),
            Some(preimage.clone()),
        );
        source
    }

    /// Load the generated rollback's single inverse child, asserting it is
    /// materialized and NOT a whole-document preimage restore.
    fn rollback_inverse_plan_step(
        store: &mut crate::authoring::store::Store,
        rollback_id: &ChangesetId,
    ) -> (ChangesetOperationKind, PlanStepEdit) {
        let rollback = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(rollback_id)?.unwrap())
            })
            .unwrap();
        assert_eq!(rollback.kind, ChangesetKind::Rollback);
        assert_eq!(rollback.status, ChangesetStatus::RollbackProposed);
        assert_eq!(rollback.operation_count, 1);
        let materialized = rollback.children[0]
            .materialized_operation
            .as_ref()
            .expect("rollback child is materialized");
        assert_ne!(
            materialized.operation,
            ChangesetOperationKind::ReplaceBody,
            "a plan tick's inverse is NEVER a whole-document preimage restore (which would \
             clobber concurrent step edits)"
        );
        let plan_step = materialized
            .plan_step_edit
            .clone()
            .expect("the inverse carries a plan-step edit");
        (rollback.children[0].operation, plan_step)
    }

    #[test]
    fn plan_tick_check_rolls_back_by_an_uncheck_never_a_preimage_restore() {
        // The invariant this locks: a `SetPlanStepState` source is invertible by
        // the OPPOSITE set-plan-step-state against the SAME step, never a
        // whole-document preimage restore. Retires the W01.P01 unavailable gate.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let source = seed_applied_plan_tick(
            &mut store,
            root,
            "rollback-tick-plan",
            "S05",
            PlanStepState::Checked,
        );

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rb:tick:1");
        assert!(
            outcome.eligibility.allowed,
            "a plan tick is now rollback-eligible: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.manual_repair.is_none());
        let rollback_id = outcome.changeset_id.expect("rollback generated");

        let (operation, plan_step) = rollback_inverse_plan_step(&mut store, &rollback_id);
        assert_eq!(operation, ChangesetOperationKind::SetPlanStepState);
        assert_eq!(
            plan_step.step_id, "S05",
            "the inverse targets the SAME step"
        );
        assert_eq!(
            plan_step.state,
            PlanStepState::Unchecked,
            "the inverse of a check is an uncheck"
        );
    }

    #[test]
    fn plan_tick_uncheck_rolls_back_by_a_check() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let source = seed_applied_plan_tick(
            &mut store,
            root,
            "rollback-untick-plan",
            "S12",
            PlanStepState::Unchecked,
        );

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rb:untick:1");
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let rollback_id = outcome.changeset_id.expect("rollback generated");

        let (operation, plan_step) = rollback_inverse_plan_step(&mut store, &rollback_id);
        assert_eq!(operation, ChangesetOperationKind::SetPlanStepState);
        assert_eq!(plan_step.step_id, "S12");
        assert_eq!(
            plan_step.state,
            PlanStepState::Checked,
            "the inverse of an uncheck is a check"
        );
    }

    #[test]
    fn repeated_plan_tick_rollback_replays_the_same_inverse() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let source = seed_applied_plan_tick(
            &mut store,
            root,
            "rollback-replay-plan",
            "S03",
            PlanStepState::Checked,
        );

        let first = generate(&mut store, root, &source, &["child_1"], "idem:rb:replay:1");
        assert!(!first.replayed);
        let second = generate(&mut store, root, &source, &["child_1"], "idem:rb:replay:1");
        assert!(
            second.replayed,
            "a repeated plan-tick rollback replays the same inverse, never appends a second"
        );
        assert_eq!(first.changeset_id, second.changeset_id);
    }
}
