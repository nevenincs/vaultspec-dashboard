//! Tool permission request flow (W12.P22).
//!
//! A `tool_permission_request` is keyed by `tool_call_id` and asks whether an agent
//! may perform ONE bounded tool action (approval-gates ADR). It is DISTINCT from a
//! changeset approval and NEVER substitutes for it: granting a tool permission lets
//! the agent run the tool, but the resulting proposal still rides the full changeset
//! approval matrix. This module owns the durable request, its claim/decision/expiry
//! lifecycle, idempotent replay, and retention/audit registration.
//!
//! The RISK TIER decides whether a human gate is needed at all — it is read from the
//! policy layer, never re-derived: a read/context tool (`ToolRiskTier::ReadOnly`)
//! auto-permits immediately under policy authority; a mutating or dangerous tool
//! queues `Pending` for an explicit human decision within a bounded window. A claim
//! coordinates reviewers but is not authority (review-claims-are-not-authority); an
//! undecided request past its window EXPIRES rather than blocking forever
//! (resource-bounds: a bounded TTL at creation).
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::actors::actor_kind_name;
use super::model::{ActionEligibility, ActorKind, ActorRef, CommandKind, ToolCallId};
use super::policy::{
    OperationMode, ToolPermissionRequirement, ToolRiskTier, resolve_effective_mode,
    tool_permission_requirement_in_mode,
};
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};
use super::tools::SemanticToolName;

const TOOL_PERMISSION_SCHEMA: &str = "authoring.tool_permission.v1";

/// The default decision window for a human-gated tool permission (resource-bounds: a
/// bounded TTL at creation). A request undecided past it EXPIRES and the agent must
/// re-request rather than block a run forever.
pub const DEFAULT_TOOL_PERMISSION_TTL_MS: i64 = 5 * 60 * 1000;

/// The tool-permission request lifecycle. `pending` awaits a decision; `claimed` is a
/// reviewer coordinating (not authority); `decided` carries an approve/reject (or is
/// an auto-permitted read tool); `expired` lapsed without a decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionQueueState {
    Pending,
    Claimed,
    Decided,
    Expired,
}

/// A recorded tool-permission decision. Approve authorizes the one tool action;
/// reject refuses it. Both are append-only evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionDecisionKind {
    Approve,
    Reject,
}

#[derive(Debug, thiserror::Error)]
pub enum PermissionError {
    #[error("no tool permission request exists for tool call `{0}`")]
    UnknownRequest(String),
    #[error("tool permission decision is not permitted: {0}")]
    NotPermitted(String),
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

/// A recorded decision bound to its reviewer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolPermissionDecisionRecord {
    pub decision: ToolPermissionDecisionKind,
    pub reviewer: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub decided_at_ms: i64,
}

/// The durable tool-permission request — the backend-served product state for one
/// tool call. `auto_permitted` marks a policy-permitted read tool (no human gate);
/// otherwise a human decision within `[created_at_ms, expires_at_ms)` is required.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolPermissionRequestRecord {
    pub schema_version: String,
    pub tool_call_id: ToolCallId,
    pub tool_name: String,
    pub risk_tier: ToolRiskTier,
    pub scope_id: String,
    pub requester: ActorRef,
    /// The effective operation mode (after narrowing resolution) the gate decision was
    /// made under — provenance for why a Mutating tool auto-permitted or gated.
    pub effective_mode: OperationMode,
    pub queue_state: ToolPermissionQueueState,
    pub auto_permitted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_by: Option<ActorRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<ToolPermissionDecisionRecord>,
    pub idempotency_key: String,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
    pub updated_at_ms: i64,
}

impl ToolPermissionRequestRecord {
    fn from_input(
        input: &ToolPermissionRequestInput,
        requirement: ToolPermissionRequirement,
        effective_mode: OperationMode,
    ) -> Self {
        let auto_permitted = requirement == ToolPermissionRequirement::AutoPermitted;
        let ttl = input
            .ttl_ms
            .unwrap_or(DEFAULT_TOOL_PERMISSION_TTL_MS)
            .max(0);
        // A policy-permitted read tool is decided at creation with no waiting window;
        // a human-gated tool queues `pending` with a bounded decision window.
        let (queue_state, expires_at_ms) = if auto_permitted {
            (ToolPermissionQueueState::Decided, input.created_at_ms)
        } else {
            (
                ToolPermissionQueueState::Pending,
                input.created_at_ms.saturating_add(ttl),
            )
        };
        Self {
            schema_version: TOOL_PERMISSION_SCHEMA.to_string(),
            tool_call_id: input.tool_call_id.clone(),
            tool_name: input.tool.as_str().to_string(),
            risk_tier: input.tool.risk_tier(),
            scope_id: input.scope_id.clone(),
            requester: input.requester.clone(),
            effective_mode,
            queue_state,
            auto_permitted,
            claimed_by: None,
            decision: None,
            idempotency_key: input.idempotency_key.clone(),
            created_at_ms: input.created_at_ms,
            expires_at_ms,
            updated_at_ms: input.created_at_ms,
        }
    }

