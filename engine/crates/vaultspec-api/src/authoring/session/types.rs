//! Session-domain data types: the lifecycle status enums and the persisted
//! session/turn/run records with their snapshot/list projections. Split out of
//! the session binding so the repository logic and these value types each stay
//! under the module-size cap; re-exported flat via `pub use types::*` so every
//! `authoring::session::…` path is unchanged.

use serde::{Deserialize, Serialize};

use super::super::model::{
    ActorRef, CommandKind, IdempotencyKey, LangGraphRef, ReceiptId, RunId, SessionId,
};
use super::super::store::idempotency::IdempotencyRecord;
use super::super::store::{Result as StoreResult, StoreError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Cancelled,
    Closed,
}

impl SessionStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Cancelled => "cancelled",
            Self::Closed => "closed",
        }
    }

    pub(super) fn from_str(value: &str) -> StoreResult<Self> {
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
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::CancelRequested => "cancel_requested",
            Self::Cancelled => "cancelled",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub(super) fn from_str(value: &str) -> StoreResult<Self> {
        match value {
            "active" => Ok(Self::Active),
            "cancel_requested" => Ok(Self::CancelRequested),
            "cancelled" => Ok(Self::Cancelled),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            other => Err(StoreError::Session(format!("unknown run status `{other}`"))),
        }
    }

    pub(super) fn active_flag(self) -> i64 {
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
