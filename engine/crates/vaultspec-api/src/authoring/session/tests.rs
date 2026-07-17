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
fn prompt_turn_joins_active_run_cancel_survives_restart() {
    let (_dir, path, mut store) = temp_store();
    let actor = actor();
    register_actor(&mut store, &actor);
    let session = accepted(
        create_session(
            &mut store,
            context(&actor, "idem:session:create:2", 100),
            session_request("Restart session"),
        )
        .unwrap(),
    );

    let started = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:1", 110),
            session.session_id.clone(),
            turn_request("Draft the implementation notes."),
        )
        .unwrap(),
    );
    let run_id = started.run_id.clone().expect("run id is returned");
    let snapshot = started.snapshot.as_ref().expect("turn returns snapshot");
    assert_eq!(started.status, "started");
    assert_eq!(snapshot.turns.len(), 1);
    assert_eq!(snapshot.active_run.as_ref().unwrap().run_id, run_id);

    let joined = accepted(
        start_prompt_turn(
            &mut store,
            context(&actor, "idem:session:turn:2", 120),
            session.session_id.clone(),
            turn_request("Second prompt joins active run."),
        )
        .unwrap(),
    );
    assert_eq!(joined.status, "joined");
    assert_eq!(joined.run_id, Some(run_id.clone()));
    assert_eq!(
        joined.snapshot.as_ref().unwrap().turns.len(),
        1,
        "joining an active run must not create a second prompt turn"
    );

    let cancelled = accepted(
        cancel_run(
            &mut store,
            context(&actor, "idem:session:cancel:1", 130),
            run_id.clone(),
            CancelRunRequest {
                reason: "user cancelled run".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(cancelled.status, "cancelled");
    assert!(cancelled.snapshot.as_ref().unwrap().active_run.is_none());
    assert_eq!(latest_seq(&mut store), 3);

    let cancelled_again = accepted(
        cancel_run(
            &mut store,
            context(&actor, "idem:session:cancel:2", 135),
            run_id.clone(),
            CancelRunRequest {
                reason: "user cancelled run".to_string(),
            },
        )
        .unwrap(),
    );
    assert_eq!(cancelled_again.status, "cancelled");
    assert_eq!(
        latest_seq(&mut store),
        3,
        "a second cancel command must not publish a duplicate lifecycle transition"
    );

    drop(store);
    let mut reopened = Store::open_at(&path).unwrap();
    let recovered = session_snapshot(&mut reopened, session.session_id.clone()).unwrap();
    assert_eq!(recovered.session.status, SessionStatus::Cancelled);
    assert!(recovered.active_run.is_none());
    assert_eq!(recovered.runs[0].status, RunStatus::Cancelled);

    let resumed = accepted(
        resume_run(
            &mut reopened,
            context(&actor, "idem:session:resume:1", 140),
            run_id,
            ResumeRunRequest {
                session_id: Some(session.session_id),
            },
        )
        .unwrap(),
    );
    assert_eq!(resumed.status, "joined");
    assert_eq!(
        resumed.snapshot.as_ref().unwrap().session.status,
        SessionStatus::Cancelled
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
                summary: Some("generation finished".to_string()),
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
                summary: Some("generation finished".to_string()),
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
            CompleteRunRequest { summary: None },
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