    /// True once an approve/reject is recorded or the read tool was auto-permitted.
    pub fn is_decided(&self) -> bool {
        matches!(self.queue_state, ToolPermissionQueueState::Decided)
    }

    /// A human-gated request is expired when it is past its window with no decision.
    /// An auto-permitted or already-decided request never expires.
    pub fn is_expired(&self, now_ms: i64) -> bool {
        !self.auto_permitted
            && self.decision.is_none()
            && !matches!(self.queue_state, ToolPermissionQueueState::Expired)
            && now_ms >= self.expires_at_ms
    }

    /// Whether the tool action is authorized to proceed: an auto-permitted read tool,
    /// or an explicit approve decision. A reject, an expiry, or a pending request is
    /// NOT granted.
    pub fn granted(&self) -> bool {
        self.auto_permitted
            || matches!(
                self.decision.as_ref().map(|decision| decision.decision),
                Some(ToolPermissionDecisionKind::Approve)
            )
    }
}

/// Input to open a tool permission request. `tool` supplies the risk tier (via the
/// tool catalog), so the caller never hand-classifies risk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolPermissionRequestInput {
    pub tool_call_id: ToolCallId,
    pub tool: SemanticToolName,
    pub scope_id: String,
    pub requester: ActorRef,
    /// The scope's configured operation mode. A Mutating tool auto-permits under
    /// assisted/autonomous (its proposal still rides the changeset gate); Dangerous
    /// always needs a human gate regardless of mode.
    pub scope_mode: OperationMode,
    /// A narrowing-only per-session override; a widening override is ignored (the
    /// scope mode stands), resolved via `policy::resolve_effective_mode`.
    pub session_override: Option<OperationMode>,
    pub idempotency_key: String,
    pub created_at_ms: i64,
    /// Decision window override; `None` uses [`DEFAULT_TOOL_PERMISSION_TTL_MS`].
    pub ttl_ms: Option<i64>,
}

/// The outcome of a tool-permission operation: the durable record, the served
/// eligibility (can the tool proceed?), and whether this call replayed a recorded
/// state (idempotency).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolPermissionOutcome {
    pub record: ToolPermissionRequestRecord,
    pub eligibility: ActionEligibility,
    pub replayed: bool,
}

pub struct ToolPermissionRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn tool_permissions<'repo>(&'repo self) -> ToolPermissionRepository<'repo, 'conn> {
        ToolPermissionRepository {
            repo: self.repository("authoring_tool_permission_requests"),
            uow: self,
        }
    }
}

impl ToolPermissionRepository<'_, '_> {
    /// Open a tool permission request. A read/context tool auto-permits under policy;
    /// a mutating/dangerous tool queues `pending` for a human decision. Idempotent by
    /// `tool_call_id`: a re-request replays the recorded state.
    pub fn request_permission(
        &self,
        input: ToolPermissionRequestInput,
    ) -> StoreResult<ToolPermissionOutcome> {
        self.uow.actors().ensure_active(&input.requester)?;
        if let Some(existing) = self.latest_for_tool_call(&input.tool_call_id)? {
            return Ok(self.replay(existing));
        }
        // Resolve the effective mode (narrowing-only) and gate mode-aware: a Mutating
        // tool auto-permits under assisted/autonomous; Dangerous always needs a human.
        let effective_mode = resolve_effective_mode(input.scope_mode, input.session_override);
        let requirement =
            tool_permission_requirement_in_mode(input.tool.risk_tier(), effective_mode);
        let record = ToolPermissionRequestRecord::from_input(&input, requirement, effective_mode);
        self.store_record(&record)?;
        // A pending human-gated request is product state (a human must decide it) →
        // retention `Pending`, protected from compaction; an auto-permitted read tool
        // is `Active` (already resolved).
        let lifecycle = if record.auto_permitted {
            LifecycleStatus::Active
        } else {
            LifecycleStatus::Pending
        };
        self.register_retention(&record, lifecycle)?;
        let eligibility = request_eligibility(&record);
        Ok(ToolPermissionOutcome {
            record,
            eligibility,
            replayed: false,
        })
    }

