//! Approval policy matrix (W10.P21).
//!
//! Approval policy is DATA, not UI conditionals (approval-gates ADR
//! `approval-policy-is-data`): this module is the single backend authority for WHAT
//! a changeset approval requires, WHO may decide it, whether a tool call may be
//! auto-permitted, and WHY — served to the client, never re-derived there
//! (review-actions-are-backend-served).
//!
//! It composes existing decisions rather than adding mechanism (operation-modes ADR
//! `operation-modes-are-policy-bundles-over-one-lifecycle`): the three operation
//! modes are named policy bundles over the ONE changeset lifecycle; the
//! agent-self-approval ban is REUSED from [`super::approvals`] (never re-derived);
//! the freshness/stale tuples are REUSED from [`super::transitions`]. The policy
//! never forks the lifecycle, relaxes the apply-time revision/validation floor, or
//! widens the destructive-operation human-approval floor.
//!
//! SCOPE FENCE (W10.P21 vs W10.P48): this module DECIDES what the policy requires —
//! the mode→requirement matrix, reviewer eligibility, tool gates, the stale
//! classification, and the served reason. The system-actor auto-approval EXECUTION,
//! the after-the-fact review lane, and the kill-switch re-queue are W10.P48
//! (`modes.rs`); they CONSULT this policy. Wiring the existing `approvals` decision
//! path to route through this layer is a deliberate contract event, not part of this
//! phase.
//!
//! RESOURCE BOUNDS: every function here is pure over its arguments and holds no
//! state — no accumulator, cache, or loop to bound.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::api::ChangesetOperationKind;
use super::approvals::{V1_POLICY_VERSION, automated_self_approval_blocker};
use super::model::{ActionEligibility, ActorKind, ActorRef, ChangesetKind, CommandKind};
use super::transitions::ApprovalFreshness;

/// The three operation modes, named policy bundles selectable per scope
/// (operation-modes ADR). `manual` is the default and most restrictive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationMode {
    /// Every changeset requires an eligible human approval before apply.
    Manual,
    /// Non-destructive changesets auto-approve; everything else queues for human
    /// review exactly as in `manual`.
    Assisted,
    /// As `assisted`, plus eligible changesets apply without waiting and the human
    /// reviews applied work after the fact. Destructive operations still queue.
    Autonomous,
}

impl OperationMode {
    /// The default per-scope mode when none is configured.
    pub const DEFAULT: Self = Self::Manual;

    /// Autonomy rank: higher is MORE autonomous. Used to resolve a narrowing-only
    /// session override (a session may lower the rank, never raise it).
    const fn autonomy_rank(self) -> u8 {
        match self {
            Self::Manual => 0,
            Self::Assisted => 1,
            Self::Autonomous => 2,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Assisted => "assisted",
            Self::Autonomous => "autonomous",
        }
    }
}

/// Resolve the effective mode from the per-scope mode and an OPTIONAL per-session
/// override. The override may only NARROW (operation-modes ADR): a session may be
/// more manual than its scope, never more autonomous. A widening override is IGNORED
/// and the scope mode stands; the effective mode is the lower autonomy rank.
pub fn resolve_effective_mode(
    scope: OperationMode,
    session_override: Option<OperationMode>,
) -> OperationMode {
    match session_override {
        Some(session) if session.autonomy_rank() < scope.autonomy_rank() => session,
        _ => scope,
    }
}

/// Whether a session override is a legal narrowing (or absent / equal). A widening
/// override (more autonomous than the scope) is not legal — the reason projection
/// records that it was ignored.
pub fn session_override_is_narrowing(
    scope: OperationMode,
    session_override: Option<OperationMode>,
) -> bool {
    match session_override {
        Some(session) => session.autonomy_rank() <= scope.autonomy_rank(),
        None => true,
    }
}

/// The risk class of an operation or changeset. The DESTRUCTIVE class carries the
/// human-approval floor that no mode may widen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskClass {
    NonDestructive,
    Destructive,
}

