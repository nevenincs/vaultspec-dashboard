use std::path::Path;

use ingest_struct::reader::read_from_worktree;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::api::{ChangesetOperationKind, TargetRevisionFence};
use crate::authoring::approvals::{
    ApprovalDecision, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple,
};
use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
use crate::authoring::model::{
    ActorId, ActorKind, ApprovalId, ChangesetKind, CommandKind, ProposalId,
    ProvisionalCollisionStatus, SessionId,
};
use crate::authoring::policy::{ApprovalRequirement, OperationMode, RiskClass};
use crate::authoring::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use crate::authoring::store::Store;

fn actor(id: &str, kind: ActorKind) -> ActorRef {
    ActorRef {
        id: ActorId::new(id).unwrap(),
        kind,
        delegated_by: None,
    }
}

/// Write a `.vault/plan/<stem>.md` doc and return its current worktree revision
/// (the real blob token), so a child's reviewed base can be pinned to reality
/// (a fake `blob:xyz` would flag every changeset as conflicted).
fn write_doc(root: &Path, stem: &str, body: &str) -> RevisionToken {
    let rel = format!(".vault/plan/{stem}.md");
    let path = root.join(&rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, body).unwrap();
    let body = read_from_worktree(root, &rel).unwrap();
    RevisionToken::new(format!("blob:{}", body.blob_hash)).unwrap()
}

fn existing_doc(stem: &str, base: &RevisionToken) -> DocumentRef {
    DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{stem}"),
        stem: stem.to_string(),
        path: format!(".vault/plan/{stem}.md"),
        doc_type: "plan".to_string(),
        base_revision: base.clone(),
    }
}

fn child(child_key: &str, document: DocumentRef) -> ChangesetChildOperationInput {
    let base = match &document {
        DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
        _ => None,
    };
    ChangesetChildOperationInput {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document,
            base_revision: base.clone(),
            current_revision: base,
        },
        materialized_operation: None,
        material_digest: None,
        validation_digest: None,
    }
}

fn record(
    changeset_id: &ChangesetId,
    previous: Option<RevisionToken>,
    status: ChangesetStatus,
    actor: &ActorRef,
    children: Vec<ChangesetChildOperationInput>,
    created_at_ms: i64,
) -> ChangesetAggregateRecord {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id.clone(),
        previous_revision: previous,
        kind: ChangesetKind::Authoring,
        status,
        session_id: Some(SessionId::new("session_1").unwrap()),
        actor: actor.clone(),
        summary: "projection proposal".to_string(),
        children,
        created_at_ms,
    })
    .unwrap()
}

fn temp_store(root: &Path) -> Store {
    let mut store = Store::open(&root.join(".vault")).unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
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
    store
}

/// Append Draft then NeedsReview for `changeset_id`, returning the NeedsReview
/// revision (the reviewable proposal revision).
fn seed_needs_review(
    store: &mut Store,
    changeset_id: &ChangesetId,
    author: &ActorRef,
    children: impl Fn() -> Vec<ChangesetChildOperationInput>,
) -> RevisionToken {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = record(
                changeset_id,
                None,
                ChangesetStatus::Draft,
                author,
                children(),
                10,
            );
            uow.ledger().append_revision(&draft)?;
            let needs_review = record(
                changeset_id,
                Some(draft.changeset_revision.clone()),
                ChangesetStatus::NeedsReview,
                author,
                children(),
                20,
            );
            uow.ledger().append_revision(&needs_review)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap()
}

fn request_approval(
    store: &mut Store,
    changeset_id: &ChangesetId,
    reviewed_revision: &RevisionToken,
) {
    request_approval_with(
        store,
        changeset_id,
        reviewed_revision,
        "approval_1",
        "proposal_1",
        "idem:request:1",
        30,
    );
}

fn request_approval_with(
    store: &mut Store,
    changeset_id: &ChangesetId,
    reviewed_revision: &RevisionToken,
    approval_id: &str,
    proposal_id: &str,
    idempotency_key: &str,
    created_at_ms: i64,
) -> ProposalId {
    let proposal_id = ProposalId::new(proposal_id).unwrap();
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            uow.approvals()
                .request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new(approval_id).unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: "validation:v1".to_string(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: idempotency_key.to_string(),
                    created_at_ms,
                })
                .map_err(|err| StoreError::Approval(err.to_string()))?;
            Ok(())
        })
        .unwrap();
    proposal_id
}

