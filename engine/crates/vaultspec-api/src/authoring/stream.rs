//! Authoring lifecycle stream and recovery surface (W11.P34, W12.P44).
//!
//! Lifecycle truth is replayed from the durable transactional outbox. Generation
//! tokens and live progress frames remain NON-AUTHORITATIVE: clients recover truth
//! through lifecycle replay or the tiered snapshot, never from raw frames
//! (streaming-events-outbox ADR). W12.P44 lands the deferred generation remainder:
//! BOUNDED generation channels (token/trace frames served under a hard per-page cap
//! with an explicit truncation gap) and the durable TRANSCRIPT COMPACTION hook —
//! terminal, past-due generation transcripts summarize by retention policy WITHOUT
//! ever touching pending approvals or rollback preimages (authoring-retention-is-
//! explicit; the retention engine enforces the protection).
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
use super::store::retention::CompactionRunSummary;
use super::store::{StoreError, unit_of_work::UnitOfWork};
use crate::app::{AppState, now_ms};

pub(crate) const LIFECYCLE_REPLAY_PAGE_CAP: u32 = 128;

/// The hard per-page cap on non-authoritative generation frames (token chunks and
/// tool traces). A channel that produces more than this in one page is truncated to
/// the cap with an explicit `dropped` count — raw frames are never allowed to grow
/// unbounded (resource-bounds: every accumulator bounded at creation).
pub(crate) const GENERATION_CHANNEL_FRAME_CAP: u32 = 256;

/// The bounded number of due generation transcripts one compaction sweep summarizes.
pub(crate) const GENERATION_TRANSCRIPT_COMPACTION_MAX: u32 = 64;

