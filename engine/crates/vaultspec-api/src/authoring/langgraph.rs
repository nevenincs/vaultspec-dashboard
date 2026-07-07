//! LangGraph runtime reference mapping.
//!
//! W12.P30 keeps LangGraph execution state behind an adapter boundary. The
//! runtime may create threads, runs, and checkpoints, but Vaultspec product
//! records remain authoritative; this module only maps runtime references onto
//! existing authoring sessions and runs.
#![allow(dead_code)]

use std::fmt;

use serde::{Deserialize, Serialize};

use super::model::{
    CommandKind, LangGraphCheckpointId, LangGraphRef, LangGraphRunId, LangGraphThreadId, RunId,
    SessionId,
};
use super::session::{AuthoringSessionRecord, RunRecord};
use super::store::{Store, StoreError};

const REDACTED_DIAGNOSTIC_MAX_CHARS: usize = 500;

pub type Result<T> = std::result::Result<T, LangGraphRuntimeError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LangGraphRuntimeErrorKind {
    Unavailable,
    InvalidReference,
    RuntimeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LangGraphRuntimeError {
    kind: LangGraphRuntimeErrorKind,
    public_message: String,
    diagnostic: Option<String>,
}

impl LangGraphRuntimeError {
    pub fn unavailable(detail: impl AsRef<str>) -> Self {
        Self {
            kind: LangGraphRuntimeErrorKind::Unavailable,
            public_message: "LangGraph runtime is unavailable".to_string(),
            diagnostic: Some(redact_diagnostic(detail.as_ref())),
        }
    }

    pub fn invalid_reference(detail: impl Into<String>) -> Self {
        Self {
            kind: LangGraphRuntimeErrorKind::InvalidReference,
            public_message: detail.into(),
            diagnostic: None,
        }
    }

    pub fn runtime_failed(detail: impl AsRef<str>) -> Self {
        Self {
            kind: LangGraphRuntimeErrorKind::RuntimeFailed,
            public_message: "LangGraph runtime request failed".to_string(),
            diagnostic: Some(redact_diagnostic(detail.as_ref())),
        }
    }

    pub fn store(err: StoreError) -> Self {
        if let StoreError::Session(message) = &err
            && message.starts_with("LangGraph ")
        {
            return Self::invalid_reference(message.clone());
        }
        Self {
            kind: LangGraphRuntimeErrorKind::RuntimeFailed,
            public_message: "LangGraph runtime mapping could not update authoring state"
                .to_string(),
            diagnostic: Some(redact_diagnostic(&err.to_string())),
        }
    }

    pub fn kind(&self) -> LangGraphRuntimeErrorKind {
        self.kind
    }

    pub fn public_message(&self) -> &str {
        &self.public_message
    }

    pub(crate) fn diagnostic(&self) -> Option<&str> {
        self.diagnostic.as_deref()
    }
}

impl fmt::Display for LangGraphRuntimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.public_message)
    }
}

impl std::error::Error for LangGraphRuntimeError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LangGraphRuntimeConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_id: Option<String>,
}

