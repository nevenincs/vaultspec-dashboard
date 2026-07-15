use super::helpers::*;

#[test]
fn proposal_mutations_persist_issuing_actor_and_delegated_provenance() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let human = human_actor();
    register_actor_with_status(&mut store, human.clone(), ActorStatus::Active);
    let delegated = delegated_actor(&human);
    let trace_id = changeset_id("changeset_actor_trace");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context_for_actor(human.clone(), "idem:create:actor-trace", 100),
            create_request(root, trace_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let appended = accepted(
        append_draft(
            &mut store,
            &reader,
            context_for_actor(delegated.clone(), "idem:append:actor-trace", 101),
            draft_request(
                root,
                trace_id.clone(),
                created.changeset_revision,
                "child_2",
                valid_body("second"),
            ),
        )
        .unwrap(),
    );
    let replaced = accepted(
        replace_draft(
            &mut store,
            &reader,
            context_for_actor(human.clone(), "idem:replace:actor-trace", 102),
            draft_request(
                root,
                trace_id.clone(),
                appended.changeset_revision,
                "child_3",
                valid_body("third"),
            ),
        )
        .unwrap(),
    );
    let latest = latest_record(&mut store, &trace_id);
    let (current_revisions, chunk_evidence) = validation_inputs(root, &latest);
    let validated = accepted(
        validate_proposal(
            &mut store,
            context_for_actor(delegated.clone(), "idem:validate:actor-trace", 103),
            ValidateProposalRequest {
                changeset_id: trace_id.clone(),
                expected_revision: replaced.changeset_revision,
                summary: "validate actor trace".to_string(),
                current_revisions,
                chunk_evidence,
            },
        )
        .unwrap(),
    );
    let submitted = accepted(
        submit_for_review(
            &mut store,
            context_for_actor(human.clone(), "idem:submit:actor-trace", 104),
            SubmitProposalRequest {
                changeset_id: trace_id.clone(),
                expected_revision: validated.changeset_revision,
                validation_digest: validated.validation_digest.unwrap(),
                summary: "submit actor trace".to_string(),
            },
        )
        .unwrap(),
    );

    assert_eq!(submitted.status, ChangesetStatus::NeedsReview);
    let revisions = history(&mut store, &trace_id).revisions;
    let expected_actors = vec![
        human.clone(),
        delegated.clone(),
        human.clone(),
        delegated.clone(),
        human.clone(),
    ];
    assert_eq!(
        revisions
            .iter()
            .map(|record| record.actor.clone())
            .collect::<Vec<_>>(),
        expected_actors
    );
    for record in &revisions {
        assert_eq!(
            record.actor_provenance_key,
            actor_provenance_key(&record.actor)
        );
    }

    let cancel_id = changeset_id("changeset_actor_cancel");
    let cancel_created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context_for_actor(delegated.clone(), "idem:create:actor-cancel", 200),
            create_request(root, cancel_id.clone(), "child_1", valid_body("cancel")),
        )
        .unwrap(),
    );
    accepted(
        cancel_proposal(
            &mut store,
            context_for_actor(human.clone(), "idem:cancel:actor-cancel", 201),
            terminal_request(
                cancel_id.clone(),
                cancel_created.changeset_revision,
                "cancel with human",
            ),
        )
        .unwrap(),
    );
    assert_eq!(
        history(&mut store, &cancel_id)
            .revisions
            .iter()
            .map(|record| record.actor.clone())
            .collect::<Vec<_>>(),
        vec![delegated.clone(), human.clone()]
    );

    let supersede_id = changeset_id("changeset_actor_supersede");
    let supersede_created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context_for_actor(human.clone(), "idem:create:actor-supersede", 300),
            create_request(
                root,
                supersede_id.clone(),
                "child_1",
                valid_body("supersede"),
            ),
        )
        .unwrap(),
    );
    accepted(
        supersede_proposal(
            &mut store,
            context_for_actor(delegated.clone(), "idem:supersede:actor-supersede", 301),
            terminal_request(
                supersede_id.clone(),
                supersede_created.changeset_revision,
                "supersede with delegated actor",
            ),
        )
        .unwrap(),
    );
    assert_eq!(
        history(&mut store, &supersede_id)
            .revisions
            .iter()
            .map(|record| record.actor.clone())
            .collect::<Vec<_>>(),
        vec![human, delegated]
    );
}