    /// Claim a pending request for review. Claiming COORDINATES reviewers but is not
    /// authority: a claimed-but-undecided request is still not granted
    /// (review-claims-are-not-authority). Expires first if the window lapsed.
    pub fn claim_permission(
        &self,
        tool_call_id: &ToolCallId,
        reviewer: &ActorRef,
        now_ms: i64,
    ) -> StoreResult<ToolPermissionOutcome> {
        self.uow.actors().ensure_active(reviewer)?;
        let mut record = self.require(tool_call_id)?;
        if let Some(expired) = self.expire_in_place(&mut record, now_ms)? {
            return Ok(expired);
        }
        if record.is_decided() {
            return Ok(self.replay(record));
        }
        // A human-gated request may be claimed only by an eligible human reviewer, not
        // the requester itself (P22-R1: claiming is a review action, same authority gate
        // as deciding).
        if let Some(denied) = tool_reviewer_authority_blocker(&record, reviewer) {
            return Ok(ToolPermissionOutcome {
                record,
                eligibility: denied,
                replayed: false,
            });
        }
        record.queue_state = ToolPermissionQueueState::Claimed;
        record.claimed_by = Some(reviewer.clone());
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        let eligibility = request_eligibility(&record);
        Ok(ToolPermissionOutcome {
            record,
            eligibility,
            replayed: false,
        })
    }

    /// Submit an approve/reject decision on a human-gated request. Idempotent: an
    /// identical decision by the same reviewer replays. Refuses a conflicting second
    /// decision, and refuses to decide an expired request (the window lapsed).
    pub fn submit_decision(
        &self,
        tool_call_id: &ToolCallId,
        decision: ToolPermissionDecisionKind,
        reviewer: &ActorRef,
        comment: Option<String>,
        now_ms: i64,
    ) -> Result<ToolPermissionOutcome, PermissionError> {
        self.uow.actors().ensure_active(reviewer)?;
        let mut record = self.require(tool_call_id)?;

        // Idempotent replay of an already-recorded decision by the same reviewer.
        if let Some(existing) = &record.decision {
            if existing.decision == decision && existing.reviewer == *reviewer {
                return Ok(self.replay(record));
            }
            return Err(PermissionError::NotPermitted(format!(
                "tool call `{tool_call_id}` already has a decision by a different reviewer"
            )));
        }
        // An auto-permitted read tool is already resolved by policy; a human decision
        // on it is a no-op replay, never a second authority.
        if record.auto_permitted {
            return Ok(self.replay(record));
        }
        if let Some(expired) = self.expire_in_place(&mut record, now_ms)? {
            return Ok(expired);
        }
        // AUTHORITY (P22-R1): a human-gated tool permission may be decided ONLY by an
        // eligible human reviewer who is not the requester — else the requester could
        // approve its own request and the human/dangerous floor becomes self-approvable.
        // A denied decision rides the success envelope as a value (denials-are-values).
        if let Some(denied) = tool_reviewer_authority_blocker(&record, reviewer) {
            return Ok(ToolPermissionOutcome {
                record,
                eligibility: denied,
                replayed: false,
            });
        }

        record.decision = Some(ToolPermissionDecisionRecord {
            decision,
            reviewer: reviewer.clone(),
            comment,
            decided_at_ms: now_ms,
        });
        record.queue_state = ToolPermissionQueueState::Decided;
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        let lifecycle = match decision {
            ToolPermissionDecisionKind::Approve => LifecycleStatus::Active,
            ToolPermissionDecisionKind::Reject => LifecycleStatus::Rejected,
        };
        self.register_retention(&record, lifecycle)?;
        let eligibility = request_eligibility(&record);
        Ok(ToolPermissionOutcome {
            record,
            eligibility,
            replayed: false,
        })
    }

    /// Expire a request whose decision window has lapsed (a bounded read that a sweep
    /// or a later touch can drive). Returns the current record either way.
    pub fn expire_if_due(
        &self,
        tool_call_id: &ToolCallId,
        now_ms: i64,
    ) -> StoreResult<ToolPermissionRequestRecord> {
        let mut record = self.require(tool_call_id)?;
        self.expire_in_place(&mut record, now_ms)?;
        Ok(record)
    }

