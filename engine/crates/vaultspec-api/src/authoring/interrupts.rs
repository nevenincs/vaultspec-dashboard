//! Interrupt resume and tool-call records (W12.P32).
//!
//! A LangGraph run pauses on interrupts (tool-permission and changeset-approval
//! requests) and resumes when a human decides. This module owns the DURABLE product
//! side of that (langgraph-integration ADR): interrupts normalized to stable domain
//! records keyed by a stable interrupt id, resume-by-interrupt-id (never by position),
//! tool-call records, and the replay-safe decision handling — all surviving
//! independently of LangGraph checkpoint pruning.
//!
//! THE EXECUTOR BAR (arch-reviewer P32): the tool-execution surface must consult the
//! P22 permission plane before running any tool. A read/context tool runs freely; a
//! MUTATING or DANGEROUS tool runs ONLY if its `tool_permission_request` is GRANTED
//! (`permissions::ToolPermissionRequestRecord::granted`). This is where the permission
//! plane built in P22 becomes real — without this gate, a granted-or-not permission is
//! inert. The gate is a PURE decision over the tool's risk tier + the (looked-up)
//! permission record; the caller resolves the record by `tool_call_id`.
//!
//! This first checkpoint lands the executor gate; the durable interrupt/tool-call
//! records, resume-by-id, and replay handling (a fresh v16 store table) follow.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::model::{ActionEligibility, InterruptId, ProposalId, RunId, ToolCallId};
use super::permissions::{ToolPermissionDecisionKind, ToolPermissionRequestRecord};
use super::policy::ToolRiskTier;
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};
use super::tools::SemanticToolName;

const INTERRUPT_SCHEMA: &str = "authoring.interrupt.v1";
const TOOL_CALL_SCHEMA: &str = "authoring.tool_call.v1";

/// What a LangGraph interrupt asks a human to decide. V1 raises exactly one kind: a
/// bounded `tool_permission` action (the executor gate). Product changeset approval is
/// review-station STATE keyed by `proposal_id` (approval-gates ADR), decided async via
/// the review-decision route — NOT a run-suspending interrupt — so no changeset-approval
/// interrupt kind is constructed anywhere. (The langgraph-integration ADR sketches a
/// `changeset_approval_request` interrupt payload for a future pause-on-approval node;
/// that kind returns with its wiring if/when such a node is built.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptKind {
    ToolPermission,
}

/// Whether an interrupt still awaits a human decision or has been resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptResumeState {
    Pending,
    Resolved,
}

/// A durable, normalized interrupt record keyed by a STABLE `interrupt_id` — so
/// multiple simultaneous interrupts resume BY ID, never by position
/// (langgraph-integration ADR). It is PRODUCT state and survives independently of
/// LangGraph checkpoint pruning; the run may replay the interrupted node, so resume is
/// idempotent (a replayed resume returns the recorded outcome, never re-decides).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterruptRecord {
    pub schema_version: String,
    pub interrupt_id: InterruptId,
    pub run_id: RunId,
    pub kind: InterruptKind,
    /// The tool call this interrupt gates. Set for every V1 interrupt (the sole
    /// `tool_permission` kind).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<ToolCallId>,
    /// The proposal an interrupt gates. Reserved: always `None` in V1 (product
    /// approval is review-station state, not an interrupt); a future pause-on-approval
    /// node would set it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<ProposalId>,
    pub resume_state: InterruptResumeState,
    /// The recorded human decision payload (opaque domain JSON), set on resolve.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<String>,
    pub idempotency_key: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl InterruptRecord {
    pub fn is_resolved(&self) -> bool {
        matches!(self.resume_state, InterruptResumeState::Resolved)
    }
}

/// The bounded page cap for the served interrupt listing (agent-wire-gaps ADR D3): a
/// recovery read of a run's interrupts is capped so a pathological run can never serve
/// an unbounded page. The `interrupts_for_run` store query already `LIMIT`s; the page
/// builder fetches one past the cap to set an honest `truncated` marker.
pub const INTERRUPT_LIST_CAP: u32 = 50;

/// The typed `tool_permission` decision (agent-wire-gaps ADR D3): the SAME shape as
/// `ToolPermissionDecisionRequest` (the resume write), so the read and write speak ONE
/// language rather than an opaque decision string on the wire. A resolved interrupt's
/// stored decision blob parses through this; a blob that predates the typed schema
/// degrades to [`InterruptDecisionProjection::DecisionUnreadable`] per record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolPermissionInterruptDecision {
    pub decision: ToolPermissionDecisionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// The typed, per-kind human decision projected onto a resolved interrupt (D3). For the
