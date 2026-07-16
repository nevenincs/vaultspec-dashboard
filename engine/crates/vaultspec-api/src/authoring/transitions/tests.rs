use super::*;
use crate::authoring::api::{ChangesetOperationKind, TargetRevisionFence};
use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
use crate::authoring::model::{
    ActorId, ActorKind, ActorRef, ChangesetId, DocumentRef, ProvisionalCollisionStatus,
    RevisionToken, SessionId,
};

fn changeset_id(value: &str) -> ChangesetId {
    ChangesetId::new(value).unwrap()
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:transition-tests").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

fn revision(value: &str) -> RevisionToken {
    RevisionToken::new(value).unwrap()
}

fn existing_doc(stem: &str, base_revision: &str) -> DocumentRef {
    DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{stem}"),
        stem: stem.to_string(),
        path: format!(".vault/plan/{stem}.md"),
        doc_type: "plan".to_string(),
        base_revision: revision(base_revision),
    }
}

fn provisional_doc() -> DocumentRef {
    DocumentRef::ProvisionalCreate {
        provisional_doc_id: "provisional_1".to_string(),
        doc_type: "plan".to_string(),
        feature: super::super::FEATURE_TAG.to_string(),
        title: "Create plan".to_string(),
        collision_status: ProvisionalCollisionStatus::Available,
        proposed_stem: Some("transition-new".to_string()),
        related: Vec::new(),
    }
}

fn fence(document: DocumentRef) -> TargetRevisionFence {
    let base_revision = match &document {
        DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
        _ => None,
    };
    TargetRevisionFence {
        document,
        base_revision: base_revision.clone(),
        current_revision: base_revision,
    }
}

fn child(key: &str, document: DocumentRef) -> ChangesetChildOperationInput {
    ChangesetChildOperationInput {
        child_key: key.to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: fence(document),
        materialized_operation: None,
        material_digest: None,
        validation_digest: None,
    }
}

fn record(
    kind: ChangesetKind,
    status: ChangesetStatus,
    children: Vec<ChangesetChildOperationInput>,
) -> ChangesetAggregateRecord {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id(match kind {
            ChangesetKind::Authoring | ChangesetKind::Direct => "changeset_1",
            ChangesetKind::Rollback => "rollback_changeset_1",
        }),
        previous_revision: None,
        kind,
        status,
        session_id: Some(session_id()),
        actor: actor(),
        summary: "transition proposal".to_string(),
        children,
        created_at_ms: 100,
    })
    .unwrap()
}

fn authoring_record(status: ChangesetStatus) -> ChangesetAggregateRecord {
    record(
        ChangesetKind::Authoring,
        status,
        vec![child(
            "child_1",
            existing_doc("transition-a", "blob:aaa111"),
        )],
    )
}

fn allowed(eligibility: ActionEligibility) {
    assert!(
        eligibility.allowed,
        "expected allowed, got {:?}",
        eligibility.reason
    );
}

fn denied_contains(eligibility: ActionEligibility, expected: &str) {
    assert!(!eligibility.allowed, "expected denied");
    let reason = eligibility.reason.expect("denial has reason");
    assert!(
        reason.contains(expected),
        "expected `{expected}` in `{reason}`"
    );
}

#[test]
fn legal_transitions_allow_review_and_apply_path_but_reject_skips() {
    let proposal = authoring_record(ChangesetStatus::Draft);
    allowed(submit_for_review_transition_eligibility(
        &proposal,
        ValidationFreshness::fresh(),
    ));

    let reviewable = authoring_record(ChangesetStatus::NeedsReview);
    allowed(approve_transition_eligibility(
        &reviewable,
        ReviewDecisionFreshness::fresh(),
        ValidationFreshness::fresh(),
    ));

    let approved = authoring_record(ChangesetStatus::Approved);
    allowed(apply_transition_eligibility(
        &approved,
        ApprovalFreshness::fresh(),
        ValidationFreshness::fresh(),
    ));
    let applying = authoring_record(ChangesetStatus::Applying);
    allowed(apply_completion_transition_eligibility(
        &applying,
        ChangesetStatus::Applied,
    ));
    allowed(apply_completion_transition_eligibility(
        &applying,
        ChangesetStatus::Failed,
    ));
    allowed(apply_completion_transition_eligibility(
        &applying,
        ChangesetStatus::Conflicted,
    ));

    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::Approve,
            ChangesetKind::Authoring,
            ChangesetStatus::Draft,
            ChangesetStatus::Approved,
        )),
        "cannot transition",
    );
    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::RequestApply,
            ChangesetKind::Authoring,
            ChangesetStatus::NeedsReview,
            ChangesetStatus::Applied,
        )),
        "cannot transition",
    );
}

