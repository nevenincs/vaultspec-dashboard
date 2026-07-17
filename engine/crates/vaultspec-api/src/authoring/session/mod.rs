//! Durable authoring sessions, prompt turns, run ownership, and recovery snapshots.
//!
//! W12.P25 stores workflow state owned by the authoring backend. LangGraph ids
//! are correlation references only; the session, turn, run, cancellation, and
//! recovery surfaces below are product state in the authoring store.

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::actors::{actor_kind_from_name, actor_kind_name};
use super::api::{
    CancelRunRequest, CancelSessionRequest, CloseSessionRequest, CompleteRunRequest,
    CreateSessionRequest, ResumeRunRequest, RunOutcome, StartPromptTurnRequest,
};
use super::events::{
    LifecycleAggregateKind, LifecycleEventInput, LifecycleEventKind, lifecycle_event_draft,
};
use super::model::{
    ActorId, ActorRef, CommandKind, IdempotencyKey, LangGraphRef, ReceiptId, RunId, SessionId,
};
use super::store::idempotency::{
    IdempotencyConflict, IdempotencyKeyScope, IdempotencyRecord, IdempotencyScope,
    InFlightReservation, OutcomeKind, RecordedOutcome, ReplayLookup, ReserveDecision,
};
use super::store::outbox::AppendDecision;
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef, RetentionRepository,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, Store, StoreError};

const OUTCOME_SCHEMA: &str = "authoring.session_command_outcome.v1";
const SESSION_RECORD_SCHEMA: &str = "authoring.session.v1";
const PROMPT_TURN_RECORD_SCHEMA: &str = "authoring.prompt_turn.v1";
const RUN_RECORD_SCHEMA: &str = "authoring.run.v1";
pub(crate) const SESSION_LIST_CAP_DEFAULT: u32 = 50;
pub(crate) const SESSION_LIST_CAP_MAX: u32 = 100;
pub(crate) const PROMPT_TEXT_MAX_BYTES: usize = 64 * 1024;
const RECOVERY_TURN_CAP: u32 = 20;
const RECOVERY_RUN_CAP: u32 = 20;
/// The bounded per-session turn queue depth (D2). A turn submitted while a run is
/// active is enqueued rather than joined; the ninth pending turn is a typed 422.
pub(crate) const TURN_QUEUE_CAP: i64 = 8;

mod types;
pub use types::*;
mod validate;
use validate::*;
mod commands;
pub use commands::*;

#[cfg(test)]
mod tests;

pub struct SessionRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    retention: RetentionRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn sessions<'repo>(&'repo self) -> SessionRepository<'repo, 'conn> {
        SessionRepository {
            repo: self.repository("authoring_sessions"),
            retention: self.retention(),
        }
    }
}

impl SessionRepository<'_, '_> {
    pub fn create_session(
        &self,
        session_id: SessionId,
        input: CreateSessionRequest,
        actor: ActorRef,
        now_ms: i64,
    ) -> StoreResult<AuthoringSessionRecord> {
        validate_title(&input.title)?;
        validate_scope(&input.scope)?;
        let record = AuthoringSessionRecord {
            schema_version: SESSION_RECORD_SCHEMA.to_string(),
            session_id,
            scope: input.scope,
            title: input.title,
            status: SessionStatus::Active,
            actor,
            langgraph: None,
            latest_turn_id: None,
            latest_run_id: None,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
            cancelled_at_ms: None,
            closed_at_ms: None,
        };
        self.insert_or_update_session(&record)?;
        self.register_session_retention(&record)?;
        Ok(record)
    }