#[test]
fn missing_actor_rejects_before_proposal_side_effects() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let missing = ActorRef {
        id: ActorId::new("agent:missing").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };

    let err = create_proposal(
        &mut store,
        &reader,
        context_for_actor(missing, "idem:create:missing-actor", 100),
        create_request(
            root,
            changeset_id("changeset_missing_actor"),
            "child_1",
            valid_body("missing"),
        ),
    )
    .unwrap_err();

    assert!(
        matches!(err, StoreError::Actor(ref detail) if detail.contains("not registered")),
        "unexpected missing actor error: {err}"
    );
    assert_eq!(
        side_effect_counts(&store),
        SideEffectCounts {
            idempotency: 0,
            preimages: 0,
            validations: 0,
            ledger: 0,
            outbox: 0,
        }
    );
}

#[test]
fn stale_actor_rejects_before_proposal_side_effects() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let stale = ActorRef {
        id: ActorId::new("agent:stale").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    register_actor_with_status(&mut store, stale.clone(), ActorStatus::Stale);

    let err = create_proposal(
        &mut store,
        &reader,
        context_for_actor(stale, "idem:create:stale-actor", 100),
        create_request(
            root,
            changeset_id("changeset_stale_actor"),
            "child_1",
            valid_body("stale"),
        ),
    )
    .unwrap_err();

    assert!(
        matches!(err, StoreError::Actor(ref detail) if detail.contains("is stale")),
        "unexpected stale actor error: {err}"
    );
    assert_eq!(
        side_effect_counts(&store),
        SideEffectCounts {
            idempotency: 0,
            preimages: 0,
            validations: 0,
            ledger: 0,
            outbox: 0,
        }
    );
}

#[test]
fn draft_commands_append_ordered_revisions_and_replace_children() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_order");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:order", 100),
            create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let appended = accepted(
        append_draft(
            &mut store,
            &reader,
            context("idem:append:order", 101),
            draft_request(
                root,
                changeset_id.clone(),
                created.changeset_revision.clone(),
                "child_2",
                valid_body("second"),
            ),
        )
        .unwrap(),
    );
    let replaced = accepted(
        replace_draft(
            &mut store,
            &reader,
            context("idem:replace:order", 102),
            draft_request(
                root,
                changeset_id.clone(),
                appended.changeset_revision.clone(),
                "child_3",
                valid_body("third"),
            ),
        )
        .unwrap(),
    );

    let history = history(&mut store, &changeset_id);
    assert_eq!(history.revisions.len(), 3);
    assert_eq!(history.revisions[0].previous_revision, None);
    assert_eq!(
        history.revisions[1].previous_revision,
        Some(created.changeset_revision)
    );
    assert_eq!(
        history.revisions[2].previous_revision,
        Some(appended.changeset_revision)
    );
    assert_eq!(history.revisions[0].children[0].child_key, "child_1");
    assert_eq!(
        history.revisions[1]
            .children
            .iter()
            .map(|child| child.child_key.as_str())
            .collect::<Vec<_>>(),
        vec!["child_1", "child_2"]
    );
    assert_eq!(history.revisions[2].children.len(), 1);
    assert_eq!(history.revisions[2].children[0].child_key, "child_3");
    assert_eq!(
        history.latest().unwrap().changeset_revision,
        replaced.changeset_revision
    );
}

#[test]
fn duplicate_create_replays_without_second_ledger_write() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_replay");
    let request = create_request(root, changeset_id.clone(), "child_1", valid_body("first"));

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:replay", 100),
            request.clone(),
        )
        .unwrap(),
    );
    assert_replayed(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:replay", 200),
            request,
        )
        .unwrap(),
    );

    assert_eq!(history(&mut store, &changeset_id).revisions.len(), 1);
}

#[test]
fn same_idempotency_key_conflicts_on_changed_request_without_second_write() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_idempotency_conflict");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:conflict", 100),
            create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let err = create_proposal(
        &mut store,
        &reader,
        context("idem:create:conflict", 101),
        create_request(root, changeset_id.clone(), "child_1", valid_body("changed")),
    )
    .unwrap_err();

    assert!(err.to_string().contains("conflicts"), "{err}");
    assert_eq!(history(&mut store, &changeset_id).revisions.len(), 1);
}

