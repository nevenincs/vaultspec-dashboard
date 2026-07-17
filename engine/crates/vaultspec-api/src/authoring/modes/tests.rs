use std::path::Path;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, DraftMutation,
    TargetRevisionFence,
};
use crate::authoring::approvals::ApprovalQueueState;
use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
use crate::authoring::model::{ChangesetKind, DocumentRef, RevisionToken, SessionId};
use crate::authoring::operations::MaterializedProposalOperation;
use crate::authoring::policy::RiskClass;
use crate::authoring::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use crate::authoring::store::Store;
use crate::authoring::store::unit_of_work::Repository;
use crate::authoring::validation::{
    CurrentRevisionObservation, ValidationStatus, ValidationStatusRecord,
    validate_changeset_material,
};

fn actor(id: &str, kind: ActorKind) -> ActorRef {
    ActorRef {
        id: ActorId::new(id).unwrap(),
        kind,
        delegated_by: None,
    }
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    write_doc(
        dir.path(),
        ".vault/plan/mode-plan.md",
        "---\ntags:\n  - '#plan'\n---\n\nold body\n",
    );
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:admin", ActorKind::Human),
                ("human:reviewer", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();
    (dir, store)
}

fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn existing_doc(root: &Path) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("mode-plan".to_string()))
        .unwrap()
}

fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("mode tests use an existing document");
    };
    base_revision.clone()
}

fn materialized(
    root: &Path,
    changeset_id: &ChangesetId,
) -> (
    MaterializedProposalOperation,
    PreimageRecord,
    ValidationStatusRecord,
) {
    let reader = SnapshotReader::for_worktree(root);
    let document = existing_doc(root);
    let snapshot = reader.require_current_base(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 10,
        })
        .unwrap();
    let revision = base_revision(&document);
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: "---\ntags:\n  - '#plan'\n---\n\nnew body\n".to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let operation = MaterializedProposalOperation::materialize_replace_body(
        changeset_id,
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap();
    let current = CurrentRevisionObservation::from_snapshot("child_1", &snapshot);
    let validation = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        &[],
        20,
    )
    .unwrap();
    assert_eq!(validation.status, ValidationStatus::ValidWithWarnings);
    assert!(validation.approval_ready);
    (operation, preimage, validation)
}

fn materialized_child(
    operation: MaterializedProposalOperation,
    validation: &ValidationStatusRecord,
) -> ChangesetChildOperationInput {
    ChangesetChildOperationInput::from_materialized(
        operation,
        validation.material_digest.clone(),
        validation.validation_digest.clone(),
    )
}

fn structural_child(
    root: &Path,
    operation: ChangesetOperationKind,
) -> ChangesetChildOperationInput {
    let document = existing_doc(root);
    let revision = base_revision(&document);
    ChangesetChildOperationInput {
        child_key: "child_1".to_string(),
        operation,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        materialized_operation: None,
        material_digest: None,
        validation_digest: None,
    }
}

fn changeset_record(
    changeset_id: &ChangesetId,
    previous: Option<RevisionToken>,
    status: ChangesetStatus,
    actor: &ActorRef,
    child: ChangesetChildOperationInput,
    created_at_ms: i64,
    kind: ChangesetKind,
) -> ChangesetAggregateRecord {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id.clone(),
        previous_revision: previous,
        kind,
        status,
        session_id: Some(SessionId::new("session_1").unwrap()),
        actor: actor.clone(),
        summary: "mode proposal".to_string(),
        children: vec![child],
        created_at_ms,
    })
    .unwrap()
}

fn seed_needs_review(
    store: &mut Store,
    changeset_id: &ChangesetId,
    author: &ActorRef,
    child: ChangesetChildOperationInput,
) -> RevisionToken {
    seed_needs_review_of_kind(store, changeset_id, author, child, ChangesetKind::Authoring)
}

