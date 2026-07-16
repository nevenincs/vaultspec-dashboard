use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::api::{ChangesetOperationKind, TargetRevisionFence};
use crate::authoring::model::{ActorId, ChangesetKind, DocumentRef, SessionId};
use crate::authoring::store::Store;

fn actor(id: &str, kind: ActorKind) -> ActorRef {
    ActorRef {
        id: ActorId::new(id).unwrap(),
        kind,
        delegated_by: None,
    }
}

fn existing_doc() -> DocumentRef {
    DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:approval-plan".to_string(),
        stem: "approval-plan".to_string(),
        path: ".vault/plan/approval-plan.md".to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:base111").unwrap(),
    }
}

fn child() -> ChangesetChildOperationInput {
    let document = existing_doc();
    let base = RevisionToken::new("blob:base111").unwrap();
    ChangesetChildOperationInput {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document,
            base_revision: Some(base.clone()),
            current_revision: Some(base),
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
    author: &ActorRef,
    created_at_ms: i64,
) -> ChangesetAggregateRecord {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id.clone(),
        previous_revision: previous,
        kind: ChangesetKind::Authoring,
        status,
        session_id: Some(SessionId::new("session_1").unwrap()),
        actor: author.clone(),
        summary: "approval proposal".to_string(),
        children: vec![child()],
        created_at_ms,
    })
    .unwrap()
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("agent:other", ActorKind::Agent),
                ("human:author", ActorKind::Human),
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

/// Append Draft then NeedsReview for `changeset_id` under `author`, returning
/// the NeedsReview revision token (the reviewable proposal revision).
fn seed_needs_review(
    store: &mut Store,
    changeset_id: &ChangesetId,
    author: &ActorRef,
) -> RevisionToken {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft = changeset_record(changeset_id, None, ChangesetStatus::Draft, author, 10);
            uow.ledger().append_revision(&draft)?;
            let needs_review = changeset_record(
                changeset_id,
                Some(draft.changeset_revision.clone()),
                ChangesetStatus::NeedsReview,
                author,
                20,
            );
            uow.ledger().append_revision(&needs_review)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap()
}

fn request(
    store: &mut Store,
    proposal_id: &ProposalId,
    changeset_id: &ChangesetId,
    reviewed_revision: &RevisionToken,
) -> ApprovalRequestRecord {
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: "validation:v1".to_string(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap()
        .record
}

fn decide(
    store: &mut Store,
    command: CommandKind,
    proposal_id: &ProposalId,
    decision: ApprovalDecision,
    reviewer: &ActorRef,
    decided_at_ms: i64,
) -> Result<ApprovalOutcome> {
    store
        .with_unit_of_work(command, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id,
                decision,
                reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: "validation:v1",
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms,
            }))
        })
        .unwrap()
}

fn outbox_events(store: &mut Store) -> Vec<crate::authoring::store::outbox::OutboxEvent> {
    store
        .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            uow.outbox().events_after(0, 50)
        })
        .unwrap()
}

// --- the durable review lifecycle published to the outbox (a2a verdict wire) ---

#[test]
fn submit_for_review_publishes_approval_requested_to_the_durable_outbox() {
    let (_dir, mut store) = temp_store();
    let author = actor("agent:author", ActorKind::Agent);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let reviewed = seed_needs_review(&mut store, &changeset_id, &author);
    let _record = request(&mut store, &proposal_id, &changeset_id, &reviewed);

    let events = outbox_events(&mut store);
    let requested = events
        .iter()
        .find(|event| event.event_kind == "approval.requested")
        .expect("submit publishes approval.requested to the outbox");
    assert_eq!(requested.aggregate_kind, "approval");
    assert_eq!(requested.aggregate_id, "approval_1");
    // The schema wrapper + correlation ids the a2a subscriber parks a run against.
    assert_eq!(
        requested.payload["schema"],
        crate::authoring::events::LIFECYCLE_EVENT_SCHEMA
    );
    let data = &requested.payload["data"];
    assert_eq!(data["approval_id"], "approval_1");
    assert_eq!(data["proposal_id"], "proposal_1");
    assert_eq!(data["changeset_id"], "changeset_1");
    assert_eq!(data["reviewed_revision"], reviewed.as_str());
    assert!(
        data.get("decision").is_none(),
        "approval.requested is non-resolving and carries no verdict"
    );
}