#[test]
fn submit_requires_validation_bound_to_latest_revision() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_validation");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:validation", 100),
            create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let first_validation =
        validate_latest(&mut store, root, &changeset_id, "idem:validate:first", 101);
    let first_digest = first_validation
        .validation_digest
        .clone()
        .expect("validation returns digest");

    let stale_submit = denied(
        submit_for_review(
            &mut store,
            context("idem:submit:missing", 102),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: first_validation.changeset_revision.clone(),
                validation_digest: "validation:missing".to_string(),
                summary: "submit missing validation".to_string(),
            },
        )
        .unwrap(),
    );
    assert!(
        stale_submit
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("validation")),
        "{stale_submit:?}"
    );

    let replaced = accepted(
        replace_draft(
            &mut store,
            &reader,
            context("idem:replace:validation", 103),
            draft_request(
                root,
                changeset_id.clone(),
                first_validation.changeset_revision.clone(),
                "child_1",
                valid_body("second"),
            ),
        )
        .unwrap(),
    );
    assert_ne!(replaced.changeset_revision, created.changeset_revision);
    let second_validation =
        validate_latest(&mut store, root, &changeset_id, "idem:validate:second", 104);

    let old_digest_submit = submit_for_review(
        &mut store,
        context("idem:submit:old-digest", 105),
        SubmitProposalRequest {
            changeset_id: changeset_id.clone(),
            expected_revision: second_validation.changeset_revision.clone(),
            validation_digest: first_digest,
            summary: "submit old validation".to_string(),
        },
    )
    .unwrap_err();
    assert!(
        old_digest_submit
            .to_string()
            .contains("current proposal revision"),
        "{old_digest_submit}"
    );

    let submitted = accepted(
        submit_for_review(
            &mut store,
            context("idem:submit:latest", 106),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: second_validation.changeset_revision,
                validation_digest: second_validation.validation_digest.unwrap(),
                summary: "submit latest validation".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(submitted.status, ChangesetStatus::NeedsReview);
}

#[test]
fn lifecycle_command_replays_are_idempotent_and_backend_owned() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let review_id = changeset_id("changeset_replay_review");
    let cancel_id = changeset_id("changeset_replay_cancel");
    let supersede_id = changeset_id("changeset_replay_supersede");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:review-replay", 100),
            create_request(root, review_id.clone(), "child_1", valid_body("review")),
        )
        .unwrap(),
    );
    let validation_request = {
        let latest = latest_record(&mut store, &review_id);
        let (current_revisions, chunk_evidence) = validation_inputs(root, &latest);
        ValidateProposalRequest {
            changeset_id: review_id.clone(),
            expected_revision: latest.changeset_revision,
            summary: "validate replay".to_string(),
            current_revisions,
            chunk_evidence,
        }
    };
    let validated = accepted(
        validate_proposal(
            &mut store,
            context("idem:validate:replay", 101),
            validation_request.clone(),
        )
        .unwrap(),
    );
    let validation_replay = replayed_outcome(
        validate_proposal(
            &mut store,
            context("idem:validate:replay", 102),
            validation_request,
        )
        .unwrap(),
        &validated,
    );
    assert_eq!(
        validation_replay.receipt_id.as_ref(),
        Some(&validated.receipt_id)
    );

    let submit_request = SubmitProposalRequest {
        changeset_id: review_id.clone(),
        expected_revision: validated.changeset_revision,
        validation_digest: validated.validation_digest.clone().unwrap(),
        summary: "submit replay".to_string(),
    };
    let submitted = accepted(
        submit_for_review(
            &mut store,
            context("idem:submit:replay", 103),
            submit_request.clone(),
        )
        .unwrap(),
    );
    let submit_replay = replayed_outcome(
        submit_for_review(
            &mut store,
            context("idem:submit:replay", 104),
            submit_request,
        )
        .unwrap(),
        &submitted,
    );
    assert_eq!(
        submit_replay.receipt_id.as_ref(),
        Some(&submitted.receipt_id)
    );
    assert_eq!(history(&mut store, &review_id).revisions.len(), 3);
    assert_eq!(
        latest_record(&mut store, &review_id).status,
        ChangesetStatus::NeedsReview
    );

    let cancel_created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:cancel-replay", 200),
            create_request(root, cancel_id.clone(), "child_1", valid_body("cancel")),
        )
        .unwrap(),
    );
    let cancel_request = terminal_request(
        cancel_id.clone(),
        cancel_created.changeset_revision,
        "cancel replay",
    );
    let cancelled = accepted(
        cancel_proposal(
            &mut store,
            context("idem:cancel:replay", 201),
            cancel_request.clone(),
        )
        .unwrap(),
    );
    let cancel_replay = replayed_outcome(
        cancel_proposal(
            &mut store,
            context("idem:cancel:replay", 202),
            cancel_request,
        )
        .unwrap(),
        &cancelled,
    );
    assert_eq!(
        cancel_replay.receipt_id.as_ref(),
        Some(&cancelled.receipt_id)
    );
    assert_eq!(history(&mut store, &cancel_id).revisions.len(), 2);
    assert_eq!(
        latest_record(&mut store, &cancel_id).status,
        ChangesetStatus::Cancelled
    );

    let supersede_created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:supersede-replay", 300),
            create_request(
                root,
                supersede_id.clone(),
                "child_1",
                valid_body("supersede"),
            ),
        )
        .unwrap(),
    );
    let supersede_request = terminal_request(
        supersede_id.clone(),
        supersede_created.changeset_revision,
        "supersede replay",
    );
    let superseded = accepted(
        supersede_proposal(
            &mut store,
            context("idem:supersede:replay", 301),
            supersede_request.clone(),
        )
        .unwrap(),
    );
    let supersede_replay = replayed_outcome(
        supersede_proposal(
            &mut store,
            context("idem:supersede:replay", 302),
            supersede_request,
        )
        .unwrap(),
        &superseded,
    );
    assert_eq!(
        supersede_replay.receipt_id.as_ref(),
        Some(&superseded.receipt_id)
    );
    assert_eq!(history(&mut store, &supersede_id).revisions.len(), 2);
    assert_eq!(
        latest_record(&mut store, &supersede_id).status,
        ChangesetStatus::Superseded
    );
}

