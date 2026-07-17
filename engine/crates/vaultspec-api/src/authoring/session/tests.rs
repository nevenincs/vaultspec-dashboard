use std::collections::HashSet;
use std::path::PathBuf;

use super::super::actors::{ActorDisplayMetadata, ActorRecordInput};
use super::super::api::CreateProposalRequest;
use super::super::model::{ActorId, ActorKind, ChangesetId, IdempotencyKey};
use super::super::proposal::ProposalCommandContext;
use super::super::snapshots::SnapshotReader;
use super::super::store::Store;
use super::super::store::retention::{
    LifecycleStatus, PayloadState, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::*;

fn temp_store() -> (tempfile::TempDir, PathBuf, Store) {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");
    let path = super::super::store::db_path(&vault_root);
    let store = Store::open(&vault_root).unwrap();
    (dir, path, store)
}

fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:session-tester").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn register_actor(store: &mut Store, actor: &ActorRef) {
    store
        .with_unit_of_work(CommandKind::CreateSession, |uow| {
            uow.actors().put_record(ActorRecordInput::active(
                actor.clone(),
                ActorDisplayMetadata::new("Session tester", None),
                1,
            ))?;
            Ok(())
        })
        .unwrap();
}

fn context(actor: &ActorRef, key: &str, now_ms: i64) -> SessionCommandContext {
    SessionCommandContext {
        actor: actor.clone(),
        idempotency_key: IdempotencyKey::new(key).unwrap(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + 60_000),
        outcome_expires_at_ms: Some(now_ms + 3_600_000),
    }
}

fn session_request(title: &str) -> CreateSessionRequest {
    CreateSessionRequest {
        scope: "scope_sessions".to_string(),
        title: title.to_string(),
    }
}

fn turn_request(prompt: &str) -> StartPromptTurnRequest {
    StartPromptTurnRequest {
        prompt: prompt.to_string(),
        summary: Some("turn summary".to_string()),
    }
}

fn accepted(result: SessionCommandResult) -> SessionCommandOutcome {
    match result {
        SessionCommandResult::Accepted { outcome, .. } => outcome,
        other => panic!("expected accepted command, got {other:?}"),
    }
}

fn replayed(result: SessionCommandResult) -> SessionCommandOutcome {
    match result {
        SessionCommandResult::Replayed { outcome, .. } => outcome,
        other => panic!("expected replayed command, got {other:?}"),
    }
}

fn latest_seq(store: &mut Store) -> i64 {
    store
        .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            uow.outbox().latest_seq()
        })
        .unwrap()
}

fn event_kinds(store: &mut Store) -> Vec<String> {
    store
        .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            uow.outbox().events_after(0, 50)
        })
        .unwrap()
        .into_iter()
        .map(|event| event.event_kind)
        .collect()
}

fn other_actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:other-tester").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn seed_retention(
    store: &mut Store,
    kind: &str,
    id: &str,
    class: RetentionClass,
    status: LifecycleStatus,
    compact_after_ms: Option<i64>,
    now: i64,
) {
    store
        .with_unit_of_work(CommandKind::EditProposal, |uow| {
            let mut record = RetentionRecord::new(
                RetentionRecordRef::new(kind, id).unwrap(),
                kind,
                id,
                class,
                status,
                format!("hash:{id}"),
                now,
            )
            .unwrap();
            record.compact_after_ms = compact_after_ms;
            uow.retention().upsert_record(&record)?;
            Ok(())
        })
        .unwrap();
}

fn payload_state(store: &mut Store, kind: &str, id: &str) -> PayloadState {
    store
        .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            Ok(uow
                .retention()
                .record(&RetentionRecordRef::new(kind, id).unwrap())?
                .expect("retention record exists")
                .payload_state)
        })
        .unwrap()
}