    /// Start a prompt turn. When the session has no active run the turn starts its own
    /// fresh run immediately (`Some(run)` — the `Direct` path). When a run is already
    /// active the turn is ENQUEUED (D2): persisted as a `Queued` turn with no run yet
    /// (`None`), bounded by [`TURN_QUEUE_CAP`] per session — the mid-run JOIN arm is
    /// deleted, so a second prompt is never silently folded into the running turn.
    pub fn start_prompt_turn(
        &self,
        session_id: &SessionId,
        input: StartPromptTurnRequest,
        actor: ActorRef,
        now_ms: i64,
    ) -> StoreResult<(PromptTurnRecord, Option<RunRecord>)> {
        validate_prompt(&input.prompt)?;
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if session.status != SessionStatus::Active {
            return Err(StoreError::Session(format!(
                "session `{session_id}` is not active"
            )));
        }

        let has_active_run = self.active_run(session_id)?.is_some();
        if has_active_run && self.queued_turn_count(session_id)? >= TURN_QUEUE_CAP {
            return Err(StoreError::TurnQueueFull(format!(
                "session `{session_id}` already has {TURN_QUEUE_CAP} turns queued"
            )));
        }

        let turn_index = self.next_turn_index(session_id)?;
        let prompt_digest = digest_value("prompt", &input.prompt)?;
        let turn_id = derive_turn_id(session_id, turn_index, &prompt_digest)?;
        let langgraph = session.langgraph.clone();
        let prompt_bytes = i64::try_from(input.prompt.len()).map_err(|_| {
            StoreError::Session("prompt length does not fit signed storage".to_string())
        })?;
        let queue_state = if has_active_run {
            TurnQueueState::Queued
        } else {
            TurnQueueState::Direct
        };
        let turn = PromptTurnRecord {
            schema_version: PROMPT_TURN_RECORD_SCHEMA.to_string(),
            turn_id: turn_id.clone(),
            session_id: session_id.clone(),
            turn_index,
            prompt_digest,
            prompt_text: input.prompt,
            prompt_bytes,
            summary: input.summary,
            actor: actor.clone(),
            langgraph: langgraph.clone(),
            created_at_ms: now_ms,
            queue_state,
            feedback_batch_id: input.feedback_batch_id,
        };
        self.insert_turn(&turn)?;
        self.register_turn_retention(&turn)?;
        session.latest_turn_id = Some(turn.turn_id.clone());
        session.updated_at_ms = now_ms;

        if has_active_run {
            self.insert_or_update_session(&session)?;
            return Ok((turn, None));
        }

        let run = self.open_run_for_turn(&turn, langgraph, now_ms)?;
        session.latest_run_id = Some(run.run_id.clone());
        self.insert_or_update_session(&session)?;
        Ok((turn, Some(run)))
    }

    /// Materialize a fresh `Active` run owning `turn` — the shared body of a direct
    /// start and a FIFO promotion, so both paths mint identical run records. The run
    /// is owned by the turn's own actor (the principal that submitted the prompt).
    fn open_run_for_turn(
        &self,
        turn: &PromptTurnRecord,
        langgraph: Option<LangGraphRef>,
        now_ms: i64,
    ) -> StoreResult<RunRecord> {
        let run_id = derive_run_id(&turn.session_id, &turn.turn_id)?;
        let run = RunRecord {
            schema_version: RUN_RECORD_SCHEMA.to_string(),
            run_id,
            session_id: turn.session_id.clone(),
            turn_id: Some(turn.turn_id.clone()),
            status: RunStatus::Active,
            active: true,
            owner: turn.actor.clone(),
            langgraph,
            cancellation_reason: None,
            failure_reason: None,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
            cancelled_at_ms: None,
            completed_at_ms: None,
        };
        self.insert_or_update_run(&run)?;
        self.register_run_retention(&run)?;
        Ok(run)
    }

    /// Promote the oldest queued turn (FIFO by `turn_index`) into a fresh `Active` run,
    /// inside the SAME unit of work as the settle/cancel that drained the prior run (D2)
    /// — so a crash between settle and promote cannot strand a queued turn. Promotes
    /// only in a still-`Active` session; a cancelled session's queue is voided, never
    /// promoted. Returns the new run (for the `run.started` event) or `None` when the
    /// queue is empty.
    pub fn promote_next_queued_turn(
        &self,
        session_id: &SessionId,
        now_ms: i64,
    ) -> StoreResult<Option<RunRecord>> {
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if session.status != SessionStatus::Active {
            return Ok(None);
        }
        let Some(mut turn) = self.oldest_queued_turn(session_id)? else {
            return Ok(None);
        };
        turn.queue_state = TurnQueueState::Promoted;
        self.persist_turn_queue_state(&turn)?;
        self.register_turn_retention(&turn)?;
        let run = self.open_run_for_turn(&turn, session.langgraph.clone(), now_ms)?;
        session.latest_turn_id = Some(turn.turn_id.clone());
        session.latest_run_id = Some(run.run_id.clone());
        session.updated_at_ms = now_ms;
        self.insert_or_update_session(&session)?;
        Ok(Some(run))
    }