#[test]
fn approve_publishes_approval_resolved_with_the_verdict_decision() {
    let (_dir, mut store) = temp_store();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let reviewed = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &reviewed);

    let outcome = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );

    let events = outbox_events(&mut store);
    let resolved = events
        .iter()
        .find(|event| event.event_kind == "approval.resolved")
        .expect("an approve publishes approval.resolved");
    assert_eq!(resolved.aggregate_kind, "approval");
    assert_eq!(resolved.aggregate_id, "approval_1");
    let data = &resolved.payload["data"];
    assert_eq!(data["decision"], "approve");
    assert_eq!(data["proposal_id"], "proposal_1");
    assert_eq!(data["changeset_id"], "changeset_1");
    assert_eq!(data["resulting_status"], "approved");
}

#[test]
fn reject_and_request_changes_publish_their_canonical_transitions_with_verdicts() {
    // A reject publishes proposal.rejected carrying decision=reject.
    let (_dir_r, mut store_r) = temp_store();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let reviewed = seed_needs_review(&mut store_r, &changeset_id, &author);
    request(&mut store_r, &proposal_id, &changeset_id, &reviewed);
    let rejected = decide(
        &mut store_r,
        CommandKind::Reject,
        &proposal_id,
        ApprovalDecision::Reject,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(
        rejected.eligibility.allowed,
        "{:?}",
        rejected.eligibility.reason
    );
    let events = outbox_events(&mut store_r);
    let event = events
        .iter()
        .find(|event| event.event_kind == "proposal.rejected")
        .expect("a reject publishes proposal.rejected");
    assert_eq!(event.payload["data"]["decision"], "reject");
    assert_eq!(event.payload["data"]["resulting_status"], "rejected");

    // A request-changes publishes proposal.updated carrying decision=request_changes,
    // which the a2a decoder maps onto its request_changes verdict from the field.
    let (_dir_e, mut store_e) = temp_store();
    let reviewed_e = seed_needs_review(&mut store_e, &changeset_id, &author);
    request(&mut store_e, &proposal_id, &changeset_id, &reviewed_e);
    let edited = decide(
        &mut store_e,
        CommandKind::EditProposal,
        &proposal_id,
        ApprovalDecision::RequestChanges,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(
        edited.eligibility.allowed,
        "{:?}",
        edited.eligibility.reason
    );
    let events = outbox_events(&mut store_e);
    let event = events
        .iter()
        .find(|event| {
            event.event_kind == "approval.resolved"
                && event.payload["data"]["decision"] == "request_changes"
        })
        .expect("a request-changes publishes approval.resolved with its verdict");
    assert_eq!(event.payload["data"]["decision"], "request_changes");
}

// --- the AGENT-SELF-APPROVAL guardrail (safety-critical), tested both sides ---

#[test]
fn agent_cannot_self_approve_but_human_self_and_distinct_reviewer_can() {
    let author_agent = actor("agent:author", ActorKind::Agent);
    let author_human = actor("human:author", ActorKind::Human);
    let other_agent = actor("agent:other", ActorKind::Agent);

    // Banned: an AGENT approving its OWN proposal.
    assert!(
        automated_self_approval_blocker(CommandKind::Approve, &author_agent, &author_agent)
            .is_some(),
        "agent self-approval must be denied"
    );
    // Permitted: a HUMAN approving their OWN proposal (operation-modes kind=direct).
    assert!(
        automated_self_approval_blocker(CommandKind::Approve, &author_human, &author_human)
            .is_none(),
        "human self-approval of an own proposal is permitted (kind=direct)"
    );
    // Permitted: a DISTINCT agent reviewer (not the author).
    assert!(
        automated_self_approval_blocker(CommandKind::Approve, &other_agent, &author_agent)
            .is_none(),
        "a distinct agent reviewer is permitted"
    );
}

#[test]
fn agent_self_approval_is_denied_end_to_end() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    // The proposing agent tries to approve its own proposal.
    let outcome = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &author,
        40,
    )
    .unwrap();
    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("its own proposal"))
    );
    assert!(outcome.record.decision.is_none(), "no decision is recorded");
}

#[test]
fn human_self_approval_of_own_direct_changeset_is_permitted() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let human = actor("human:author", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &human);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    let outcome = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &human,
        40,
    )
    .unwrap();
    assert!(
        outcome.eligibility.allowed,
        "reason: {:?}",
        outcome.eligibility.reason
    );
    assert_eq!(
        outcome.record.decision.as_ref().unwrap().resulting_status,
        ChangesetStatus::Approved
    );
}