/// S262: the compaction driver, exercised through the LIVE prompt-turn boundary (not a
/// direct `compact_due` call). Starting a prompt turn runs one bounded sweep that
/// summarizes a terminal generation transcript WHILE a co-located pending-approval
/// protected-product-state record stays Full — the P44 invariant realized through the
/// wiring.
#[test]
fn the_prompt_turn_hook_compacts_a_terminal_transcript_and_retains_a_pending_approval() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let now = 10_000_000;

    let session_id = SessionId::new("session_compaction").unwrap();
    store
        .with_unit_of_work(CommandKind::CreateSession, |uow| {
            uow.sessions().create_session(
                session_id.clone(),
                session_request("Compaction session"),
                actor.clone(),
                1_000,
            )?;
            Ok(())
        })
        .unwrap();

    // A terminal, past-due generation transcript (compactable) and a live pending
    // approval as protected product state (must be RETAINED), both past the due horizon.
    seed_retention(
        &mut store,
        "authoring_prompt_turn",
        "turn_terminal",
        RetentionClass::GenerationTranscript,
        LifecycleStatus::Superseded,
        Some(now - 1),
        now,
    );
    seed_retention(
        &mut store,
        "authoring_approval",
        "approval_pending",
        RetentionClass::ProtectedProductState,
        LifecycleStatus::Active,
        Some(now - 1),
        now,
    );

    // Drive the LIVE hook: starting a prompt turn runs one bounded compaction sweep in
    // its own turn-creation unit of work.
    accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:turn:compact", now),
            session_id,
            turn_request("please continue"),
        )
        .unwrap(),
    );

    assert_eq!(
        payload_state(&mut store, "authoring_prompt_turn", "turn_terminal"),
        PayloadState::Summarized,
        "the prompt-turn hook compacted the terminal generation transcript"
    );
    assert_eq!(
        payload_state(&mut store, "authoring_approval", "approval_pending"),
        PayloadState::Full,
        "the hook never compacts a pending approval (protected product state)"
    );
}

#[test]
fn create_session_persists_replays_and_conflicts_without_duplicate_events() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);

    let first = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:1", 10),
            session_request("Agentic session"),
        )
        .unwrap(),
    );

    assert_eq!(first.command, CommandKind::CreateSession);
    assert_eq!(first.status, "created");
    assert_eq!(latest_seq(&mut store), 1);

    let replay = replayed(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:1", 20),
            session_request("Agentic session"),
        )
        .unwrap(),
    );

    assert_eq!(replay.session_id, first.session_id);
    assert_eq!(replay.receipt_id, first.receipt_id);
    assert_eq!(
        latest_seq(&mut store),
        1,
        "idempotent replay must not append another session.created event"
    );

    let conflict = create_session(
        &mut store,
        context(&actor, "idem:session:create:1", 30),
        session_request("Different title"),
    )
    .unwrap_err();
    assert!(
        matches!(conflict, StoreError::Idempotency(_)),
        "same key with different payload must conflict, got {conflict:?}"
    );
}

#[test]
fn second_turn_queues_behind_active_run_without_joining() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:q", 100),
            session_request("Queue session"),
        )
        .unwrap(),
    );

    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:1", 110),
            session.session_id.clone(),
            turn_request("First prompt starts a run."),
        )
        .unwrap(),
    );
    let run1 = started.run_id.clone().expect("run id is returned");
    assert_eq!(started.status, "started");

    // A second prompt submitted mid-run is ENQUEUED (D2), never joined: it is a real
    // second turn with no run yet, and the first run stays active.
    let queued = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:2", 120),
            session.session_id.clone(),
            turn_request("Second prompt queues behind the run."),
        )
        .unwrap(),
    );
    assert_eq!(queued.status, "queued");
    assert_eq!(queued.run_id, None, "a queued turn has no run yet");
    let snap = queued.snapshot.as_ref().unwrap();
    assert_eq!(
        snap.turns.len(),
        2,
        "the queued turn is persisted as a real second turn, not folded into the run"
    );
    assert_eq!(
        snap.queued_turn_ids.len(),
        1,
        "the second turn is served as queued"
    );
    assert_eq!(
        snap.active_run.as_ref().unwrap().run_id,
        run1,
        "the first run stays active while the second turn waits"
    );
    // Enqueue emits turn.queued, not a second run.started.
    assert_eq!(
        event_kinds(&mut store),
        vec!["session.created", "run.started", "turn.queued"]
    );
}

