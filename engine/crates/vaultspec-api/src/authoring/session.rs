//! Durable authoring sessions, prompt turns, run ownership, and recovery snapshots.
//!
//! W12.P25 stores workflow state owned by the authoring backend. LangGraph ids
//! are correlation references only; the session, turn, run, cancellation, and
//! recovery surfaces below are product state in the authoring store.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::actors::{actor_kind_from_name, actor_kind_name};
use super::api::{
    CancelRunRequest, CreateSessionRequest, ResumeRunRequest, StartPromptTurnRequest,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Cancelled,
    Closed,
}

impl SessionStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Cancelled => "cancelled",
            Self::Closed => "closed",
        }
    }

    fn from_str(value: &str) -> StoreResult<Self> {
        match value {
            "active" => Ok(Self::Active),
            "cancelled" => Ok(Self::Cancelled),
            "closed" => Ok(Self::Closed),
            other => Err(StoreError::Session(format!(
                "unknown session status `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Active,
    CancelRequested,
    Cancelled,
    Completed,
    Failed,
}

impl RunStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::CancelRequested => "cancel_requested",
            Self::Cancelled => "cancelled",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    fn from_str(value: &str) -> StoreResult<Self> {
        match value {
            "active" => Ok(Self::Active),
            "cancel_requested" => Ok(Self::CancelRequested),
            "cancelled" => Ok(Self::Cancelled),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            other => Err(StoreError::Session(format!("unknown run status `{other}`"))),
        }
    }

    fn active_flag(self) -> i64 {
        match self {
            Self::Active | Self::CancelRequested => 1,
            Self::Cancelled | Self::Completed | Self::Failed => 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionCommandContext {
    pub actor: ActorRef,
    pub idempotency_key: IdempotencyKey,
    pub now_ms: i64,
    pub in_flight_expires_at_ms: Option<i64>,
    pub outcome_expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthoringSessionRecord {
    pub schema_version: String,
    pub session_id: SessionId,
    pub scope: String,
    pub title: String,
    pub status: SessionStatus,
    pub actor: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langgraph: Option<LangGraphRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_run_id: Option<RunId>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromptTurnRecord {
    pub schema_version: String,
    pub turn_id: String,
    pub session_id: SessionId,
    pub turn_index: i64,
    pub prompt_digest: String,
    pub prompt_text: String,
    pub prompt_bytes: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub actor: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langgraph: Option<LangGraphRef>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunRecord {
    pub schema_version: String,
    pub run_id: RunId,
    pub session_id: SessionId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub status: RunStatus,
    pub active: bool,
    pub owner: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langgraph: Option<LangGraphRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancellation_reason: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionSnapshot {
    pub session: AuthoringSessionRecord,
    pub turns: Vec<PromptTurnRecord>,
    pub runs: Vec<RunRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_run: Option<RunRecord>,
    pub caps: SessionSnapshotCaps,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionSnapshotCaps {
    pub turn_cap: u32,
    pub run_cap: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionListPage {
    pub items: Vec<AuthoringSessionRecord>,
    pub cap: u32,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_after_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_after_session_id: Option<SessionId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionCommandOutcome {
    pub schema_version: String,
    pub command: CommandKind,
    pub session_id: SessionId,
    pub status: String,
    pub receipt_id: ReceiptId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<RunId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<SessionSnapshot>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SessionCommandResult {
    Accepted {
        outcome: SessionCommandOutcome,
        idempotency: IdempotencyRecord,
    },
    Replayed {
        outcome: SessionCommandOutcome,
        idempotency: IdempotencyRecord,
    },
    InFlight {
        idempotency: IdempotencyRecord,
    },
}

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
        };
        self.insert_or_update_session(&record)?;
        self.register_session_retention(&record)?;
        Ok(record)
    }

    pub fn start_prompt_turn(
        &self,
        session_id: &SessionId,
        input: StartPromptTurnRequest,
        actor: ActorRef,
        now_ms: i64,
    ) -> StoreResult<(PromptTurnRecord, RunRecord, bool)> {
        validate_prompt(&input.prompt)?;
        let mut session = self
            .session(session_id)?
            .ok_or_else(|| StoreError::Session(format!("session `{session_id}` does not exist")))?;
        if session.status != SessionStatus::Active {
            return Err(StoreError::Session(format!(
                "session `{session_id}` is not active"
            )));
        }
        if let Some(active) = self.active_run(session_id)? {
            let turn = active
                .turn_id
                .as_ref()
                .and_then(|turn_id| self.turn(turn_id).transpose())
                .transpose()?
                .ok_or_else(|| {
                    StoreError::Session(format!(
                        "active run `{}` has no prompt turn",
                        active.run_id
                    ))
                })?;
            return Ok((turn, active, true));
        }

        let turn_index = self.next_turn_index(session_id)?;
        let prompt_digest = digest_value("prompt", &input.prompt)?;
        let turn_id = derive_turn_id(session_id, turn_index, &prompt_digest)?;
        let run_id = derive_run_id(session_id, &turn_id)?;
        let langgraph = session.langgraph.clone();
        let prompt_bytes = i64::try_from(input.prompt.len()).map_err(|_| {
            StoreError::Session("prompt length does not fit signed storage".to_string())
        })?;
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
        };
        let run = RunRecord {
            schema_version: RUN_RECORD_SCHEMA.to_string(),
            run_id: run_id.clone(),
            session_id: session_id.clone(),
            turn_id: Some(turn_id),
            status: RunStatus::Active,
            active: true,
            owner: actor,
            langgraph,
            cancellation_reason: None,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
            cancelled_at_ms: None,
            completed_at_ms: None,
        };
        self.insert_turn(&turn)?;
        self.register_turn_retention(&turn)?;
        self.insert_or_update_run(&run)?;
        self.register_run_retention(&run)?;
        session.latest_turn_id = Some(turn.turn_id.clone());
        session.latest_run_id = Some(run.run_id.clone());
        session.updated_at_ms = now_ms;
        self.insert_or_update_session(&session)?;
        Ok((turn, run, false))
    }

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
        let mut session = self.session(&run.session_id)?.ok_or_else(|| {
            StoreError::Session(format!("session `{}` does not exist", run.session_id))
        })?;
        session.status = SessionStatus::Cancelled;
        session.updated_at_ms = now_ms;
        session.cancelled_at_ms = Some(now_ms);
        self.insert_or_update_session(&session)?;
        self.register_session_retention(&session)?;
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
        Ok(SessionSnapshot {
            session,
            turns,
            runs,
            active_run,
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
                 record_json, created_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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

pub fn create_session(
    store: &mut Store,
    context: SessionCommandContext,
    request: CreateSessionRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("session_request", &request)?;
    let session_id = derive_session_id(&context.actor, &context.idempotency_key, &request_digest)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CreateSession, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CreateSession,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let record = uow.sessions().create_session(
                    session_id.clone(),
                    request,
                    context.actor.clone(),
                    context.now_ms,
                )?;
                append_session_created_event(
                    uow,
                    &record,
                    &context.actor,
                    Some(context.idempotency_key.clone()),
                    Some(CommandKind::CreateSession),
                    receipt_id,
                    context.now_ms,
                )?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CreateSession,
                    session_id: record.session_id,
                    status: "created".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: None,
                    snapshot: None,
                })
            },
        )
    })
}

pub fn start_prompt_turn(
    store: &mut Store,
    context: SessionCommandContext,
    session_id: SessionId,
    request: StartPromptTurnRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("prompt_turn_request", &request)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::StartPromptTurn,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (_turn, run, joined) = uow.sessions().start_prompt_turn(
                    &session_id,
                    request,
                    context.actor.clone(),
                    context.now_ms,
                )?;
                if !joined {
                    append_session_event(
                        uow,
                        LifecycleAggregateKind::Run,
                        run.run_id.as_str(),
                        LifecycleEventKind::RunStarted,
                        &context,
                        receipt_id,
                        json!({ "run": run }),
                    )?;
                }
                let snapshot = uow.sessions().snapshot(&session_id, Some(&run.run_id))?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::StartPromptTurn,
                    session_id: session_id.clone(),
                    status: if joined { "joined" } else { "started" }.to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run.run_id),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn cancel_run(
    store: &mut Store,
    context: SessionCommandContext,
    run_id: RunId,
    request: CancelRunRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("cancel_run_request", &request)?;
    let scope = IdempotencyScope::new(
        "run",
        run_id.as_str(),
        None,
        digest_value(
            "run_scope",
            &json!({ "run_id": run_id, "request_digest": request_digest }),
        )?,
    );
    store.with_unit_of_work(CommandKind::CancelRun, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CancelRun,
                aggregate_kind: "run",
                aggregate_id: run_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (run, changed) = uow
                    .sessions()
                    .cancel_run(&run_id, request, context.now_ms)?;
                if changed {
                    append_session_event(
                        uow,
                        LifecycleAggregateKind::Run,
                        run.run_id.as_str(),
                        LifecycleEventKind::CancellationRecorded,
                        &context,
                        receipt_id,
                        json!({ "run": run }),
                    )?;
                }
                let snapshot = uow
                    .sessions()
                    .snapshot(&run.session_id, Some(&run.run_id))?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CancelRun,
                    session_id: run.session_id,
                    status: "cancelled".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run.run_id),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn resume_run(
    store: &mut Store,
    context: SessionCommandContext,
    run_id: RunId,
    request: ResumeRunRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("resume_run_request", &request)?;
    let scope = IdempotencyScope::new(
        "run",
        run_id.as_str(),
        None,
        digest_value(
            "run_scope",
            &json!({ "run_id": run_id, "request_digest": request_digest }),
        )?,
    );
    store.with_unit_of_work(CommandKind::ResumeRun, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::ResumeRun,
                aggregate_kind: "run",
                aggregate_id: run_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let snapshot = uow.sessions().resume_run(&run_id, request)?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::ResumeRun,
                    session_id: snapshot.session.session_id.clone(),
                    status: "joined".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run_id.clone()),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn session_snapshot(store: &mut Store, session_id: SessionId) -> StoreResult<SessionSnapshot> {
    store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
        uow.sessions().snapshot(&session_id, None)
    })
}

pub fn list_sessions(
    store: &mut Store,
    cap: u32,
    after_ms: Option<i64>,
    after_session_id: Option<SessionId>,
) -> StoreResult<SessionListPage> {
    store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
        uow.sessions()
            .list_sessions(cap, after_ms, after_session_id)
    })
}

#[derive(Debug, Clone)]
struct IdempotentCoordinates {
    command: CommandKind,
    aggregate_kind: &'static str,
    aggregate_id: String,
    scope: IdempotencyScope,
    request_digest: String,
}

fn run_idempotent(
    uow: &UnitOfWork<'_>,
    context: &SessionCommandContext,
    coordinates: IdempotentCoordinates,
    handler: impl FnOnce(&ReceiptId) -> StoreResult<SessionCommandOutcome>,
) -> StoreResult<SessionCommandResult> {
    let _actor_record = uow.actors().ensure_active(&context.actor)?;
    let key_scope = IdempotencyKeyScope::new(
        context.actor.clone(),
        coordinates.command,
        context.idempotency_key.clone(),
    );
    let receipt_id = receipt_id(
        coordinates.command,
        &coordinates.aggregate_id,
        &coordinates.request_digest,
    )?;
    match uow.idempotency().lookup_replay(
        &key_scope,
        &coordinates.scope,
        &coordinates.request_digest,
        context.now_ms,
    )? {
        ReplayLookup::Replay(record) => {
            let outcome = outcome_from_record(&record)?;
            return Ok(SessionCommandResult::Replayed {
                outcome,
                idempotency: record,
            });
        }
        ReplayLookup::InFlight(record) => {
            return Ok(SessionCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReplayLookup::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
        ReplayLookup::None | ReplayLookup::Expired(_) => {}
    }

    let reservation = match uow.idempotency().reserve_in_flight(
        key_scope,
        coordinates.scope,
        coordinates.request_digest,
        receipt_id,
        context.now_ms,
        context.in_flight_expires_at_ms,
    )? {
        ReserveDecision::Reserved(reservation) => reservation,
        ReserveDecision::Replay(record) => {
            let outcome = outcome_from_record(&record)?;
            return Ok(SessionCommandResult::Replayed {
                outcome,
                idempotency: record,
            });
        }
        ReserveDecision::InFlight(record) => {
            return Ok(SessionCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReserveDecision::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
    };
    let outcome = handler(&reservation.receipt_id)?;
    let idempotency = record_outcome(
        uow,
        &reservation,
        coordinates.aggregate_kind,
        &coordinates.aggregate_id,
        &outcome,
        context,
    )?;
    Ok(SessionCommandResult::Accepted {
        outcome,
        idempotency,
    })
}

fn record_outcome(
    uow: &UnitOfWork<'_>,
    reservation: &InFlightReservation,
    aggregate_kind: &str,
    aggregate_id: &str,
    outcome: &SessionCommandOutcome,
    context: &SessionCommandContext,
) -> StoreResult<IdempotencyRecord> {
    let payload =
        serde_json::to_value(outcome).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    uow.idempotency().record_outcome(
        reservation,
        RecordedOutcome {
            kind: OutcomeKind::Accepted,
            aggregate_kind: aggregate_kind.to_string(),
            aggregate_id: aggregate_id.to_string(),
            schema: OUTCOME_SCHEMA.to_string(),
            payload,
            http_status: Some(200),
            completed_at_ms: context.now_ms,
            outcome_expires_at_ms: context.outcome_expires_at_ms,
        },
        context.now_ms,
    )
}

fn append_session_event(
    uow: &UnitOfWork<'_>,
    aggregate_kind: LifecycleAggregateKind,
    aggregate_id: &str,
    event_kind: LifecycleEventKind,
    context: &SessionCommandContext,
    receipt_id: &ReceiptId,
    payload: Value,
) -> StoreResult<()> {
    let event = lifecycle_event_draft(LifecycleEventInput {
        event_id: format!("session-event:{}", receipt_id.as_str()),
        dedupe_key: format!("session-event:{}", receipt_id.as_str()),
        aggregate_kind,
        aggregate_id: aggregate_id.to_string(),
        event_kind,
        actor: context.actor.clone(),
        command: Some(context_command(event_kind)),
        idempotency_key: Some(context.idempotency_key.clone()),
        payload,
        created_at_ms: context.now_ms,
    })?;
    match uow.outbox().append_event(event)? {
        AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
    }
}

pub(crate) fn append_session_created_event(
    uow: &UnitOfWork<'_>,
    record: &AuthoringSessionRecord,
    actor: &ActorRef,
    idempotency_key: Option<IdempotencyKey>,
    command: Option<CommandKind>,
    receipt_id: &ReceiptId,
    created_at_ms: i64,
) -> StoreResult<()> {
    let event = lifecycle_event_draft(LifecycleEventInput {
        event_id: format!("session-event:{}", receipt_id.as_str()),
        dedupe_key: format!("session-event:{}", receipt_id.as_str()),
        aggregate_kind: LifecycleAggregateKind::Session,
        aggregate_id: record.session_id.as_str().to_string(),
        event_kind: LifecycleEventKind::SessionCreated,
        actor: actor.clone(),
        command,
        idempotency_key,
        payload: json!({ "session": record }),
        created_at_ms,
    })?;
    match uow.outbox().append_event(event)? {
        AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
    }
}

fn context_command(event_kind: LifecycleEventKind) -> CommandKind {
    match event_kind {
        LifecycleEventKind::SessionCreated => CommandKind::CreateSession,
        LifecycleEventKind::RunStarted => CommandKind::StartPromptTurn,
        LifecycleEventKind::CancellationRecorded => CommandKind::CancelRun,
        _ => CommandKind::ResumeRun,
    }
}

fn outcome_from_record(record: &IdempotencyRecord) -> StoreResult<SessionCommandOutcome> {
    let payload = record
        .outcome
        .as_ref()
        .ok_or_else(|| {
            StoreError::Idempotency(
                "replayed session command carries no recorded outcome".to_string(),
            )
        })?
        .payload
        .clone();
    serde_json::from_value(payload).map_err(|err| {
        StoreError::Idempotency(format!("recorded session outcome is unreadable: {err}"))
    })
}

fn idempotency_conflict(conflict: &IdempotencyConflict) -> StoreError {
    StoreError::Idempotency(format!(
        "idempotency key `{}` conflicts with existing session command scope `{}`",
        conflict.key_scope.key.as_str(),
        conflict.existing_scope.id
    ))
}

fn session_scope(
    session_id: &SessionId,
    revision: Option<String>,
    request_digest: &str,
) -> IdempotencyScope {
    IdempotencyScope::new(
        "session",
        session_id.as_str(),
        revision,
        digest_value(
            "session_scope",
            &json!({ "session_id": session_id, "request_digest": request_digest }),
        )
        .expect("scope digest serializes"),
    )
}

fn derive_session_id(
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    request_digest: &str,
) -> StoreResult<SessionId> {
    SessionId::new(format!(
        "session:{}",
        blob_oid(
            serde_json::to_string(&json!({
                "actor": actor,
                "idempotency_key": idempotency_key,
                "request_digest": request_digest,
            }))
            .map_err(|err| StoreError::Session(err.to_string()))?
            .as_bytes(),
        )
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

fn derive_turn_id(
    session_id: &SessionId,
    turn_index: i64,
    prompt_digest: &str,
) -> StoreResult<String> {
    Ok(format!(
        "turn:{}",
        blob_oid(format!("{}:{turn_index}:{prompt_digest}", session_id.as_str()).as_bytes())
    ))
}

fn derive_run_id(session_id: &SessionId, turn_id: &str) -> StoreResult<RunId> {
    RunId::new(format!(
        "run:{}",
        blob_oid(format!("{}:{turn_id}", session_id.as_str()).as_bytes())
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

fn digest_value(prefix: &str, value: &impl Serialize) -> StoreResult<String> {
    let bytes =
        serde_json::to_vec(value).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    Ok(format!("{prefix}:{}", blob_oid(&bytes)))
}

fn receipt_id(
    command: CommandKind,
    aggregate_id: &str,
    request_digest: &str,
) -> StoreResult<ReceiptId> {
    ReceiptId::new(format!(
        "receipt:{:?}:{}:{}",
        command,
        aggregate_id,
        digest_suffix(request_digest)
    ))
    .map_err(|err| StoreError::Idempotency(err.to_string()))
}

fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

fn delegated_by_key(actor: &ActorRef) -> &str {
    actor.delegated_by.as_ref().map_or("", ActorId::as_str)
}

fn langgraph_columns(
    langgraph: Option<&LangGraphRef>,
) -> (Option<&str>, Option<&str>, Option<&str>) {
    (
        langgraph.map(|value| value.thread_id.as_str()),
        langgraph.and_then(|value| value.run_id.as_ref().map(|id| id.as_str())),
        langgraph.and_then(|value| value.checkpoint_id.as_ref().map(|id| id.as_str())),
    )
}

fn merge_langgraph_ref(
    existing: Option<LangGraphRef>,
    incoming: LangGraphRef,
    aggregate_kind: &str,
    aggregate_id: &str,
) -> StoreResult<LangGraphRef> {
    let Some(mut current) = existing else {
        return Ok(incoming);
    };
    if current.thread_id != incoming.thread_id {
        return Err(StoreError::Session(format!(
            "LangGraph thread for {aggregate_kind} `{aggregate_id}` is already `{}`",
            current.thread_id
        )));
    }
    if let Some(incoming_run_id) = incoming.run_id {
        if let Some(current_run_id) = current.run_id.as_ref()
            && *current_run_id != incoming_run_id
        {
            return Err(StoreError::Session(format!(
                "LangGraph run for {aggregate_kind} `{aggregate_id}` is already `{current_run_id}`"
            )));
        }
        current.run_id = Some(incoming_run_id);
    }
    if incoming.checkpoint_id.is_some() {
        current.checkpoint_id = incoming.checkpoint_id;
    }
    Ok(current)
}

fn read_json_record<T: for<'de> Deserialize<'de>>(row: &rusqlite::Row<'_>) -> rusqlite::Result<T> {
    let record_json: String = row.get(0)?;
    serde_json::from_str(&record_json).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

fn validate_session_record(record: AuthoringSessionRecord) -> StoreResult<AuthoringSessionRecord> {
    if record.schema_version != SESSION_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported session schema `{}`",
            record.schema_version
        )));
    }
    validate_scope(&record.scope)?;
    validate_title(&record.title)?;
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Session(
            "session updated_at_ms predates created_at_ms".to_string(),
        ));
    }
    let _ = SessionStatus::from_str(record.status.as_str())?;
    let _ = actor_kind_from_name(actor_kind_name(record.actor.kind))?;
    Ok(record)
}

fn session_lifecycle_status(status: SessionStatus) -> LifecycleStatus {
    match status {
        SessionStatus::Active => LifecycleStatus::Active,
        SessionStatus::Cancelled | SessionStatus::Closed => LifecycleStatus::Expired,
    }
}

fn run_lifecycle_status(status: RunStatus) -> LifecycleStatus {
    match status {
        RunStatus::Active | RunStatus::CancelRequested => LifecycleStatus::Active,
        RunStatus::Cancelled | RunStatus::Completed | RunStatus::Failed => LifecycleStatus::Expired,
    }
}

fn validate_turn_record(record: PromptTurnRecord) -> StoreResult<PromptTurnRecord> {
    if record.schema_version != PROMPT_TURN_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported prompt turn schema `{}`",
            record.schema_version
        )));
    }
    validate_prompt(&record.prompt_text)?;
    if record.turn_index <= 0 {
        return Err(StoreError::Session(
            "prompt turn index must be positive".to_string(),
        ));
    }
    Ok(record)
}

fn validate_run_record(record: RunRecord) -> StoreResult<RunRecord> {
    if record.schema_version != RUN_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported run schema `{}`",
            record.schema_version
        )));
    }
    let _ = RunStatus::from_str(record.status.as_str())?;
    if record.active != (record.status.active_flag() == 1) {
        return Err(StoreError::Session(
            "run active flag does not match status".to_string(),
        ));
    }
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Session(
            "run updated_at_ms predates created_at_ms".to_string(),
        ));
    }
    Ok(record)
}