/// sole V1 `tool_permission` kind this is the approve/reject + optional comment the
/// resume write records; a stored decision that does not parse as the typed schema (a
/// legacy opaque blob) projects as `decision_unreadable` so the page degrades per
/// record rather than failing wholesale.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum InterruptDecisionProjection {
    ToolPermission {
        decision: ToolPermissionDecisionKind,
        #[serde(skip_serializing_if = "Option::is_none")]
        comment: Option<String>,
    },
    DecisionUnreadable,
}

/// One interrupt as served on the recovery listing (D3): the stable id, the run it
/// gates, its kind, the gated tool call, its resume state (a `pending` entry is the
/// flag a client recovers a still-open permission prompt from), the raise/resolve
/// timestamps, and — when resolved — the typed decision projection. A pending
/// interrupt carries no `decision`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterruptProjection {
    pub interrupt_id: InterruptId,
    pub run_id: RunId,
    pub kind: InterruptKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<ToolCallId>,
    pub resume_state: InterruptResumeState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<InterruptDecisionProjection>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// A bounded page of interrupt projections for one run (D3): raise-order items, the
/// applied `cap`, and an honest `truncated` marker set when more interrupts exist than
/// the cap serves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterruptListPage {
    pub items: Vec<InterruptProjection>,
    pub cap: u32,
    pub truncated: bool,
}

/// Project the recorded human decision on an interrupt into its typed per-kind schema
/// (D3). `None` for a still-pending interrupt (no decision recorded); a resolved
/// interrupt whose opaque decision blob does not parse as the typed schema yields
/// `DecisionUnreadable` rather than an error, so one legacy record never fails the page.
pub fn project_interrupt_decision(record: &InterruptRecord) -> Option<InterruptDecisionProjection> {
    let raw = record.decision.as_deref()?;
    Some(match record.kind {
        InterruptKind::ToolPermission => {
            match serde_json::from_str::<ToolPermissionInterruptDecision>(raw) {
                Ok(parsed) => InterruptDecisionProjection::ToolPermission {
                    decision: parsed.decision,
                    comment: parsed.comment,
                },
                Err(_) => InterruptDecisionProjection::DecisionUnreadable,
            }
        }
    })
}

/// Project a durable interrupt record onto its served shape (D3), parsing its recorded
/// decision through [`project_interrupt_decision`].
pub fn project_interrupt(record: InterruptRecord) -> InterruptProjection {
    let decision = project_interrupt_decision(&record);
    InterruptProjection {
        interrupt_id: record.interrupt_id,
        run_id: record.run_id,
        kind: record.kind,
        tool_call_id: record.tool_call_id,
        resume_state: record.resume_state,
        decision,
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
    }
}

/// A durable tool-call record: the agent tool call, its risk tier, and whether the
/// executor gate PERMITTED it to run (the P22 permission plane, snapshotted at
/// execution). Bounded, product state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolCallRecord {
    pub schema_version: String,
    pub tool_call_id: ToolCallId,
    pub run_id: RunId,
    pub tool_name: String,
    pub risk_tier: ToolRiskTier,
    /// The executor-gate outcome: whether the tool was permitted to execute.
    pub permitted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refusal_reason: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// The EXECUTOR BAR: may this tool call execute? A read/context tool always may — it
/// has no side effect and needs no permission. A mutating or dangerous tool may run
/// ONLY if its tool permission exists AND is granted (`granted()` — an auto-permitted
/// read tool or an explicit approve). A missing or ungranted permission is a denial
/// (denials-are-values), each with a distinct honest reason.
///
/// `permission` is the durable [`ToolPermissionRequestRecord`] the caller resolved by
/// `tool_call_id`; it is `None` when no request was ever opened for this call.
pub fn tool_execution_gate(
    tool: SemanticToolName,
    permission: Option<&ToolPermissionRequestRecord>,
) -> ActionEligibility {
    let command = tool.command();
    match tool.risk_tier() {
        // A read/context tool runs freely — no permission gate.
        ToolRiskTier::ReadOnly => ActionEligibility::allowed(command),
        // A mutating/dangerous tool must hold a GRANTED permission before it runs.
        ToolRiskTier::Mutating | ToolRiskTier::Dangerous => match permission {
            Some(record) if record.granted() => ActionEligibility::allowed(command),
            Some(_) => ActionEligibility::denied(
                command,
                "tool permission is not granted; the tool call cannot execute",
            ),
            None => ActionEligibility::denied(
                command,
                "a non-read-only tool requires a granted tool permission before execution",
            ),
        },
    }
}

