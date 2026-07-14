use std::path::Path;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput, ActorStatus};
use crate::authoring::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, CreateProposalRequest,
    CreateSessionRequest, DraftMode, DraftMutation, TargetRevisionFence,
};
use crate::authoring::approvals::{ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple};
use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
use crate::authoring::model::{ActorId, ActorKind, ApprovalId, DocumentRef, ProposalId, SessionId};
use crate::authoring::proposal::{
    ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, create_proposal,
    validate_proposal,
};
use crate::authoring::snapshots::SnapshotReader;
use crate::authoring::store::Store;
use crate::authoring::transitions::ValidationFreshness;
use crate::authoring::validation::{ChunkEvidenceStatus, ChunkValidationEvidence};

fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    register_actor(&mut store, author());
    register_actor(&mut store, reviewer());
    register_actor(&mut store, second_reviewer());
    create_session(&mut store);
    (dir, store)
}

fn register_actor(store: &mut Store, actor: ActorRef) {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().put_record(ActorRecordInput {
                actor: actor.clone(),
                display: ActorDisplayMetadata::new("Review station test actor", None),
                status: ActorStatus::Active,
                created_at_ms: 1,
                updated_at_ms: 1,
            })?;
            Ok(())
        })
        .unwrap();
}

fn create_session(store: &mut Store) {
    store
        .with_unit_of_work(CommandKind::CreateSession, |uow| {
            uow.sessions().create_session(
                session_id(),
                CreateSessionRequest {
                    scope: "review-tests".to_string(),
                    title: "Review station test session".to_string(),
                },
                author(),
                1,
            )?;
            Ok(())
        })
        .unwrap();
}

fn author() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:review-author").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

fn reviewer() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:reviewer").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn second_reviewer() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:second-reviewer").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn changeset_id(value: &str) -> ChangesetId {
    ChangesetId::new(value).unwrap()
}

fn valid_body(label: &str) -> String {
    format!("---\ntags:\n  - '#plan'\n---\n\n# Plan\n\n{label}\n")
}

fn resolved_doc(root: &Path, stem: &str) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
        .unwrap()
}

fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("existing document expected");
    };
    base_revision.clone()
}

fn context(actor: ActorRef, key: &str, now_ms: i64) -> ProposalCommandContext {
    ProposalCommandContext {
        actor,
        idempotency_key: crate::authoring::model::IdempotencyKey::new(key).unwrap(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + 60_000),
        outcome_expires_at_ms: None,
    }
}

fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
    match result {
        ProposalCommandResult::Accepted { outcome, .. } => outcome,
        other => panic!("expected accepted, got {other:?}"),
    }
}

/// Create + validate a proposal against `stem`, leaving it materialized and validated
/// (ready to submit for review). Returns the changeset id and the validation digest.
fn create_and_validate(
    store: &mut Store,
    root: &Path,
    id: &ChangesetId,
    stem: &str,
    body: &str,
    base_now: i64,
) -> String {
    let reader = SnapshotReader::for_worktree(root);
    let document = resolved_doc(root, stem);
    let revision = base_revision(&document);
    accepted(
        create_proposal(
            store,
            &reader,
            context(author(), &format!("idem:create:{}", id.as_str()), base_now),
            CreateProposalRequest {
                session_id: session_id(),
                changeset_id: id.clone(),
                summary: "review this proposal".to_string(),
                operations: vec![ChangesetChildOperationDraft {
                    child_key: "child_1".to_string(),
                    operation: ChangesetOperationKind::ReplaceBody,
                    target: TargetRevisionFence {
                        document: document.clone(),
                        base_revision: Some(revision.clone()),
                        current_revision: Some(revision.clone()),
                    },
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: body.to_string(),
                        frontmatter: None,
                        new_stem: None,
                        section_selector: None,
                        plan_step: None,
                    },
                }],
            },
        )
        .unwrap(),
    );
    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(id))
        .unwrap()
        .unwrap();
    let operation = latest.children[0]
        .materialized_operation
        .as_ref()
        .unwrap()
        .clone();
    let current = crate::authoring::validation::CurrentRevisionObservation::from_snapshot(
        "child_1",
        &reader
            .require_current_base(&operation.target_snapshot.document)
            .unwrap(),
    );
    let chunk = ChunkValidationEvidence {
        child_key: "child_1".to_string(),
        evidence_id: "chunk:child_1".to_string(),
        document: operation.target_snapshot.document.clone(),
        base_revision: operation.target_snapshot.base_revision.clone(),
        chunker_version: "whole_document_v1".to_string(),
        range: "bytes:0..all".to_string(),
        content_hash: operation.review_diff.base_blob_hash.clone(),
        observed_revision: Some(operation.target_snapshot.base_revision.clone()),
        observed_content_hash: Some(operation.review_diff.base_blob_hash.clone()),
        status: ChunkEvidenceStatus::Current,
    };
    let validated = accepted(
        validate_proposal(
            store,
            context(
                author(),
                &format!("idem:validate:{}", id.as_str()),
                base_now + 1,
            ),
            crate::authoring::proposal::ValidateProposalRequest {
                changeset_id: id.clone(),
                expected_revision: latest.changeset_revision,
                summary: "validate".to_string(),
                current_revisions: vec![current],
                chunk_evidence: vec![chunk],
            },
        )
        .unwrap(),
    );
    validated.validation_digest.unwrap()
}

