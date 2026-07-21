use super::helpers::*;

// --- W02.P05a: propose-side operation-kind generalization --------------

/// Serializes the tests that spawn the REAL `vaultspec-core` subprocess
/// (mirrors `apply::tests::REAL_CORE_TEST_LOCK` / `direct_write::tests::REAL_CORE_TEST_LOCK`).
static REAL_CORE_TEST_LOCK: Mutex<()> = Mutex::new(());

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .env("GIT_AUTHOR_NAME", "proposal-live")
        .env("GIT_AUTHOR_EMAIL", "proposal-live@example.invalid")
        .env("GIT_COMMITTER_NAME", "proposal-live")
        .env("GIT_COMMITTER_EMAIL", "proposal-live@example.invalid")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn scaffold_vaultspec_workspace(root: &Path) {
    crate::authoring::core_workspace::scaffold_vaultspec_workspace(
        root,
        "standard-flow propose tests",
    );
}

/// A REAL git + vaultspec workspace (unlike `temp_store`'s bare tempdir) —
/// needed so `apply_changeset` can drive the genuine `vaultspec-core`
/// binary, proving the standard propose surface reaches a REAL Applied
/// state, not just a materialized draft.
fn temp_live_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    write_doc(
        root,
        ".vault/plan/proposal-plan.md",
        "---\ntags:\n  - '#plan'\n  - '#standard-flow'\ndate: '2026-01-01'\n---\n\n# Plan\n\nold body\n",
    );
    scaffold_vaultspec_workspace(root);
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "standard flow fixture"]);
    let mut store = Store::open(&root.join(".vault")).unwrap();
    register_actor(&mut store);
    (dir, store)
}

fn applier_actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:applier").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn frontmatter_draft_for(root: &Path, child_key: &str, date: &str) -> ChangesetChildOperationDraft {
    let document = resolved_doc(root);
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::EditFrontmatter,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: Some(FrontmatterEditFields {
                date: Some(date.to_string()),
                tags: None,
                related: None,
            }),
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    }
}

fn rename_draft_for(root: &Path, child_key: &str, new_stem: &str) -> ChangesetChildOperationDraft {
    let document = resolved_doc(root);
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::Rename,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: Some(new_stem.to_string()),
            section_selector: None,
            plan_step: None,
        },
    }
}

fn create_document_draft_for(child_key: &str) -> ChangesetChildOperationDraft {
    let document = DocumentRef::ProvisionalCreate {
        provisional_doc_id: format!("provisional:{child_key}"),
        doc_type: "plan".to_string(),
        feature: "standard-flow-create".to_string(),
        title: "Standard Flow Create".to_string(),
        collision_status: ProvisionalCollisionStatus::Unknown,
        proposed_stem: None,
        related: Vec::new(),
    };
    ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::CreateDocument,
        target: TargetRevisionFence {
            document,
            base_revision: None,
            current_revision: None,
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: "preview\n".to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    }
}

/// Drive `draft` through the STANDARD multi-step propose surface —
/// `create_proposal` -> `validate_proposal` -> `submit_for_review` ->
/// approve -> `apply_changeset` — end to end, through the SAME propose
/// command surface the `propose_changeset` agent tool dispatches into
/// (`http.rs`'s `/execute` route calls `proposal::create_proposal`/
/// `dispatch_draft_mutation` -> `append_draft`/`replace_draft` directly;
/// there is no separate agent-only seam). Three distinct actors
/// (proposer, reviewer, applier) mirror the self-approval / self-apply
/// guardrails every other live-core fixture in this crate respects.
fn standard_flow_to_applied(
    store: &mut Store,
    root: &Path,
    changeset_id: ChangesetId,
    draft: ChangesetChildOperationDraft,
) -> (ChangesetAggregateRecord, ApplyOutcome) {
    let reader = reader(root);
    let author = actor();
    let reviewer = human_actor();
    let applier = applier_actor();
    register_actor_with_status(store, reviewer.clone(), ActorStatus::Active);
    register_actor_with_status(store, applier.clone(), ActorStatus::Active);

    let tag = changeset_id.as_str().to_string();
    accepted(
        create_proposal(
            store,
            &reader,
            context_for_actor(author.clone(), &format!("idem:create:{tag}"), 100),
            CreateProposalRequest {
                session_id: session_id(),
                changeset_id: changeset_id.clone(),
                summary: "standard flow propose".to_string(),
                operations: vec![draft],
            },
        )
        .unwrap(),
    );

    let validated = validate_latest(
        store,
        root,
        &changeset_id,
        &format!("idem:validate:{tag}"),
        101,
    );

    let submitted = accepted(
        submit_for_review(
            store,
            context_for_actor(author.clone(), &format!("idem:submit:{tag}"), 102),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: validated.changeset_revision,
                validation_digest: validated.validation_digest.clone().unwrap(),
                summary: "standard flow submit".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(submitted.status, ChangesetStatus::NeedsReview);

    let proposal_id = ProposalId::new(format!("proposal:{tag}")).unwrap();
    let validation_digest = submitted.validation_digest.clone().unwrap();
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new(format!("approval:{tag}")).unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: submitted.changeset_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: format!("idem:request:{tag}"),
                created_at_ms: 103,
            }))
        })
        .unwrap()
        .unwrap();

    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id: &proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: &validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms: 104,
            }))
        })
        .unwrap()
        .unwrap();

    let idem = IdempotencyKey::new(format!("idem:apply:{tag}")).unwrap();
    let outcome = apply_changeset(
        store,
        &CoreAdapter::detect(),
        root,
        ApplyRequest {
            changeset_id: &changeset_id,
            proposal_id: &proposal_id,
            actor: &applier,
            idempotency_key: &idem,
            fencing_token: None,
            now_ms: 105,
        },
    )
    .unwrap();

    let applied_record = latest_record(store, &changeset_id);
    (applied_record, outcome)
}

