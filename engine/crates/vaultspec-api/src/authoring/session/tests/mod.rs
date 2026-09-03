//! Session-store test suite, decomposed into shared fixtures plus two scoped
//! groups: the session/turn/queue surfaces and the run-settlement surfaces.
//! The fixtures stay in this module because `janitor`'s own tests reach them
//! by the `session::tests::` path.

use std::collections::HashSet;
use std::path::PathBuf;

use vaultspec_product::a2a_contract::A2A_PROVIDER_CONDITIONS;

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

mod lifecycle;
mod settlement;

pub(super) fn temp_store() -> (tempfile::TempDir, PathBuf, Store) {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");
    let path = super::super::store::db_path(&vault_root);
    let store = Store::open(&vault_root).unwrap();
    (dir, path, store)
}

pub(super) fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:session-tester").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

pub(super) fn register_actor(store: &mut Store, actor: &ActorRef) {
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

pub(super) fn context(actor: &ActorRef, key: &str, now_ms: i64) -> SessionCommandContext {
    SessionCommandContext {
        actor: actor.clone(),
        idempotency_key: IdempotencyKey::new(key).unwrap(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + 60_000),
        outcome_expires_at_ms: Some(now_ms + 3_600_000),
    }
}

pub(super) fn session_request(title: &str) -> CreateSessionRequest {
    CreateSessionRequest {
        scope: "scope_sessions".to_string(),
        title: title.to_string(),
    }
}

pub(super) fn turn_request(prompt: &str) -> StartPromptTurnRequest {
    StartPromptTurnRequest {
        prompt: prompt.to_string(),
        summary: Some("turn summary".to_string()),
        feedback_batch_id: None,
    }
}

pub(super) fn accepted(result: SessionCommandResult) -> SessionCommandOutcome {
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

pub(super) fn event_kinds(store: &mut Store) -> Vec<String> {
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

pub(super) fn seed_retention(
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

pub(super) fn payload_state(store: &mut Store, kind: &str, id: &str) -> PayloadState {
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

/// Set up a session with one active run, ready to be settled.
fn run_awaiting_settlement(store: &mut Store, owner: &ActorRef, tag: &str) -> RunId {
    register_actor(store, owner);
    let session = accepted(
        create_session(
            store,
            context(owner, &format!("idem:session:create:{tag}"), 100),
            session_request("Provider-condition session"),
        )
        .unwrap(),
    );
    let started = accepted(
        start_prompt_turn(
            store,
            context(owner, &format!("idem:{tag}:turn:1"), 110),
            session.session_id,
            turn_request("A prompt whose provider refuses."),
        )
        .unwrap(),
    );
    started.run_id.unwrap()
}

fn stored_run(store: &mut Store, run_id: &RunId) -> RunRecord {
    store
        .with_read_unit_of_work(CommandKind::ReadContext, |uow| uow.sessions().run(run_id))
        .unwrap()
        .expect("the settled run is readable")
}