    /// The latest durable request for a tool call (by insert sequence).
    pub fn latest_for_tool_call(
        &self,
        tool_call_id: &ToolCallId,
    ) -> StoreResult<Option<ToolPermissionRequestRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_tool_permission_requests
             WHERE tool_call_id = ?1
             ORDER BY seq DESC
             LIMIT 1",
            [tool_call_id.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_record(&json)?)),
            None => Ok(None),
        }
    }

    fn require(&self, tool_call_id: &ToolCallId) -> StoreResult<ToolPermissionRequestRecord> {
        self.latest_for_tool_call(tool_call_id)?.ok_or_else(|| {
            StoreError::Permission(format!("no tool permission request for `{tool_call_id}`"))
        })
    }

    fn replay(&self, record: ToolPermissionRequestRecord) -> ToolPermissionOutcome {
        let eligibility = request_eligibility(&record);
        ToolPermissionOutcome {
            record,
            eligibility,
            replayed: true,
        }
    }

    fn expire_in_place(
        &self,
        record: &mut ToolPermissionRequestRecord,
        now_ms: i64,
    ) -> StoreResult<Option<ToolPermissionOutcome>> {
        if !record.is_expired(now_ms) {
            return Ok(None);
        }
        record.queue_state = ToolPermissionQueueState::Expired;
        record.updated_at_ms = now_ms;
        self.store_record(record)?;
        self.register_retention(record, LifecycleStatus::Expired)?;
        let eligibility = request_eligibility(record);
        Ok(Some(ToolPermissionOutcome {
            record: record.clone(),
            eligibility,
            replayed: false,
        }))
    }

    fn register_retention(
        &self,
        record: &ToolPermissionRequestRecord,
        lifecycle: LifecycleStatus,
    ) -> StoreResult<()> {
        let retention = RetentionRecord::new(
            RetentionRecordRef::new("tool_permission", record.tool_call_id.as_str())?,
            "tool_call",
            record.tool_call_id.as_str(),
            RetentionClass::ReviewMaterial,
            lifecycle,
            record.tool_call_id.as_str(),
            record.updated_at_ms,
        )?;
        self.uow.retention().upsert_record(&retention)
    }

    fn store_record(&self, record: &ToolPermissionRequestRecord) -> StoreResult<()> {
        validate_record(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Permission(err.to_string()))?;
        let (reviewer_id, reviewer_kind) = match &record.decision {
            Some(decision) => (
                Some(decision.reviewer.id.as_str().to_string()),
                Some(actor_kind_name(decision.reviewer.kind).to_string()),
            ),
            None => (None, None),
        };
        let decision = record
            .decision
            .as_ref()
            .map(|d| decision_as_str(d.decision));
        self.repo.execute(
            "INSERT INTO authoring_tool_permission_requests
                (tool_call_id, tool_name, risk_tier, scope_id, queue_state,
                 auto_permitted, decision, requester_actor_id, requester_actor_kind,
                 reviewer_actor_id, reviewer_actor_kind, idempotency_key, record_json,
                 created_at_ms, expires_at_ms, updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(tool_call_id) DO UPDATE SET
                queue_state = excluded.queue_state,
                auto_permitted = excluded.auto_permitted,
                decision = excluded.decision,
                reviewer_actor_id = excluded.reviewer_actor_id,
                reviewer_actor_kind = excluded.reviewer_actor_kind,
                record_json = excluded.record_json,
                expires_at_ms = excluded.expires_at_ms,
                updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.tool_call_id.as_str(),
                record.tool_name.as_str(),
                risk_tier_as_str(record.risk_tier),
                record.scope_id.as_str(),
                queue_state_as_str(record.queue_state),
                record.auto_permitted as i64,
                decision,
                record.requester.id.as_str(),
                actor_kind_name(record.requester.kind),
                reviewer_id,
                reviewer_kind,
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.created_at_ms,
                record.expires_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

/// The reviewer-authority gate for a HUMAN-GATED tool permission (P22-R1). A request
/// whose requirement is HumanApprovalRequired may be decided or claimed ONLY by a HUMAN
/// who is NOT the requester: a system actor's tool authority is the auto-permit lane the
/// mode policy owns, never the reviewer hat (security-provenance), and the requester
/// cannot decide its own request nor a delegate acting on its behalf — else the
/// human/dangerous floor becomes requester-self-approvable. Mirrors the
/// `automated_self_approval_blocker` shape (self / on-behalf) rather than re-deriving it.
fn tool_reviewer_authority_blocker(
    record: &ToolPermissionRequestRecord,
    reviewer: &ActorRef,
) -> Option<ActionEligibility> {
    // An auto-permitted read tool has no reviewer gate (policy already resolved it).
    if record.auto_permitted {
        return None;
    }
    if reviewer.kind != ActorKind::Human {
        return Some(ActionEligibility::denied(
            CommandKind::RequestToolPermission,
            "a human-gated tool permission may be decided only by a human reviewer",
        ));
    }
    let decides_as_requester = reviewer.id == record.requester.id;
    let decides_on_behalf = reviewer.delegated_by.as_ref() == Some(&record.requester.id);
    if decides_as_requester || decides_on_behalf {
        return Some(ActionEligibility::denied(
            CommandKind::RequestToolPermission,
            "the requester cannot decide its own tool permission request",
        ));
    }
    None
}

/// The served eligibility for whether the tool action may proceed. Granted → allowed;
/// otherwise a distinct, honest reason (rejected / expired / awaiting decision).
fn request_eligibility(record: &ToolPermissionRequestRecord) -> ActionEligibility {
    if record.granted() {
        return ActionEligibility::allowed(CommandKind::RequestToolPermission);
    }
    let reason = match record.queue_state {
        ToolPermissionQueueState::Expired => "tool permission request expired without a decision",
        ToolPermissionQueueState::Decided => {
            // Decided but not granted → an explicit reject.
            "tool permission was rejected by the reviewer"
        }
        ToolPermissionQueueState::Pending | ToolPermissionQueueState::Claimed => {
            "this tool capability requires an explicit human decision before it may proceed"
        }
    };
    ActionEligibility::denied(CommandKind::RequestToolPermission, reason)
}

fn read_record(json: &str) -> StoreResult<ToolPermissionRequestRecord> {
    serde_json::from_str(json).map_err(|err| StoreError::Permission(err.to_string()))
}

fn validate_record(record: &ToolPermissionRequestRecord) -> StoreResult<()> {
    if record.schema_version != TOOL_PERMISSION_SCHEMA {
        return Err(StoreError::Permission(format!(
            "unsupported tool permission schema `{}`",
            record.schema_version
        )));
    }
    if record.idempotency_key.trim().is_empty() {
        return Err(StoreError::Permission(
            "idempotency key cannot be empty".to_string(),
        ));
    }
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Permission(
            "updated_at_ms cannot be before created_at_ms".to_string(),
        ));
    }
    match (record.queue_state, &record.decision, record.auto_permitted) {
        // A decided state needs a decision unless it is an auto-permitted read tool.
        (ToolPermissionQueueState::Decided, None, false) => Err(StoreError::Permission(
            "a decided tool permission must carry a decision unless auto-permitted".to_string(),
        )),
        // An undecided or expired request cannot carry a decision.
        (
            ToolPermissionQueueState::Pending
            | ToolPermissionQueueState::Claimed
            | ToolPermissionQueueState::Expired,
            Some(_),
            _,
        ) => Err(StoreError::Permission(
            "an undecided or expired tool permission cannot carry a decision".to_string(),
        )),
        _ => Ok(()),
    }
}

fn queue_state_as_str(state: ToolPermissionQueueState) -> &'static str {
    match state {
        ToolPermissionQueueState::Pending => "pending",
        ToolPermissionQueueState::Claimed => "claimed",
        ToolPermissionQueueState::Decided => "decided",
        ToolPermissionQueueState::Expired => "expired",
    }
}