#[test]
fn automated_self_approval_ban_covers_delegated_on_behalf_and_tool_executor() {
    let origin_agent = actor("agent:author", ActorKind::Agent);
    let origin_human = actor("human:author", ActorKind::Human);

    // (b) An automated actor acting ON BEHALF of the origin author (delegated
    // by the proposer) is denied — currently it would pass as a "distinct" id.
    let on_behalf = ActorRef {
        id: ActorId::new("agent:writer").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: Some(ActorId::new("human:author").unwrap()),
    };
    assert!(
        automated_self_approval_blocker(CommandKind::Approve, &on_behalf, &origin_human).is_some(),
        "an automated actor acting on behalf of the origin author is denied"
    );

    // (c) A ToolExecutor carrying the proposer's identity is denied (the ban
    // must cover all FOUR actor kinds' automated writers, not just Agent).
    let tool_self = ActorRef {
        id: ActorId::new("agent:author").unwrap(),
        kind: ActorKind::ToolExecutor,
        delegated_by: None,
    };
    assert!(
        automated_self_approval_blocker(CommandKind::RequestApply, &tool_self, &origin_agent)
            .is_some(),
        "a tool-executor self-approval is denied"
    );

    // A delegate of a DIFFERENT principal is a genuine distinct reviewer.
    let other_delegate = ActorRef {
        id: ActorId::new("agent:writer").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: Some(ActorId::new("human:someone-else").unwrap()),
    };
    assert!(
        automated_self_approval_blocker(CommandKind::Approve, &other_delegate, &origin_human)
            .is_none(),
        "a delegate of a different principal is a distinct reviewer"
    );
}

#[test]
fn self_approval_ban_keys_on_origin_author_not_latest_reviewer() {
    // Agent A proposes+submits (origin=A); human H approves -> latest().actor
    // becomes H. The ban (which P36 apply reuses) MUST still deny A keyed on
    // ORIGIN=A, even though latest().actor is now the reviewer (P23-R1).
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);
    decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        40,
    )
    .unwrap();

    let (origin_actor, latest_actor) = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let origin = uow.ledger().origin(&changeset_id)?.unwrap().actor;
            let latest = uow.ledger().latest(&changeset_id)?.unwrap().actor;
            Ok((origin, latest))
        })
        .unwrap();
    assert_eq!(origin_actor, author, "origin is the proposing agent");
    assert_eq!(
        latest_actor, reviewer,
        "latest is the reviewer after approval"
    );
    // Keyed on ORIGIN → denied (the correct apply-path behavior)...
    assert!(
        automated_self_approval_blocker(CommandKind::RequestApply, &author, &origin_actor)
            .is_some()
    );
    // ...and would WRONGLY pass if keyed on latest().actor — the bug R1 closes.
    assert!(
        automated_self_approval_blocker(CommandKind::RequestApply, &author, &latest_actor)
            .is_none()
    );
}

#[test]
fn re_request_supersedes_the_prior_pending_approval() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    // Re-request under a NEW idempotency key + new approval id.
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_2").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: revision.clone(),
                    validation_digest: "validation:v1".to_string(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:2".to_string(),
                created_at_ms: 35,
            }))
        })
        .unwrap()
        .unwrap();

    // The prior request (approval_1) is retired (stale) and its retention row
    // is Superseded — not an immortal Pending leak.
    let old = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.approvals()
                .record_by_approval(&ApprovalId::new("approval_1").unwrap())
        })
        .unwrap()
        .unwrap();
    assert!(old.stale, "the superseded request is retired");
    let old_retention = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .record(&RetentionRecordRef::new("approval", "approval_1").unwrap())
        })
        .unwrap()
        .unwrap();
    assert_eq!(old_retention.lifecycle_status, LifecycleStatus::Superseded);
}

// --- S113 decision matrix ---

#[test]
fn approved_proposal_reaches_approved_and_records_durable_state() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    let outcome = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(outcome.eligibility.allowed);
    assert_eq!(outcome.record.queue_state, ApprovalQueueState::Closed);
    assert_eq!(
        outcome.record.decision.as_ref().unwrap().decision,
        ApprovalDecision::Approve
    );

    // The durable approval snapshot + the ledger status both reflect approval.
    let (snapshot, status) = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let snapshot = uow.approvals().latest_for_proposal(&proposal_id)?.unwrap();
            let status = uow.ledger().latest(&changeset_id)?.unwrap().status;
            Ok((snapshot, status))
        })
        .unwrap();
    assert_eq!(snapshot.queue_state, ApprovalQueueState::Closed);
    assert_eq!(status, ChangesetStatus::Approved);
}

#[test]
fn pending_approval_is_registered_in_retention() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    // A pending approval MUST be registered in retention so compaction can
    // never silently delete it (S40).
    let retained = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .record(&RetentionRecordRef::new("approval", "approval_1").unwrap())
        })
        .unwrap()
        .expect("pending approval is registered in retention");
    assert_eq!(retained.lifecycle_status, LifecycleStatus::Pending);
}

