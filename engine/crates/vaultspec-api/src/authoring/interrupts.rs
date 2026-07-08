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
use super::permissions::ToolPermissionRequestRecord;
use super::policy::ToolRiskTier;
use super::tools::SemanticToolName;

const INTERRUPT_SCHEMA: &str = "authoring.interrupt.v1";
const TOOL_CALL_SCHEMA: &str = "authoring.tool_call.v1";

/// What a LangGraph interrupt asks a human to decide (langgraph-integration ADR): a
/// bounded `tool_permission` action, or the final `changeset_approval`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptKind {
    ToolPermission,
    ChangesetApproval,
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
    /// The tool call this interrupt gates (a `tool_permission` interrupt).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<ToolCallId>,
    /// The proposal this interrupt gates (a `changeset_approval` interrupt).
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
}