/// The risk class of ONE operation. Non-destructive: content edits, create, and
/// link. Destructive (identity/structure-affecting): rename, archive, unarchive.
/// The destructive set is classified CONSERVATIVELY — an unarchive is structural, so
/// it takes the human floor rather than being auto-approvable; over-classifying is
/// the safe direction (it can only ADD a human gate, never remove one).
pub fn operation_risk(operation: ChangesetOperationKind) -> RiskClass {
    match operation {
        ChangesetOperationKind::CreateDocument
        | ChangesetOperationKind::ReplaceBody
        | ChangesetOperationKind::AppendBody
        | ChangesetOperationKind::EditFrontmatter
        | ChangesetOperationKind::SectionEdit
        | ChangesetOperationKind::Link => RiskClass::NonDestructive,
        ChangesetOperationKind::Rename
        | ChangesetOperationKind::Archive
        | ChangesetOperationKind::Unarchive => RiskClass::Destructive,
    }
}

/// The risk class of a WHOLE changeset. A rollback changeset is destructive BY KIND
/// (approval-gates / operation-modes: rollback requires explicit human approval in
/// every mode). An authoring changeset takes the MAX risk over its child operations.
/// An empty operation set is treated as destructive — an unclassifiable changeset
/// fails CLOSED and never auto-approves.
pub fn changeset_risk(kind: ChangesetKind, operations: &[ChangesetOperationKind]) -> RiskClass {
    if kind == ChangesetKind::Rollback || operations.is_empty() {
        return RiskClass::Destructive;
    }
    if operations
        .iter()
        .copied()
        .any(|operation| operation_risk(operation) == RiskClass::Destructive)
    {
        RiskClass::Destructive
    } else {
        RiskClass::NonDestructive
    }
}

/// What a changeset approval requires under the policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRequirement {
    /// An eligible HUMAN approval is required before apply.
    HumanApprovalRequired,
    /// The changeset may be auto-approved by the SYSTEM actor under the mode policy.
    /// This is the policy REPRESENTATION of the allowance; the system-actor approval
    /// record + the after-the-fact review lane are W10.P48.
    SystemAutoApprovable,
}

/// The approval-requirement matrix over (effective mode, changeset risk).
///
/// The DESTRUCTIVE FLOOR is absolute: a destructive changeset requires human
/// approval in EVERY mode — no mode may widen this (operation-modes ADR constraint).
/// A non-destructive changeset is human-gated in `manual` and system-auto-approvable
/// in `assisted` / `autonomous`.
pub fn approval_requirement(mode: OperationMode, risk: RiskClass) -> ApprovalRequirement {
    match risk {
        RiskClass::Destructive => ApprovalRequirement::HumanApprovalRequired,
        RiskClass::NonDestructive => match mode {
            OperationMode::Manual => ApprovalRequirement::HumanApprovalRequired,
            OperationMode::Assisted | OperationMode::Autonomous => {
                ApprovalRequirement::SystemAutoApprovable
            }
        },
    }
}

/// Reviewer eligibility for a review DECISION (approve / reject / apply). The
/// agent-self-approval ban is the single authority — REUSED from [`super::approvals`]
/// (`automated_self_approval_blocker`), never re-derived: an automated writer cannot
/// approve or apply its own proposal (or one it proposed on behalf of), while a human
/// approving their own manual changeset and any distinct reviewer are permitted. This
/// formalizes the reviewer check through the policy layer without duplicating it.
pub fn reviewer_eligibility(
    command: CommandKind,
    approver: &ActorRef,
    origin_author: &ActorRef,
) -> ActionEligibility {
    match automated_self_approval_blocker(command, approver, origin_author) {
        Some(denied) => denied,
        None => ActionEligibility::allowed(command),
    }
}

/// Whether the SYSTEM actor may record a policy auto-approval. This is a DISTINCT
/// fact from agent self-approval (operation-modes ADR): it is permitted ONLY for a
/// `SystemAutoApprovable` requirement and ONLY by a genuine `System` actor — never an
/// Agent/ToolExecutor wearing the system hat, and never for a human-required
/// changeset. The EXECUTION of the auto-approval is W10.P48; this decides its
/// legality.
pub fn system_auto_approval_eligibility(
    command: CommandKind,
    actor: &ActorRef,
    requirement: ApprovalRequirement,
) -> ActionEligibility {
    if requirement != ApprovalRequirement::SystemAutoApprovable {
        return ActionEligibility::denied(
            command,
            "policy requires a human approval; the system actor cannot auto-approve this changeset",
        );
    }
    if actor.kind != ActorKind::System {
        return ActionEligibility::denied(
            command,
            "only the system actor may record a policy auto-approval",
        );
    }
    ActionEligibility::allowed(command)
}