fn seed_needs_review_of_kind(
    store: &mut Store,
    changeset_id: &ChangesetId,
    author: &ActorRef,
    child: ChangesetChildOperationInput,
    kind: ChangesetKind,
) -> RevisionToken {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = changeset_record(
                changeset_id,
                None,
                ChangesetStatus::Draft,
                author,
                child.clone(),
                30,
                kind,
            );
            uow.ledger().append_revision(&draft)?;
            let needs_review = changeset_record(
                changeset_id,
                Some(draft.changeset_revision.clone()),
                ChangesetStatus::NeedsReview,
                author,
                child,
                31,
                kind,
            );
            uow.ledger().append_revision(&needs_review)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap()
}

fn request_approval(
    store: &mut Store,
    proposal_id: &ProposalId,
    changeset_id: &ChangesetId,
    reviewed_revision: &RevisionToken,
    validation_digest: &str,
) -> ApprovalRequestRecord {
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.to_string(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:approval:1".to_string(),
                created_at_ms: 40,
            }))
        })
        .unwrap()
        .unwrap()
        .record
}

fn set_mode(
    store: &mut Store,
    root: &Path,
    mode: OperationMode,
    actor: &ActorRef,
    now_ms: i64,
) -> OperationModeUpdate {
    let scope_id = scope_id_for_worktree(root);
    store
        .with_unit_of_work(CommandKind::SetOperationMode, |uow| {
            uow.modes().set_scope_mode(
                &scope_id,
                mode,
                actor,
                &IdempotencyKey::new(format!("idem:mode:{now_ms}")).unwrap(),
                now_ms,
            )
        })
        .unwrap()
}

fn append_apply_statuses(store: &mut Store, changeset_id: &ChangesetId) {
    let system = system_actor();
    store
        .with_unit_of_work(CommandKind::RequestApply, |uow| {
            let approved = uow.ledger().latest(changeset_id)?.unwrap();
            let applying =
                append_status_revision(uow, &approved, ChangesetStatus::Applying, &system, 70)?;
            append_status_revision(uow, &applying, ChangesetStatus::Applied, &system, 71)?;
            Ok(())
        })
        .unwrap();
}

fn marker_by_approval(store: &mut Store, approval_id: &ApprovalId) -> SystemPolicyApprovalRecord {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let json = uow
                .repository("authoring_system_policy_approvals")
                .query_optional(
                    "SELECT record_json
                     FROM authoring_system_policy_approvals
                     WHERE approval_id = ?1",
                    [approval_id.as_str()],
                    |row| row.get::<_, String>(0),
                )?
                .expect("system policy marker exists");
            read_system_marker(&json)
        })
        .unwrap()
}

#[test]
fn eligible_changeset_is_approved_by_system_actor_in_autonomous_mode() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let author = actor("agent:author", ActorKind::Agent);
    let admin = actor("human:admin", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let (operation, preimage, validation) = materialized(root, &changeset_id);
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.snapshots().store_preimage(&preimage)?;
            uow.validations().store_record(&validation)
        })
        .unwrap();
    let reviewed = seed_needs_review(
        &mut store,
        &changeset_id,
        &author,
        materialized_child(operation, &validation),
    );
    let approval = request_approval(
        &mut store,
        &proposal_id,
        &changeset_id,
        &reviewed,
        &validation.validation_digest,
    );
    set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

    let scope_id = scope_id_for_worktree(root);
    let outcome = store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
        })
        .unwrap();

    assert!(outcome.approved(), "system approval should be recorded");
    assert_eq!(
        outcome.policy.requirement,
        ApprovalRequirement::SystemAutoApprovable
    );
    assert_eq!(outcome.policy.risk, RiskClass::NonDestructive);
    let recorded = outcome.approval.expect("approval outcome is returned");
    let decision = recorded.decision.expect("decision is recorded");
    assert_eq!(decision.reviewer, system_actor());
    assert_eq!(decision.resulting_status, ChangesetStatus::Approved);
    assert_eq!(
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&changeset_id)?.unwrap().status)
            })
            .unwrap(),
        ChangesetStatus::Approved
    );
}