/// Whether the executor may proceed — the boolean form of [`tool_execution_gate`].
pub fn tool_execution_permitted(
    tool: SemanticToolName,
    permission: Option<&ToolPermissionRequestRecord>,
) -> bool {
    tool_execution_gate(tool, permission).allowed
}

/// Input to record a raised interrupt. The sole V1 `tool_permission` interrupt carries
/// the gated `tool_call_id`; `proposal_id` is reserved (always `None` today).
#[derive(Debug, Clone)]
pub struct RecordInterruptInput {
    pub interrupt_id: InterruptId,
    pub run_id: RunId,
    pub kind: InterruptKind,
    pub tool_call_id: Option<ToolCallId>,
    pub proposal_id: Option<ProposalId>,
    pub idempotency_key: String,
    pub created_at_ms: i64,
}

/// Input to record a tool call's executor-gate outcome (`permitted` + `refusal_reason`,
/// as produced by [`tool_execution_gate`]). `tool` supplies the durable `tool_name` and
/// `risk_tier`.
#[derive(Debug, Clone)]
pub struct RecordToolCallInput {
    pub tool_call_id: ToolCallId,
    pub run_id: RunId,
    pub tool: SemanticToolName,
    pub permitted: bool,
    pub refusal_reason: Option<String>,
    pub created_at_ms: i64,
}

/// The outcome of recording or resolving an interrupt. `replayed` is true when the call
/// found an existing record and returned it unchanged (idempotent replay) rather than
/// writing — so a re-raised interrupt or a replayed resume never re-decides.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterruptOutcome {
    pub record: InterruptRecord,
    pub replayed: bool,
}

/// The outcome of recording a tool call. `replayed` is true when the call replayed an
/// existing record for the same `tool_call_id` rather than writing a fresh one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCallOutcome {
    pub record: ToolCallRecord,
    pub replayed: bool,
}

/// The durable interrupt repository (langgraph-integration ADR): raise-and-resolve of
/// interrupt records keyed by a STABLE `interrupt_id`. Resolve is resume-BY-ID and
/// replay-safe — a replayed resume returns the recorded decision, never re-decides.
pub struct InterruptRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn interrupts<'repo>(&'repo self) -> InterruptRepository<'repo, 'conn> {
        InterruptRepository {
            repo: self.repository("authoring_interrupts"),
            uow: self,
        }
    }
}

impl InterruptRepository<'_, '_> {
    /// Record a raised interrupt as `Pending`. Idempotent by `interrupt_id`: a re-raise
    /// of the same id replays the recorded state (never a second row, never a reset of a
    /// resolved interrupt back to pending).
    pub fn record_interrupt(&self, input: RecordInterruptInput) -> StoreResult<InterruptOutcome> {
        if let Some(existing) = self.get(&input.interrupt_id)? {
            return Ok(InterruptOutcome {
                record: existing,
                replayed: true,
            });
        }
        let record = InterruptRecord {
            schema_version: INTERRUPT_SCHEMA.to_string(),
            interrupt_id: input.interrupt_id,
            run_id: input.run_id,
            kind: input.kind,
            tool_call_id: input.tool_call_id,
            proposal_id: input.proposal_id,
            resume_state: InterruptResumeState::Pending,
            decision: None,
            idempotency_key: input.idempotency_key,
            created_at_ms: input.created_at_ms,
            updated_at_ms: input.created_at_ms,
        };
        self.store_record(&record)?;
        // A pending interrupt awaits a human decision → protected product state that must
        // outlive checkpoint pruning until resolved.
        self.register_retention(&record, LifecycleStatus::Pending)?;
        Ok(InterruptOutcome {
            record,
            replayed: false,
        })
    }

    /// Resolve an interrupt BY ID with a recorded decision (opaque domain JSON). Replay
    /// safe: an already-resolved interrupt returns its recorded outcome unchanged (the
    /// run may replay the interrupted node — resume must be idempotent and never
    /// re-decide). Resolving an unknown id is a fault.
    pub fn resolve_interrupt(
        &self,
        interrupt_id: &InterruptId,
        decision: String,
        now_ms: i64,
    ) -> StoreResult<InterruptOutcome> {
        let mut record = self.require(interrupt_id)?;
        if record.is_resolved() {
            return Ok(InterruptOutcome {
                record,
                replayed: true,
            });
        }
        record.resume_state = InterruptResumeState::Resolved;
        record.decision = Some(decision);
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        // A resolved interrupt is settled product state; keep it protected as an audit of
        // the decision that resumed the run.
        self.register_retention(&record, LifecycleStatus::Active)?;
        Ok(InterruptOutcome {
            record,
            replayed: false,
        })
    }