#[test]
fn run_cancel_is_run_scoped_preserves_session_and_promotes_next_queued_turn() {
    let (_dir, path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:rc", 100),
            session_request("Run-cancel session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:1", 110),
            session.session_id.clone(),
            turn_request("First prompt starts a run."),
        )
        .unwrap(),
    );
    let run1 = started.run_id.clone().unwrap();
    accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:2", 120),
            session.session_id.clone(),
            turn_request("Second prompt queues."),
        )
        .unwrap(),
    );

    // Cancelling the run leaves the SESSION active (D2 — Stop stops the run, not the
    // conversation) and atomically promotes the queued turn into a fresh run.
    let cancelled = accepted(
        cancel_run(
            &mut store,
            context(&actor, "idem:session:cancel:1", 130),
            run1.clone(),
            CancelRunRequest {
                reason: "user stopped the run".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(cancelled.status, "cancelled");
    let snap = cancelled.snapshot.as_ref().unwrap();
    assert_eq!(
        snap.session.status,
        SessionStatus::Active,
        "D2: a run-scoped cancel must leave the session active"
    );
    let promoted = snap
        .active_run
        .as_ref()
        .expect("the queued turn was promoted into a fresh active run");
    assert_ne!(promoted.run_id, run1, "promotion mints a new run");
    assert!(
        snap.queued_turn_ids.is_empty(),
        "the queue drained when its turn was promoted"
    );
    assert_eq!(
        event_kinds(&mut store),
        vec![
            "session.created",
            "run.started",
            "turn.queued",
            "cancellation.recorded",
            "run.started",
        ],
        "promotion emits run.started exactly as a direct start does"
    );

    // The promoted run and the cancelled run both survive a restart — proof they
    // committed in one unit of work.
    drop(store);
    let mut reopened = Store::open_at(&path).unwrap();
    let recovered = session_snapshot(&mut reopened, session.session_id.clone()).unwrap();
    assert_eq!(recovered.session.status, SessionStatus::Active);
    assert_eq!(
        recovered.active_run.as_ref().unwrap().run_id,
        promoted.run_id
    );

    // A second cancel of the already-terminal run is an idempotent no-op transition.
    let seq_before = latest_seq(&mut reopened);
    let cancelled_again = accepted(
        cancel_run(
            &mut reopened,
            context(&actor, "idem:session:cancel:2", 135),
            run1,
            CancelRunRequest {
                reason: "user stopped the run".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(cancelled_again.status, "cancelled");
    assert_eq!(
        latest_seq(&mut reopened),
        seq_before,
        "a second cancel of a terminal run publishes no duplicate transition"
    );
}

#[test]
fn queue_cap_overflow_is_a_typed_error() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:cap", 100),
            session_request("Queue cap session"),
        )
        .unwrap(),
    );
    // One active run, then fill the queue to TURN_QUEUE_CAP.
    accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:cap:turn:0", 110),
            session.session_id.clone(),
            turn_request("Prompt 0 starts the run."),
        )
        .unwrap(),
    );
    for i in 0..TURN_QUEUE_CAP {
        let queued = accepted(
            start_prompt_turn(
                &mut store,
                context(&actor, &format!("idem:cap:turn:{}", i + 1), 120 + i),
                session.session_id.clone(),
                turn_request(&format!("Queued prompt {i}.")),
            )
            .unwrap(),
        );
        assert_eq!(queued.status, "queued");
    }
    // The (cap + 1)-th pending turn overflows with a typed queue-full error.
    let overflow = start_prompt_turn(
        &mut store,
        context(&actor, "idem:cap:overflow", 200),
        session.session_id.clone(),
        turn_request("One prompt too many."),
    )
    .unwrap_err();
    assert!(
        matches!(overflow, StoreError::TurnQueueFull(_)),
        "the {}th pending turn is a typed queue-full error, got {overflow:?}",
        TURN_QUEUE_CAP + 1
    );
}

