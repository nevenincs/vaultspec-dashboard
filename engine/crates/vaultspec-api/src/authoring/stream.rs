//! Authoring lifecycle stream and recovery surface (W11.P34).
//!
//! Lifecycle truth is replayed from the durable transactional outbox. Generation
//! tokens and live progress frames remain non-authoritative and are deferred to
//! the bounded generation phase; this module only exposes lifecycle replay,
//! explicit gaps, and snapshot-plus-next-sequence recovery.
#![allow(dead_code)]

use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};

use super::events::projector_feed_page;
use super::model::{CommandKind, RunId, SessionId};
use super::projections::ProjectionError;
use super::store::{StoreError, unit_of_work::UnitOfWork};
use crate::app::AppState;

pub(crate) const LIFECYCLE_REPLAY_PAGE_CAP: u32 = 128;
pub(crate) const GENERATION_CHANNEL_PLACEHOLDER_CAP: u32 = 0;

#[derive(Debug, Deserialize)]
pub(crate) struct EventStreamParams {
    #[serde(default)]
    pub last_seq: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RecoveryParams {
    #[serde(default)]
    pub last_seq: Option<i64>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub run_id: Option<String>,
}

pub(crate) async fn events(
    State(state): State<Arc<AppState>>,
    Query(params): Query<EventStreamParams>,
) -> Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>> {
    let result = state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
            lifecycle_replay_events(uow, params.last_seq.unwrap_or(0))
        })
    });
    let events = match result {
        Ok(events) => events,
        Err(err) => vec![stream_error_event(
            &state,
            "authoring_store_unavailable",
            &err,
        )],
    };

    Sse::new(tokio_stream::iter(events.into_iter().map(Ok)))
        .keep_alive(axum::response::sse::KeepAlive::default())
}

pub(crate) async fn recovery(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RecoveryParams>,
) -> Response {
    match validate_recovery_params(&params) {
        Ok(()) => {}
        Err(message) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                "authoring_recovery_request_invalid",
                &message,
            )
            .into_response();
        }
    }

    let worktree_root = state.active_workspace_root();
    let session_id = match params.session_id.as_deref().map(SessionId::new).transpose() {
        Ok(value) => value,
        Err(err) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                "authoring_recovery_request_invalid",
                &err.to_string(),
            )
            .into_response();
        }
    };
    let run_id = match params.run_id.as_deref().map(RunId::new).transpose() {
        Ok(value) => value,
        Err(err) => {
            return super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                "authoring_recovery_request_invalid",
                &err.to_string(),
            )
            .into_response();
        }
    };

    let data = state.with_authoring_store(|store| {
        store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
            let latest_outbox_seq = uow.outbox().latest_seq()?;
            let proposals = uow
                .projections()
                .list_proposals(&worktree_root)
                .map_err(|ProjectionError::Store(err)| err)?;
            let session_snapshot = match (&session_id, &run_id) {
                (Some(session_id), run_id) => {
                    Some(uow.sessions().snapshot(session_id, run_id.as_ref())?)
                }
                (None, Some(run_id)) => {
                    let run = uow.sessions().run(run_id)?.ok_or_else(|| {
                        StoreError::Session(format!("run `{run_id}` does not exist"))
                    })?;
                    Some(uow.sessions().snapshot(&run.session_id, Some(run_id))?)
                }
                (None, None) => None,
            };
            Ok(json!({
                "api_version": "v1",
                "family": "recovery",
                "latest_outbox_seq": latest_outbox_seq,
                "next_seq": latest_outbox_seq.saturating_add(1),
                "requested_last_seq": params.last_seq.unwrap_or(0),
                "snapshot": {
                    "proposals": proposals,
                    "session": session_snapshot,
                    "generation_channels": {
                        "implemented": false,
                        "cap": GENERATION_CHANNEL_PLACEHOLDER_CAP,
                        "authoritative": false,
                    }
                }
            }))
        })
    });

    match data {
        Ok(data) => super::response::snapshot(&state, data).into_response(),
        Err(StoreError::Session(err)) => super::response::typed_error(
            &state,
            StatusCode::UNPROCESSABLE_ENTITY,
            "authoring_session_refused",
            &err,
        )
        .into_response(),
        Err(err) => super::response::typed_error(
            &state,
            StatusCode::SERVICE_UNAVAILABLE,
            "authoring_store_unavailable",
            &format!("authoring store is unavailable: {err}"),
        )
        .into_response(),
    }
}