fn decision_as_str(decision: ToolPermissionDecisionKind) -> &'static str {
    match decision {
        ToolPermissionDecisionKind::Approve => "approve",
        ToolPermissionDecisionKind::Reject => "reject",
    }
}

fn risk_tier_as_str(tier: ToolRiskTier) -> &'static str {
    match tier {
        ToolRiskTier::ReadOnly => "read_only",
        ToolRiskTier::Mutating => "mutating",
        ToolRiskTier::Dangerous => "dangerous",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::{ActorId, ActorKind, CommandKind};
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn requester() -> ActorRef {
        actor("agent:requester", ActorKind::Agent)
    }

    fn reviewer() -> ActorRef {
        actor("human:reviewer", ActorKind::Human)
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:requester", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:other", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();
        (dir, store)
    }

    fn request(
        store: &mut Store,
        tool_call_id: &str,
        tool: SemanticToolName,
        ttl_ms: Option<i64>,
        now: i64,
    ) -> ToolPermissionOutcome {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                Ok(uow
                    .tool_permissions()
                    .request_permission(ToolPermissionRequestInput {
                        tool_call_id: ToolCallId::new(tool_call_id).unwrap(),
                        tool,
                        scope_id: "worktree".to_string(),
                        requester: requester(),
                        scope_mode: OperationMode::Manual,
                        session_override: None,
                        idempotency_key: format!("idem:{tool_call_id}"),
                        created_at_ms: now,
                        ttl_ms,
                    }))
            })
            .unwrap()
            .unwrap()
    }

    fn request_in_mode(
        store: &mut Store,
        tool_call_id: &str,
        tool: SemanticToolName,
        scope_mode: OperationMode,
        now: i64,
    ) -> ToolPermissionOutcome {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                Ok(uow
                    .tool_permissions()
                    .request_permission(ToolPermissionRequestInput {
                        tool_call_id: ToolCallId::new(tool_call_id).unwrap(),
                        tool,
                        scope_id: "worktree".to_string(),
                        requester: requester(),
                        scope_mode,
                        session_override: None,
                        idempotency_key: format!("idem:{tool_call_id}"),
                        created_at_ms: now,
                        ttl_ms: None,
                    }))
            })
            .unwrap()
            .unwrap()
    }

    fn decide(
        store: &mut Store,
        tool_call_id: &str,
        decision: ToolPermissionDecisionKind,
        reviewer: &ActorRef,
        now: i64,
    ) -> Result<ToolPermissionOutcome, PermissionError> {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                Ok(uow.tool_permissions().submit_decision(
                    &ToolCallId::new(tool_call_id).unwrap(),
                    decision,
                    reviewer,
                    None,
                    now,
                ))
            })
            .unwrap()
    }

    #[test]
    fn read_context_tool_is_auto_permitted_without_a_human_gate() {
        let (_dir, mut store) = temp_store();
        let outcome = request(
            &mut store,
            "call_read",
            SemanticToolName::ReadContext,
            None,
            10,
        );

        assert!(outcome.record.auto_permitted);
        assert!(outcome.record.is_decided());
        assert_eq!(outcome.record.risk_tier, ToolRiskTier::ReadOnly);
        assert!(outcome.record.granted());
        assert!(
            outcome.eligibility.allowed,
            "a read/context tool auto-permits: {:?}",
            outcome.eligibility.reason
        );
    }

    #[test]
    fn mutating_tool_requires_and_records_a_human_approval() {
        let (_dir, mut store) = temp_store();
        let opened = request(
            &mut store,
            "call_propose",
            SemanticToolName::ProposeChangeset,
            None,
            10,
        );
        assert_eq!(opened.record.risk_tier, ToolRiskTier::Mutating);
        assert_eq!(opened.record.queue_state, ToolPermissionQueueState::Pending);
        assert!(!opened.record.granted());
        assert!(
            !opened.eligibility.allowed
                && opened
                    .eligibility
                    .reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("human decision")),
            "a mutating tool is gated pending a human decision: {:?}",
            opened.eligibility
        );

        let decided = decide(
            &mut store,
            "call_propose",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            20,
        )
        .unwrap();
        assert!(decided.record.granted());
        assert_eq!(
            decided.record.queue_state,
            ToolPermissionQueueState::Decided
        );
        assert!(decided.eligibility.allowed);
    }

    #[test]
    fn dangerous_tool_can_be_rejected_and_stays_ungranted() {
        let (_dir, mut store) = temp_store();
        let opened = request(
            &mut store,
            "call_apply",
            SemanticToolName::RequestApply,
            None,
            10,
        );
        assert_eq!(opened.record.risk_tier, ToolRiskTier::Dangerous);

        let rejected = decide(
            &mut store,
            "call_apply",
            ToolPermissionDecisionKind::Reject,
            &reviewer(),
            20,
        )
        .unwrap();
        assert!(!rejected.record.granted());
        assert_eq!(
            rejected.record.decision.as_ref().unwrap().decision,
            ToolPermissionDecisionKind::Reject
        );
        assert!(
            !rejected.eligibility.allowed
                && rejected
                    .eligibility
                    .reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("rejected"))
        );
    }

    #[test]
    fn expired_request_cannot_be_decided() {
        let (_dir, mut store) = temp_store();
        request(
            &mut store,
            "call_expire",
            SemanticToolName::ProposeChangeset,
            Some(100),
            10,
        );

        // Decide well past the 100ms window: the request expires, no approval lands.
        let outcome = decide(
            &mut store,
            "call_expire",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            10 + 500,
        )
        .unwrap();
        assert_eq!(
            outcome.record.queue_state,
            ToolPermissionQueueState::Expired
        );
        assert!(outcome.record.decision.is_none(), "no decision is recorded");
        assert!(!outcome.record.granted());
        assert!(
            !outcome.eligibility.allowed
                && outcome
                    .eligibility
                    .reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("expired"))
        );
    }

    #[test]
    fn replayed_decision_is_idempotent() {
        let (_dir, mut store) = temp_store();
        request(
            &mut store,
            "call_replay",
            SemanticToolName::RequestApproval,
            None,
            10,
        );
        let first = decide(
            &mut store,
            "call_replay",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            20,
        )
        .unwrap();
        assert!(!first.replayed);

        let replay = decide(
            &mut store,
            "call_replay",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            30,
        )
        .unwrap();
        assert!(replay.replayed, "an identical decision replays");
        assert_eq!(
            replay.record.decision.as_ref().unwrap().decided_at_ms,
            20,
            "the recorded outcome is unchanged"
        );

        // A conflicting decision by a different reviewer is refused.
        let conflict = decide(
            &mut store,
            "call_replay",
            ToolPermissionDecisionKind::Reject,
            &actor("human:other", ActorKind::Human),
            40,
        )
        .unwrap_err();
        assert!(matches!(conflict, PermissionError::NotPermitted(_)));
    }

    #[test]
    fn multiple_simultaneous_requests_are_independent() {
        let (_dir, mut store) = temp_store();
        for id in ["call_a", "call_b", "call_c"] {
            request(&mut store, id, SemanticToolName::ProposeChangeset, None, 10);
        }
        // Decide only one; the others stay pending, each keyed by its own tool call.
        decide(
            &mut store,
            "call_b",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            20,
        )
        .unwrap();

        let states = store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                let mut out = Vec::new();
                for id in ["call_a", "call_b", "call_c"] {
                    let record = uow
                        .tool_permissions()
                        .latest_for_tool_call(&ToolCallId::new(id).unwrap())?
                        .unwrap();
                    out.push((record.queue_state, record.granted()));
                }
                Ok(out)
            })
            .unwrap();
        assert_eq!(states[0], (ToolPermissionQueueState::Pending, false));
        assert_eq!(states[1], (ToolPermissionQueueState::Decided, true));
        assert_eq!(states[2], (ToolPermissionQueueState::Pending, false));
    }

    #[test]
    fn claim_coordinates_but_is_not_authority() {
        let (_dir, mut store) = temp_store();
        request(&mut store, "call_claim", SemanticToolName::Cancel, None, 10);
        let claimed = store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                Ok(uow.tool_permissions().claim_permission(
                    &ToolCallId::new("call_claim").unwrap(),
                    &reviewer(),
                    20,
                ))
            })
            .unwrap()
            .unwrap();
        assert_eq!(
            claimed.record.queue_state,
            ToolPermissionQueueState::Claimed
        );
        assert_eq!(claimed.record.claimed_by.as_ref(), Some(&reviewer()));
        assert!(
            !claimed.record.granted() && !claimed.eligibility.allowed,
            "a claim does not grant the tool permission"
        );
    }

    #[test]
    fn re_request_is_idempotent_by_tool_call_id() {
        let (_dir, mut store) = temp_store();
        let first = request(
            &mut store,
            "call_dup",
            SemanticToolName::ProposeChangeset,
            None,
            10,
        );
        assert!(!first.replayed);
        let again = request(
            &mut store,
            "call_dup",
            SemanticToolName::ProposeChangeset,
            None,
            15,
        );
        assert!(
            again.replayed,
            "a re-request for the same tool call replays"
        );
        assert_eq!(again.record.created_at_ms, 10, "the original record stands");
    }

    #[test]
    fn mutating_tool_auto_permits_under_autonomous_but_stays_gated_under_manual() {
        let (_dir, mut store) = temp_store();
        // Autonomous scope: a Mutating tool auto-permits (its proposal still rides the
        // changeset approval matrix — no double gate).
        let autonomous = request_in_mode(
            &mut store,
            "call_auto",
            SemanticToolName::ProposeChangeset,
            OperationMode::Autonomous,
            10,
        );
        assert_eq!(autonomous.record.effective_mode, OperationMode::Autonomous);
        assert!(
            autonomous.record.auto_permitted && autonomous.record.granted(),
            "a mutating tool auto-permits under autonomous"
        );
        assert!(autonomous.eligibility.allowed);

        // Manual scope: the same Mutating tool queues for a human decision.
        let manual = request_in_mode(
            &mut store,
            "call_manual",
            SemanticToolName::ProposeChangeset,
            OperationMode::Manual,
            10,
        );
        assert!(!manual.record.auto_permitted && !manual.record.granted());
        assert_eq!(manual.record.queue_state, ToolPermissionQueueState::Pending);
    }

    #[test]
    fn dangerous_tool_stays_human_gated_even_under_autonomous() {
        let (_dir, mut store) = temp_store();
        // The dangerous floor holds regardless of mode — autonomy never auto-permits it.
        let outcome = request_in_mode(
            &mut store,
            "call_danger",
            SemanticToolName::RequestApply,
            OperationMode::Autonomous,
            10,
        );
        assert_eq!(outcome.record.risk_tier, ToolRiskTier::Dangerous);
        assert_eq!(outcome.record.effective_mode, OperationMode::Autonomous);
        assert!(
            !outcome.record.auto_permitted && !outcome.record.granted(),
            "dangerous stays human-gated even under autonomous"
        );
        assert_eq!(
            outcome.record.queue_state,
            ToolPermissionQueueState::Pending
        );
    }

    fn human_gated_record(requester: &ActorRef) -> ToolPermissionRequestRecord {
        ToolPermissionRequestRecord::from_input(
            &ToolPermissionRequestInput {
                tool_call_id: ToolCallId::new("call_auth").unwrap(),
                tool: SemanticToolName::RequestApply,
                scope_id: "worktree".to_string(),
                requester: requester.clone(),
                scope_mode: OperationMode::Autonomous,
                session_override: None,
                idempotency_key: "idem:auth".to_string(),
                created_at_ms: 10,
                ttl_ms: None,
            },
            ToolPermissionRequirement::HumanApprovalRequired,
            OperationMode::Autonomous,
        )
    }

    #[test]
    fn reviewer_authority_blocker_denies_non_human_and_self_decide() {
        let requester = actor("agent:requester", ActorKind::Agent);
        let record = human_gated_record(&requester);
        assert!(!record.auto_permitted);

        // Agent self-decide DENIED.
        assert!(tool_reviewer_authority_blocker(&record, &requester).is_some());
        // A ToolExecutor delegate of the requester DENIED (non-human AND on-behalf).
        let tool_delegate = ActorRef {
            id: ActorId::new("tool:writer").unwrap(),
            kind: ActorKind::ToolExecutor,
            delegated_by: Some(ActorId::new("agent:requester").unwrap()),
        };
        assert!(tool_reviewer_authority_blocker(&record, &tool_delegate).is_some());
        // A System actor DENIED (system's tool authority is the auto-permit lane).
        let system = actor("system:auto", ActorKind::System);
        assert!(tool_reviewer_authority_blocker(&record, &system).is_some());
        // A human delegate acting on behalf of the requester is STILL denied (self-decide).
        let human_delegate = ActorRef {
            id: ActorId::new("human:proxy").unwrap(),
            kind: ActorKind::Human,
            delegated_by: Some(ActorId::new("agent:requester").unwrap()),
        };
        assert!(tool_reviewer_authority_blocker(&record, &human_delegate).is_some());
        // A DISTINCT human passes.
        let human = actor("human:reviewer", ActorKind::Human);
        assert!(tool_reviewer_authority_blocker(&record, &human).is_none());
        // An auto-permitted read tool has no reviewer gate at all.
        let read_record = ToolPermissionRequestRecord::from_input(
            &ToolPermissionRequestInput {
                tool_call_id: ToolCallId::new("call_read").unwrap(),
                tool: SemanticToolName::ReadContext,
                scope_id: "worktree".to_string(),
                requester: requester.clone(),
                scope_mode: OperationMode::Manual,
                session_override: None,
                idempotency_key: "idem:read".to_string(),
                created_at_ms: 10,
                ttl_ms: None,
            },
            ToolPermissionRequirement::AutoPermitted,
            OperationMode::Manual,
        );
        assert!(read_record.auto_permitted);
        assert!(tool_reviewer_authority_blocker(&read_record, &requester).is_none());
    }

    #[test]
    fn requester_cannot_self_decide_but_a_distinct_human_can() {
        let (_dir, mut store) = temp_store();
        // A dangerous tool requested by the agent — human-gated in every mode.
        request(
            &mut store,
            "call_auth",
            SemanticToolName::RequestApply,
            None,
            10,
        );

        // The requester (agent) approving its OWN request is denied — no decision lands,
        // the dangerous floor is NOT self-approvable.
        let self_decide = decide(
            &mut store,
            "call_auth",
            ToolPermissionDecisionKind::Approve,
            &requester(),
            20,
        )
        .unwrap();
        assert!(!self_decide.eligibility.allowed && !self_decide.record.granted());
        assert!(
            self_decide.record.decision.is_none(),
            "a denied self-decide records nothing"
        );
        // The requester is an agent, so the kind gate fires first (a human-gated tool
        // needs a HUMAN reviewer); the self-decide gate itself is covered directly in
        // `reviewer_authority_blocker_denies_non_human_and_self_decide`.
        assert!(
            self_decide
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("human reviewer"))
        );

        // A distinct human reviewer approves.
        let approved = decide(
            &mut store,
            "call_auth",
            ToolPermissionDecisionKind::Approve,
            &reviewer(),
            30,
        )
        .unwrap();
        assert!(approved.eligibility.allowed && approved.record.granted());
    }
}