/// Drive a validated proposal into `NeedsReview` and open its approval request, so the
/// review station sees a real queued item.
fn submit_and_open_approval(
    store: &mut Store,
    id: &ChangesetId,
    validation_digest: &str,
    now_ms: i64,
) {
    // The submit transition (Proposed -> NeedsReview) under the reviewer path.
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            let latest = uow.ledger().latest(id)?.unwrap();
            let next =
                crate::authoring::ledger::ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: id.clone(),
                    previous_revision: Some(latest.changeset_revision.clone()),
                    kind: latest.kind,
                    status: ChangesetStatus::NeedsReview,
                    session_id: latest.session_id.clone(),
                    actor: author(),
                    summary: latest.summary.clone(),
                    children: latest
                        .children
                        .iter()
                        .map(|child| ChangesetChildOperationInput {
                            child_key: child.child_key.clone(),
                            operation: child.operation,
                            target: child.target.clone(),
                            materialized_operation: child.materialized_operation.clone(),
                            material_digest: child.material_digest.clone(),
                            validation_digest: child.validation_digest.clone(),
                        })
                        .collect(),
                    created_at_ms: now_ms,
                })
                .map_err(|err| StoreError::Ledger(err.to_string()))?;
            uow.ledger().append_revision(&next)?;
            let proposal_id = ProposalId::new(format!("proposal:{}", id.as_str())).unwrap();
            uow.approvals()
                .request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new(format!("approval:{}", id.as_str())).unwrap(),
                    proposal_id,
                    changeset_id: id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: next.changeset_revision.clone(),
                        validation_digest: validation_digest.to_string(),
                        policy_version: crate::authoring::approvals::V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: format!("idem:approval:{}", id.as_str()),
                    created_at_ms: now_ms,
                })
                .map_err(|err| StoreError::Approval(err.to_string()))?;
            Ok(())
        })
        .unwrap();
}

fn needs_review_item(store: &mut Store, root: &Path, id: &ChangesetId, stem: &str, now: i64) {
    write_doc(root, &format!(".vault/plan/{stem}.md"), &valid_body("base"));
    let digest = create_and_validate(store, root, id, stem, &valid_body("edited"), now);
    submit_and_open_approval(store, id, &digest, now + 10);
}

fn claim(store: &mut Store, id: &ChangesetId, reviewer: ActorRef, now: i64) -> ReviewClaimOutcome {
    store
        .with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station().claim(ClaimReviewInput {
                changeset_id: id.clone(),
                purpose: ReviewClaimPurpose::Review,
                reviewer,
                idempotency_key: format!("idem:claim:{}", id.as_str()),
                now_ms: now,
                ttl_ms: None,
            })
        })
        .unwrap()
}

fn queue(store: &mut Store, root: &Path, now: i64) -> ReviewQueueProjection {
    store
        .with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station().review_queue(root, now)
        })
        .unwrap()
}

fn item_for<'a>(queue: &'a ReviewQueueProjection, id: &ChangesetId) -> &'a ReviewQueueItem {
    queue
        .items
        .iter()
        .find(|item| &item.proposal.changeset_id == id)
        .expect("queue item present")
}