impl LangGraphRuntimeConfig {
    pub fn unavailable() -> Self {
        Self {
            endpoint: None,
            assistant_id: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LangGraphRuntimeAdapter {
    config: LangGraphRuntimeConfig,
}

impl LangGraphRuntimeAdapter {
    pub fn new(config: LangGraphRuntimeConfig) -> Self {
        Self { config }
    }

    pub fn ensure_available(&self) -> Result<()> {
        let endpoint = self
            .config
            .endpoint
            .as_deref()
            .filter(|value| !value.trim().is_empty());
        let assistant_id = self
            .config
            .assistant_id
            .as_deref()
            .filter(|value| !value.trim().is_empty());
        if endpoint.is_none() || assistant_id.is_none() {
            return Err(LangGraphRuntimeError::unavailable(
                "missing LangGraph endpoint or assistant id",
            ));
        }
        Ok(())
    }

    pub fn capture_thread_created(
        &self,
        store: &mut Store,
        event: RuntimeThreadCreated,
        now_ms: i64,
    ) -> Result<AuthoringSessionRecord> {
        self.ensure_available()?;
        record_thread_created(store, event, now_ms)
    }

    pub fn capture_run_created(
        &self,
        store: &mut Store,
        event: RuntimeRunCreated,
        now_ms: i64,
    ) -> Result<RunRecord> {
        self.ensure_available()?;
        record_run_created(store, event, now_ms)
    }

    pub fn capture_checkpoint(
        &self,
        store: &mut Store,
        event: RuntimeCheckpointCaptured,
        now_ms: i64,
    ) -> Result<RunRecord> {
        self.ensure_available()?;
        record_checkpoint_captured(store, event, now_ms)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeThreadCreated {
    pub session_id: SessionId,
    pub thread_id: LangGraphThreadId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint_id: Option<LangGraphCheckpointId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeRunCreated {
    pub run_id: RunId,
    pub thread_id: LangGraphThreadId,
    pub langgraph_run_id: LangGraphRunId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint_id: Option<LangGraphCheckpointId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeCheckpointCaptured {
    pub run_id: RunId,
    pub thread_id: LangGraphThreadId,
    pub langgraph_run_id: LangGraphRunId,
    pub checkpoint_id: LangGraphCheckpointId,
}

pub fn record_thread_created(
    store: &mut Store,
    event: RuntimeThreadCreated,
    now_ms: i64,
) -> Result<AuthoringSessionRecord> {
    let langgraph = LangGraphRef {
        thread_id: event.thread_id,
        run_id: None,
        checkpoint_id: event.checkpoint_id,
    };
    store
        .with_unit_of_work(CommandKind::MapLangGraphRuntime, |uow| {
            uow.sessions()
                .attach_session_langgraph_ref(&event.session_id, langgraph, now_ms)
        })
        .map_err(LangGraphRuntimeError::store)
}

pub fn record_run_created(
    store: &mut Store,
    event: RuntimeRunCreated,
    now_ms: i64,
) -> Result<RunRecord> {
    let langgraph = LangGraphRef {
        thread_id: event.thread_id,
        run_id: Some(event.langgraph_run_id),
        checkpoint_id: event.checkpoint_id,
    };
    store
        .with_unit_of_work(CommandKind::MapLangGraphRuntime, |uow| {
            uow.sessions()
                .attach_run_langgraph_ref(&event.run_id, langgraph, now_ms)
        })
        .map_err(LangGraphRuntimeError::store)
}

pub fn record_checkpoint_captured(
    store: &mut Store,
    event: RuntimeCheckpointCaptured,
    now_ms: i64,
) -> Result<RunRecord> {
    let langgraph = LangGraphRef {
        thread_id: event.thread_id,
        run_id: Some(event.langgraph_run_id),
        checkpoint_id: Some(event.checkpoint_id),
    };
    store
        .with_unit_of_work(CommandKind::MapLangGraphRuntime, |uow| {
            uow.sessions()
                .attach_checkpoint_ref(&event.run_id, langgraph, now_ms)
        })
        .map_err(LangGraphRuntimeError::store)
}

fn redact_diagnostic(detail: &str) -> String {
    let mut redact_next = false;
    let collapsed = detail
        .split_whitespace()
        .map(|value| {
            if redact_next {
                redact_next = false;
                return "[redacted]";
            }
            let (redacted, redacts_next) = redact_token_like(value);
            redact_next = redacts_next;
            redacted
        })
        .collect::<Vec<_>>()
        .join(" ");
    collapsed
        .chars()
        .take(REDACTED_DIAGNOSTIC_MAX_CHARS)
        .collect()
}

fn redact_token_like(value: &str) -> (&str, bool) {
    let lower = value.to_ascii_lowercase();
    if lower.contains("authorization")
        || lower.contains("bearer")
        || lower.contains("http://")
        || lower.contains("https://")
        || lower.contains("token")
        || lower.contains("api_key")
        || lower.contains("apikey")
        || lower.contains("body=")
        || lower.contains("password")
        || lower.contains("prompt:")
        || lower.contains("prompt=")
        || lower.contains("raw-body")
        || lower.contains("secret")
    {
        (
            "[redacted]",
            lower == "authorization" || lower == "bearer" || lower == "prompt:" || lower == "body:",
        )
    } else if lower == "prompt:" || lower == "body:" {
        ("[redacted]", true)
    } else {
        (value, false)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::super::actors::{ActorDisplayMetadata, ActorRecordInput};
    use super::super::api::{CreateSessionRequest, StartPromptTurnRequest};
    use super::super::model::{ActorId, ActorKind, ActorRef, IdempotencyKey};
    use super::super::session::{
        SessionCommandContext, SessionCommandResult, create_session, session_snapshot,
        start_prompt_turn,
    };
    use super::super::store;
    use super::*;

    fn temp_store() -> (tempfile::TempDir, PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = store::db_path(&vault_root);
        let store = Store::open(&vault_root).unwrap();
        (dir, path, store)
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:langgraph").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn register_actor(store: &mut Store, actor: &ActorRef) {
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actors().put_record(ActorRecordInput::active(
                    actor.clone(),
                    ActorDisplayMetadata::new("LangGraph agent", None),
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

    fn accepted(result: SessionCommandResult) -> super::super::session::SessionCommandOutcome {
        match result {
            SessionCommandResult::Accepted { outcome, .. } => outcome,
            other => panic!("expected accepted command, got {other:?}"),
        }
    }

    fn session_request() -> CreateSessionRequest {
        CreateSessionRequest {
            scope: "scope_langgraph".to_string(),
            title: "LangGraph runtime mapping".to_string(),
        }
    }

    fn turn_request() -> StartPromptTurnRequest {
        StartPromptTurnRequest {
            prompt: "Draft an authoring proposal through semantic tools.".to_string(),
            summary: Some("runtime mapping turn".to_string()),
        }
    }

    fn available_adapter() -> LangGraphRuntimeAdapter {
        LangGraphRuntimeAdapter::new(LangGraphRuntimeConfig {
            endpoint: Some("http://127.0.0.1:2024".to_string()),
            assistant_id: Some("assistant:vaultspec-authoring".to_string()),
        })
    }

    #[test]
    fn unavailable_runtime_and_runtime_failures_are_redacted() {
        let unavailable = LangGraphRuntimeAdapter::new(LangGraphRuntimeConfig::unavailable());
        let err = unavailable.ensure_available().unwrap_err();
        assert_eq!(err.kind(), LangGraphRuntimeErrorKind::Unavailable);
        assert_eq!(err.public_message(), "LangGraph runtime is unavailable");
        assert!(!err.to_string().contains("endpoint"));

        let failed = LangGraphRuntimeError::runtime_failed(
            "POST https://agent.example.invalid/runs Authorization: Bearer secret-token prompt: raw-body",
        );
        assert_eq!(failed.kind(), LangGraphRuntimeErrorKind::RuntimeFailed);
        assert_eq!(failed.public_message(), "LangGraph runtime request failed");
        let diagnostic = failed.diagnostic().expect("diagnostic is retained");
        assert!(
            !diagnostic.contains("https://agent.example.invalid"),
            "diagnostic must redact runtime URLs: {diagnostic}"
        );
        assert!(
            !diagnostic.to_ascii_lowercase().contains("bearer"),
            "diagnostic must redact bearer credentials: {diagnostic}"
        );
        assert!(
            !diagnostic.contains("secret-token"),
            "diagnostic must redact token-shaped values: {diagnostic}"
        );
        assert!(
            !diagnostic.contains("raw-body"),
            "diagnostic must redact prompt and body fragments: {diagnostic}"
        );
    }

    #[test]
    fn thread_run_and_checkpoint_refs_persist_without_replacing_vaultspec_ids() {
        let (_dir, path, mut store) = temp_store();
        let actor = actor();
        register_actor(&mut store, &actor);
        let adapter = available_adapter();

        let session = accepted(
            create_session(
                &mut store,
                context(&actor, "idem:langgraph:session", 10),
                session_request(),
            )
            .unwrap(),
        );
        let run = accepted(
            start_prompt_turn(
                &mut store,
                context(&actor, "idem:langgraph:turn", 20),
                session.session_id.clone(),
                turn_request(),
            )
            .unwrap(),
        );
        let vaultspec_run_id = run.run_id.expect("Vaultspec run id is created");

        let thread_id = LangGraphThreadId::new("thread:runtime-1").unwrap();
        let session_record = adapter
            .capture_thread_created(
                &mut store,
                RuntimeThreadCreated {
                    session_id: session.session_id.clone(),
                    thread_id: thread_id.clone(),
                    checkpoint_id: None,
                },
                30,
            )
            .unwrap();
        assert_eq!(
            session_record.langgraph.as_ref().unwrap().thread_id,
            thread_id
        );
        assert!(session_record.langgraph.as_ref().unwrap().run_id.is_none());

        let langgraph_run_id = LangGraphRunId::new("lg_run:runtime-1").unwrap();
        let mapped_run = adapter
            .capture_run_created(
                &mut store,
                RuntimeRunCreated {
                    run_id: vaultspec_run_id.clone(),
                    thread_id: thread_id.clone(),
                    langgraph_run_id: langgraph_run_id.clone(),
                    checkpoint_id: None,
                },
                40,
            )
            .unwrap();
        assert_eq!(
            mapped_run.run_id, vaultspec_run_id,
            "runtime mapping must not replace the Vaultspec run id"
        );
        assert_eq!(
            mapped_run.langgraph.as_ref().unwrap().run_id.as_ref(),
            Some(&langgraph_run_id)
        );

        let checkpoint_id = LangGraphCheckpointId::new("checkpoint:runtime-1").unwrap();
        let checkpointed_run = adapter
            .capture_checkpoint(
                &mut store,
                RuntimeCheckpointCaptured {
                    run_id: vaultspec_run_id.clone(),
                    thread_id: thread_id.clone(),
                    langgraph_run_id: langgraph_run_id.clone(),
                    checkpoint_id: checkpoint_id.clone(),
                },
                50,
            )
            .unwrap();
        assert_eq!(
            checkpointed_run
                .langgraph
                .as_ref()
                .unwrap()
                .checkpoint_id
                .as_ref(),
            Some(&checkpoint_id)
        );

        drop(store);
        let schema = rusqlite::Connection::open(&path)
            .unwrap()
            .query_row(
                "SELECT group_concat(sql, '\n') FROM sqlite_schema WHERE type = 'table'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert!(
            schema.contains("langgraph_checkpoint_id"),
            "durable store keeps checkpoint ids as typed reference columns"
        );
        assert!(
            !schema.contains("checkpoint_payload"),
            "durable store must not allocate a raw LangGraph checkpoint payload surface"
        );

        let mut reopened = Store::open_at(&path).unwrap();
        let recovered = session_snapshot(&mut reopened, session.session_id.clone()).unwrap();
        assert_eq!(
            recovered.session.langgraph.as_ref().unwrap().thread_id,
            thread_id
        );
        let recovered_run = recovered
            .runs
            .iter()
            .find(|run| run.run_id == vaultspec_run_id)
            .expect("mapped Vaultspec run is recovered");
        let recovered_ref = recovered_run.langgraph.as_ref().unwrap();
        assert_eq!(recovered_ref.run_id.as_ref(), Some(&langgraph_run_id));
        assert_eq!(recovered_ref.checkpoint_id.as_ref(), Some(&checkpoint_id));
        assert!(
            recovered
                .session
                .langgraph
                .as_ref()
                .unwrap()
                .run_id
                .is_none(),
            "session-level LangGraph refs remain thread-scoped, not run authority"
        );
        let serialized = serde_json::to_string(&recovered).unwrap();
        assert!(
            !serialized.contains("checkpoint_payload"),
            "recovery must expose checkpoint ids as references, not raw checkpoint payloads"
        );
    }

    #[test]
    fn conflicting_runtime_refs_are_rejected_without_overwriting_product_state() {
        let (_dir, _path, mut store) = temp_store();
        let actor = actor();
        register_actor(&mut store, &actor);
        let adapter = available_adapter();

        let session = accepted(
            create_session(
                &mut store,
                context(&actor, "idem:langgraph:conflict:session", 10),
                session_request(),
            )
            .unwrap(),
        );
        adapter
            .capture_thread_created(
                &mut store,
                RuntimeThreadCreated {
                    session_id: session.session_id.clone(),
                    thread_id: LangGraphThreadId::new("thread:original").unwrap(),
                    checkpoint_id: None,
                },
                20,
            )
            .unwrap();

        let err = adapter
            .capture_thread_created(
                &mut store,
                RuntimeThreadCreated {
                    session_id: session.session_id.clone(),
                    thread_id: LangGraphThreadId::new("thread:conflict").unwrap(),
                    checkpoint_id: None,
                },
                30,
            )
            .unwrap_err();
        assert_eq!(err.kind(), LangGraphRuntimeErrorKind::InvalidReference);

        let recovered = session_snapshot(&mut store, session.session_id).unwrap();
        assert_eq!(
            recovered.session.langgraph.as_ref().unwrap().thread_id,
            LangGraphThreadId::new("thread:original").unwrap()
        );
    }
}