    /// Cancel a single run (D2 run-scoped). The run transitions to `Cancelled`; the
    /// owning session is LEFT `Active` (the D2 cutover deleted the session cascade), so
    /// Stop halts the run and the conversation continues — the caller promotes the next
    /// queued turn into the freed session. Terminal runs replay as an idempotent no-op.
    pub fn cancel_run(
        &self,
        run_id: &RunId,
        input: CancelRunRequest,
        now_ms: i64,
    ) -> StoreResult<(RunRecord, bool)> {
        validate_reason(&input.reason)?;
        let mut run = self
            .run(run_id)?
            .ok_or_else(|| StoreError::Session(format!("run `{run_id}` does not exist")))?;
        if matches!(
            run.status,
            RunStatus::Cancelled | RunStatus::Completed | RunStatus::Failed
        ) {
            return Ok((run, false));
        }
        run.status = RunStatus::Cancelled;
        run.active = false;
        run.cancellation_reason = Some(input.reason);
        run.updated_at_ms = now_ms;
        run.cancelled_at_ms = Some(now_ms);
        self.insert_or_update_run(&run)?;
        self.register_run_retention(&run)?;
        Ok((run, true))
    }

    /// Explicitly cancel a whole session (D2). Cancels the active run if one exists
    /// (emitting nothing here — the caller owns events), VOIDS every queued turn in the
    /// SAME unit of work (no promotion into a cancelled session; voided turns stay
    /// readable history but are never runnable), and marks the session `Cancelled`.
    /// Returns the session, the cancelled run (if any), and whether anything changed —
    /// an already-terminal session replays as an idempotent no-op.
    pub fn cancel_session(
        &self,
        session_id: &SessionId,
        input: CancelSessionRequest,
        now_ms: i64,
    ) -> StoreResult<(AuthoringSessionRecord, Option<RunRecord>, bool)> {
        validate_reason(&input.reason)?;
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if session.status != SessionStatus::Active {
            return Ok((session, None, false));
        }
        let cancelled_run = if let Some(mut run) = self.active_run(session_id)? {
            run.status = RunStatus::Cancelled;
            run.active = false;
            run.cancellation_reason = Some(input.reason.clone());
            run.updated_at_ms = now_ms;
            run.cancelled_at_ms = Some(now_ms);
            self.insert_or_update_run(&run)?;
            self.register_run_retention(&run)?;
            Some(run)
        } else {
            None
        };
        self.void_queued_turns(session_id, now_ms)?;
        session.status = SessionStatus::Cancelled;
        session.updated_at_ms = now_ms;
        session.cancelled_at_ms = Some(now_ms);
        self.insert_or_update_session(&session)?;
        self.register_session_retention(&session)?;
        Ok((session, cancelled_run, true))
    }

    /// Gracefully close a session (S13): the BENIGN terminal path, `Active` → `Closed`.
    /// Unlike `cancel_session` this never tears down work — a session with a genuinely
    /// active run is REFUSED (cancel the run or await its settlement first), so a close
    /// only ever retires a quiescent session. Returns the session and whether anything
    /// changed: an already-terminal session (`Closed` OR `Cancelled`) replays as an
    /// idempotent no-op, mirroring `cancel_session`'s non-`Active` re-entry semantics.
    pub fn close_session(
        &self,
        session_id: &SessionId,
        input: CloseSessionRequest,
        now_ms: i64,
    ) -> StoreResult<(AuthoringSessionRecord, bool)> {
        if let Some(reason) = input.reason.as_deref() {
            validate_reason(reason)?;
        }
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if session.status != SessionStatus::Active {
            return Ok((session, false));
        }
        if let Some(run) = self.active_run(session_id)? {
            return Err(StoreError::Session(format!(
                "cannot close session `{session_id}` while run `{}` is active; cancel the run or await its completion",
                run.run_id
            )));
        }
        session.status = SessionStatus::Closed;
        session.updated_at_ms = now_ms;
        session.closed_at_ms = Some(now_ms);
        self.insert_or_update_session(&session)?;
        self.register_session_retention(&session)?;
        Ok((session, true))
    }