fn approve_proposal(store: &mut Store, proposal_id: &ProposalId, decided_at_ms: i64) {
    let reviewer = actor("human:reviewer", ActorKind::Human);
    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            uow.approvals()
                .submit_decision(ReviewDecisionInput {
                    proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: "validation:v1",
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms,
                })
                .map_err(|err| StoreError::Approval(err.to_string()))?;
            Ok(())
        })
        .unwrap();
}

fn project(store: &mut Store, root: &Path, changeset_id: &ChangesetId) -> ProposalProjection {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.projections().project_proposal(changeset_id, root))
        })
        .unwrap()
        .unwrap()
        .unwrap()
}

fn project_detail(
    store: &mut Store,
    root: &Path,
    changeset_id: &ChangesetId,
) -> ProposalDetailProjection {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow
                .projections()
                .project_proposal_detail(changeset_id, root))
        })
        .unwrap()
        .unwrap()
        .unwrap()
}

/// Write a base document and build a MATERIALIZED replace-body child input for it
/// (child_key `child_1`), carrying the real target snapshot the projection reads
/// the proposed text from. The materialized operation's `changeset_id` must equal
/// the aggregate's, so the ledger's materialized-child identity check passes.
fn materialized_child(
    root: &Path,
    stem: &str,
    changeset_id: &ChangesetId,
    base_body: &str,
    new_body: &str,
) -> (ChangesetChildOperationInput, PreimageRecord) {
    use crate::authoring::api::{ChangesetChildOperationDraft, DraftMode, DraftMutation};
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::operations::MaterializedProposalOperation;

    let rel = format!(".vault/plan/{stem}.md");
    let path = root.join(&rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, base_body).unwrap();

    let document = DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
        .unwrap();
    let base_snapshot = SnapshotReader::for_worktree(root)
        .require_current_base(&document)
        .unwrap();
    let base_revision = match &document {
        DocumentRef::Existing { base_revision, .. } => base_revision.clone(),
        _ => panic!("resolved document must be existing"),
    };
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_revision.clone()),
            current_revision: Some(base_revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: new_body.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let preimage = SnapshotReader::for_worktree(root)
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document,
            captured_at_ms: 100,
        })
        .unwrap();
    let operation = MaterializedProposalOperation::materialize_replace_body(
        changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    (
        ChangesetChildOperationInput::from_materialized(operation, "material:v1", "validation:v1"),
        preimage,
    )
}

fn store_preimage(store: &mut Store, preimage: &PreimageRecord) {
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.snapshots().store_preimage(preimage)
        })
        .unwrap();
}

#[test]
fn needs_review_proposal_serves_approve_reject_eligibility() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let children = move || vec![child("child_1", existing_doc("projection-a", &base))];
    let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
    request_approval(&mut store, &changeset_id, &revision);

    let projection = project(&mut store, root, &changeset_id);

    assert_eq!(projection.status, ChangesetStatus::NeedsReview);
    assert_eq!(projection.origin_actor, author);
    assert!(projection.conflict.is_none(), "base matches the worktree");
    assert!(projection.approval.present);
    assert!(!projection.approval.stale);
    assert_eq!(projection.policy.scope_mode, OperationMode::Manual);
    assert_eq!(projection.policy.effective_mode, OperationMode::Manual);
    assert_eq!(projection.policy.risk, RiskClass::NonDestructive);
    assert_eq!(
        projection.policy.requirement,
        ApprovalRequirement::HumanApprovalRequired
    );
    assert!(
        projection.policy.reason.contains("manual mode"),
        "policy reason is backend-served: {:?}",
        projection.policy
    );
    // Both review decisions are served, backend-owned. With no validation
    // record seeded, the served reason is the MISSING validation record
    // (absence is NOT staleness — a NeedsReview proposal that was never
    // validated is "not yet validated", not "stale digest"), and it is NOT a
    // target conflict (proving the live target-fence comparison passed on a
    // fresh worktree base). The eligibility reasons are backend-served.
    assert_eq!(projection.eligibility.len(), 2);
    assert!(
        projection.eligibility.iter().all(|entry| !entry.allowed
            && entry.reason.as_deref().is_some_and(|reason| {
                reason.contains("validation record")
                    && !reason.contains("target revisions")
                    && !reason.contains("stale")
            })),
        "review decisions are served; the reason is the MISSING validation record, \
             not a stale digest or a target conflict: {:?}",
        projection.eligibility
    );
    assert!(!projection.rollback.available);
}