#[test]
fn rejected_proposal_reaches_rejected() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    let outcome = decide(
        &mut store,
        CommandKind::Reject,
        &proposal_id,
        ApprovalDecision::Reject,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(outcome.eligibility.allowed);
    assert_eq!(
        outcome.record.decision.as_ref().unwrap().resulting_status,
        ChangesetStatus::Rejected
    );

    let status = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.ledger().latest(&changeset_id)?.unwrap().status)
        })
        .unwrap();
    assert_eq!(status, ChangesetStatus::Rejected);
}

#[test]
fn request_changes_returns_the_proposal_to_draft_under_the_reviewer() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    // W13.P24 activates request-changes (the deferred W05.P23 remainder): the reviewer
    // sends the proposal back for revision through the EditProposal arc.
    let outcome = decide(
        &mut store,
        CommandKind::EditProposal,
        &proposal_id,
        ApprovalDecision::RequestChanges,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(
        outcome.eligibility.allowed,
        "request-changes is decidable: {:?}",
        outcome.eligibility
    );
    let decision = outcome.record.decision.expect("a decision is recorded");
    assert_eq!(decision.decision, ApprovalDecision::RequestChanges);
    assert_eq!(decision.reviewer, reviewer);
    assert_eq!(decision.resulting_status, ChangesetStatus::Draft);
    assert_eq!(outcome.record.queue_state, ApprovalQueueState::Closed);

    // The changeset is back to Draft under the REVIEWER's identity (a reviewer edit).
    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().latest(&changeset_id)
        })
        .unwrap()
        .unwrap();
    assert_eq!(latest.status, ChangesetStatus::Draft);
    assert_eq!(latest.actor, reviewer);
}

#[test]
fn stale_revision_invalidates_and_blocks_the_decision() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    // The proposal is edited: a NEW NeedsReview revision supersedes the
    // reviewed one, so the pending approval is stale.
    let new_revision = store
        .with_unit_of_work(CommandKind::EditProposal, |uow| {
            let current = uow.ledger().latest(&changeset_id)?.unwrap();
            let redraft = changeset_record(
                &changeset_id,
                Some(current.changeset_revision.clone()),
                ChangesetStatus::Draft,
                &author,
                50,
            );
            uow.ledger().append_revision(&redraft)?;
            let resubmit = changeset_record(
                &changeset_id,
                Some(redraft.changeset_revision.clone()),
                ChangesetStatus::NeedsReview,
                &author,
                60,
            );
            // A distinct summary would change the digest; force distinctness via
            // created_at_ms which the aggregate digest includes.
            uow.ledger().append_revision(&resubmit)?;
            Ok(resubmit.changeset_revision)
        })
        .unwrap();
    assert_ne!(
        revision, new_revision,
        "the redraft must produce a new revision"
    );

    let invalidated = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.approvals().invalidate_if_stale(
                &proposal_id,
                &new_revision,
                "validation:v1",
                V1_POLICY_VERSION,
                70,
            ))
        })
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(invalidated.stale, "pending approval is marked stale");

    // The decision is now blocked as stale for the current proposal revision.
    let outcome = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        80,
    )
    .unwrap();
    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("proposal revision"))
    );
}

#[test]
fn replayed_decision_is_idempotent() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    let first = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        40,
    )
    .unwrap();
    assert!(!first.replayed);

    let replay = decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        41,
    )
    .unwrap();
    assert!(replay.replayed, "a repeated identical decision replays");
    assert_eq!(
        replay.record.decision.as_ref().unwrap().decided_at_ms,
        40,
        "the recorded outcome is unchanged"
    );
}

#[test]
fn conflicting_reviewer_action_is_refused() {
    let (_dir, mut store) = temp_store();
    let changeset_id = ChangesetId::new("changeset_1").unwrap();
    let proposal_id = ProposalId::new("proposal_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let other = actor("agent:other", ActorKind::Agent);
    let revision = seed_needs_review(&mut store, &changeset_id, &author);
    request(&mut store, &proposal_id, &changeset_id, &revision);

    decide(
        &mut store,
        CommandKind::Approve,
        &proposal_id,
        ApprovalDecision::Approve,
        &reviewer,
        40,
    )
    .unwrap();

    // A different reviewer trying to reject an already-approved proposal.
    let err = decide(
        &mut store,
        CommandKind::Reject,
        &proposal_id,
        ApprovalDecision::Reject,
        &other,
        50,
    )
    .unwrap_err();
    assert!(matches!(err, ApprovalError::NotPermitted(_)));
}