/// The stable summary hash a policy-driven generation-transcript compaction records
/// on each summarized transcript (the sweep replaces full payload with a summary).
pub(crate) const GENERATION_TRANSCRIPT_SUMMARY_HASH: &str = "generation-transcript-summary-v1";

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

    let now = now_ms();
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
            let generation_channels = generation_channels_snapshot(uow, latest_outbox_seq, now)?;
            Ok(json!({
                "api_version": "v1",
                "family": "recovery",
                "latest_outbox_seq": latest_outbox_seq,
                "next_seq": latest_outbox_seq.saturating_add(1),
                "requested_last_seq": params.last_seq.unwrap_or(0),
                "snapshot": {
                    "proposals": proposals,
                    "session": session_snapshot,
                    "generation_channels": generation_channels
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

/// The bounded, NON-AUTHORITATIVE generation-channel descriptor for the recovery
/// snapshot (W12.P44). It advertises the token + trace channels, their hard frame
/// cap, the cursor a frontend restores generation subscription from (aligned to the
/// lifecycle recovery point — generation truth is recovered through lifecycle replay,
/// not raw frames), and a READ-ONLY summary of the durable transcript retention +
/// compaction state. It never triggers compaction: that is a mutation and cannot run
/// on this read-only recovery path.
fn generation_channels_snapshot(
    uow: &UnitOfWork<'_>,
    latest_outbox_seq: i64,
    now_ms: i64,
) -> Result<Value, StoreError> {
    let retention = uow.retention().status(now_ms)?;
    // Generation subscription restores from the same point lifecycle recovery resumes:
    // a reconnecting client resubscribes to live frames here and recovers authoritative
    // truth via lifecycle replay from `next_generation_seq`.
    let next_generation_seq = latest_outbox_seq.saturating_add(1);
    Ok(json!({
        "implemented": true,
        "authoritative": false,
        "frame_cap": GENERATION_CHANNEL_FRAME_CAP,
        "channels": {
            "token": { "cap": GENERATION_CHANNEL_FRAME_CAP, "authoritative": false },
            "trace": { "cap": GENERATION_CHANNEL_FRAME_CAP, "authoritative": false }
        },
        "cursor": { "next_generation_seq": next_generation_seq },
        "transcripts": {
            "total": retention.total_records,
            "protected": retention.protected_records,
            "due_for_compaction": retention.compactable_due_records,
            "compacted": retention.compacted_records,
            "compaction_max_per_sweep": GENERATION_TRANSCRIPT_COMPACTION_MAX
        }
    }))
}

/// The TRANSCRIPT COMPACTION hook (W12.P44): summarize terminal, past-due generation
/// transcripts by retention policy, bounded to at most [`GENERATION_TRANSCRIPT_COMPACTION_MAX`]
/// per sweep. It delegates to the retention engine, which by construction compacts
/// ONLY `generation_transcript`/`review_material` records in a terminal lifecycle
/// state — pending approvals (protected product state), audit receipts, non-terminal
/// records, and rollback preimages are skipped, never discarded. A mutation: it must
/// run inside a mutating unit of work, never the read-only recovery path.
fn compact_generation_transcripts(
    uow: &UnitOfWork<'_>,
    run_id: &RunId,
    now_ms: i64,
) -> Result<CompactionRunSummary, StoreError> {
    uow.retention().compact_due(
        run_id.as_str(),
        now_ms,
        GENERATION_TRANSCRIPT_COMPACTION_MAX,
        GENERATION_TRANSCRIPT_SUMMARY_HASH,
    )
}

/// One bounded page of non-authoritative generation frames: the served frames capped
/// at [`GENERATION_CHANNEL_FRAME_CAP`], plus the count dropped past the cap. Raw
/// generation frames are transient and never durably accumulated; this is the serve-
/// time bound that keeps a noisy token/trace channel from crowding out product state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BoundedGenerationPage {
    pub served: Vec<Value>,
    pub dropped: usize,
}

/// Cap a batch of generation frames at the hard per-page frame cap, reporting how many
/// were dropped past it so the channel signals truncation rather than growing unbounded.
pub(crate) fn bounded_generation_page(frames: Vec<Value>) -> BoundedGenerationPage {
    let cap = GENERATION_CHANNEL_FRAME_CAP as usize;
    let total = frames.len();
    if total <= cap {
        return BoundedGenerationPage {
            served: frames,
            dropped: 0,
        };
    }
    BoundedGenerationPage {
        served: frames.into_iter().take(cap).collect(),
        dropped: total - cap,
    }
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
    use super::super::model::RunId;
    use super::super::model::{
        ActorId, ActorKind, ActorRef, CommandKind, IdempotencyKey, SessionId,
    };
    use super::super::store::Store;
    use super::super::store::outbox::{AppendDecision, OutboxEventDraft};
    use super::super::store::retention::{
        CompactionDecision, CompactionRequest, LifecycleStatus, PayloadState, RetentionClass,
        RetentionRecord, RetentionRecordRef,
    };
    use super::*;

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
        let channels = &body["data"]["snapshot"]["generation_channels"];
        assert_eq!(channels["implemented"], true);
        assert_eq!(
            channels["authoritative"], false,
            "generation is never authoritative"
        );
        assert_eq!(channels["frame_cap"], GENERATION_CHANNEL_FRAME_CAP);
        assert_eq!(
            channels["channels"]["token"]["cap"],
            GENERATION_CHANNEL_FRAME_CAP
        );
        assert_eq!(
            channels["channels"]["trace"]["cap"],
            GENERATION_CHANNEL_FRAME_CAP
        );
        // Frontend cursor restoration: the generation cursor aligns to the lifecycle
        // recovery point (latest_outbox_seq=1 → next=2).
        assert_eq!(channels["cursor"]["next_generation_seq"], 2);
        assert!(channels["transcripts"]["total"].is_number());
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

    // ---- W12.P44 bounded generation channels + transcript compaction -----------------

    #[test]
    fn generation_frames_stay_bounded_at_the_cap() {
        let cap = GENERATION_CHANNEL_FRAME_CAP as usize;

        // A page at or under the cap is served whole with nothing dropped.
        let under = bounded_generation_page(vec![json!({"t": "x"}); cap]);
        assert_eq!(under.served.len(), cap);
        assert_eq!(under.dropped, 0);

        // A noisy channel past the cap is truncated to the cap with the overflow counted
        // — raw frames never grow unbounded.
        let over = bounded_generation_page(vec![json!({"t": "x"}); cap + 5]);
        assert_eq!(over.served.len(), cap);
        assert_eq!(over.dropped, 5);
    }

    #[test]
    fn terminal_transcript_compacts_while_pending_approval_is_retained() {
        let (_dir, _path, mut store) = temp_store();
        let now = 10_000_000;

        // A terminal, past-due generation transcript — the compactable target.
        seed_retention(
            &mut store,
            "authoring_prompt_turn",
            "turn_terminal",
            RetentionClass::GenerationTranscript,
            LifecycleStatus::Superseded,
            Some(now - 1),
            now,
        );
        // A live pending approval as protected product state — lifecycle truth that must
        // never be compacted away, even though it is past the same due horizon.
        seed_retention(
            &mut store,
            "authoring_approval",
            "approval_pending",
            RetentionClass::ProtectedProductState,
            LifecycleStatus::Active,
            Some(now - 1),
            now,
        );

        let summary = store
            .with_unit_of_work(CommandKind::EditProposal, |uow| {
                compact_generation_transcripts(uow, &RunId::new("run:compact").unwrap(), now)
            })
            .unwrap();

        assert_eq!(
            summary.compacted_count, 1,
            "the terminal generation transcript is summarized"
        );
        assert_eq!(
            payload_state(&mut store, "authoring_prompt_turn", "turn_terminal"),
            PayloadState::Summarized,
        );
        assert_eq!(
            payload_state(&mut store, "authoring_approval", "approval_pending"),
            PayloadState::Full,
            "a pending approval is never discarded by generation-transcript compaction",
        );

        // Even if a pending approval were directly targeted for compaction, the retention
        // engine BLOCKS it (protected product state) — the protection is a hard refusal,
        // not merely an out-of-scope class filter.
        let decision = store
            .with_unit_of_work(CommandKind::EditProposal, |uow| {
                uow.retention().compact_record(CompactionRequest {
                    record_ref: RetentionRecordRef::new("authoring_approval", "approval_pending")
                        .unwrap(),
                    run_id: "run:compact".to_string(),
                    marker_id: "run:compact:direct".to_string(),
                    now_ms: now,
                    summary_json: Some("{\"summary\":\"x\"}".to_string()),
                    summary_hash: Some("hash:x".to_string()),
                    allow_rollback_limitation: false,
                    rollback_unavailable_reason: None,
                })
            })
            .unwrap();
        assert!(
            matches!(decision, CompactionDecision::Blocked(_)),
            "a directly-targeted pending approval must be Blocked, not compacted: {decision:?}"
        );
        assert_eq!(
            payload_state(&mut store, "authoring_approval", "approval_pending"),
            PayloadState::Full,
            "the pending approval payload stays Full after the blocked attempt",
        );
    }

    #[test]
    fn non_terminal_generation_transcript_is_retained_in_full() {
        let (_dir, _path, mut store) = temp_store();
        let now = 10_000_000;

        // An Active (non-terminal) transcript, even past its due horizon, is retained in
        // full — only terminal (rejected/superseded/expired) transcripts compact.
        seed_retention(
            &mut store,
            "authoring_prompt_turn",
            "turn_active",
            RetentionClass::GenerationTranscript,
            LifecycleStatus::Active,
            Some(now - 1),
            now,
        );

        let summary = store
            .with_unit_of_work(CommandKind::EditProposal, |uow| {
                compact_generation_transcripts(uow, &RunId::new("run:noop").unwrap(), now)
            })
            .unwrap();

        assert_eq!(summary.compacted_count, 0);
        assert_eq!(
            payload_state(&mut store, "authoring_prompt_turn", "turn_active"),
            PayloadState::Full,
        );
    }
}