fn lifecycle_replay_events(uow: &UnitOfWork<'_>, last_seq: i64) -> Result<Vec<Event>, StoreError> {
    if last_seq < 0 {
        return Ok(vec![gap_event(json!({
            "reason": "invalid_last_seq",
            "requested_last_seq": last_seq,
        }))]);
    }

    let latest = uow.outbox().latest_seq()?;
    if last_seq > latest {
        return Ok(vec![gap_event(json!({
            "reason": "cursor_ahead_of_high_water",
            "requested_last_seq": last_seq,
            "latest_outbox_seq": latest,
            "next_recovery_seq": latest.saturating_add(1),
        }))]);
    }
    if latest.saturating_sub(last_seq) > i64::from(LIFECYCLE_REPLAY_PAGE_CAP) {
        return Ok(vec![gap_event(json!({
            "reason": "replay_window_exceeded",
            "requested_last_seq": last_seq,
            "latest_outbox_seq": latest,
            "next_recovery_seq": latest.saturating_add(1),
        }))]);
    }

    let events = uow
        .outbox()
        .events_after(last_seq, LIFECYCLE_REPLAY_PAGE_CAP)?;
    let feed = projector_feed_page(events, latest)?;
    let mut rendered = Vec::with_capacity(feed.items.len());
    for item in feed.items {
        rendered.push(
            Event::default()
                .event("lifecycle")
                .id(item.seq.to_string())
                .data(
                    serde_json::to_string(&item)
                        .map_err(|err| StoreError::Outbox(err.to_string()))?,
                ),
        );
    }
    Ok(rendered)
}

fn validate_recovery_params(params: &RecoveryParams) -> Result<(), String> {
    if params.last_seq.is_some_and(|seq| seq < 0) {
        return Err("last_seq must be non-negative".to_string());
    }
    Ok(())
}

fn gap_event(payload: Value) -> Event {
    Event::default().event("gap").data(payload.to_string())
}