    /// The durable interrupt for a stable id, if any.
    pub fn get(&self, interrupt_id: &InterruptId) -> StoreResult<Option<InterruptRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_interrupts
             WHERE interrupt_id = ?1",
            [interrupt_id.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_interrupt(&json)?)),
            None => Ok(None),
        }
    }

    /// Every interrupt for a run in raise order, bounded by `cap` — the resume listing
    /// that resolves BY ID rather than by position.
    pub fn interrupts_for_run(
        &self,
        run_id: &RunId,
        cap: u32,
    ) -> StoreResult<Vec<InterruptRecord>> {
        let rows = self.repo.query_collect(
            "SELECT record_json
             FROM authoring_interrupts
             WHERE run_id = ?1
             ORDER BY seq ASC
             LIMIT ?2",
            rusqlite::params![run_id.as_str(), cap],
            |row| row.get::<_, String>(0),
        )?;
        rows.iter().map(|json| read_interrupt(json)).collect()
    }

    /// The bounded, raise-order interrupt page for a run (agent-wire-gaps ADR D3) — the
    /// recovery listing a client that lost its `/execute` `awaiting_permission` response
    /// reads its pending interrupts back from. Reuses `interrupts_for_run` (no new store
    /// query): it fetches one past the clamped cap to set an honest `truncated` marker,
    /// then projects each record through the typed decision schema. The requested `cap`
    /// is clamped to `INTERRUPT_LIST_CAP`.
    pub fn interrupts_list_page(&self, run_id: &RunId, cap: u32) -> StoreResult<InterruptListPage> {
        let cap = cap.clamp(1, INTERRUPT_LIST_CAP);
        let rows = self.interrupts_for_run(run_id, cap.saturating_add(1))?;
        let truncated = rows.len() as u32 > cap;
        let items = rows
            .into_iter()
            .take(cap as usize)
            .map(project_interrupt)
            .collect();
        Ok(InterruptListPage {
            items,
            cap,
            truncated,
        })
    }

    fn require(&self, interrupt_id: &InterruptId) -> StoreResult<InterruptRecord> {
        self.get(interrupt_id)?.ok_or_else(|| {
            StoreError::Validation(format!("no interrupt record for `{interrupt_id}`"))
        })
    }

    fn register_retention(
        &self,
        record: &InterruptRecord,
        lifecycle: LifecycleStatus,
    ) -> StoreResult<()> {
        let retention = RetentionRecord::new(
            RetentionRecordRef::new("interrupt", record.interrupt_id.as_str())?,
            "interrupt",
            record.interrupt_id.as_str(),
            RetentionClass::ProtectedProductState,
            lifecycle,
            record.interrupt_id.as_str(),
            record.updated_at_ms,
        )?;
        self.uow.retention().upsert_record(&retention)
    }

    fn store_record(&self, record: &InterruptRecord) -> StoreResult<()> {
        if record.schema_version != INTERRUPT_SCHEMA {
            return Err(StoreError::Validation(format!(
                "unsupported interrupt schema `{}`",
                record.schema_version
            )));
        }
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Validation(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_interrupts
                (interrupt_id, run_id, kind, tool_call_id, proposal_id, resume_state,
                 decision, idempotency_key, record_json, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(interrupt_id) DO UPDATE SET
                resume_state = excluded.resume_state,
                decision = excluded.decision,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.interrupt_id.as_str(),
                record.run_id.as_str(),
                interrupt_kind_column(record.kind),
                record.tool_call_id.as_ref().map(ToolCallId::as_str),
                record.proposal_id.as_ref().map(ProposalId::as_str),
                resume_state_column(record.resume_state),
                record.decision.as_deref(),
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

/// The durable tool-call repository: snapshots each tool call's executor-gate outcome as
/// bounded product state. Idempotent by `tool_call_id`.
pub struct ToolCallRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn tool_call_records<'repo>(&'repo self) -> ToolCallRepository<'repo, 'conn> {
        ToolCallRepository {
            repo: self.repository("authoring_tool_call_records"),
            uow: self,
        }
    }
}

impl ToolCallRepository<'_, '_> {
    /// Record a tool call's executor-gate outcome. Idempotent by `tool_call_id`: a
    /// re-record replays the existing snapshot rather than overwriting the recorded
    /// decision.
    pub fn record_tool_call(&self, input: RecordToolCallInput) -> StoreResult<ToolCallOutcome> {
        if let Some(existing) = self.get(&input.tool_call_id)? {
            return Ok(ToolCallOutcome {
                record: existing,
                replayed: true,
            });
        }
        let record = ToolCallRecord {
            schema_version: TOOL_CALL_SCHEMA.to_string(),
            tool_call_id: input.tool_call_id,
            run_id: input.run_id,
            tool_name: input.tool.as_str().to_string(),
            risk_tier: input.tool.risk_tier(),
            permitted: input.permitted,
            refusal_reason: input.refusal_reason,
            created_at_ms: input.created_at_ms,
            updated_at_ms: input.created_at_ms,
        };
        self.store_record(&record)?;
        self.register_retention(&record)?;
        Ok(ToolCallOutcome {
            record,
            replayed: false,
        })
    }

    /// The durable tool-call record for a call id, if any.
    pub fn get(&self, tool_call_id: &ToolCallId) -> StoreResult<Option<ToolCallRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_tool_call_records
             WHERE tool_call_id = ?1",
            [tool_call_id.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_tool_call(&json)?)),
            None => Ok(None),
        }
    }

    fn register_retention(&self, record: &ToolCallRecord) -> StoreResult<()> {
        let retention = RetentionRecord::new(
            RetentionRecordRef::new("tool_call_record", record.tool_call_id.as_str())?,
            "tool_call",
            record.tool_call_id.as_str(),
            RetentionClass::AuditReceipt,
            LifecycleStatus::Active,
            record.tool_call_id.as_str(),
            record.updated_at_ms,
        )?;
        self.uow.retention().upsert_record(&retention)
    }

    fn store_record(&self, record: &ToolCallRecord) -> StoreResult<()> {
        if record.schema_version != TOOL_CALL_SCHEMA {
            return Err(StoreError::Validation(format!(
                "unsupported tool-call schema `{}`",
                record.schema_version
            )));
        }
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Validation(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_tool_call_records
                (tool_call_id, run_id, tool_name, risk_tier, permitted, refusal_reason,
                 record_json, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(tool_call_id) DO NOTHING",
            rusqlite::params![
                record.tool_call_id.as_str(),
                record.run_id.as_str(),
                record.tool_name.as_str(),
                risk_tier_column(record.risk_tier),
                record.permitted as i64,
                record.refusal_reason.as_deref(),
                record_json.as_str(),
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

fn read_interrupt(json: &str) -> StoreResult<InterruptRecord> {
    serde_json::from_str(json).map_err(|err| StoreError::Validation(err.to_string()))
}

fn read_tool_call(json: &str) -> StoreResult<ToolCallRecord> {
    serde_json::from_str(json).map_err(|err| StoreError::Validation(err.to_string()))
}

fn interrupt_kind_column(kind: InterruptKind) -> &'static str {
    match kind {
        InterruptKind::ToolPermission => "tool_permission",
    }
}

fn resume_state_column(state: InterruptResumeState) -> &'static str {
    match state {
        InterruptResumeState::Pending => "pending",
        InterruptResumeState::Resolved => "resolved",
    }
}

fn risk_tier_column(tier: ToolRiskTier) -> &'static str {
    match tier {
        ToolRiskTier::ReadOnly => "read_only",
        ToolRiskTier::Mutating => "mutating",
        ToolRiskTier::Dangerous => "dangerous",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::{ActorId, ActorKind, ActorRef, ToolCallId};
    use crate::authoring::permissions::{ToolPermissionQueueState, ToolPermissionRequestRecord};
    use crate::authoring::policy::OperationMode;

    fn requester() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:requester").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    /// A minimal permission record for a tool call in a given decided state, so the
    /// gate can be exercised without the full request/decide flow.
    fn permission(
        tool: SemanticToolName,
        queue_state: ToolPermissionQueueState,
        auto_permitted: bool,
    ) -> ToolPermissionRequestRecord {
        ToolPermissionRequestRecord {
            schema_version: "authoring.tool_permission.v1".to_string(),
            tool_call_id: ToolCallId::new("call_1").unwrap(),
            tool_name: tool.as_str().to_string(),
            risk_tier: tool.risk_tier(),
            scope_id: "worktree".to_string(),
            requester: requester(),
            effective_mode: OperationMode::Manual,
            queue_state,
            auto_permitted,
            claimed_by: None,
            decision: None,
            idempotency_key: "idem:1".to_string(),
            created_at_ms: 10,
            expires_at_ms: 10,
            updated_at_ms: 10,
        }
    }

    #[test]
    fn read_only_tool_runs_without_any_permission() {
        // A read/context tool executes freely — no permission record needed.
        let gate = tool_execution_gate(SemanticToolName::ReadContext, None);
        assert!(gate.allowed);
        assert!(tool_execution_permitted(
            SemanticToolName::SearchGraph,
            None
        ));
    }

    #[test]
    fn mutating_tool_refused_without_a_granted_permission() {
        // No permission at all → refused.
        let missing = tool_execution_gate(SemanticToolName::ProposeChangeset, None);
        assert!(!missing.allowed);
        assert!(
            missing
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("granted tool permission"))
        );

        // A pending (undecided) permission is NOT granted → refused.
        let pending = permission(
            SemanticToolName::ProposeChangeset,
            ToolPermissionQueueState::Pending,
            false,
        );
        assert!(!pending.granted());
        let gate = tool_execution_gate(SemanticToolName::ProposeChangeset, Some(&pending));
        assert!(!gate.allowed);
        assert!(
            gate.reason
                .as_deref()
                .is_some_and(|reason| reason.contains("not granted"))
        );
    }

    #[test]
    fn mutating_tool_runs_with_a_granted_permission() {
        // A decided-approved permission grants execution. (Model a granted record via
        // the auto-permitted decided state — granted() is true either way.)
        let mut granted = permission(
            SemanticToolName::ProposeChangeset,
            ToolPermissionQueueState::Decided,
            true,
        );
        granted.auto_permitted = true; // decided + granted
        assert!(granted.granted());
        let gate = tool_execution_gate(SemanticToolName::ProposeChangeset, Some(&granted));
        assert!(
            gate.allowed,
            "a granted permission lets the tool run: {gate:?}"
        );
    }

    #[test]
    fn dangerous_tool_holds_the_gate_regardless() {
        // RequestApply is Dangerous — refused without a grant, allowed with one.
        assert!(!tool_execution_permitted(
            SemanticToolName::RequestApply,
            None
        ));
        let granted = permission(
            SemanticToolName::RequestApply,
            ToolPermissionQueueState::Decided,
            true,
        );
        assert!(tool_execution_permitted(
            SemanticToolName::RequestApply,
            Some(&granted)
        ));
    }

    // ---- durable interrupt + tool-call records (S158) --------------------------------

    use crate::authoring::model::{CommandKind, InterruptId, RunId};
    use crate::authoring::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join(".vault")).unwrap();
        (dir, store)
    }

    fn raise(
        store: &mut Store,
        interrupt_id: &str,
        run_id: &str,
        kind: InterruptKind,
        now: i64,
    ) -> InterruptOutcome {
        store
            .with_unit_of_work(CommandKind::ResumeRun, |uow| {
                Ok(uow.interrupts().record_interrupt(RecordInterruptInput {
                    interrupt_id: InterruptId::new(interrupt_id).unwrap(),
                    run_id: RunId::new(run_id).unwrap(),
                    kind,
                    tool_call_id: Some(ToolCallId::new("call_1").unwrap()),
                    proposal_id: None,
                    idempotency_key: format!("idem:{interrupt_id}"),
                    created_at_ms: now,
                }))
            })
            .unwrap()
            .unwrap()
    }

    fn resolve(
        store: &mut Store,
        interrupt_id: &str,
        decision: &str,
        now: i64,
    ) -> InterruptOutcome {
        store
            .with_unit_of_work(CommandKind::ResumeRun, |uow| {
                uow.interrupts().resolve_interrupt(
                    &InterruptId::new(interrupt_id).unwrap(),
                    decision.to_string(),
                    now,
                )
            })
            .unwrap()
    }

    #[test]
    fn simultaneous_interrupts_resolve_independently_by_stable_id() {
        // Two interrupts on ONE run resume by their stable ids, never by position:
        // resolving one leaves the other pending.
        let (_dir, mut store) = temp_store();
        raise(
            &mut store,
            "interrupt:run1/a",
            "run:1",
            InterruptKind::ToolPermission,
            10,
        );
        raise(
            &mut store,
            "interrupt:run1/b",
            "run:1",
            InterruptKind::ToolPermission,
            11,
        );

        let resolved = resolve(&mut store, "interrupt:run1/a", "{\"approve\":true}", 20);
        assert!(!resolved.replayed);
        assert!(resolved.record.is_resolved());

        let listing = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .interrupts_for_run(&RunId::new("run:1").unwrap(), 100)
            })
            .unwrap();
        assert_eq!(listing.len(), 2);
        // Raise order preserved; the second is still pending — the first resolve did not
        // touch it by position.
        assert_eq!(listing[0].interrupt_id.as_str(), "interrupt:run1/a");
        assert!(listing[0].is_resolved());
        assert_eq!(listing[1].interrupt_id.as_str(), "interrupt:run1/b");
        assert!(!listing[1].is_resolved());
    }

    #[test]
    fn resolve_is_replay_safe_and_never_re_decides() {
        // A replayed resume returns the RECORDED decision, never re-decides — the run may
        // replay the interrupted node after resuming.
        let (_dir, mut store) = temp_store();
        raise(
            &mut store,
            "interrupt:run2/a",
            "run:2",
            InterruptKind::ToolPermission,
            10,
        );
        let first = resolve(&mut store, "interrupt:run2/a", "approve", 20);
        assert!(!first.replayed);
        assert_eq!(first.record.decision.as_deref(), Some("approve"));

        // A second resolve with a DIFFERENT decision replays the recorded outcome.
        let replay = resolve(&mut store, "interrupt:run2/a", "reject", 30);
        assert!(replay.replayed);
        assert_eq!(replay.record.decision.as_deref(), Some("approve"));
        assert_eq!(replay.record.updated_at_ms, 20, "no re-write on replay");
    }

    #[test]
    fn re_raised_interrupt_replays_and_does_not_duplicate() {
        let (_dir, mut store) = temp_store();
        raise(
            &mut store,
            "interrupt:run3/a",
            "run:3",
            InterruptKind::ToolPermission,
            10,
        );
        let again = raise(
            &mut store,
            "interrupt:run3/a",
            "run:3",
            InterruptKind::ToolPermission,
            99,
        );
        assert!(again.replayed);
        assert_eq!(
            again.record.created_at_ms, 10,
            "original preserved on re-raise"
        );

        let listing = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .interrupts_for_run(&RunId::new("run:3").unwrap(), 100)
            })
            .unwrap();
        assert_eq!(listing.len(), 1, "re-raise is idempotent, not a second row");
    }

    #[test]
    fn interrupt_record_survives_store_reopen() {
        // Product state survives independently of checkpoint pruning — modelled here by a
        // store reopen: the record is still there.
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        {
            let mut store = Store::open(&vault_root).unwrap();
            raise(
                &mut store,
                "interrupt:run4/a",
                "run:4",
                InterruptKind::ToolPermission,
                10,
            );
        }
        let mut reopened = Store::open(&vault_root).unwrap();
        let found = reopened
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .get(&InterruptId::new("interrupt:run4/a").unwrap())
            })
            .unwrap();
        let record = found.expect("interrupt survives reopen");
        assert_eq!(record.kind, InterruptKind::ToolPermission);
        assert_eq!(record.tool_call_id.as_ref().unwrap().as_str(), "call_1");
        assert!(!record.is_resolved());
    }

    #[test]
    fn tool_call_record_snapshots_the_gate_and_is_idempotent() {
        let (_dir, mut store) = temp_store();

        // A refused mutating call (no grant) records permitted=false + the refusal.
        let gate = tool_execution_gate(SemanticToolName::ProposeChangeset, None);
        let refused = store
            .with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
                Ok(uow
                    .tool_call_records()
                    .record_tool_call(RecordToolCallInput {
                        tool_call_id: ToolCallId::new("call_refused").unwrap(),
                        run_id: RunId::new("run:5").unwrap(),
                        tool: SemanticToolName::ProposeChangeset,
                        permitted: gate.allowed,
                        refusal_reason: gate.reason.clone(),
                        created_at_ms: 10,
                    }))
            })
            .unwrap()
            .unwrap();
        assert!(!refused.replayed);
        assert!(!refused.record.permitted);
        assert!(refused.record.refusal_reason.is_some());
        assert_eq!(refused.record.risk_tier, ToolRiskTier::Mutating);

        // Re-recording the same call id replays the snapshot, never overwrites it.
        let replay = store
            .with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
                Ok(uow
                    .tool_call_records()
                    .record_tool_call(RecordToolCallInput {
                        tool_call_id: ToolCallId::new("call_refused").unwrap(),
                        run_id: RunId::new("run:5").unwrap(),
                        tool: SemanticToolName::ProposeChangeset,
                        permitted: true,
                        refusal_reason: None,
                        created_at_ms: 999,
                    }))
            })
            .unwrap()
            .unwrap();
        assert!(replay.replayed);
        assert!(!replay.record.permitted, "recorded snapshot unchanged");
        assert_eq!(replay.record.created_at_ms, 10);
    }

    #[test]
    fn read_only_tool_call_records_permitted() {
        let (_dir, mut store) = temp_store();
        let gate = tool_execution_gate(SemanticToolName::ReadContext, None);
        let recorded = store
            .with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
                Ok(uow
                    .tool_call_records()
                    .record_tool_call(RecordToolCallInput {
                        tool_call_id: ToolCallId::new("call_read").unwrap(),
                        run_id: RunId::new("run:6").unwrap(),
                        tool: SemanticToolName::ReadContext,
                        permitted: gate.allowed,
                        refusal_reason: gate.reason.clone(),
                        created_at_ms: 10,
                    }))
            })
            .unwrap()
            .unwrap();
        assert!(recorded.record.permitted);
        assert!(recorded.record.refusal_reason.is_none());
        assert_eq!(recorded.record.risk_tier, ToolRiskTier::ReadOnly);
    }

    // ---- D3: bounded interrupt list page + typed decision projection ----------------

    fn list_page(store: &mut Store, run_id: &str, cap: u32) -> InterruptListPage {
        store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .interrupts_list_page(&RunId::new(run_id).unwrap(), cap)
            })
            .unwrap()
    }

    #[test]
    fn list_page_projects_typed_decision_and_flags_pending_entries() {
        // A resolved interrupt whose decision blob is the typed permission schema
        // projects to the typed decision; a still-pending interrupt carries none and is
        // recoverable as a pending entry. Raise order is preserved.
        let (_dir, mut store) = temp_store();
        raise(
            &mut store,
            "interrupt:d3/a",
            "run:d3",
            InterruptKind::ToolPermission,
            10,
        );
        raise(
            &mut store,
            "interrupt:d3/b",
            "run:d3",
            InterruptKind::ToolPermission,
            11,
        );
        resolve(
            &mut store,
            "interrupt:d3/a",
            "{\"decision\":\"approve\",\"comment\":\"looks right\"}",
            20,
        );

        let page = list_page(&mut store, "run:d3", 50);
        assert_eq!(page.cap, 50);
        assert!(!page.truncated);
        assert_eq!(page.items.len(), 2);

        assert_eq!(page.items[0].interrupt_id.as_str(), "interrupt:d3/a");
        assert_eq!(page.items[0].resume_state, InterruptResumeState::Resolved);
        assert_eq!(
            page.items[0].decision,
            Some(InterruptDecisionProjection::ToolPermission {
                decision: ToolPermissionDecisionKind::Approve,
                comment: Some("looks right".to_string()),
            })
        );

        assert_eq!(page.items[1].interrupt_id.as_str(), "interrupt:d3/b");
        assert_eq!(page.items[1].resume_state, InterruptResumeState::Pending);
        assert!(
            page.items[1].decision.is_none(),
            "a pending interrupt carries no decision projection: {:?}",
            page.items[1]
        );
    }

    #[test]
    fn list_page_degrades_a_legacy_opaque_decision_without_failing() {
        // A resolved interrupt whose stored decision predates the typed schema (an opaque
        // blob) projects as decision_unreadable — the page still serves, per-record
        // degradation, never a failed listing.
        let (_dir, mut store) = temp_store();
        raise(
            &mut store,
            "interrupt:legacy/a",
            "run:legacy",
            InterruptKind::ToolPermission,
            10,
        );
        resolve(
            &mut store,
            "interrupt:legacy/a",
            "{\"kind\":\"steer\",\"prompt\":\"keep going\"}",
            20,
        );

        let page = list_page(&mut store, "run:legacy", 50);
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].resume_state, InterruptResumeState::Resolved);
        assert_eq!(
            page.items[0].decision,
            Some(InterruptDecisionProjection::DecisionUnreadable),
            "an unparseable legacy decision degrades rather than failing the page"
        );
    }

    #[test]
    fn list_page_caps_and_marks_truncation() {
        // Three interrupts under a cap of 2: the page serves 2 in raise order and flags
        // truncation; a cap above the total (and above INTERRUPT_LIST_CAP) clamps and
        // does not over-report truncation.
        let (_dir, mut store) = temp_store();
        for (idx, now) in [("a", 10), ("b", 11), ("c", 12)] {
            raise(
                &mut store,
                &format!("interrupt:cap/{idx}"),
                "run:cap",
                InterruptKind::ToolPermission,
                now,
            );
        }

        let capped = list_page(&mut store, "run:cap", 2);
        assert_eq!(capped.cap, 2);
        assert!(capped.truncated, "3 interrupts under a cap of 2 truncate");
        assert_eq!(capped.items.len(), 2);
        assert_eq!(capped.items[0].interrupt_id.as_str(), "interrupt:cap/a");
        assert_eq!(capped.items[1].interrupt_id.as_str(), "interrupt:cap/b");

        let whole = list_page(&mut store, "run:cap", 1_000);
        assert_eq!(
            whole.cap, INTERRUPT_LIST_CAP,
            "a requested cap above the ceiling clamps to INTERRUPT_LIST_CAP"
        );
        assert!(
            !whole.truncated,
            "3 interrupts under the full cap do not truncate"
        );
        assert_eq!(whole.items.len(), 3);
    }
}