#[test]
fn submit_rejects_latest_validation_that_is_not_approval_ready() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_invalid_validation");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:invalid", 100),
            create_request(
                root,
                changeset_id.clone(),
                "child_1",
                invalid_body("missing frontmatter"),
            ),
        )
        .unwrap(),
    );
    let validation = validate_latest(
        &mut store,
        root,
        &changeset_id,
        "idem:validate:invalid",
        101,
    );
    let validation_digest = validation
        .validation_digest
        .clone()
        .expect("validation returns digest");
    let invalid_snapshot = snapshot(&mut store, &changeset_id);
    let latest_validation = invalid_snapshot
        .latest_validation
        .expect("invalid validation is still recorded");
    assert_eq!(latest_validation.validation_digest, validation_digest);
    assert!(!latest_validation.approval_ready);

    let rejected = denied(
        submit_for_review(
            &mut store,
            context("idem:submit:invalid", 102),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: validation.changeset_revision,
                validation_digest,
                summary: "submit invalid validation".to_string(),
            },
        )
        .unwrap(),
    );

    assert!(
        rejected
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("not reviewable")),
        "{rejected:?}"
    );
    let final_snapshot = snapshot(&mut store, &changeset_id);
    assert_eq!(final_snapshot.history.revisions.len(), 2);
    assert_eq!(
        final_snapshot.latest.unwrap().status,
        ChangesetStatus::Proposed
    );
}

#[test]
fn proposal_snapshot_reconstructs_history_and_latest_validation() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let changeset_id = changeset_id("changeset_snapshot");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:snapshot", 100),
            create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let validation = validate_latest(
        &mut store,
        root,
        &changeset_id,
        "idem:validate:snapshot",
        101,
    );
    let validation_digest = validation
        .validation_digest
        .clone()
        .expect("validation returns digest");

    let snapshot = snapshot(&mut store, &changeset_id);
    assert_eq!(snapshot.history.revisions.len(), 2);
    assert_eq!(snapshot.latest.unwrap().status, ChangesetStatus::Proposed);
    assert_eq!(
        snapshot.latest_validation.unwrap().validation_digest,
        validation_digest
    );
}