/// The risk tier of an agent tool request. A `tool_permission_request` is keyed by
/// tool call and is DISTINCT from changeset approval (approval-gates ADR).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolRiskTier {
    /// Read/context tools (read a document, search the graph) — no side effects.
    ReadOnly,
    /// A tool that proposes a mutation — still gated by CHANGESET approval downstream.
    Mutating,
    /// A dangerous capability (destructive or outside the sandbox) — always gated.
    Dangerous,
}

/// What a tool permission request requires under the policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionRequirement {
    AutoPermitted,
    HumanApprovalRequired,
}

/// The tool-permission gate. A read/context tool is auto-permitted; a mutating or
/// dangerous tool needs an explicit human gate. A tool permission NEVER substitutes
/// for changeset approval (approval-gates ADR) — an auto-permitted tool call still
/// produces a proposal that rides the full approval matrix.
pub fn tool_permission_requirement(tier: ToolRiskTier) -> ToolPermissionRequirement {
    match tier {
        ToolRiskTier::ReadOnly => ToolPermissionRequirement::AutoPermitted,
        ToolRiskTier::Mutating | ToolRiskTier::Dangerous => {
            ToolPermissionRequirement::HumanApprovalRequired
        }
    }
}

/// The tool-permission gate as a served eligibility over
/// [`CommandKind::RequestToolPermission`].
pub fn tool_permission_eligibility(tier: ToolRiskTier) -> ActionEligibility {
    match tool_permission_requirement(tier) {
        ToolPermissionRequirement::AutoPermitted => {
            ActionEligibility::allowed(CommandKind::RequestToolPermission)
        }
        ToolPermissionRequirement::HumanApprovalRequired => ActionEligibility {
            command: CommandKind::RequestToolPermission,
            allowed: true,
            reason: Some(
                "this tool capability may be requested, but it requires explicit human approval \
                 before execution"
                    .to_string(),
            ),
        },
    }
}

/// The four review actions (approval-gates ADR). Approve/Reject are the live V1
/// subset; Edit (request-changes) and Respond are the review-loop actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewAction {
    Approve,
    Reject,
    /// Request changes — a reviewer-driven return to draft. RESERVED for W05.P24.
    Edit,
    /// Clarify / instruct without deciding. RESERVED for W05.P24.
    Respond,
}

/// Whether a review action is DECIDABLE in V1. Approve/Reject are live; Edit
/// (request-changes) and Respond are review-loop actions RESERVED for W05.P24 — the
/// transition engine does not yet support them (`ApprovalDecision::RequestChanges`
/// returns a typed "reserved" denial today). The policy REPRESENTS them for a stable
/// contract but reports them not-yet-supported rather than inventing the transition.
pub fn review_action_supported_in_v1(action: ReviewAction) -> bool {
    matches!(action, ReviewAction::Approve | ReviewAction::Reject)
}

/// The conditions that make an approval stale (approval-gates ADR: "which conditions
/// make the approval stale", as data). Classified from the reused
/// [`ApprovalFreshness`] tuple in the same precedence the transition blocker uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StaleCondition {
    RunCancelled,
    ProposalRevisionChanged,
    TargetRevisionChanged,
    ValidationDigestChanged,
    PolicyVersionChanged,
}

/// The policy stale-condition classification of an approval's freshness tuple. REUSES
/// the [`ApprovalFreshness`] primitive (never re-derives it) and returns the FIRST
/// active condition in the transition blocker's precedence, or `None` when fresh. A
/// missing record is NOT a stale condition — it is an absent approval, whose reason
/// the transition layer owns.
pub fn approval_stale_condition(freshness: ApprovalFreshness) -> Option<StaleCondition> {
    if !freshness.record_present {
        return None;
    }
    if freshness.run_cancelled {
        return Some(StaleCondition::RunCancelled);
    }
    if !freshness.proposal_revision_current {
        return Some(StaleCondition::ProposalRevisionChanged);
    }
    if !freshness.target_revisions_current {
        return Some(StaleCondition::TargetRevisionChanged);
    }
    if !freshness.validation_digest_current {
        return Some(StaleCondition::ValidationDigestChanged);
    }
    if !freshness.policy_version_current {
        return Some(StaleCondition::PolicyVersionChanged);
    }
    None
}