#[test]
fn out_of_band_edit_surfaces_conflict_and_denies_review_targets() {
    // The advisory-A2.1 scenario: an UN-LEDGERED worktree edit moves the target
    // base after review. The stored approval is NOT stale, but the projection's
    // live target-fence comparison catches it — a conflict, and the review
    // eligibility is denied for stale target revisions.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let children = move || vec![child("child_1", existing_doc("projection-a", &base))];
    let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
    request_approval(&mut store, &changeset_id, &revision);

    // Human direct-saves the document out of band — the ledger/approval never
    // learns of it.
    write_doc(root, "projection-a", "changed out of band\n");

    let projection = project(&mut store, root, &changeset_id);

    let conflict = projection
        .conflict
        .expect("target-fence conflict is surfaced");
    assert_eq!(conflict.child_key, "child_1");
    assert!(conflict.reason.contains("changed since review"));
    assert!(
        projection.eligibility.iter().any(|entry| !entry.allowed
            && entry
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("target revisions"))),
        "review eligibility is denied for stale target revisions: {:?}",
        projection.eligibility
    );
}

#[test]
fn projection_rebuilds_identically_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let children = move || vec![child("child_1", existing_doc("projection-a", &base))];

    let before = {
        let mut store = temp_store(root);
        let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
        request_approval(&mut store, &changeset_id, &revision);
        project(&mut store, root, &changeset_id)
    };

    // Reopen the store from disk: a projection holds no state, so it rebuilds
    // byte-identically from durable rows.
    let mut reopened = Store::open(&root.join(".vault")).unwrap();
    let after = project(&mut reopened, root, &changeset_id);

    assert_eq!(before, after);
}

#[test]
fn draft_proposal_serves_submit_eligibility_gated_on_validation() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = record(
                &changeset_id,
                None,
                ChangesetStatus::Draft,
                &author,
                vec![child("child_1", existing_doc("projection-a", &base))],
                10,
            );
            uow.ledger().append_revision(&draft)?;
            Ok(())
        })
        .unwrap();

    let projection = project(&mut store, root, &changeset_id);

    assert_eq!(projection.status, ChangesetStatus::Draft);
    assert!(!projection.validation.present, "no validation record yet");
    assert_eq!(projection.eligibility.len(), 1);
    let submit = &projection.eligibility[0];
    assert!(
        !submit.allowed
            && submit
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("validation record")),
        "submit is denied without a validation record: {submit:?}"
    );
}

#[test]
fn projection_serves_destructive_policy_for_empty_or_structural_changesets() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let children = move || {
        vec![ChangesetChildOperationInput {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: existing_doc("projection-a", &base),
                base_revision: Some(base.clone()),
                current_revision: Some(base.clone()),
            },
            materialized_operation: None,
            material_digest: Some("material:v1".to_string()),
            validation_digest: Some("validation:v1".to_string()),
        }]
    };
    seed_needs_review(&mut store, &changeset_id, &author, children);

    let projection = project(&mut store, root, &changeset_id);

    assert_eq!(projection.policy.risk, RiskClass::Destructive);
    assert_eq!(
        projection.policy.requirement,
        ApprovalRequirement::HumanApprovalRequired
    );
    assert!(
        projection.policy.reason.contains("destructive"),
        "destructive policy reason is served: {:?}",
        projection.policy
    );
}