#[test]
fn pending_queue_lists_only_needs_review_items_as_queued() {
    let (dir, mut store) = temp_store();
    let root = dir.path();

    // Two needs-review items, plus a draft that must NOT appear in the review queue.
    let a = changeset_id("changeset_pending_a");
    let b = changeset_id("changeset_pending_b");
    needs_review_item(&mut store, root, &a, "pending-a", 100);
    needs_review_item(&mut store, root, &b, "pending-b", 200);

    let draft = changeset_id("changeset_pending_draft");
    write_doc(root, ".vault/plan/pending-draft.md", &valid_body("base"));
    create_and_validate(
        &mut store,
        root,
        &draft,
        "pending-draft",
        &valid_body("x"),
        300,
    );

    let queue = queue(&mut store, root, 1_000);
    assert_eq!(queue.items.len(), 2, "only needs-review items are queued");
    assert!(!queue.truncated);
    assert!(
        queue
            .items
            .iter()
            .all(|item| item.proposal.status == ChangesetStatus::NeedsReview),
        "every queue item is needs-review"
    );
    // With no claims, every item is `queued` and carries no claim overlay.
    for item in &queue.items {
        assert_eq!(item.station_state, ReviewStationItemState::Queued);
        assert!(item.claim.is_none());
    }
    assert!(
        !queue
            .items
            .iter()
            .any(|item| item.proposal.changeset_id == draft),
        "a draft never enters the review queue"
    );
}

#[test]
fn claiming_an_item_composes_the_claimed_state_and_overlay() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_claim");
    needs_review_item(&mut store, root, &id, "claim-plan", 100);

    let outcome = claim(&mut store, &id, reviewer(), 1_000);
    assert!(outcome.eligibility.allowed, "{:?}", outcome.eligibility);
    assert!(!outcome.replayed);

    let queue = queue(&mut store, root, 1_010);
    let item = item_for(&queue, &id);
    assert_eq!(item.station_state, ReviewStationItemState::Claimed);
    let overlay = item.claim.as_ref().expect("claim overlay served");
    assert_eq!(overlay.reviewer, reviewer());
    assert_eq!(overlay.purpose, ReviewClaimPurpose::Review);
    assert!(overlay.expires_at_ms > 1_000);

    // A different reviewer cannot claim a held item — the denial is a value, and the
    // held claim is unchanged (advisory coordination, not authority theft).
    let contended = claim(&mut store, &id, second_reviewer(), 1_020);
    assert!(!contended.eligibility.allowed);
    assert!(
        contended
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("different reviewer")),
        "{:?}",
        contended.eligibility
    );
    assert_eq!(
        contended.record.unwrap().reviewer,
        reviewer(),
        "the original holder still holds the item"
    );

    // The claim NEVER changes the proposal's approval truth (claim is advisory).
    assert_eq!(
        item.proposal.approval.queue_state,
        Some(ApprovalQueueState::Queued)
    );
}

#[test]
fn releasing_an_item_returns_it_to_the_queued_state() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_release");
    needs_review_item(&mut store, root, &id, "release-plan", 100);
    claim(&mut store, &id, reviewer(), 1_000);

    // A non-holder cannot release (denied value, item still held).
    let non_holder = store
        .with_unit_of_work(CommandKind::ReleaseReview, |uow| {
            uow.review_station().release(&id, &second_reviewer(), 1_005)
        })
        .unwrap();
    assert!(!non_holder.eligibility.allowed);
    assert!(
        non_holder
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("only the reviewer holding")),
        "{:?}",
        non_holder.eligibility
    );
    assert_eq!(
        queue(&mut store, root, 1_006)
            .items
            .iter()
            .find(|item| item.proposal.changeset_id == id)
            .unwrap()
            .station_state,
        ReviewStationItemState::Claimed
    );

    // The holder releases → the item returns to `queued` with no claim overlay.
    let released = store
        .with_unit_of_work(CommandKind::ReleaseReview, |uow| {
            uow.review_station().release(&id, &reviewer(), 1_010)
        })
        .unwrap();
    assert!(released.eligibility.allowed);
    assert_eq!(released.record.unwrap().state, ReviewClaimState::Released);

    let item = item_for(&queue(&mut store, root, 1_020), &id).clone();
    assert_eq!(item.station_state, ReviewStationItemState::Queued);
    assert!(item.claim.is_none());
}

#[test]
fn clarification_records_the_exchange_and_keeps_the_item_claimed() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_clarify");
    needs_review_item(&mut store, root, &id, "clarify-plan", 100);
    claim(&mut store, &id, reviewer(), 1_000);

    // Respond requires the holder; a non-holder is denied.
    let non_holder = store
        .with_unit_of_work(CommandKind::Respond, |uow| {
            uow.review_station().respond(
                &id,
                &second_reviewer(),
                "please clarify the intent".to_string(),
                1_005,
            )
        })
        .unwrap();
    assert!(!non_holder.eligibility.allowed);

    let responded = store
        .with_unit_of_work(CommandKind::Respond, |uow| {
            uow.review_station().respond(
                &id,
                &reviewer(),
                "please cite the source revision".to_string(),
                1_010,
            )
        })
        .unwrap();
    assert!(responded.eligibility.allowed, "{:?}", responded.eligibility);

    // The item stays claimed; the clarification is a served FIELD, and the changeset
    // status is unchanged (status-preserving respond arc).
    let item = item_for(&queue(&mut store, root, 1_020), &id).clone();
    assert_eq!(item.station_state, ReviewStationItemState::Claimed);
    let clarification = item
        .claim
        .as_ref()
        .unwrap()
        .latest_clarification
        .as_ref()
        .expect("clarification served");
    assert_eq!(clarification.reviewer, reviewer());
    assert_eq!(clarification.comment, "please cite the source revision");
    assert_eq!(item.proposal.status, ChangesetStatus::NeedsReview);
}