    /// Settle an active run into its terminal state (D1). The reported `outcome`
    /// (`completed` — the default preserving pre-outcome callers — or `failed`) picks
    /// the terminal `RunStatus`; a `failed` outcome may carry a `failure_reason`, a
    /// `completed` one must not. Authorization is owner-only: the settling `actor` must
    /// be the run's owner or its delegator (a typed `RunForbidden` 403 otherwise) —
    /// nobody else may forge settlement. A terminal run replays idempotently. The
    /// session is LEFT `Active`; the caller promotes the next queued turn.
    pub fn complete_run(
        &self,
        run_id: &RunId,
        input: CompleteRunRequest,
        actor: &ActorRef,
        now_ms: i64,
    ) -> StoreResult<(RunRecord, bool)> {
        validate_completion_summary(input.summary.as_deref())?;
        let outcome = input.outcome.unwrap_or(RunOutcome::Completed);
        match outcome {
            RunOutcome::Failed => validate_failure_reason(input.failure_reason.as_deref())?,
            RunOutcome::Completed if input.failure_reason.is_some() => {
                return Err(StoreError::Session(
                    "a completed run carries no failure_reason".to_string(),
                ));
            }
            RunOutcome::Completed => {}
        }
        let mut run = self
            .run(run_id)?
            .ok_or_else(|| StoreError::Session(format!("run `{run_id}` does not exist")))?;
        authorize_run_owner(&run, actor)?;
        if matches!(
            run.status,
            RunStatus::Cancelled | RunStatus::Completed | RunStatus::Failed
        ) {
            return Ok((run, false));
        }
        run.status = match outcome {
            RunOutcome::Completed => RunStatus::Completed,
            RunOutcome::Failed => RunStatus::Failed,
        };
        run.active = false;
        run.failure_reason = input.failure_reason;
        run.updated_at_ms = now_ms;
        run.completed_at_ms = Some(now_ms);
        self.insert_or_update_run(&run)?;
        self.register_run_retention(&run)?;
        Ok((run, true))
    }

    pub fn resume_run(
        &self,
        run_id: &RunId,
        input: ResumeRunRequest,
    ) -> StoreResult<SessionSnapshot> {
        let run = self
            .run(run_id)?
            .ok_or_else(|| StoreError::Session(format!("run `{run_id}` does not exist")))?;
        if let Some(session_id) = input.session_id
            && session_id != run.session_id
        {
            return Err(StoreError::Session(format!(
                "run `{run_id}` does not belong to session `{session_id}`"
            )));
        }
        self.snapshot(&run.session_id, Some(run_id))
    }

    pub fn attach_session_langgraph_ref(
        &self,
        session_id: &SessionId,
        langgraph: LangGraphRef,
        now_ms: i64,
    ) -> StoreResult<AuthoringSessionRecord> {
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        session.langgraph = Some(merge_langgraph_ref(
            session.langgraph.take(),
            langgraph,
            "session",
            session_id.as_str(),
        )?);
        session.updated_at_ms = now_ms;
        self.insert_or_update_session(&session)?;
        self.register_session_retention(&session)?;
        Ok(session)
    }

    pub fn attach_run_langgraph_ref(
        &self,
        run_id: &RunId,
        langgraph: LangGraphRef,
        now_ms: i64,
    ) -> StoreResult<RunRecord> {
        if langgraph.run_id.is_none() {
            return Err(StoreError::Session(format!(
                "LangGraph run reference for `{run_id}` must include a runtime run id"
            )));
        }
        let mut run = self
            .run(run_id)?
            .ok_or_else(|| StoreError::Session(format!("run `{run_id}` does not exist")))?;
        let merged_run_ref =
            merge_langgraph_ref(run.langgraph.take(), langgraph, "run", run_id.as_str())?;
        run.langgraph = Some(merged_run_ref.clone());
        run.updated_at_ms = now_ms;
        self.insert_or_update_run(&run)?;
        self.register_run_retention(&run)?;

        let mut session = self.session(&run.session_id)?.ok_or_else(|| {
            StoreError::Session(format!("session `{}` does not exist", run.session_id))
        })?;
        let session_ref = LangGraphRef {
            thread_id: merged_run_ref.thread_id.clone(),
            run_id: None,
            checkpoint_id: None,
        };
        session.langgraph = Some(merge_langgraph_ref(
            session.langgraph.take(),
            session_ref,
            "session",
            run.session_id.as_str(),
        )?);
        session.updated_at_ms = now_ms;
        self.insert_or_update_session(&session)?;
        self.register_session_retention(&session)?;

        if let Some(turn_id) = run.turn_id.as_deref()
            && let Some(mut turn) = self.turn(turn_id)?
        {
            turn.langgraph = Some(merge_langgraph_ref(
                turn.langgraph.take(),
                merged_run_ref,
                "prompt turn",
                turn_id,
            )?);
            self.update_turn(&turn)?;
            self.register_turn_retention(&turn)?;
        }
        Ok(run)
    }