#[test]
fn direct_changeset_is_never_system_auto_approved_even_in_autonomous_mode() {
    // P49-R2 site-c guard (LOAD-BEARING): a crashed direct save can leave a Draft
    // kind=Direct changeset that a client pushes through the GENERIC submit route
    // (which gates nothing on kind) into this composition. Even in autonomous mode
    // over a non-destructive body edit — which WOULD auto-approve for Authoring —
    // a Direct changeset must be refused: it is the human's own self-approved save,
    // never a system approval.
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let author = actor("human:reviewer", ActorKind::Human);
    let admin = actor("human:admin", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let (operation, preimage, validation) = materialized(root, &changeset_id);
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.snapshots().store_preimage(&preimage)?;
            uow.validations().store_record(&validation)
        })
        .unwrap();
    let reviewed = seed_needs_review_of_kind(
        &mut store,
        &changeset_id,
        &author,
        materialized_child(operation, &validation),
        ChangesetKind::Direct,
    );
    let approval = request_approval(
        &mut store,
        &proposal_id,
        &changeset_id,
        &reviewed,
        &validation.validation_digest,
    );
    set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

    let scope_id = scope_id_for_worktree(root);
    let outcome = store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
        })
        .unwrap();

    assert!(
        !outcome.approved(),
        "a direct changeset must never be system-auto-approved: {:?}",
        outcome.eligibility
    );
    assert!(
        outcome.marker.is_none(),
        "no system approval marker for a direct save"
    );
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("human-self-approved")),
        "the refusal names the human-self-approval reason: {:?}",
        outcome.eligibility
    );
}

#[test]
fn destructive_operation_keeps_the_human_floor_in_autonomous_mode() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let author = actor("agent:author", ActorKind::Agent);
    let admin = actor("human:admin", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let reviewed = seed_needs_review(
        &mut store,
        &changeset_id,
        &author,
        structural_child(root, ChangesetOperationKind::Rename),
    );
    let approval = request_approval(
        &mut store,
        &proposal_id,
        &changeset_id,
        &reviewed,
        "validation:v1",
    );
    set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

    let scope_id = scope_id_for_worktree(root);
    let outcome = store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
        })
        .unwrap();

    assert!(!outcome.approved());
    assert_eq!(outcome.policy.risk, RiskClass::Destructive);
    assert_eq!(
        outcome.policy.requirement,
        ApprovalRequirement::HumanApprovalRequired
    );
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("human approval"))
    );
    let (status, decision) = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let status = uow.ledger().latest(&changeset_id)?.unwrap().status;
            let decision = uow
                .approvals()
                .latest_for_proposal(&proposal_id)?
                .unwrap()
                .decision;
            Ok((status, decision))
        })
        .unwrap();
    assert_eq!(status, ChangesetStatus::NeedsReview);
    assert!(decision.is_none());
}

#[test]
fn applied_system_approval_is_served_in_the_after_fact_lane() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let author = actor("agent:author", ActorKind::Agent);
    let admin = actor("human:admin", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let (operation, preimage, validation) = materialized(root, &changeset_id);
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.snapshots().store_preimage(&preimage)?;
            uow.validations().store_record(&validation)
        })
        .unwrap();
    let reviewed = seed_needs_review(
        &mut store,
        &changeset_id,
        &author,
        materialized_child(operation, &validation),
    );
    let approval = request_approval(
        &mut store,
        &proposal_id,
        &changeset_id,
        &reviewed,
        &validation.validation_digest,
    );
    set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);
    let scope_id = scope_id_for_worktree(root);
    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
        })
        .unwrap();
    append_apply_statuses(&mut store, &changeset_id);

    let lane = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.projections()
                .list_proposals(root)
                .map(|page| page.applied_under_policy)
                .map_err(|err| StoreError::Mode(err.to_string()))
        })
        .unwrap();

    assert_eq!(lane.items.len(), 1);
    let item = &lane.items[0];
    assert_eq!(item.proposal.changeset_id, changeset_id);
    assert_eq!(item.proposal.status, ChangesetStatus::Applied);
    assert_eq!(item.mode, OperationMode::Autonomous);
    assert_eq!(item.policy_id, MODE_POLICY_ID);
    assert_eq!(item.system_actor, system_actor());
    assert!(item.proposal.rollback.available);
    assert_eq!(item.acknowledgement_count, 0);
}