#[test]
fn terminal_statuses_refuse_lifecycle_mutations() {
    for status in [
        ChangesetStatus::Applied,
        ChangesetStatus::Rejected,
        ChangesetStatus::Superseded,
        ChangesetStatus::Failed,
        ChangesetStatus::Cancelled,
    ] {
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::CancelProposal,
                ChangesetKind::Authoring,
                status,
                ChangesetStatus::Cancelled,
            )),
            "terminal",
        );
    }
}

#[test]
fn submit_for_review_requires_reviewable_status_and_fresh_validation() {
    let proposed = authoring_record(ChangesetStatus::Proposed);
    allowed(submit_for_review_transition_eligibility(
        &proposed,
        ValidationFreshness::fresh(),
    ));

    denied_contains(
        submit_for_review_transition_eligibility(&proposed, ValidationFreshness::missing()),
        "validation record",
    );
    denied_contains(
        submit_for_review_transition_eligibility(&proposed, ValidationFreshness::invalid()),
        "approval-ready",
    );
    denied_contains(
        submit_for_review_transition_eligibility(&proposed, ValidationFreshness::stale_digest()),
        "digest",
    );

    let approved = authoring_record(ChangesetStatus::Approved);
    denied_contains(
        submit_for_review_transition_eligibility(&approved, ValidationFreshness::fresh()),
        "cannot transition",
    );
}

#[test]
fn approve_and_reject_are_only_review_state_decisions() {
    let reviewable = authoring_record(ChangesetStatus::NeedsReview);
    allowed(reject_transition_eligibility(
        &reviewable,
        ReviewDecisionFreshness::fresh(),
        ValidationFreshness::fresh(),
    ));
    denied_contains(
        reject_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::stale_validation(),
            ValidationFreshness::fresh(),
        ),
        "validation digest",
    );
    denied_contains(
        reject_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::cancelled_run(),
            ValidationFreshness::fresh(),
        ),
        "run was cancelled",
    );

    denied_contains(
        approve_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::missing(),
            ValidationFreshness::fresh(),
        ),
        "review request",
    );
    denied_contains(
        approve_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::stale_targets(),
            ValidationFreshness::fresh(),
        ),
        "target revisions",
    );
    denied_contains(
        approve_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::stale_policy(),
            ValidationFreshness::fresh(),
        ),
        "policy version",
    );
    denied_contains(
        approve_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::fresh(),
            ValidationFreshness::stale_digest(),
        ),
        "validation digest",
    );
    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::Approve,
            ChangesetKind::Authoring,
            ChangesetStatus::Rejected,
            ChangesetStatus::Approved,
        )),
        "terminal",
    );

    let rejected = authoring_record(ChangesetStatus::Rejected);
    denied_contains(
        apply_transition_eligibility(
            &rejected,
            ApprovalFreshness::fresh(),
            ValidationFreshness::fresh(),
        ),
        "terminal",
    );
}

#[test]
fn request_apply_requires_single_child_and_fresh_approval_tuple() {
    let approved = authoring_record(ChangesetStatus::Approved);
    allowed(apply_transition_eligibility(
        &approved,
        ApprovalFreshness::fresh(),
        ValidationFreshness::fresh(),
    ));

    let multi_child = record(
        ChangesetKind::Authoring,
        ChangesetStatus::Approved,
        vec![
            child("child_1", existing_doc("transition-a", "blob:aaa111")),
            child("child_2", provisional_doc()),
        ],
    );
    denied_contains(
        apply_transition_eligibility(
            &multi_child,
            ApprovalFreshness::fresh(),
            ValidationFreshness::fresh(),
        ),
        "exactly one child",
    );
    denied_contains(
        apply_transition_eligibility(
            &approved,
            ApprovalFreshness::stale_revision(),
            ValidationFreshness::fresh(),
        ),
        "proposal revision",
    );
    denied_contains(
        apply_transition_eligibility(
            &approved,
            ApprovalFreshness::stale_targets(),
            ValidationFreshness::fresh(),
        ),
        "target revisions",
    );
    denied_contains(
        apply_transition_eligibility(
            &approved,
            ApprovalFreshness::stale_validation(),
            ValidationFreshness::fresh(),
        ),
        "validation digest",
    );
    denied_contains(
        apply_transition_eligibility(
            &approved,
            ApprovalFreshness::stale_policy(),
            ValidationFreshness::fresh(),
        ),
        "policy version",
    );
}