#[test]
fn applied_changeset_with_preimage_is_rollback_available() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "applied body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let doc = existing_doc("projection-a", &base);
    let children = {
        let doc = doc.clone();
        move || vec![child("child_1", doc.clone())]
    };

    // Walk the single-child apply lifecycle to Applied, then capture a preimage.
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = record(
                &changeset_id,
                None,
                ChangesetStatus::Draft,
                &author,
                children(),
                10,
            );
            uow.ledger().append_revision(&draft)?;
            let needs_review = record(
                &changeset_id,
                Some(draft.changeset_revision.clone()),
                ChangesetStatus::NeedsReview,
                &author,
                children(),
                20,
            );
            uow.ledger().append_revision(&needs_review)?;
            let approved = record(
                &changeset_id,
                Some(needs_review.changeset_revision.clone()),
                ChangesetStatus::Approved,
                &reviewer,
                children(),
                30,
            );
            uow.ledger().append_revision(&approved)?;
            let applying = record(
                &changeset_id,
                Some(approved.changeset_revision.clone()),
                ChangesetStatus::Applying,
                &reviewer,
                children(),
                40,
            );
            uow.ledger().append_revision(&applying)?;
            let applied = record(
                &changeset_id,
                Some(applying.changeset_revision.clone()),
                ChangesetStatus::Applied,
                &reviewer,
                children(),
                50,
            );
            uow.ledger().append_revision(&applied)?;

            // Capture the rollback preimage for the applied child.
            let preimage = SnapshotReader::for_worktree(root)
                .capture_preimage(PreimageCaptureRequest {
                    preimage_id: "preimage_1".to_string(),
                    changeset_id: changeset_id.as_str().to_string(),
                    operation_id: "child_1".to_string(),
                    document: doc.clone(),
                    captured_at_ms: 60,
                })
                .unwrap();
            uow.snapshots().store_preimage(&preimage)?;
            Ok(())
        })
        .unwrap();

    let projection = project(&mut store, root, &changeset_id);

    assert_eq!(projection.status, ChangesetStatus::Applied);
    assert!(
        projection.rollback.available,
        "applied changeset with a preimage is rollback-available: {:?}",
        projection.rollback
    );
    assert_eq!(projection.rollback.child_key.as_deref(), Some("child_1"));
    assert!(
        projection.eligibility.is_empty(),
        "an applied changeset exposes no standing lifecycle action"
    );
}

#[test]
fn applied_changeset_without_preimage_is_rollback_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "applied body\n");
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let children = {
        let base = base.clone();
        move || vec![child("child_1", existing_doc("projection-a", &base))]
    };
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let mut previous: Option<RevisionToken> = None;
            for (status, at) in [
                (ChangesetStatus::Draft, 10),
                (ChangesetStatus::NeedsReview, 20),
                (ChangesetStatus::Approved, 30),
                (ChangesetStatus::Applying, 40),
                (ChangesetStatus::Applied, 50),
            ] {
                let author = if matches!(
                    status,
                    ChangesetStatus::Approved
                        | ChangesetStatus::Applying
                        | ChangesetStatus::Applied
                ) {
                    &reviewer
                } else {
                    &author
                };
                let revision = record(
                    &changeset_id,
                    previous.clone(),
                    status,
                    author,
                    children(),
                    at,
                );
                uow.ledger().append_revision(&revision)?;
                previous = Some(revision.changeset_revision.clone());
            }
            Ok(())
        })
        .unwrap();

    let projection = project(&mut store, root, &changeset_id);

    assert!(!projection.rollback.available);
    assert!(
        projection
            .rollback
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("preimage")),
        "the unavailable reason names the missing preimage: {:?}",
        projection.rollback
    );
}