    pub fn attach_checkpoint_ref(
        &self,
        run_id: &RunId,
        langgraph: LangGraphRef,
        now_ms: i64,
    ) -> StoreResult<RunRecord> {
        if langgraph.checkpoint_id.is_none() {
            return Err(StoreError::Session(format!(
                "LangGraph checkpoint reference for `{run_id}` must include a checkpoint id"
            )));
        }
        self.attach_run_langgraph_ref(run_id, langgraph, now_ms)
    }

    pub fn session(&self, session_id: &SessionId) -> StoreResult<Option<AuthoringSessionRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json FROM authoring_sessions WHERE session_id = ?1",
                [session_id.as_str()],
                read_json_record::<AuthoringSessionRecord>,
            )?
            .map(validate_session_record)
            .transpose()
    }

    pub fn run(&self, run_id: &RunId) -> StoreResult<Option<RunRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json FROM authoring_runs WHERE run_id = ?1",
                [run_id.as_str()],
                read_json_record::<RunRecord>,
            )?
            .map(validate_run_record)
            .transpose()
    }

    pub fn turn(&self, turn_id: &str) -> StoreResult<Option<PromptTurnRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json FROM authoring_prompt_turns WHERE turn_id = ?1",
                [turn_id],
                read_json_record::<PromptTurnRecord>,
            )?
            .map(validate_turn_record)
            .transpose()
    }

    pub fn active_run(&self, session_id: &SessionId) -> StoreResult<Option<RunRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_runs
                 WHERE session_id = ?1 AND active = 1
                 ORDER BY created_at_ms DESC
                 LIMIT 1",
                [session_id.as_str()],
                read_json_record::<RunRecord>,
            )?
            .map(validate_run_record)
            .transpose()
    }

    pub fn snapshot(
        &self,
        session_id: &SessionId,
        run_id: Option<&RunId>,
    ) -> StoreResult<SessionSnapshot> {
        let session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if let Some(run_id) = run_id {
            let run = self
                .run(run_id)?
                .ok_or_else(|| StoreError::Session(format!("run `{run_id}` does not exist")))?;
            if run.session_id != *session_id {
                return Err(StoreError::Session(format!(
                    "run `{run_id}` does not belong to session `{session_id}`"
                )));
            }
        }
        let turns = self.turns(session_id, RECOVERY_TURN_CAP)?;
        let runs = self.runs(session_id, RECOVERY_RUN_CAP)?;
        let active_run = runs.iter().find(|run| run.active).cloned();
        let queued_turn_ids = self.queued_turn_ids(session_id)?;
        Ok(SessionSnapshot {
            session,
            turns,
            runs,
            active_run,
            queued_turn_ids,
            caps: SessionSnapshotCaps {
                turn_cap: RECOVERY_TURN_CAP,
                run_cap: RECOVERY_RUN_CAP,
            },
        })
    }

    pub fn list_sessions(
        &self,
        cap: u32,
        after_ms: Option<i64>,
        after_session_id: Option<SessionId>,
    ) -> StoreResult<SessionListPage> {
        let cap = cap.clamp(1, SESSION_LIST_CAP_MAX);
        let rows = self.repo.query_collect(
            "SELECT record_json
             FROM authoring_sessions
             WHERE (
                ?1 IS NULL
                OR updated_at_ms < ?1
                OR (updated_at_ms = ?1 AND session_id > ?2)
             )
             ORDER BY updated_at_ms DESC, session_id ASC
             LIMIT ?3",
            rusqlite::params![
                after_ms,
                after_session_id
                    .as_ref()
                    .map(SessionId::as_str)
                    .unwrap_or(""),
                i64::from(cap.saturating_add(1))
            ],
            read_json_record::<AuthoringSessionRecord>,
        )?;
        let truncated = rows.len() > cap as usize;
        let mut items = rows
            .into_iter()
            .take(cap as usize)
            .map(validate_session_record)
            .collect::<StoreResult<Vec<_>>>()?;
        let (next_after_ms, next_after_session_id) = if truncated {
            items
                .last()
                .map(|record| (Some(record.updated_at_ms), Some(record.session_id.clone())))
                .unwrap_or((None, None))
        } else {
            (None, None)
        };
        Ok(SessionListPage {
            items: std::mem::take(&mut items),
            cap,
            truncated,
            next_after_ms,
            next_after_session_id,
        })
    }

    fn turns(&self, session_id: &SessionId, cap: u32) -> StoreResult<Vec<PromptTurnRecord>> {
        self.repo
            .query_collect(
                "SELECT record_json
                 FROM authoring_prompt_turns
                 WHERE session_id = ?1
                 ORDER BY turn_index DESC
                 LIMIT ?2",
                rusqlite::params![session_id.as_str(), i64::from(cap)],
                read_json_record::<PromptTurnRecord>,
            )?
            .into_iter()
            .map(validate_turn_record)
            .collect()
    }

    fn runs(&self, session_id: &SessionId, cap: u32) -> StoreResult<Vec<RunRecord>> {
        self.repo
            .query_collect(
                "SELECT record_json
                 FROM authoring_runs
                 WHERE session_id = ?1
                 ORDER BY created_at_ms DESC
                 LIMIT ?2",
                rusqlite::params![session_id.as_str(), i64::from(cap)],
                read_json_record::<RunRecord>,
            )?
            .into_iter()
            .map(validate_run_record)
            .collect()
    }

    /// The count of turns currently `Queued` (awaiting promotion) in a session — the
    /// bound checked against [`TURN_QUEUE_CAP`] on enqueue.
    fn queued_turn_count(&self, session_id: &SessionId) -> StoreResult<i64> {
        self.repo
            .query_optional(
                "SELECT count(*)
             FROM authoring_prompt_turns
             WHERE session_id = ?1 AND queue_state = 'queued'",
                [session_id.as_str()],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count.unwrap_or(0))
    }

    /// The oldest `Queued` turn (FIFO by `turn_index`) awaiting promotion, or `None`
    /// when the queue is empty.
    fn oldest_queued_turn(&self, session_id: &SessionId) -> StoreResult<Option<PromptTurnRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_prompt_turns
                 WHERE session_id = ?1 AND queue_state = 'queued'
                 ORDER BY turn_index ASC
                 LIMIT 1",
                [session_id.as_str()],
                read_json_record::<PromptTurnRecord>,
            )?
            .map(validate_turn_record)
            .transpose()
    }

    /// The turn ids currently `Queued` behind the active run, oldest first — served on
    /// the snapshot so the client reads queue depth explicitly.
    fn queued_turn_ids(&self, session_id: &SessionId) -> StoreResult<Vec<String>> {
        self.repo.query_collect(
            "SELECT turn_id
             FROM authoring_prompt_turns
             WHERE session_id = ?1 AND queue_state = 'queued'
             ORDER BY turn_index ASC",
            [session_id.as_str()],
            |row| row.get::<_, String>(0),
        )
    }

    /// Void every still-`Queued` turn of a session (D2 session-cancel): each becomes
    /// `Voided` — readable history, never runnable. Rewrites both the queryable column
    /// and the record JSON so the two never disagree.
    fn void_queued_turns(&self, session_id: &SessionId, now_ms: i64) -> StoreResult<()> {
        let queued = self.repo.query_collect(
            "SELECT record_json
             FROM authoring_prompt_turns
             WHERE session_id = ?1 AND queue_state = 'queued'
             ORDER BY turn_index ASC",
            [session_id.as_str()],
            read_json_record::<PromptTurnRecord>,
        )?;
        for turn in queued {
            let mut turn = validate_turn_record(turn)?;
            turn.queue_state = TurnQueueState::Voided;
            self.persist_turn_queue_state(&turn)?;
            self.register_turn_retention(&turn)?;
        }
        let _ = now_ms;
        Ok(())
    }

    /// Rewrite a turn's `queue_state` — the queryable column AND the source-of-truth
    /// record JSON — for the promotion (`Queued` → `Promoted`) and void
    /// (`Queued` → `Voided`) transitions.
    fn persist_turn_queue_state(&self, record: &PromptTurnRecord) -> StoreResult<()> {
        validate_turn_record(record.clone())?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::Session(format!("prompt turn json: {err}")))?;
        let updated = self.repo.execute(
            "UPDATE authoring_prompt_turns
             SET queue_state = ?2, record_json = ?3
             WHERE turn_id = ?1",
            rusqlite::params![
                record.turn_id.as_str(),
                record.queue_state.as_str(),
                record_json
            ],
        )?;
        if updated == 0 {
            return Err(StoreError::Session(format!(
                "prompt turn `{}` does not exist",
                record.turn_id
            )));
        }
        Ok(())
    }

    fn next_turn_index(&self, session_id: &SessionId) -> StoreResult<i64> {
        let latest = self.repo.query_optional(
            "SELECT max(turn_index)
             FROM authoring_prompt_turns
             WHERE session_id = ?1",
            [session_id.as_str()],
            |row| row.get::<_, Option<i64>>(0),
        )?;
        Ok(latest.flatten().unwrap_or(0) + 1)
    }

    fn insert_or_update_session(&self, record: &AuthoringSessionRecord) -> StoreResult<()> {
        validate_session_record(record.clone())?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::Session(format!("session record json: {err}")))?;
        let (thread_id, run_id, checkpoint_id) = langgraph_columns(record.langgraph.as_ref());
        self.repo.execute(
            "INSERT INTO authoring_sessions
                (session_id, scope_id, title, status, actor_id, actor_kind,
                 delegated_by_actor_id, langgraph_thread_id, langgraph_run_id,
                 langgraph_checkpoint_id, latest_turn_id, latest_run_id, record_json,
                 created_at_ms, updated_at_ms, cancelled_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(session_id) DO UPDATE SET
                scope_id = excluded.scope_id,
                title = excluded.title,
                status = excluded.status,
                actor_id = excluded.actor_id,
                actor_kind = excluded.actor_kind,
                delegated_by_actor_id = excluded.delegated_by_actor_id,
                langgraph_thread_id = excluded.langgraph_thread_id,
                langgraph_run_id = excluded.langgraph_run_id,
                langgraph_checkpoint_id = excluded.langgraph_checkpoint_id,
                latest_turn_id = excluded.latest_turn_id,
                latest_run_id = excluded.latest_run_id,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms,
                cancelled_at_ms = excluded.cancelled_at_ms",
            rusqlite::params![
                record.session_id.as_str(),
                record.scope.as_str(),
                record.title.as_str(),
                record.status.as_str(),
                record.actor.id.as_str(),
                actor_kind_name(record.actor.kind),
                delegated_by_key(&record.actor),
                thread_id,
                run_id,
                checkpoint_id,
                record.latest_turn_id.as_deref(),
                record.latest_run_id.as_ref().map(RunId::as_str),
                record_json,
                record.created_at_ms,
                record.updated_at_ms,
                record.cancelled_at_ms,
            ],
        )?;
        Ok(())
    }

    fn insert_turn(&self, record: &PromptTurnRecord) -> StoreResult<()> {
        validate_turn_record(record.clone())?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::Session(format!("prompt turn json: {err}")))?;
        let (thread_id, run_id, checkpoint_id) = langgraph_columns(record.langgraph.as_ref());
        self.repo.execute(
            "INSERT INTO authoring_prompt_turns
                (turn_id, session_id, turn_index, prompt_digest, prompt_text,
                 prompt_bytes, summary, actor_id, actor_kind, delegated_by_actor_id,
                 langgraph_thread_id, langgraph_run_id, langgraph_checkpoint_id,
                 record_json, created_at_ms, queue_state)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            rusqlite::params![
                record.turn_id.as_str(),
                record.session_id.as_str(),
                record.turn_index,
                record.prompt_digest.as_str(),
                record.prompt_text.as_str(),
                record.prompt_bytes,
                record.summary.as_deref(),
                record.actor.id.as_str(),
                actor_kind_name(record.actor.kind),
                delegated_by_key(&record.actor),
                thread_id,
                run_id,
                checkpoint_id,
                record_json,
                record.created_at_ms,
                record.queue_state.as_str(),
            ],
        )?;
        Ok(())
    }

    fn update_turn(&self, record: &PromptTurnRecord) -> StoreResult<()> {
        validate_turn_record(record.clone())?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::Session(format!("prompt turn json: {err}")))?;
        let (thread_id, run_id, checkpoint_id) = langgraph_columns(record.langgraph.as_ref());
        let updated = self.repo.execute(
            "UPDATE authoring_prompt_turns
             SET langgraph_thread_id = ?2,
                 langgraph_run_id = ?3,
                 langgraph_checkpoint_id = ?4,
                 record_json = ?5
             WHERE turn_id = ?1",
            rusqlite::params![
                record.turn_id.as_str(),
                thread_id,
                run_id,
                checkpoint_id,
                record_json,
            ],
        )?;
        if updated == 0 {
            return Err(StoreError::Session(format!(
                "prompt turn `{}` does not exist",
                record.turn_id
            )));
        }
        Ok(())
    }

    fn insert_or_update_run(&self, record: &RunRecord) -> StoreResult<()> {
        validate_run_record(record.clone())?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::Session(format!("run record json: {err}")))?;
        let (thread_id, run_id, checkpoint_id) = langgraph_columns(record.langgraph.as_ref());
        self.repo.execute(
            "INSERT INTO authoring_runs
                (run_id, session_id, turn_id, status, active, owner_actor_id,
                 owner_actor_kind, delegated_by_actor_id, langgraph_thread_id,
                 langgraph_run_id, langgraph_checkpoint_id, cancellation_reason,
                 record_json, created_at_ms, updated_at_ms, cancelled_at_ms,
                 completed_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
             ON CONFLICT(run_id) DO UPDATE SET
                status = excluded.status,
                active = excluded.active,
                cancellation_reason = excluded.cancellation_reason,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms,
                cancelled_at_ms = excluded.cancelled_at_ms,
                completed_at_ms = excluded.completed_at_ms",
            rusqlite::params![
                record.run_id.as_str(),
                record.session_id.as_str(),
                record.turn_id.as_deref(),
                record.status.as_str(),
                if record.active { 1 } else { 0 },
                record.owner.id.as_str(),
                actor_kind_name(record.owner.kind),
                delegated_by_key(&record.owner),
                thread_id,
                run_id,
                checkpoint_id,
                record.cancellation_reason.as_deref(),
                record_json,
                record.created_at_ms,
                record.updated_at_ms,
                record.cancelled_at_ms,
                record.completed_at_ms,
            ],
        )?;
        Ok(())
    }

    fn register_session_retention(&self, record: &AuthoringSessionRecord) -> StoreResult<()> {
        let payload = serde_json::to_vec(record)
            .map_err(|err| StoreError::Retention(format!("session retention json: {err}")))?;
        let mut retention = RetentionRecord::new(
            RetentionRecordRef::new("authoring_session", record.session_id.as_str())?,
            "session",
            record.session_id.as_str(),
            RetentionClass::ProtectedProductState,
            session_lifecycle_status(record.status),
            blob_oid(&payload),
            record.updated_at_ms,
        )?;
        retention.payload_bytes = i64::try_from(payload.len()).map_err(|_| {
            StoreError::Retention("session retention payload length overflow".to_string())
        })?;
        self.retention.upsert_record(&retention)
    }

    fn register_turn_retention(&self, record: &PromptTurnRecord) -> StoreResult<()> {
        let payload = serde_json::to_vec(record)
            .map_err(|err| StoreError::Retention(format!("prompt turn retention json: {err}")))?;
        let mut retention = RetentionRecord::new(
            RetentionRecordRef::new("authoring_prompt_turn", record.turn_id.as_str())?,
            "session",
            record.session_id.as_str(),
            RetentionClass::GenerationTranscript,
            LifecycleStatus::Active,
            blob_oid(&payload),
            record.created_at_ms,
        )?;
        retention.payload_bytes = i64::try_from(payload.len()).map_err(|_| {
            StoreError::Retention("prompt turn retention payload length overflow".to_string())
        })?;
        retention.compact_after_ms = Some(record.created_at_ms + 7 * 24 * 3_600 * 1_000);
        self.retention.upsert_record(&retention)
    }

    fn register_run_retention(&self, record: &RunRecord) -> StoreResult<()> {
        let payload = serde_json::to_vec(record)
            .map_err(|err| StoreError::Retention(format!("run retention json: {err}")))?;
        let mut retention = RetentionRecord::new(
            RetentionRecordRef::new("authoring_run", record.run_id.as_str())?,
            "run",
            record.run_id.as_str(),
            RetentionClass::ProtectedProductState,
            run_lifecycle_status(record.status),
            blob_oid(&payload),
            record.updated_at_ms,
        )?;
        retention.payload_bytes = i64::try_from(payload.len()).map_err(|_| {
            StoreError::Retention("run retention payload length overflow".to_string())
        })?;
        self.retention.upsert_record(&retention)
    }
}

/// Owner-only authorization for the run-settle command (D1) and the interrupt-resume
/// command (P05 review floor): the acting principal must be the run's `owner` or that
/// owner's delegator. Any other actor is a typed `RunForbidden` (403) — nobody may
/// forge another run's settlement, approve a stranger's pending tool permission, or
/// inject a steering prompt into a run they have no connection to.
pub(crate) fn authorize_run_owner(run: &RunRecord, actor: &ActorRef) -> StoreResult<()> {
    let is_owner = actor.id == run.owner.id;
    let is_delegator = run.owner.delegated_by.as_ref() == Some(&actor.id);
    if is_owner || is_delegator {
        Ok(())
    } else {
        Err(StoreError::RunForbidden(format!(
            "run `{}` may be completed only by its owner",
            run.run_id
        )))
    }
}