#[test]
fn draft_mutation_commands_do_not_bypass_review_and_rebase_arcs() {
    allowed(transition_eligibility(TransitionRequest::new(
        CommandKind::ReplaceDraft,
        ChangesetKind::Authoring,
        ChangesetStatus::Proposed,
        ChangesetStatus::Draft,
    )));
    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::ReplaceDraft,
            ChangesetKind::Authoring,
            ChangesetStatus::NeedsReview,
            ChangesetStatus::Draft,
        )),
        "cannot transition",
    );
    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::AppendDraft,
            ChangesetKind::Authoring,
            ChangesetStatus::Approved,
            ChangesetStatus::Draft,
        )),
        "cannot transition",
    );
    allowed(transition_eligibility(TransitionRequest::new(
        CommandKind::EditProposal,
        ChangesetKind::Authoring,
        ChangesetStatus::NeedsReview,
        ChangesetStatus::Draft,
    )));
    allowed(transition_eligibility(TransitionRequest::new(
        CommandKind::Rebase,
        ChangesetKind::Authoring,
        ChangesetStatus::Conflicted,
        ChangesetStatus::Draft,
    )));
}

#[test]
fn cancelled_run_invalidates_approval_and_blocks_apply() {
    let approved = authoring_record(ChangesetStatus::Approved);

    denied_contains(
        apply_transition_eligibility(
            &approved,
            ApprovalFreshness::cancelled_run(),
            ValidationFreshness::fresh(),
        ),
        "run was cancelled",
    );
}

#[test]
fn staged_multi_document_statuses_are_reserved_and_unreachable() {
    denied_contains(
        transition_eligibility(
            TransitionRequest::new(
                CommandKind::RequestApply,
                ChangesetKind::Authoring,
                ChangesetStatus::Approved,
                ChangesetStatus::PartiallyApplied,
            )
            .with_approval(ApprovalFreshness::fresh())
            .with_validation(ValidationFreshness::fresh()),
        ),
        "reserved",
    );
    denied_contains(
        transition_eligibility(TransitionRequest::new(
            CommandKind::Supersede,
            ChangesetKind::Authoring,
            ChangesetStatus::CompensationRequired,
            ChangesetStatus::Superseded,
        )),
        "reserved",
    );
}

#[test]
fn plan_step_tick_source_is_rollback_eligible_by_the_opposite_state_inverse() {
    // W04.P09.S33: a SetPlanStepState source is now INVERTIBLE — the inverse
    // is the OPPOSITE set-plan-step-state against the same step (built in
    // `rollback.rs`), never the whole-document preimage restore that would
    // clobber concurrent step edits. This guard locks the new invariant:
    // the gate must ADMIT a plan-tick source (so `rollback.rs` generates the
    // state-flip inverse), and it fails loudly if a future edit drops
    // SetPlanStepState back out of the invertible set.
    let source = record(
        ChangesetKind::Authoring,
        ChangesetStatus::Applied,
        vec![ChangesetChildOperationInput {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::SetPlanStepState,
            target: fence(existing_doc("tick-plan", "blob:aaa111")),
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }],
    );
    allowed(create_rollback_eligibility(
        &source,
        &[RollbackChildEligibility::new(
            "child_1",
            ChangesetOperationKind::SetPlanStepState,
            true,
        )],
    ));
}