#[test]
fn mode_downgrade_requeues_not_yet_applying_system_approval_as_human_review() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let author = actor("agent:author", ActorKind::Agent);
    let admin = actor("human:admin", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let (operation, preimage, validation) = materialized(root, &changeset_id);
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.snapshots().store_preimage(&preimage)?;
            uow.validations().store_record(&validation)
        })
        .unwrap();
    let reviewed = seed_needs_review(
        &mut store,
        &changeset_id,
        &author,
        materialized_child(operation, &validation),
    );
    let approval = request_approval(
        &mut store,
        &proposal_id,
        &changeset_id,
        &reviewed,
        &validation.validation_digest,
    );
    set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);
    let scope_id = scope_id_for_worktree(root);
    let auto = store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
        })
        .unwrap();
    assert!(auto.approved());
    let stale_approval_id = auto.approval.as_ref().unwrap().approval_id.clone();

    let update = set_mode(&mut store, root, OperationMode::Manual, &admin, 65);

    assert_eq!(update.requeued_approvals, 1);
    let (latest, old, replacement) = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let latest = uow.ledger().latest(&changeset_id)?.unwrap();
            let old = uow
                .approvals()
                .record_by_approval(&stale_approval_id)?
                .unwrap();
            let replacement = uow.approvals().latest_for_proposal(&proposal_id)?.unwrap();
            Ok((latest, old, replacement))
        })
        .unwrap();
    assert_eq!(latest.status, ChangesetStatus::NeedsReview);
    // P48-R1: the kill switch re-queues through the SINGLE declared
    // Approved→NeedsReview arc — the head's predecessor is the Approved auto-approval,
    // NOT a synthetic Approved→Draft re-draft, and the system actor never authored a
    // Draft revision.
    let history = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id)
        })
        .unwrap();
    let predecessor = &history.revisions[history.revisions.len() - 2];
    assert_eq!(
        predecessor.status,
        ChangesetStatus::Approved,
        "requeue is a direct Approved→NeedsReview hop, not through Draft"
    );
    assert!(
        !history
            .revisions
            .iter()
            .any(|rev| rev.status == ChangesetStatus::Draft && rev.actor == system_actor()),
        "the requeue never emits a synthetic Approved→Draft re-draft"
    );
    assert!(old.stale);
    assert_eq!(old.stale_reason.as_deref(), Some("policy_version_changed"));
    assert_ne!(replacement.approval_id, stale_approval_id);
    assert!(!replacement.stale);
    assert_eq!(replacement.queue_state, ApprovalQueueState::Queued);
    assert_eq!(
        replacement.reviewed.proposal_revision,
        latest.changeset_revision
    );
    let projection = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.projections()
                .project_proposal(&changeset_id, root)
                .map_err(|err| StoreError::Mode(err.to_string()))
        })
        .unwrap()
        .unwrap();
    assert!(
        !projection.approval.stale,
        "the replacement approval remains actionable for human review"
    );
    assert_eq!(
        projection.approval.stale_reason.as_deref(),
        Some("policy_version_changed"),
        "the served review item carries the kill-switch policy stale reason"
    );
    let marker = marker_by_approval(&mut store, &stale_approval_id);
    assert_eq!(marker.requeued_at_ms, Some(65));
}