#[test]
fn frontmatter_proposal_through_the_standard_flow_applies_and_is_rollback_eligible() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let (dir, mut store) = temp_live_store();
    let root = dir.path();
    let cs_id = changeset_id("changeset_standard_frontmatter");
    let draft = frontmatter_draft_for(root, "child_1", "2026-03-03");

    let (applied_record, outcome) =
        standard_flow_to_applied(&mut store, root, cs_id.clone(), draft);

    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied standard-flow proposal yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert_eq!(
        receipt.actor,
        applier_actor(),
        "provenance: the receipt records the applying actor"
    );
    assert_eq!(applied_record.status, ChangesetStatus::Applied);

    // A real preimage — the standard flow's own materialize_drafts path —
    // was persisted, not just embedded in the materialized operation.
    let operation = applied_record.children[0]
        .materialized_operation
        .as_ref()
        .expect("applied child is materialized");
    let preimage_id = operation.preimage.preimage_id.clone();
    let stored_preimage = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.snapshots().preimage(&preimage_id)
        })
        .unwrap();
    assert!(
        stored_preimage.is_some(),
        "the standard propose flow must persist a real preimage for a frontmatter edit"
    );

    let rollback_eligibility = create_rollback_eligibility(
        &applied_record,
        &[RollbackChildEligibility::new(
            "child_1",
            ChangesetOperationKind::EditFrontmatter,
            true,
        )],
    );
    assert!(
        rollback_eligibility.allowed,
        "a standard-flow-applied frontmatter edit must be rollback-eligible: {:?}",
        rollback_eligibility.reason
    );
}

#[test]
fn rename_proposal_through_the_standard_flow_applies_and_is_rollback_eligible() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let (dir, mut store) = temp_live_store();
    let root = dir.path();
    let cs_id = changeset_id("changeset_standard_rename");
    let draft = rename_draft_for(root, "child_1", "proposal-plan-renamed");

    let (applied_record, outcome) =
        standard_flow_to_applied(&mut store, root, cs_id.clone(), draft);

    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied standard-flow proposal yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert_eq!(applied_record.status, ChangesetStatus::Applied);
    assert!(
        !root.join(".vault/plan/proposal-plan.md").exists(),
        "the REAL vaultspec-core rename moved the document away from the old stem"
    );
    assert!(
        root.join(".vault/plan/proposal-plan-renamed.md").exists(),
        "the REAL vaultspec-core rename landed at the new stem"
    );

    let operation = applied_record.children[0]
        .materialized_operation
        .as_ref()
        .expect("applied child is materialized");
    let preimage_id = operation.preimage.preimage_id.clone();
    let stored_preimage = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.snapshots().preimage(&preimage_id)
        })
        .unwrap();
    assert!(
        stored_preimage.is_some(),
        "the standard propose flow must persist a real preimage for a rename"
    );

    let rollback_eligibility = create_rollback_eligibility(
        &applied_record,
        &[RollbackChildEligibility::new(
            "child_1",
            ChangesetOperationKind::Rename,
            true,
        )],
    );
    assert!(
        rollback_eligibility.allowed,
        "a standard-flow-applied rename must be rollback-eligible: {:?}",
        rollback_eligibility.reason
    );
}

#[test]
fn create_document_draft_is_accepted_and_validated_through_the_standard_propose_surface() {
    // Lighter than the frontmatter/rename round trips (no live-core apply):
    // proves `create_proposal` accepts a `CreateDocument` draft (the
    // `materialize_drafts` dispatch fix) AND that `validate_proposal`'s
    // server-derived evidence (`validation_evidence`'s phantom-observation
    // branch) also works for it — the two propose-surface seams a
    // `ProvisionalCreate` target used to break unconditionally.
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let cs_id = changeset_id("changeset_standard_create");
    let draft = create_document_draft_for("child_1");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:standard-create", 100),
            CreateProposalRequest {
                session_id: session_id(),
                changeset_id: cs_id.clone(),
                summary: "propose create".to_string(),
                operations: vec![draft],
            },
        )
        .unwrap(),
    );
    assert_eq!(created.status, ChangesetStatus::Draft);

    let latest = latest_record(&mut store, &cs_id);
    let child = &latest.children[0];
    assert_eq!(child.operation, ChangesetOperationKind::CreateDocument);
    let operation = child
        .materialized_operation
        .as_ref()
        .expect("create draft is materialized");
    assert!(
        operation.create_document_date.is_some(),
        "the standard propose surface must fix the create date at materialize time too"
    );

    let validated = validate_latest(
        &mut store,
        root,
        &cs_id,
        "idem:validate:standard-create",
        101,
    );
    assert_eq!(validated.status, ChangesetStatus::Proposed);

    // No inverse via the standard flow either — create stays honestly
    // non-rollback-eligible regardless of how it was proposed.
    let rollback_eligibility = create_rollback_eligibility(
        &latest,
        &[RollbackChildEligibility::new(
            "child_1",
            ChangesetOperationKind::CreateDocument,
            false,
        )],
    );
    assert!(!rollback_eligibility.allowed, "{rollback_eligibility:?}");
}