#[test]
fn reviewer_edit_request_changes_returns_the_proposal_to_draft() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_reviewer_edit");
    let digest = {
        write_doc(root, ".vault/plan/edit-plan.md", &valid_body("base"));
        let d = create_and_validate(&mut store, root, &id, "edit-plan", &valid_body("v1"), 100);
        submit_and_open_approval(&mut store, &id, &d, 110);
        d
    };
    claim(&mut store, &id, reviewer(), 1_000);

    // The reviewer requests changes: the now-activated decision drives the EditProposal
    // arc (NeedsReview -> Draft) under the reviewer's identity, a reviewer edit.
    let proposal_id = ProposalId::new(format!("proposal:{}", id.as_str())).unwrap();
    let outcome = store
        .with_unit_of_work(CommandKind::EditProposal, |uow| {
            uow.approvals()
                .submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::RequestChanges,
                    reviewer: &reviewer(),
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &digest,
                    current_policy_version: crate::authoring::approvals::V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: Some("tighten the second paragraph".to_string()),
                    decided_at_ms: 1_100,
                })
                .map_err(|err| StoreError::Approval(err.to_string()))
        })
        .unwrap();
    assert!(
        outcome.eligibility.allowed,
        "request-changes is activated: {:?}",
        outcome.eligibility
    );

    // The changeset is back to Draft, under the REVIEWER's identity, and it leaves the
    // needs-review queue.
    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(&id))
        .unwrap()
        .unwrap();
    assert_eq!(latest.status, ChangesetStatus::Draft);
    assert_eq!(latest.actor, reviewer(), "the reviewer authored the edit");
    assert_eq!(
        outcome.record.decision.unwrap().decision,
        ApprovalDecision::RequestChanges
    );
    assert!(
        !queue(&mut store, root, 1_200)
            .items
            .iter()
            .any(|item| item.proposal.changeset_id == id),
        "a request-changes item leaves the review queue"
    );
}

#[test]
fn provenance_trail_is_redacted_of_raw_preimage_bodies() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_provenance_redaction");
    // A distinctive base body whose text must NEVER appear in the served trail.
    let secret_body = valid_body("TOP-SECRET-PREIMAGE-BODY-marker");
    write_doc(root, ".vault/plan/redact-plan.md", &secret_body);
    let digest = create_and_validate(
        &mut store,
        root,
        &id,
        "redact-plan",
        &valid_body("edited"),
        100,
    );
    submit_and_open_approval(&mut store, &id, &digest, 110);

    let trail = store
        .with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station()
                .changeset_provenance(&id, MAX_PROVENANCE_ENTRIES)
        })
        .unwrap()
        .expect("trail exists");

    // The trail carries the preimage FINGERPRINT (id + content hash), never the body.
    let material = trail
        .entries
        .iter()
        .flat_map(|entry| entry.materials.iter())
        .find(|material| material.kind == "preimage")
        .expect("a preimage fingerprint is surfaced");
    assert!(!material.id.is_empty());
    assert!(!material.content_hash.is_empty());
    assert!(material.byte_len > 0);

    // The load-bearing assertion: the raw preimage body text is absent from the entire
    // serialized provenance projection.
    let serialized = serde_json::to_string(&trail).unwrap();
    assert!(
        !serialized.contains("TOP-SECRET-PREIMAGE-BODY-marker"),
        "raw preimage body must be redacted from the provenance trail"
    );
    // Who-did-what is served: the proposing actor authored the first entry.
    assert!(trail.entries.iter().any(|entry| entry.actor == author()));
}