fn stream_error_event(state: &AppState, kind: &str, err: &StoreError) -> Event {
    Event::default().event("error").data(
        json!({
            "error_kind": kind,
            "error": err.to_string(),
            "tiers": crate::routes::query_tiers(&state.active_cell()),
        })
        .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::super::api::CreateSessionRequest;
    use super::super::events::{
        LifecycleAggregateKind, LifecycleEventInput, LifecycleEventKind, lifecycle_event_draft,
    };
    use super::super::model::{
        ActorId, ActorKind, ActorRef, CommandKind, IdempotencyKey, SessionId,
    };
    use super::super::store::Store;
    use super::super::store::outbox::{AppendDecision, OutboxEventDraft};
    use super::*;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-30-authoring-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    fn temp_store() -> (tempfile::TempDir, std::path::PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = super::super::store::db_path(&vault_root);
        let store = Store::open(&vault_root).unwrap();
        (dir, path, store)
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:alice").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn draft(label: &str, event_kind: LifecycleEventKind) -> OutboxEventDraft {
        lifecycle_event_draft(LifecycleEventInput {
            event_id: format!("event:{label}"),
            dedupe_key: format!("dedupe:{label}"),
            aggregate_kind: LifecycleAggregateKind::Proposal,
            aggregate_id: format!("proposal_{label}"),
            event_kind,
            actor: actor(),
            command: Some(CommandKind::EditProposal),
            idempotency_key: Some(IdempotencyKey::new(format!("idem:{label}")).unwrap()),
            payload: json!({"label": label}),
            created_at_ms: 1_000,
        })
        .unwrap()
    }

    fn append_event(store: &mut Store, draft: OutboxEventDraft) {
        store
            .with_unit_of_work(CommandKind::EditProposal, |uow| {
                match uow.outbox().append_event(draft)? {
                    AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
                }
            })
            .unwrap();
    }

    fn render(event: &Event) -> String {
        format!("{event:?}")
    }

    async fn response_json(response: Response) -> Value {
        let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn replay_reads_durable_outbox_rows_after_last_sequence() {
        let (_dir, _path, mut store) = temp_store();
        append_event(
            &mut store,
            draft("first", LifecycleEventKind::ProposalUpdated),
        );
        append_event(
            &mut store,
            draft("second", LifecycleEventKind::ValidationUpdated),
        );

        let events = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                lifecycle_replay_events(uow, 1)
            })
            .unwrap();

        assert_eq!(events.len(), 1);
        let rendered = render(&events[0]);
        assert!(rendered.contains("lifecycle"), "{rendered}");
        assert!(rendered.contains("id: 2"), "{rendered}");
        assert!(rendered.contains("validation.updated"), "{rendered}");
        assert!(
            !rendered.contains("proposal.updated"),
            "last_seq=1 must not replay already-seen lifecycle rows: {rendered}"
        );
    }

    #[test]
    fn replay_survives_store_restart_from_durable_outbox() {
        let (_dir, path, mut store) = temp_store();
        append_event(
            &mut store,
            draft("restart", LifecycleEventKind::ProposalUpdated),
        );
        drop(store);

        let mut reopened = Store::open_at(&path).unwrap();
        let events = reopened
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                lifecycle_replay_events(uow, 0)
            })
            .unwrap();

        assert_eq!(events.len(), 1);
        let rendered = render(&events[0]);
        assert!(rendered.contains("lifecycle"), "{rendered}");
        assert!(rendered.contains("proposal.updated"), "{rendered}");
    }

    #[test]
    fn replay_window_gap_is_explicit_and_bounded() {
        let (_dir, _path, mut store) = temp_store();
        for idx in 0..=LIFECYCLE_REPLAY_PAGE_CAP {
            append_event(
                &mut store,
                draft(
                    &format!("window:{idx}"),
                    LifecycleEventKind::ProposalUpdated,
                ),
            );
        }

        let events = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                lifecycle_replay_events(uow, 0)
            })
            .unwrap();

        assert_eq!(events.len(), 1);
        let rendered = render(&events[0]);
        assert!(rendered.contains("gap"), "{rendered}");
        assert!(rendered.contains("replay_window_exceeded"), "{rendered}");
        assert!(
            rendered.contains("\\\"latest_outbox_seq\\\":129"),
            "gap payload carries the recovery high-water mark: {rendered}"
        );
    }

    #[test]
    fn negative_stream_cursor_yields_gap_event() {
        let (_dir, _path, mut store) = temp_store();
        let events = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                lifecycle_replay_events(uow, -1)
            })
            .unwrap();

        assert_eq!(events.len(), 1);
        let rendered = render(&events[0]);
        assert!(rendered.contains("gap"), "{rendered}");
        assert!(rendered.contains("invalid_last_seq"), "{rendered}");
        assert!(
            rendered.contains("\\\"requested_last_seq\\\":-1"),
            "{rendered}"
        );
    }

    #[test]
    fn cursor_ahead_of_high_water_yields_recovery_gap() {
        let (_dir, _path, mut store) = temp_store();
        append_event(
            &mut store,
            draft("high-water", LifecycleEventKind::ProposalUpdated),
        );

        let events = store
            .with_read_unit_of_work(CommandKind::SubscribeEvents, |uow| {
                lifecycle_replay_events(uow, 999)
            })
            .unwrap();

        assert_eq!(events.len(), 1);
        let rendered = render(&events[0]);
        assert!(rendered.contains("gap"), "{rendered}");
        assert!(
            rendered.contains("cursor_ahead_of_high_water"),
            "{rendered}"
        );
        assert!(
            rendered.contains("\\\"latest_outbox_seq\\\":1"),
            "gap payload carries durable high-water state: {rendered}"
        );
        assert!(
            rendered.contains("\\\"next_recovery_seq\\\":2"),
            "gap payload gives the frontend a recovery cursor: {rendered}"
        );
    }

    #[test]
    fn stream_error_event_carries_tiers() {
        let (_dir, state) = fixture_state();
        let event = stream_error_event(
            &state,
            "authoring_store_unavailable",
            &StoreError::Outbox("offline".to_string()),
        );

        let rendered = render(&event);
        assert!(rendered.contains("error"), "{rendered}");
        assert!(
            rendered.contains("authoring_store_unavailable"),
            "{rendered}"
        );
        assert!(rendered.contains("\\\"tiers\\\""), "{rendered}");
        assert!(rendered.contains("\\\"semantic\\\""), "{rendered}");
    }

    #[tokio::test]
    async fn recovery_snapshot_is_tiered_and_marks_generation_non_authoritative() {
        let (_dir, state) = fixture_state();
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::EditProposal, |uow| {
                    uow.outbox()
                        .append_event(draft("recovery", LifecycleEventKind::ProposalUpdated))?;
                    Ok(())
                })
            })
            .unwrap();

        let response = recovery(
            State(state.clone()),
            Query(RecoveryParams {
                last_seq: Some(0),
                session_id: None,
                run_id: None,
            }),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(body["data"]["family"], "recovery");
        assert_eq!(body["data"]["latest_outbox_seq"], 1);
        assert_eq!(body["data"]["next_seq"], 2);
        assert_eq!(body["data"]["requested_last_seq"], 0);
        assert_eq!(
            body["data"]["snapshot"]["generation_channels"]["implemented"],
            false
        );
        assert_eq!(
            body["data"]["snapshot"]["generation_channels"]["cap"],
            GENERATION_CHANNEL_PLACEHOLDER_CAP
        );
        assert_eq!(
            body["data"]["snapshot"]["generation_channels"]["authoritative"],
            false
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn recovery_serves_session_snapshot_after_w12() {
        let (_dir, state) = fixture_state();
        let session_id = SessionId::new("session_1").unwrap();
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.sessions().create_session(
                        session_id.clone(),
                        CreateSessionRequest {
                            scope: "stream-tests".to_string(),
                            title: "Stream recovery session".to_string(),
                        },
                        actor(),
                        1_000,
                    )?;
                    Ok(())
                })
            })
            .unwrap();

        let response = recovery(
            State(state),
            Query(RecoveryParams {
                last_seq: Some(0),
                session_id: Some("session_1".to_string()),
                run_id: None,
            }),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(
            body["data"]["snapshot"]["session"]["session"]["session_id"],
            "session_1"
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn recovery_route_is_mounted_and_tiered() {
        let (_dir, state) = fixture_state();
        let router = super::super::http::authoring_router(state.clone()).with_state(state);

        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/recovery?last_seq=0")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(body["data"]["family"], "recovery");
        assert_eq!(body["data"]["latest_outbox_seq"], 0);
        assert_eq!(body["data"]["next_seq"], 1);
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }
}