#[test]
fn session_cancel_emits_dual_events_and_voids_the_queue() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:sc", 100),
            session_request("Session-cancel session"),
        )
        .unwrap(),
    );
    accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:sc:turn:1", 110),
            session.session_id.clone(),
            turn_request("First prompt starts a run."),
        )
        .unwrap(),
    );
    let queued = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:sc:turn:2", 120),
            session.session_id.clone(),
            turn_request("Second prompt queues."),
        )
        .unwrap(),
    );
    let queued_turn_id = queued.snapshot.as_ref().unwrap().queued_turn_ids[0].clone();

    let cancelled = accepted(
        cancel_session(
            &mut store,
            context(&actor, "idem:sc:cancel", 130),
            session.session_id.clone(),
            CancelSessionRequest {
                reason: "end the conversation".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(cancelled.status, "cancelled");
    let snap = cancelled.snapshot.as_ref().unwrap();
    assert_eq!(snap.session.status, SessionStatus::Cancelled);
    assert!(snap.active_run.is_none(), "the active run was cancelled");
    assert!(
        snap.queued_turn_ids.is_empty(),
        "a voided turn is no longer queued"
    );
    // The queued turn is VOIDED: readable history, but never promoted into a run.
    let voided = snap
        .turns
        .iter()
        .find(|turn| turn.turn_id == queued_turn_id)
        .expect("the queued turn remains readable history");
    assert_eq!(
        voided.queue_state,
        TurnQueueState::Voided,
        "session cancel voids the queue rather than promoting it"
    );
    assert!(
        !snap.runs.iter().any(|run| run.active),
        "no queued turn was promoted into a cancelled session"
    );
    // Session cancel emits BOTH the run cancellation and the new session.cancelled kind.
    let kinds = event_kinds(&mut store);
    assert!(
        kinds.contains(&"cancellation.recorded".to_string()),
        "the active run records its cancellation: {kinds:?}"
    );
    assert!(
        kinds.contains(&"session.cancelled".to_string()),
        "the session records its own session.cancelled kind: {kinds:?}"
    );
    assert!(
        !kinds.iter().rev().take(2).any(|kind| kind == "run.started"),
        "session cancel promotes nothing, so no run.started follows: {kinds:?}"
    );
}

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
            super::super::events::projector_feed_page(uow.outbox().events_after(0, 50)?, latest)
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
fn session_listing_is_bounded_and_reports_next_marker() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);

    for index in 0..105 {
        let key = format!("idem:session:list:{index}");
        let title = format!("Session {index:03}");
        let outcome = accepted(
            create_session(
                &mut store,
                context(&actor, &key, 1_000),
                session_request(&title),
            )
            .unwrap(),
        );
        assert_eq!(outcome.status, "created");
    }

    let page = list_sessions(&mut store, 50, None, None).unwrap();

    assert_eq!(page.items.len(), 50);
    assert_eq!(page.cap, 50);
    assert!(page.truncated);
    assert!(page.next_after_ms.is_some());
    assert!(page.next_after_session_id.is_some());

    let first_page_ids = page
        .items
        .iter()
        .map(|record| record.session_id.as_str().to_string())
        .collect::<HashSet<_>>();
    let next = list_sessions(
        &mut store,
        50,
        page.next_after_ms,
        page.next_after_session_id.clone(),
    )
    .unwrap();
    assert_eq!(next.items.len(), 50);
    for record in next.items {
        assert!(
            !first_page_ids.contains(record.session_id.as_str()),
            "timestamp-tied cursor must not repeat or skip by relying on timestamp only"
        );
    }
}

#[test]
fn proposal_creation_rejects_unknown_session_id() {
    let (dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let worktree = dir.path();
    std::fs::create_dir_all(worktree.join(".vault/plan")).unwrap();
    let reader = SnapshotReader::for_worktree(worktree.to_path_buf());

    let err = super::super::proposal::create_proposal(
        &mut store,
        &reader,
        ProposalCommandContext {
            actor,
            idempotency_key: IdempotencyKey::new("idem:proposal:unknown-session").unwrap(),
            now_ms: 2_000,
            in_flight_expires_at_ms: Some(62_000),
            outcome_expires_at_ms: Some(3_602_000),
        },
        CreateProposalRequest {
            session_id: SessionId::new("session_missing").unwrap(),
            changeset_id: ChangesetId::new("changeset_missing_session").unwrap(),
            summary: "Missing session proposal".to_string(),
            operations: Vec::new(),
        },
    )
    .unwrap_err();

    assert!(
        matches!(err, StoreError::Session(_)),
        "unknown session ids must fail before proposal state is recorded, got {err:?}"
    );
    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger()
                .latest(&ChangesetId::new("changeset_missing_session").unwrap())
        })
        .unwrap();
    assert!(latest.is_none());
}

#[test]
fn recovery_snapshot_can_be_read_by_session_or_run() {
    let (_dir, _path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:recovery", 3_000),
            session_request("Recovery session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:recovery", 3_010),
            session.session_id.clone(),
            turn_request("Recover this run."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.expect("run id");

    let by_session = store
        .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            uow.sessions().snapshot(&session.session_id, None)
        })
        .unwrap();
    let by_run = store
        .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            uow.sessions().snapshot(&session.session_id, Some(&run_id))
        })
        .unwrap();

    assert_eq!(by_session.session.session_id, session.session_id);
    assert_eq!(by_run.active_run.unwrap().run_id, run_id);
    assert_eq!(by_session.caps.turn_cap, RECOVERY_TURN_CAP);
    assert_eq!(by_session.caps.run_cap, RECOVERY_RUN_CAP);
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
            },
        )
        .unwrap(),
    );
    let snap = failed.snapshot.as_ref().unwrap();
    assert_eq!(snap.runs[0].status, RunStatus::Failed);
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
            },
        )
        .unwrap(),
    );
    let snap = completed.snapshot.as_ref().unwrap();
    assert_eq!(snap.runs[0].status, RunStatus::Completed);
    assert_eq!(snap.session.status, SessionStatus::Active);
}