fn validate_scope(scope: &str) -> StoreResult<()> {
    if scope.trim().is_empty() || scope != scope.trim() || scope.len() > 160 {
        return Err(StoreError::Session(
            "session scope must be non-empty, unpadded, and at most 160 bytes".to_string(),
        ));
    }
    Ok(())
}

fn validate_title(title: &str) -> StoreResult<()> {
    if title.trim().is_empty() || title != title.trim() || title.len() > 200 {
        return Err(StoreError::Session(
            "session title must be non-empty, unpadded, and at most 200 bytes".to_string(),
        ));
    }
    Ok(())
}

fn validate_prompt(prompt: &str) -> StoreResult<()> {
    if prompt.trim().is_empty() {
        return Err(StoreError::Session(
            "prompt turn must contain non-whitespace text".to_string(),
        ));
    }
    if prompt.len() > PROMPT_TEXT_MAX_BYTES {
        return Err(StoreError::Session(format!(
            "prompt turn exceeds {PROMPT_TEXT_MAX_BYTES} bytes"
        )));
    }
    Ok(())
}

fn validate_reason(reason: &str) -> StoreResult<()> {
    if reason.trim().is_empty() || reason != reason.trim() || reason.len() > 500 {
        return Err(StoreError::Session(
            "cancellation reason must be non-empty, unpadded, and at most 500 bytes".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::path::PathBuf;

    use super::super::actors::{ActorDisplayMetadata, ActorRecordInput};
    use super::super::api::CreateProposalRequest;
    use super::super::model::{ActorId, ActorKind, ChangesetId, IdempotencyKey};
    use super::super::proposal::ProposalCommandContext;
    use super::super::snapshots::SnapshotReader;
    use super::super::store::Store;
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
}