#[test]
fn list_projection_is_bounded_and_reports_truncation() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let author = actor("agent:author", ActorKind::Agent);

    // Seed MAX + 5 distinct changesets (one Draft revision each).
    let total = MAX_PROJECTION_PROPOSALS + 5;
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for index in 0..total {
                let changeset_id = ChangesetId::new(format!("changeset_{index}")).unwrap();
                let draft = record(
                    &changeset_id,
                    None,
                    ChangesetStatus::Draft,
                    &author,
                    vec![child("child_1", existing_doc("projection-a", &base))],
                    index as i64,
                );
                uow.ledger().append_revision(&draft)?;
            }
            Ok(())
        })
        .unwrap();

    let page = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.projections().list_proposals(root))
        })
        .unwrap()
        .unwrap();

    assert_eq!(page.cap, MAX_PROJECTION_PROPOSALS);
    assert_eq!(
        page.items.len(),
        MAX_PROJECTION_PROPOSALS,
        "the page is bounded at the cap"
    );
    assert!(page.truncated, "a corpus over the cap reports truncation");
    assert_eq!(
        page.counts.total_changesets, total,
        "counts cover the full durable corpus, not the bounded page"
    );
    assert_eq!(page.counts.statuses.draft, total);
    assert_eq!(page.counts.queues.queued, 0);
}

#[test]
fn review_counts_roll_up_latest_statuses_and_approval_queues() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let author = actor("agent:author", ActorKind::Agent);

    let queued_changeset = ChangesetId::new("changeset_queued").unwrap();
    let queued_revision = seed_needs_review(&mut store, &queued_changeset, &author, {
        let base = base.clone();
        move || vec![child("child_1", existing_doc("projection-a", &base))]
    });
    request_approval_with(
        &mut store,
        &queued_changeset,
        &queued_revision,
        "approval_queued",
        "proposal_queued",
        "idem:queued",
        30,
    );

    let closed_changeset = ChangesetId::new("changeset_closed").unwrap();
    let closed_revision = seed_needs_review(&mut store, &closed_changeset, &author, {
        let base = base.clone();
        move || vec![child("child_1", existing_doc("projection-a", &base))]
    });
    let closed_proposal = request_approval_with(
        &mut store,
        &closed_changeset,
        &closed_revision,
        "approval_closed",
        "proposal_closed",
        "idem:closed",
        40,
    );
    approve_proposal(&mut store, &closed_proposal, 50);

    let draft_changeset = ChangesetId::new("changeset_draft").unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = record(
                &draft_changeset,
                None,
                ChangesetStatus::Draft,
                &author,
                vec![child("child_1", existing_doc("projection-a", &base))],
                60,
            );
            uow.ledger().append_revision(&draft)?;
            Ok(())
        })
        .unwrap();

    let counts = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.projections().review_counts())
        })
        .unwrap()
        .unwrap();

    assert_eq!(counts.total_changesets, 3);
    assert_eq!(counts.statuses.needs_review, 1);
    assert_eq!(counts.statuses.approved, 1);
    assert_eq!(counts.statuses.draft, 1);
    assert_eq!(counts.queues.queued, 1);
    assert_eq!(counts.queues.closed, 1);
    assert_eq!(
        counts.queues.decision_submitted, 0,
        "decision-submitted remains zero until the durable store exposes that state"
    );
    assert_eq!(counts.queues.claimed, 0);
}

#[test]
fn document_activity_is_bounded_ordered_and_rebuildable() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base_a = write_doc(root, "projection-a", "body a\n");
    let base_b = write_doc(root, "projection-b", "body b\n");
    let author = actor("agent:author", ActorKind::Agent);
    let document_key = "existing:worktree:doc:projection-a";

    {
        let mut store = temp_store(root);
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for index in 0..4 {
                    let changeset_id =
                        ChangesetId::new(format!("changeset_activity_{index}")).unwrap();
                    let stem = if index == 1 {
                        "projection-b"
                    } else {
                        "projection-a"
                    };
                    let base = if index == 1 { &base_b } else { &base_a };
                    let draft = record(
                        &changeset_id,
                        None,
                        ChangesetStatus::Draft,
                        &author,
                        vec![child("child_1", existing_doc(stem, base))],
                        10 + index as i64,
                    );
                    uow.ledger().append_revision(&draft)?;
                }
                Ok(())
            })
            .unwrap();

        let page = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow
                    .projections()
                    .document_activity_bounded(document_key, 2, root))
            })
            .unwrap()
            .unwrap();

        assert_eq!(page.cap, 2);
        assert!(page.truncated);
        assert_eq!(page.items.len(), 2);
        assert_eq!(
            page.items[0].proposal.changeset_id.as_str(),
            "changeset_activity_3"
        );
        assert_eq!(
            page.items[1].proposal.changeset_id.as_str(),
            "changeset_activity_2"
        );
        assert!(
            page.items
                .iter()
                .all(|item| item.document.key == document_key)
        );
    }

    let mut reopened = Store::open(&root.join(".vault")).unwrap();
    let rebuilt = reopened
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow
                .projections()
                .document_activity_bounded(document_key, 2, root))
        })
        .unwrap()
        .unwrap();

    assert_eq!(rebuilt.items.len(), 2);
    assert!(rebuilt.truncated);
    assert_eq!(
        rebuilt.items[0].proposal.changeset_id.as_str(),
        "changeset_activity_3"
    );
    assert_eq!(
        rebuilt.items[1].proposal.changeset_id.as_str(),
        "changeset_activity_2"
    );
}