/// The backend-served policy decision for a changeset approval: the effective mode
/// (after narrowing resolution), whether a session override was ignored, the
/// changeset risk, the approval requirement, and a plain-language reason. This is the
/// SERVED explanation the client renders — it never re-derives the policy
/// (approval-policy-is-data; review-actions-are-backend-served).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyDecisionProjection {
    pub policy_version: String,
    pub scope_mode: OperationMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_override: Option<OperationMode>,
    pub effective_mode: OperationMode,
    pub session_override_ignored: bool,
    pub risk: RiskClass,
    pub requirement: ApprovalRequirement,
    pub reason: String,
}

/// Compute the served policy decision for a changeset: resolve the effective mode
/// (narrowing-only), classify the changeset risk, and derive the approval
/// requirement + reason. PURE — reads no state, holds none. The system-actor
/// auto-approval execution and after-the-fact lane are W10.P48; this decides WHAT the
/// policy requires and WHY.
pub fn decide_changeset_approval(
    scope_mode: OperationMode,
    session_override: Option<OperationMode>,
    kind: ChangesetKind,
    operations: &[ChangesetOperationKind],
) -> PolicyDecisionProjection {
    let effective_mode = resolve_effective_mode(scope_mode, session_override);
    let session_override_ignored = !session_override_is_narrowing(scope_mode, session_override);
    let risk = changeset_risk(kind, operations);
    let requirement = approval_requirement(effective_mode, risk);
    let reason = decision_reason(effective_mode, risk, requirement, session_override_ignored);
    PolicyDecisionProjection {
        policy_version: V1_POLICY_VERSION.to_string(),
        scope_mode,
        session_override,
        effective_mode,
        session_override_ignored,
        risk,
        requirement,
        reason,
    }
}