#[test]
fn provenance_lineage_parses_p28_tokens_fail_safe() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    write_doc(root, ".vault/plan/lineage-plan.md", &valid_body("base"));

    // A replacement changeset whose Draft summary carries the P28 "Replaces {id}" token,
    // exactly as create_replacement_proposal writes it.
    let source = changeset_id("changeset_lineage_source");
    let replacement = changeset_id("changeset_lineage_replacement");
    let reader = SnapshotReader::for_worktree(root);
    let document = resolved_doc(root, "lineage-plan");
    let revision = base_revision(&document);
    accepted(
        create_proposal(
            &mut store,
            &reader,
            context(author(), "idem:create:lineage", 100),
            CreateProposalRequest {
                session_id: session_id(),
                changeset_id: replacement.clone(),
                summary: format!(
                    "Replaces {}: regenerate against current base",
                    source.as_str()
                ),
                operations: vec![ChangesetChildOperationDraft {
                    child_key: "child_1".to_string(),
                    operation: ChangesetOperationKind::ReplaceBody,
                    target: TargetRevisionFence {
                        document,
                        base_revision: Some(revision.clone()),
                        current_revision: Some(revision),
                    },
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: valid_body("edited"),
                        frontmatter: None,
                        new_stem: None,
                        section_selector: None,
                        plan_step: None,
                    },
                }],
            },
        )
        .unwrap(),
    );

    let trail = store
        .with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station()
                .changeset_provenance(&replacement, MAX_PROVENANCE_ENTRIES)
        })
        .unwrap()
        .unwrap();
    assert_eq!(
        trail.lineage.replaces.as_ref().map(|id| id.as_str()),
        Some(source.as_str()),
        "the structured `replaces` linkage is parsed from the P28 summary token"
    );
    assert!(trail.lineage.superseded_by.is_none());

    // Fail-safe: a summary that does not match yields no linkage, never a crash/wrong id.
    // No prefix, an invalid id token, and an empty rest all yield None.
    assert!(parse_lineage_token("just a normal summary", "Replaces ").is_none());
    assert!(parse_lineage_token("Replaces bad!id: x", "Replaces ").is_none());
    assert!(parse_lineage_token("Replaces ", "Replaces ").is_none());

    // COLLISION-ROBUST: a plain-English author summary that opens with the prefix word
    // but carries NO colon-terminated id must NOT fabricate a false provenance link,
    // even when the coincidental first word is a syntactically valid changeset id.
    assert!(
        parse_lineage_token("Replaces the old plan against current base", "Replaces ").is_none(),
        "an innocent summary must not mint a false `replaces` link"
    );
    assert!(
        parse_lineage_token("Superseded by newer guidance", "Superseded by ").is_none(),
        "an innocent summary must not mint a false `superseded_by` link"
    );
    // The colon is REQUIRED and sufficient: a P28-shaped colon-terminated token parses.
    assert_eq!(
        parse_lineage_token("Replaces changeset_x: refresh the intro", "Replaces ")
            .map(|id| id.as_str().to_string()),
        Some("changeset_x".to_string())
    );
}

#[test]
fn provenance_query_results_are_bounded_and_truncated() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let id = changeset_id("changeset_bounded");
    write_doc(root, ".vault/plan/bounded-plan.md", &valid_body("base"));
    create_and_validate(
        &mut store,
        root,
        &id,
        "bounded-plan",
        &valid_body("v1"),
        100,
    );

    // Append many Draft revisions so the history exceeds a small query cap. Draft ->
    // Draft is a declared arc, so the real ledger accepts each append.
    let base = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(&id))
        .unwrap()
        .unwrap();
    let mut previous = base;
    for n in 0..6 {
        let next =
            crate::authoring::ledger::ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: id.clone(),
                previous_revision: Some(previous.changeset_revision.clone()),
                kind: previous.kind,
                status: ChangesetStatus::Draft,
                session_id: previous.session_id.clone(),
                actor: author(),
                summary: format!("draft revision {n}"),
                children: previous
                    .children
                    .iter()
                    .map(|child| ChangesetChildOperationInput {
                        child_key: child.child_key.clone(),
                        operation: child.operation,
                        target: child.target.clone(),
                        materialized_operation: child.materialized_operation.clone(),
                        material_digest: child.material_digest.clone(),
                        validation_digest: child.validation_digest.clone(),
                    })
                    .collect(),
                created_at_ms: 200 + n,
            })
            .unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().append_revision(&next)
            })
            .unwrap();
        previous = next;
    }

    let cap = 3;
    let trail = store
        .with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station().changeset_provenance(&id, cap)
        })
        .unwrap()
        .unwrap();
    assert_eq!(trail.entries.len(), cap, "the entry page honors the cap");
    assert_eq!(trail.cap, cap);
    assert!(trail.truncated, "more revisions than the cap → truncated");
    // Newest-first: the capped page starts at the most recent revision.
    assert_eq!(trail.entries[0].summary, "draft revision 5");
}