#[test]
fn document_activity_groups_all_document_ref_identity_variants() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base = write_doc(root, "projection-a", "body\n");
    let mut store = temp_store(root);
    let author = actor("agent:author", ActorKind::Agent);
    let source = existing_doc("projection-a", &base);
    let provisional = DocumentRef::ProvisionalCreate {
        provisional_doc_id: "provisional_doc_1".to_string(),
        doc_type: "adr".to_string(),
        feature: "agentic-spec-authoring-backend".to_string(),
        title: "Activity Identity".to_string(),
        collision_status: ProvisionalCollisionStatus::Available,
        proposed_stem: Some("activity-identity".to_string()),
        related: Vec::new(),
    };
    let rename = DocumentRef::RenameTarget {
        source: Box::new(source.clone()),
        proposed_stem: "projection-renamed".to_string(),
        proposed_node_id: "doc:projection-renamed".to_string(),
    };
    let materialized = DocumentRef::MaterializedResult {
        reviewed: Box::new(source.clone()),
        result_node_id: "doc:projection-materialized".to_string(),
        result_path: ".vault/plan/projection-materialized.md".to_string(),
        result_revision: base.clone(),
    };
    let changeset_id = ChangesetId::new("changeset_identity").unwrap();

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = record(
                &changeset_id,
                None,
                ChangesetStatus::Draft,
                &author,
                vec![
                    child("child_existing", source),
                    child("child_provisional", provisional),
                    child("child_rename", rename),
                    child("child_materialized", materialized),
                ],
                10,
            );
            uow.ledger().append_revision(&draft)?;
            Ok(())
        })
        .unwrap();

    for (key, kind, expected_child) in [
        (
            "existing:worktree:doc:projection-a",
            "existing",
            "child_existing",
        ),
        (
            "provisional:provisional_doc_1",
            "provisional_create",
            "child_provisional",
        ),
        (
            "rename_target:doc:projection-renamed",
            "rename_target",
            "child_rename",
        ),
        (
            "materialized:doc:projection-materialized",
            "materialized_result",
            "child_materialized",
        ),
    ] {
        let page = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.projections().document_activity(key, root))
            })
            .unwrap()
            .unwrap();
        assert!(
            page.items
                .iter()
                .any(|item| item.document.kind == kind && item.child_key == expected_child),
            "activity key {key} should expose {kind}/{expected_child}: {:?}",
            page.items
        );
    }
}

