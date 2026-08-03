//! Run settlement: the terminal outcome arms, the failure reason, the provider
//! condition, and settle authorization. Fixtures come from the parent module.

use super::*;

#[test]
fn completing_a_run_covers_the_outcome_enum_owner_and_failed_arm() {
    let (_dir, _path, mut store) = temp_store();
    let owner = actor();
    let other = other_actor();
    register_actor(&mut store, &owner);
    register_actor(&mut store, &other);
    let session = accepted(
        create_session(
            &mut store,
            context(&owner, "idem:session:create:oc", 100),
            session_request("Outcome session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&owner, "idem:oc:turn:1", 110),
            session.session_id.clone(),
            turn_request("A prompt to fail."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.clone().unwrap();

    // A non-owner may not settle the run: a typed RunForbidden (403).
    let forbidden = complete_run(
        &mut store,
        context(&other, "idem:oc:intruder", 115),
        run_id.clone(),
        CompleteRunRequest {
            outcome: None,
            summary: None,
            failure_reason: None,
            provider_condition: None,
        },
    )
    .unwrap_err();
    assert!(
        matches!(forbidden, StoreError::RunForbidden(_)),
        "only the run owner may complete it, got {forbidden:?}"
    );

    // A completed outcome must not carry a failure_reason.
    let mismatched = complete_run(
        &mut store,
        context(&owner, "idem:oc:mismatch", 116),
        run_id.clone(),
        CompleteRunRequest {
            outcome: Some(RunOutcome::Completed),
            summary: None,
            failure_reason: Some("should not be here".to_string()),
            provider_condition: None,
        },
    )
    .unwrap_err();
    assert!(matches!(mismatched, StoreError::Session(_)));

    // The Failed arm records the terminal status and the failure reason.
    let failed = accepted(
        complete_run(
            &mut store,
            context(&owner, "idem:oc:fail", 120),
            run_id,
            CompleteRunRequest {
                outcome: Some(RunOutcome::Failed),
                summary: None,
                failure_reason: Some("the model errored".to_string()),
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    let snap = failed.snapshot.as_ref().unwrap();
    assert_eq!(snap.runs[0].status, RunStatus::Failed);
    assert_eq!(
        snap.runs[0].failure_reason.as_deref(),
        Some("the model errored")
    );
    assert_eq!(
        snap.session.status,
        SessionStatus::Active,
        "a failed run still leaves its session active"
    );
    assert_eq!(
        event_kinds(&mut store).last().map(String::as_str),
        Some("run.completed"),
        "a failed outcome rides the same run.completed kind"
    );
}

#[test]
fn settle_and_promote_are_atomic_a_failure_between_them_rolls_back_both() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:atomic", 100),
            session_request("Atomic session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:atomic:turn:1", 110),
            session.session_id.clone(),
            turn_request("First prompt starts a run."),
        )
        .unwrap(),
    );
    let run1 = started.run_id.clone().unwrap();
    accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:atomic:turn:2", 120),
            session.session_id.clone(),
            turn_request("Second prompt queues."),
        )
        .unwrap(),
    );

    // Crash-injection: complete the run and promote the queued turn in ONE unit of
    // work, then fail before commit. The unit of work rolls back — NEITHER the
    // completion nor the promotion persists, so a queued turn is never stranded.
    let session_id = session.session_id.clone();
    let injected: StoreResult<()> = store.with_unit_of_work(CommandKind::CompleteRun, |uow| {
        uow.sessions().complete_run(
            &run1,
            CompleteRunRequest {
                outcome: None,
                summary: None,
                failure_reason: None,
                provider_condition: None,
            },
            &actor,
            300,
        )?;
        uow.sessions().promote_next_queued_turn(&session_id, 300)?;
        Err(StoreError::Session(
            "injected crash after promote".to_string(),
        ))
    });
    assert!(
        injected.is_err(),
        "the injected crash aborts the unit of work"
    );

    let snap = session_snapshot(&mut store, session_id).unwrap();
    let run1_state = snap
        .runs
        .iter()
        .find(|run| run.run_id == run1)
        .expect("run1 exists");
    assert_eq!(
        run1_state.status,
        RunStatus::Active,
        "the rolled-back completion left run1 active"
    );
    assert_eq!(
        snap.queued_turn_ids.len(),
        1,
        "the rolled-back promotion left the turn queued"
    );
}

#[test]
fn run_completion_transitions_emits_run_completed_and_replays_across_restart() {
    let (_dir, path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:complete", 200),
            session_request("Completion session"),
        )
        .unwrap(),
    );

    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:complete", 210),
            session.session_id.clone(),
            turn_request("Draft then settle the run."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.clone().expect("run id is returned");
    assert_eq!(latest_seq(&mut store), 2, "session.created + run.started");

    let completed = accepted(
        complete_run(
            &mut store,
            context(&actor, "idem:session:complete:1", 220),
            run_id.clone(),
            CompleteRunRequest {
                outcome: None,
                summary: Some("generation finished".to_string()),
                failure_reason: None,
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    assert_eq!(completed.status, "completed");
    let snapshot = completed
        .snapshot
        .as_ref()
        .expect("completion returns snapshot");
    assert!(
        snapshot.active_run.is_none(),
        "a completed run is no longer active"
    );
    assert_eq!(snapshot.runs[0].status, RunStatus::Completed);
    assert_eq!(snapshot.runs[0].completed_at_ms, Some(220));
    assert_eq!(
        snapshot.session.status,
        SessionStatus::Active,
        "completing a run must leave its session active for further turns"
    );
    assert_eq!(
        latest_seq(&mut store),
        3,
        "completion publishes exactly one run.completed transition"
    );

    let emitted = store
        .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            uow.outbox().events_after(0, 50)
        })
        .unwrap();
    let kinds: Vec<&str> = emitted
        .iter()
        .map(|event| event.event_kind.as_str())
        .collect();
    assert_eq!(
        kinds,
        vec!["session.created", "run.started", "run.completed"]
    );

    // Re-completing is idempotent: the recorded outcome replays and no duplicate
    // transition lands on the durable feed.
    let replayed_completion = replayed(
        complete_run(
            &mut store,
            context(&actor, "idem:session:complete:1", 220),
            run_id.clone(),
            CompleteRunRequest {
                outcome: None,
                summary: Some("generation finished".to_string()),
                failure_reason: None,
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    assert_eq!(replayed_completion.status, "completed");
    assert_eq!(
        latest_seq(&mut store),
        3,
        "an idempotent re-completion publishes no duplicate transition"
    );

    // A fresh completion command against an already-terminal run is a no-op transition:
    // it records its own outcome but appends no lifecycle event.
    let terminal_noop = accepted(
        complete_run(
            &mut store,
            context(&actor, "idem:session:complete:2", 225),
            run_id.clone(),
            CompleteRunRequest {
                outcome: None,
                summary: None,
                failure_reason: None,
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    assert_eq!(terminal_noop.status, "completed");
    assert_eq!(
        latest_seq(&mut store),
        3,
        "completing an already-terminal run must not publish a second transition"
    );

    drop(store);
    let mut reopened = Store::open_at(&path).unwrap();
    let recovered = session_snapshot(&mut reopened, session.session_id.clone()).unwrap();
    assert_eq!(recovered.session.status, SessionStatus::Active);
    assert!(recovered.active_run.is_none());
    assert_eq!(recovered.runs[0].status, RunStatus::Completed);
    assert_eq!(recovered.runs[0].completed_at_ms, Some(220));

    let feed = reopened
        .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            let latest = uow.outbox().latest_seq()?;
            crate::authoring::events::projector_feed_page(uow.outbox().events_after(0, 50)?, latest)
        })
        .unwrap();
    let replayed_kinds: Vec<&str> = feed
        .items
        .iter()
        .map(|item| item.event_kind.as_str())
        .collect();
    assert_eq!(
        replayed_kinds,
        vec!["session.created", "run.started", "run.completed"],
        "run.completed replays from the durable outbox after restart"
    );
}

#[test]
fn failure_reason_bounds_reject_empty_padded_and_oversized() {
    let (_dir, _path, mut store) = temp_store();
    let owner = actor();
    register_actor(&mut store, &owner);
    let session = accepted(
        create_session(
            &mut store,
            context(&owner, "idem:session:create:frb", 100),
            session_request("Failure-reason bounds session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&owner, "idem:frb:turn:1", 110),
            session.session_id.clone(),
            turn_request("A prompt whose run fails."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.clone().unwrap();

    for (key, reason) in [
        ("idem:frb:empty", String::new()),
        ("idem:frb:padded", " padded ".to_string()),
        ("idem:frb:oversized", "x".repeat(501)),
    ] {
        let rejected = complete_run(
            &mut store,
            context(&owner, key, 120),
            run_id.clone(),
            CompleteRunRequest {
                outcome: Some(RunOutcome::Failed),
                summary: None,
                failure_reason: Some(reason),
                provider_condition: None,
            },
        )
        .unwrap_err();
        assert!(
            matches!(rejected, StoreError::Session(_)),
            "`{key}` must be rejected by the failure-reason bounds, got {rejected:?}"
        );
    }

    // The run is untouched by the rejected attempts and a 500-byte reason is the
    // accepted maximum.
    let failed = accepted(
        complete_run(
            &mut store,
            context(&owner, "idem:frb:max", 130),
            run_id,
            CompleteRunRequest {
                outcome: Some(RunOutcome::Failed),
                summary: None,
                failure_reason: Some("x".repeat(500)),
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    let snap = failed.snapshot.as_ref().unwrap();
    assert_eq!(snap.runs[0].status, RunStatus::Failed);
}

#[test]
fn a_settled_provider_condition_survives_the_store_and_a_reopen() {
    let (_dir, path, mut store) = temp_store();
    let owner = actor();
    let run_id = run_awaiting_settlement(&mut store, &owner, "pcrt");

    // Before settlement the record carries no condition AT ALL — not a null, and
    // not the floor member. The serialized form is what the store writes to the
    // record column, so this is also the exact shape of every run recorded
    // before this field existed.
    let active = stored_run(&mut store, &run_id);
    assert_eq!(active.status, RunStatus::Active);
    assert_eq!(active.provider_condition, None);
    assert!(
        !serde_json::to_string(&active)
            .unwrap()
            .contains("provider_condition"),
        "an absent condition is omitted from the record, so reading one back \
         exercises the same missing-field path a pre-existing record takes"
    );

    let failed = accepted(
        complete_run(
            &mut store,
            context(&owner, "idem:pcrt:fail", 120),
            run_id.clone(),
            CompleteRunRequest {
                outcome: Some(RunOutcome::Failed),
                summary: None,
                // A reason that describes something OTHER than the condition, so
                // a reader that derived one from the other would land on the
                // wrong member instead of accidentally agreeing.
                failure_reason: Some("the worker gave up after three attempts".to_string()),
                provider_condition: Some("usage_exhausted".to_string()),
            },
        )
        .unwrap(),
    );
    assert_eq!(
        failed.snapshot.as_ref().unwrap().runs[0]
            .provider_condition
            .as_deref(),
        Some("usage_exhausted"),
        "the settle response already reflects the recorded condition"
    );

    // The real read path over the persisted record, and again after a reopen:
    // a client that reconnects after a restart reads the same classification.
    let read_back = stored_run(&mut store, &run_id);
    assert_eq!(read_back.status, RunStatus::Failed);
    assert_eq!(
        read_back.provider_condition.as_deref(),
        Some("usage_exhausted")
    );
    assert_eq!(
        read_back.failure_reason.as_deref(),
        Some("the worker gave up after three attempts"),
        "the prose reason is preserved unchanged beside the condition, and \
         neither is derived from the other"
    );

    drop(store);
    let mut reopened = Store::open_at(&path).unwrap();
    let recovered = stored_run(&mut reopened, &run_id);
    assert_eq!(
        recovered.provider_condition.as_deref(),
        Some("usage_exhausted"),
        "the condition is durable, not an artefact of the settling process"
    );
}

#[test]
fn a_condition_outside_the_vocabulary_is_refused_and_nothing_is_recorded() {
    let (_dir, _path, mut store) = temp_store();
    let owner = actor();
    let run_id = run_awaiting_settlement(&mut store, &owner, "pcbad");

    let rejected = complete_run(
        &mut store,
        context(&owner, "idem:pcbad:fail", 120),
        run_id.clone(),
        CompleteRunRequest {
            outcome: Some(RunOutcome::Failed),
            summary: None,
            failure_reason: Some("the lane refused".to_string()),
            provider_condition: Some("quota_exceeded".to_string()),
        },
    )
    .unwrap_err();
    let StoreError::Session(message) = &rejected else {
        panic!("an unrecognised condition is a session-domain refusal, got {rejected:?}");
    };
    assert!(
        message.contains("quota_exceeded"),
        "the refusal names the offending value so the caller can see what it sent: {message}"
    );
    for member in A2A_PROVIDER_CONDITIONS {
        assert!(
            message.contains(member),
            "the refusal lists the accepted set so the caller can correct itself; \
             `{member}` is missing from: {message}"
        );
    }

    // The refusal is total: the run keeps running rather than settling with a
    // reason and no classification, which would be the silent half-write this
    // whole field exists to prevent.
    let untouched = stored_run(&mut store, &run_id);
    assert_eq!(untouched.status, RunStatus::Active);
    assert_eq!(untouched.failure_reason, None);
    assert_eq!(untouched.provider_condition, None);

    // Every member of the shared vocabulary is admitted by the same boundary
    // that refused the value above — including the floor member, which is a real
    // outcome rather than an error case.
    for (index, member) in A2A_PROVIDER_CONDITIONS.iter().enumerate() {
        let (_dir, _path, mut store) = temp_store();
        let owner = actor();
        let run_id = run_awaiting_settlement(&mut store, &owner, &format!("pcok{index}"));
        complete_run(
            &mut store,
            context(&owner, &format!("idem:pcok{index}:fail"), 120),
            run_id.clone(),
            CompleteRunRequest {
                outcome: Some(RunOutcome::Failed),
                summary: None,
                failure_reason: None,
                provider_condition: Some((*member).to_string()),
            },
        )
        .unwrap_or_else(|err| panic!("`{member}` is a member and must settle: {err:?}"));
        assert_eq!(
            stored_run(&mut store, &run_id)
                .provider_condition
                .as_deref(),
            Some(*member)
        );
    }
}

#[test]
fn a_completed_run_cannot_carry_a_provider_condition() {
    let (_dir, _path, mut store) = temp_store();
    let owner = actor();
    let run_id = run_awaiting_settlement(&mut store, &owner, "pcok");

    // The value itself is a perfectly good member; what makes this a refusal is
    // that a run which did not fail has nothing for a condition to describe.
    let rejected = complete_run(
        &mut store,
        context(&owner, "idem:pcok:complete", 120),
        run_id.clone(),
        CompleteRunRequest {
            outcome: Some(RunOutcome::Completed),
            summary: Some("it finished".to_string()),
            failure_reason: None,
            provider_condition: Some("throttled".to_string()),
        },
    )
    .unwrap_err();
    assert!(
        matches!(&rejected, StoreError::Session(message) if message.contains("provider_condition")),
        "the contradiction is refused on its own terms, got {rejected:?}"
    );

    let settled = accepted(
        complete_run(
            &mut store,
            context(&owner, "idem:pcok:complete:clean", 130),
            run_id.clone(),
            CompleteRunRequest {
                outcome: Some(RunOutcome::Completed),
                summary: Some("it finished".to_string()),
                failure_reason: None,
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    assert_eq!(
        settled.snapshot.as_ref().unwrap().runs[0].status,
        RunStatus::Completed
    );
    assert_eq!(stored_run(&mut store, &run_id).provider_condition, None);
}

#[test]
fn a_delegator_may_complete_its_delegated_agents_run() {
    let (_dir, _path, mut store) = temp_store();
    let delegator = actor();
    // Actor RECORDS are delegation-free by construction; delegated_by is
    // runtime provenance on the resolved principal (token resolution), so the
    // record registers bare and only the command-context ref carries it.
    let delegated_agent_record = ActorRef {
        id: ActorId::new("agent:delegated-worker").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    let delegated_agent = ActorRef {
        delegated_by: Some(delegator.id.clone()),
        ..delegated_agent_record.clone()
    };
    register_actor(&mut store, &delegator);
    register_actor(&mut store, &delegated_agent_record);
    let session = accepted(
        create_session(
            &mut store,
            context(&delegated_agent, "idem:session:create:dlg", 100),
            session_request("Delegated session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&delegated_agent, "idem:dlg:turn:1", 110),
            session.session_id.clone(),
            turn_request("A delegated prompt."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.clone().unwrap();

    // The delegator behind the run's owner may legitimately settle it (the
    // positive branch of the owner guard), and the outcome records normally.
    let completed = accepted(
        complete_run(
            &mut store,
            context(&delegator, "idem:dlg:complete", 120),
            run_id,
            CompleteRunRequest {
                outcome: None,
                summary: None,
                failure_reason: None,
                provider_condition: None,
            },
        )
        .unwrap(),
    );
    let snap = completed.snapshot.as_ref().unwrap();
    assert_eq!(snap.runs[0].status, RunStatus::Completed);
    assert_eq!(snap.session.status, SessionStatus::Active);
}