fn decision_reason(
    mode: OperationMode,
    risk: RiskClass,
    requirement: ApprovalRequirement,
    session_override_ignored: bool,
) -> String {
    let base = match (risk, requirement) {
        (RiskClass::Destructive, _) => {
            "a destructive changeset requires explicit human approval in every mode \
             (the destructive-operation floor)"
                .to_string()
        }
        (RiskClass::NonDestructive, ApprovalRequirement::HumanApprovalRequired) => format!(
            "{} mode requires an eligible human approval before apply",
            mode.label()
        ),
        (RiskClass::NonDestructive, ApprovalRequirement::SystemAutoApprovable) => format!(
            "{} mode auto-approves a non-destructive changeset under system-actor authority",
            mode.label()
        ),
    };
    if session_override_ignored {
        format!(
            "{base}; a per-session override that would widen the scope mode was ignored \
             (overrides may only narrow)"
        )
    } else {
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::{ActorId, ActorKind};

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    #[test]
    fn operation_and_changeset_risk_classify_destructive_conservatively() {
        for op in [
            ChangesetOperationKind::CreateDocument,
            ChangesetOperationKind::ReplaceBody,
            ChangesetOperationKind::AppendBody,
            ChangesetOperationKind::EditFrontmatter,
            ChangesetOperationKind::SectionEdit,
            ChangesetOperationKind::Link,
        ] {
            assert_eq!(operation_risk(op), RiskClass::NonDestructive, "{op:?}");
        }
        for op in [
            ChangesetOperationKind::Rename,
            ChangesetOperationKind::Archive,
            ChangesetOperationKind::Unarchive,
        ] {
            assert_eq!(operation_risk(op), RiskClass::Destructive, "{op:?}");
        }

        // A rollback changeset is destructive by KIND regardless of its operations.
        assert_eq!(
            changeset_risk(
                ChangesetKind::Rollback,
                &[ChangesetOperationKind::ReplaceBody]
            ),
            RiskClass::Destructive
        );
        // An authoring changeset takes the MAX risk over its operations.
        assert_eq!(
            changeset_risk(
                ChangesetKind::Authoring,
                &[
                    ChangesetOperationKind::ReplaceBody,
                    ChangesetOperationKind::EditFrontmatter
                ]
            ),
            RiskClass::NonDestructive
        );
        assert_eq!(
            changeset_risk(
                ChangesetKind::Authoring,
                &[
                    ChangesetOperationKind::ReplaceBody,
                    ChangesetOperationKind::Rename
                ]
            ),
            RiskClass::Destructive
        );
        // Empty operation set fails CLOSED (destructive).
        assert_eq!(
            changeset_risk(ChangesetKind::Authoring, &[]),
            RiskClass::Destructive
        );
    }

    #[test]
    fn destructive_floor_holds_in_every_mode_and_nondestructive_follows_the_matrix() {
        for mode in [
            OperationMode::Manual,
            OperationMode::Assisted,
            OperationMode::Autonomous,
        ] {
            assert_eq!(
                approval_requirement(mode, RiskClass::Destructive),
                ApprovalRequirement::HumanApprovalRequired,
                "destructive must stay human-gated in {mode:?}"
            );
        }
        assert_eq!(
            approval_requirement(OperationMode::Manual, RiskClass::NonDestructive),
            ApprovalRequirement::HumanApprovalRequired
        );
        assert_eq!(
            approval_requirement(OperationMode::Assisted, RiskClass::NonDestructive),
            ApprovalRequirement::SystemAutoApprovable
        );
        assert_eq!(
            approval_requirement(OperationMode::Autonomous, RiskClass::NonDestructive),
            ApprovalRequirement::SystemAutoApprovable
        );
    }

    #[test]
    fn session_override_narrows_only_never_widens() {
        // Narrowing: autonomous scope + manual session → effective manual.
        assert_eq!(
            resolve_effective_mode(OperationMode::Autonomous, Some(OperationMode::Manual)),
            OperationMode::Manual
        );
        assert!(session_override_is_narrowing(
            OperationMode::Autonomous,
            Some(OperationMode::Manual)
        ));
        // Widening: manual scope + autonomous session → IGNORED, effective manual.
        assert_eq!(
            resolve_effective_mode(OperationMode::Manual, Some(OperationMode::Autonomous)),
            OperationMode::Manual
        );
        assert!(!session_override_is_narrowing(
            OperationMode::Manual,
            Some(OperationMode::Autonomous)
        ));
        // Equal / absent are legal no-ops.
        assert_eq!(
            resolve_effective_mode(OperationMode::Assisted, Some(OperationMode::Assisted)),
            OperationMode::Assisted
        );
        assert_eq!(
            resolve_effective_mode(OperationMode::Assisted, None),
            OperationMode::Assisted
        );
    }

    #[test]
    fn reviewer_eligibility_refuses_agent_self_approval_but_permits_human_and_distinct() {
        let agent = actor("agent:author", ActorKind::Agent);
        let human = actor("human:author", ActorKind::Human);
        let other = actor("agent:other", ActorKind::Agent);

        // Agent approving its OWN proposal → refused (self-approval refusal).
        let denied = reviewer_eligibility(CommandKind::Approve, &agent, &agent);
        assert!(!denied.allowed);
        assert!(
            denied
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("its own proposal"))
        );
        // Human approving their OWN manual changeset → permitted (kind=direct).
        assert!(reviewer_eligibility(CommandKind::Approve, &human, &human).allowed);
        // A distinct agent reviewer → permitted.
        assert!(reviewer_eligibility(CommandKind::Approve, &other, &agent).allowed);
    }

    #[test]
    fn system_auto_approval_requires_system_actor_and_auto_approvable_requirement() {
        let system = actor("system:autoapprove", ActorKind::System);
        let agent = actor("agent:author", ActorKind::Agent);

        // System actor + auto-approvable → allowed.
        assert!(
            system_auto_approval_eligibility(
                CommandKind::Approve,
                &system,
                ApprovalRequirement::SystemAutoApprovable
            )
            .allowed
        );
        // System actor but the changeset requires a human → denied.
        let human_required = system_auto_approval_eligibility(
            CommandKind::Approve,
            &system,
            ApprovalRequirement::HumanApprovalRequired,
        );
        assert!(!human_required.allowed);
        assert!(
            human_required
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("human approval"))
        );
        // A NON-system actor cannot record the auto-approval (distinct from agent
        // self-approval — an agent may never wear the system hat).
        let not_system = system_auto_approval_eligibility(
            CommandKind::Approve,
            &agent,
            ApprovalRequirement::SystemAutoApprovable,
        );
        assert!(!not_system.allowed);
        assert!(
            not_system
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("only the system actor"))
        );
    }

    #[test]
    fn dangerous_tool_request_needs_approval_readonly_is_auto_permitted() {
        assert_eq!(
            tool_permission_requirement(ToolRiskTier::ReadOnly),
            ToolPermissionRequirement::AutoPermitted
        );
        assert_eq!(
            tool_permission_requirement(ToolRiskTier::Mutating),
            ToolPermissionRequirement::HumanApprovalRequired
        );
        assert_eq!(
            tool_permission_requirement(ToolRiskTier::Dangerous),
            ToolPermissionRequirement::HumanApprovalRequired
        );

        assert!(tool_permission_eligibility(ToolRiskTier::ReadOnly).allowed);
        let dangerous = tool_permission_eligibility(ToolRiskTier::Dangerous);
        assert!(
            dangerous.allowed,
            "a dangerous tool permission request enters the human gate; it is not refused outright"
        );
        assert_eq!(dangerous.command, CommandKind::RequestToolPermission);
        assert!(
            dangerous
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("requires explicit human approval"))
        );
    }

    #[test]
    fn request_changes_and_respond_are_represented_but_reserved_in_v1() {
        // Approve/Reject are the live V1 subset.
        assert!(review_action_supported_in_v1(ReviewAction::Approve));
        assert!(review_action_supported_in_v1(ReviewAction::Reject));
        // Edit (request-changes) + Respond are represented for a stable contract but
        // NOT decidable in V1 (reserved for W05.P24 — the transition engine returns a
        // typed "reserved" denial today; we do not invent the transition here).
        assert!(!review_action_supported_in_v1(ReviewAction::Edit));
        assert!(!review_action_supported_in_v1(ReviewAction::Respond));
    }

    #[test]
    fn approval_stale_condition_classifies_validation_and_revision_staleness() {
        assert_eq!(approval_stale_condition(ApprovalFreshness::fresh()), None);
        // A missing record is NOT a stale condition (absent approval, not stale).
        assert_eq!(approval_stale_condition(ApprovalFreshness::missing()), None);
        assert_eq!(
            approval_stale_condition(ApprovalFreshness::stale_validation()),
            Some(StaleCondition::ValidationDigestChanged)
        );
        assert_eq!(
            approval_stale_condition(ApprovalFreshness::stale_revision()),
            Some(StaleCondition::ProposalRevisionChanged)
        );
        assert_eq!(
            approval_stale_condition(ApprovalFreshness::stale_targets()),
            Some(StaleCondition::TargetRevisionChanged)
        );
        assert_eq!(
            approval_stale_condition(ApprovalFreshness::stale_policy()),
            Some(StaleCondition::PolicyVersionChanged)
        );
        assert_eq!(
            approval_stale_condition(ApprovalFreshness::cancelled_run()),
            Some(StaleCondition::RunCancelled)
        );
    }

    #[test]
    fn changeset_policy_decision_is_served_and_explains_the_requirement() {
        // Autonomous scope, non-destructive body edit → auto-approvable, served reason.
        let decision = decide_changeset_approval(
            OperationMode::Autonomous,
            None,
            ChangesetKind::Authoring,
            &[ChangesetOperationKind::ReplaceBody],
        );
        assert_eq!(decision.effective_mode, OperationMode::Autonomous);
        assert_eq!(decision.risk, RiskClass::NonDestructive);
        assert_eq!(
            decision.requirement,
            ApprovalRequirement::SystemAutoApprovable
        );
        assert_eq!(decision.policy_version, V1_POLICY_VERSION);
        assert!(!decision.session_override_ignored);
        assert!(decision.reason.contains("auto-approves"));

        // The projection is served and rejects unknown fields on the wire.
        let value = serde_json::to_value(&decision).unwrap();
        assert_eq!(value["requirement"], "system_auto_approvable");
        let recovered: PolicyDecisionProjection = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(recovered, decision);
        let mut tampered = value;
        tampered["frontend_inferred"] = serde_json::json!(true);
        assert!(serde_json::from_value::<PolicyDecisionProjection>(tampered).is_err());

        // A widening session override is ignored and the reason says so; a
        // destructive op keeps the human floor even in autonomous mode.
        let widened = decide_changeset_approval(
            OperationMode::Manual,
            Some(OperationMode::Autonomous),
            ChangesetKind::Authoring,
            &[ChangesetOperationKind::Rename],
        );
        assert_eq!(widened.effective_mode, OperationMode::Manual);
        assert!(widened.session_override_ignored);
        assert_eq!(widened.risk, RiskClass::Destructive);
        assert_eq!(
            widened.requirement,
            ApprovalRequirement::HumanApprovalRequired
        );
        assert!(widened.reason.contains("destructive"));
        assert!(widened.reason.contains("only narrow"));
    }
}