#[test]
fn detail_projection_serves_approval_ids_and_bounded_base_and_proposed_texts() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let (mat, preimage) = materialized_child(
        root,
        "projection-a",
        &changeset_id,
        "alpha\nbeta\n",
        "alpha\nBETA\n",
    );
    store_preimage(&mut store, &preimage);
    let revision = seed_needs_review(&mut store, &changeset_id, &author, {
        let mat = mat.clone();
        move || vec![mat.clone()]
    });
    request_approval(&mut store, &changeset_id, &revision);

    let detail = project_detail(&mut store, root, &changeset_id);

    // Part 1: the IDENTITY fields are served from the approval record so a human
    // reviewing from the queue can name the approval without recomputing a hash.
    assert!(detail.proposal.approval.present);
    assert_eq!(
        detail.proposal.approval.approval_id,
        Some(ApprovalId::new("approval_1").unwrap())
    );
    assert_eq!(
        detail.proposal.approval.proposal_id,
        Some(ProposalId::new("proposal_1").unwrap())
    );
    assert_eq!(
        detail.proposal.approval.reviewed_proposal_revision.as_ref(),
        Some(&revision)
    );

    // Part 2: BOTH the base and proposed bounded texts are served, with honest
    // (unset) truncation flags for these small documents. No server-side diff.
    assert_eq!(detail.review_documents.len(), 1);
    let doc = &detail.review_documents[0];
    assert_eq!(doc.child_key, "child_1");
    assert_eq!(doc.base.text, "alpha\nbeta\n");
    assert!(!doc.base.truncated);
    assert_eq!(doc.base.total_bytes, "alpha\nbeta\n".len());
    assert_eq!(doc.base.returned_bytes, "alpha\nbeta\n".len());
    assert_eq!(doc.proposed.text, "alpha\nBETA\n");
    assert!(!doc.proposed.truncated);
    assert_eq!(doc.proposed.total_bytes, "alpha\nBETA\n".len());
}

#[test]
fn detail_projection_keeps_original_base_after_worktree_matches_target() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let (mat, preimage) = materialized_child(
        root,
        "projection-a",
        &changeset_id,
        "alpha\nbeta\n",
        "alpha\nBETA\n",
    );
    store_preimage(&mut store, &preimage);
    let revision = seed_needs_review(&mut store, &changeset_id, &author, {
        let mat = mat.clone();
        move || vec![mat.clone()]
    });
    request_approval(&mut store, &changeset_id, &revision);
    std::fs::write(root.join(".vault/plan/projection-a.md"), "alpha\nBETA\n").unwrap();

    let detail = project_detail(&mut store, root, &changeset_id);

    assert_eq!(detail.review_documents.len(), 1);
    let doc = &detail.review_documents[0];
    assert_eq!(
        doc.base.text, "alpha\nbeta\n",
        "review evidence must come from the stored preimage, not current worktree"
    );
    assert_eq!(doc.proposed.text, "alpha\nBETA\n");
}

#[test]
fn review_document_text_truncates_honestly_over_the_byte_cap() {
    let big = "a".repeat(MAX_REVIEW_DOCUMENT_TEXT_BYTES + 64);
    let bounded = BoundedDocumentText::from_text(&big);
    assert!(bounded.truncated, "an over-cap body reports truncation");
    assert_eq!(bounded.total_bytes, MAX_REVIEW_DOCUMENT_TEXT_BYTES + 64);
    assert_eq!(bounded.returned_bytes, MAX_REVIEW_DOCUMENT_TEXT_BYTES);
    assert_eq!(bounded.text.len(), MAX_REVIEW_DOCUMENT_TEXT_BYTES);

    let small = "short body\n";
    let bounded = BoundedDocumentText::from_text(small);
    assert!(!bounded.truncated);
    assert_eq!(bounded.returned_bytes, small.len());
    assert_eq!(bounded.total_bytes, small.len());
}

#[test]
fn list_projection_never_carries_document_bodies() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut store = temp_store(root);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let (mat, _preimage) = materialized_child(
        root,
        "projection-a",
        &changeset_id,
        "alpha\nbeta\n",
        "alpha\nBETA\n",
    );
    let revision = seed_needs_review(&mut store, &changeset_id, &author, {
        let mat = mat.clone();
        move || vec![mat.clone()]
    });
    request_approval(&mut store, &changeset_id, &revision);

    let page = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.projections().list_proposals(root))
        })
        .unwrap()
        .unwrap();

    let serialized = serde_json::to_value(&page).unwrap().to_string();
    // The list row carries the approval IDENTITY fields (Part 1, allowed on the
    // list) but NEVER a document body: no detail shape, no proposed text, and the
    // proposed body content must not leak (bound #1).
    assert!(serialized.contains("approval_id"));
    assert!(!serialized.contains("review_documents"));
    assert!(!serialized.contains("payload_text"));
    assert!(
        !serialized.contains("BETA"),
        "the proposed body must never appear on the list projection"
    );
}