#[test]
fn cancellation_and_supersession_are_terminal() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);
    let cancelled_id = changeset_id("changeset_cancelled");
    let superseded_id = changeset_id("changeset_superseded");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:cancelled", 100),
            create_request(root, cancelled_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let cancelled = accepted(
        cancel_proposal(
            &mut store,
            context("idem:cancel", 101),
            terminal_request(
                cancelled_id.clone(),
                created.changeset_revision,
                "cancel proposal",
            ),
        )
        .unwrap(),
    );
    assert_eq!(cancelled.status, ChangesetStatus::Cancelled);
    let terminal_append = denied(
        append_draft(
            &mut store,
            &reader,
            context("idem:append:cancelled", 102),
            draft_request(
                root,
                cancelled_id.clone(),
                cancelled.changeset_revision,
                "child_2",
                valid_body("blocked"),
            ),
        )
        .unwrap(),
    );
    assert!(
        terminal_append
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("terminal")),
        "{terminal_append:?}"
    );

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:superseded", 200),
            create_request(root, superseded_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let superseded = accepted(
        supersede_proposal(
            &mut store,
            context("idem:supersede", 201),
            terminal_request(
                superseded_id.clone(),
                created.changeset_revision,
                "supersede proposal",
            ),
        )
        .unwrap(),
    );
    assert_eq!(superseded.status, ChangesetStatus::Superseded);
    let terminal_validate = denied(
        validate_proposal(
            &mut store,
            context("idem:validate:superseded", 202),
            ValidateProposalRequest {
                changeset_id: superseded_id,
                expected_revision: superseded.changeset_revision,
                summary: "validate terminal proposal".to_string(),
                current_revisions: Vec::new(),
                chunk_evidence: Vec::new(),
            },
        )
        .unwrap(),
    );
    assert!(
        terminal_validate
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("terminal")),
        "{terminal_validate:?}"
    );
}

#[test]
fn cancel_and_supersede_publish_changeset_transition_events_to_the_outbox() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = reader(root);

    let cancelled_id = changeset_id("changeset_cancel_evt");
    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:cancel-evt", 100),
            create_request(root, cancelled_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let cancelled = accepted(
        cancel_proposal(
            &mut store,
            context("idem:cancel-evt", 101),
            terminal_request(cancelled_id.clone(), created.changeset_revision, "cancel"),
        )
        .unwrap(),
    );
    assert_eq!(cancelled.status, ChangesetStatus::Cancelled);

    let superseded_id = changeset_id("changeset_supersede_evt");
    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:supersede-evt", 200),
            create_request(root, superseded_id.clone(), "child_1", valid_body("first")),
        )
        .unwrap(),
    );
    let superseded = accepted(
        supersede_proposal(
            &mut store,
            context("idem:supersede-evt", 201),
            terminal_request(
                superseded_id.clone(),
                created.changeset_revision,
                "supersede",
            ),
        )
        .unwrap(),
    );
    assert_eq!(superseded.status, ChangesetStatus::Superseded);

    let events = store
        .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            uow.outbox().events_after(0, 50)
        })
        .unwrap();

    // Cancel publishes the canonical cancellation.recorded transition on the changeset
    // aggregate, keyed to the resulting revision, carrying the served status.
    let cancel_event = events
        .iter()
        .find(|event| event.event_kind == "cancellation.recorded")
        .expect("cancel publishes cancellation.recorded");
    assert_eq!(cancel_event.aggregate_kind, "changeset");
    assert_eq!(cancel_event.aggregate_id, cancelled_id.as_str());
    assert_eq!(cancel_event.payload["data"]["status"], "cancelled");
    assert_eq!(
        cancel_event.payload["data"]["changeset_id"],
        cancelled_id.as_str()
    );

    // Supersede rides the canonical proposal.updated transition (from_changeset_status).
    let supersede_event = events
        .iter()
        .find(|event| {
            event.event_kind == "proposal.updated" && event.aggregate_id == superseded_id.as_str()
        })
        .expect("supersede publishes proposal.updated");
    assert_eq!(supersede_event.payload["data"]["status"], "superseded");
}