#[test]
fn rollback_is_a_new_changeset_and_source_status_is_not_rewritten() {
    let source = authoring_record(ChangesetStatus::Applied);
    let preimage_child =
        RollbackChildEligibility::new("child_1", ChangesetOperationKind::ReplaceBody, true);
    allowed(create_rollback_eligibility(
        &source,
        std::slice::from_ref(&preimage_child),
    ));
    assert_eq!(
        source.status,
        ChangesetStatus::Applied,
        "rollback eligibility does not mutate the source changeset"
    );

    allowed(initial_changeset_status_eligibility(
        ChangesetKind::Rollback,
        ChangesetStatus::RollbackProposed,
    ));
    denied_contains(
        initial_changeset_status_eligibility(
            ChangesetKind::Authoring,
            ChangesetStatus::RollbackProposed,
        ),
        "not a valid initial",
    );

    let rejected = authoring_record(ChangesetStatus::Rejected);
    denied_contains(
        create_rollback_eligibility(&rejected, std::slice::from_ref(&preimage_child)),
        "not applied",
    );
    let multi_source = record(
        ChangesetKind::Authoring,
        ChangesetStatus::Applied,
        vec![
            child("child_1", existing_doc("transition-a", "blob:aaa111")),
            child("child_2", existing_doc("transition-b", "blob:bbb111")),
        ],
    );
    denied_contains(
        create_rollback_eligibility(
            &multi_source,
            &[
                preimage_child.clone(),
                RollbackChildEligibility::new("child_2", ChangesetOperationKind::ReplaceBody, true),
            ],
        ),
        "exactly one",
    );
    denied_contains(
        create_rollback_eligibility(
            &source,
            &[RollbackChildEligibility::new(
                "missing_child",
                ChangesetOperationKind::ReplaceBody,
                true,
            )],
        ),
        "does not exist",
    );
    denied_contains(
        create_rollback_eligibility(
            &source,
            &[RollbackChildEligibility::new(
                "child_1",
                ChangesetOperationKind::CreateDocument,
                true,
            )],
        ),
        "does not match",
    );
    let create_source = record(
        ChangesetKind::Authoring,
        ChangesetStatus::Applied,
        vec![ChangesetChildOperationInput {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::CreateDocument,
            target: fence(provisional_doc()),
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }],
    );
    denied_contains(
        create_rollback_eligibility(
            &create_source,
            &[RollbackChildEligibility::new(
                "child_1",
                ChangesetOperationKind::CreateDocument,
                true,
            )],
        ),
        "rollback_unavailable",
    );
    denied_contains(
        create_rollback_eligibility(
            &source,
            &[RollbackChildEligibility::new(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                false,
            )],
        ),
        "required preimage",
    );
}

#[test]
fn policy_requeue_arc_is_declared_and_gated_to_system_over_approved() {
    // P48-R1: the Approved→NeedsReview kill-switch arc is DECLARED in the append
    // vocabulary (so it is not a synthetic 2-hop leaking undeclared arcs).
    assert!(append_allows_status_transition(
        ChangesetKind::Authoring,
        ChangesetStatus::Approved,
        ChangesetStatus::NeedsReview,
    ));

    let approved = authoring_record(ChangesetStatus::Approved);
    let system = ActorRef {
        id: ActorId::new("system:modes").unwrap(),
        kind: ActorKind::System,
        delegated_by: None,
    };
    let human = ActorRef {
        id: ActorId::new("human:reviewer").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    };

    // Legal only for the system actor over an approved head.
    allowed(policy_requeue_transition_eligibility(&approved, &system));
    denied_contains(
        policy_requeue_transition_eligibility(&approved, &human),
        "system-actor",
    );
    let needs_review = authoring_record(ChangesetStatus::NeedsReview);
    denied_contains(
        policy_requeue_transition_eligibility(&needs_review, &system),
        "approved head",
    );
}

#[test]
fn every_command_has_an_explicit_lifecycle_scope() {
    for command in CommandKind::ALL {
        let scope = command_lifecycle_scope(*command);
        match command {
            CommandKind::CreateProposal | CommandKind::CreateRollback => {
                assert_eq!(scope, CommandLifecycleScope::InitialChangeset)
            }
            CommandKind::ReadContext
            | CommandKind::SearchGraph
            | CommandKind::SubscribeEvents
            | CommandKind::RecoverEventStream => {
                assert_eq!(scope, CommandLifecycleScope::NotChangesetLifecycle)
            }
            _ => {
                assert!(
                    matches!(
                        scope,
                        CommandLifecycleScope::ChangesetTransition
                            | CommandLifecycleScope::StatusPreserving
                            | CommandLifecycleScope::NotChangesetLifecycle
                    ),
                    "command has a declared lifecycle scope: {command:?}"
                );
            }
        }
    }
}
