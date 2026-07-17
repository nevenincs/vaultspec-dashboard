//! Lifecycle transition and eligibility decisions.
//!
//! W03.P16 owns pure status transition checks and stale-state guards. Command
//! handlers, approval records, apply receipts, routes, streams, sessions, and
//! core adapter calls are later phases.

use super::api::ChangesetOperationKind;
use super::ledger::ChangesetAggregateRecord;
use super::model::{
    ActionEligibility, ActorKind, ActorRef, ChangesetKind, ChangesetStatus, CommandKind,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandLifecycleScope {
    InitialChangeset,
    ChangesetTransition,
    StatusPreserving,
    NotChangesetLifecycle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ValidationFreshness {
    pub record_present: bool,
    pub approval_ready: bool,
    pub digest_matches_reviewed: bool,
}

impl ValidationFreshness {
    #[cfg(test)]
    pub const fn fresh() -> Self {
        Self {
            record_present: true,
            approval_ready: true,
            digest_matches_reviewed: true,
        }
    }

    pub const fn missing() -> Self {
        Self {
            record_present: false,
            approval_ready: false,
            digest_matches_reviewed: false,
        }
    }

    pub const fn invalid() -> Self {
        Self {
            record_present: true,
            approval_ready: false,
            digest_matches_reviewed: true,
        }
    }

    pub const fn stale_digest() -> Self {
        Self {
            record_present: true,
            approval_ready: true,
            digest_matches_reviewed: false,
        }
    }

    fn blocker(self, command: CommandKind) -> Option<ActionEligibility> {
        if !self.record_present {
            return Some(ActionEligibility::denied(
                command,
                "current validation record is required",
            ));
        }
        if !self.approval_ready {
            return Some(ActionEligibility::denied(
                command,
                "validation is not approval-ready",
            ));
        }
        if !self.digest_matches_reviewed {
            return Some(ActionEligibility::denied(
                command,
                "validation digest no longer matches reviewed material",
            ));
        }
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApprovalFreshness {
    pub record_present: bool,
    pub proposal_revision_current: bool,
    pub target_revisions_current: bool,
    pub validation_digest_current: bool,
    pub policy_version_current: bool,
    pub run_cancelled: bool,
}

impl ApprovalFreshness {
    #[cfg(test)]
    pub const fn fresh() -> Self {
        Self {
            record_present: true,
            proposal_revision_current: true,
            target_revisions_current: true,
            validation_digest_current: true,
            policy_version_current: true,
            run_cancelled: false,
        }
    }

    pub const fn missing() -> Self {
        Self {
            record_present: false,
            proposal_revision_current: false,
            target_revisions_current: false,
            validation_digest_current: false,
            policy_version_current: false,
            run_cancelled: false,
        }
    }

    #[cfg(test)]
    pub const fn cancelled_run() -> Self {
        Self {
            run_cancelled: true,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_revision() -> Self {
        Self {
            proposal_revision_current: false,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_targets() -> Self {
        Self {
            target_revisions_current: false,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_validation() -> Self {
        Self {
            validation_digest_current: false,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_policy() -> Self {
        Self {
            policy_version_current: false,
            ..Self::fresh()
        }
    }

    fn blocker(self, command: CommandKind) -> Option<ActionEligibility> {
        if !self.record_present {
            return Some(ActionEligibility::denied(
                command,
                "approval record is required",
            ));
        }
        if self.run_cancelled {
            return Some(ActionEligibility::denied(
                command,
                "approval is stale because the linked run was cancelled",
            ));
        }
        if !self.proposal_revision_current {
            return Some(ActionEligibility::denied(
                command,
                "approval is stale for the current proposal revision",
            ));
        }
        if !self.target_revisions_current {
            return Some(ActionEligibility::denied(
                command,
                "approval is stale for the current target revisions",
            ));
        }
        if !self.validation_digest_current {
            return Some(ActionEligibility::denied(
                command,
                "approval is stale for the current validation digest",
            ));
        }
        if !self.policy_version_current {
            return Some(ActionEligibility::denied(
                command,
                "approval is stale for the current policy version",
            ));
        }
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewDecisionFreshness {
    pub review_request_present: bool,
    pub proposal_revision_current: bool,
    pub target_revisions_current: bool,
    pub validation_digest_current: bool,
    pub policy_version_current: bool,
    pub run_cancelled: bool,
}

impl ReviewDecisionFreshness {
    #[cfg(test)]
    pub const fn fresh() -> Self {
        Self {
            review_request_present: true,
            proposal_revision_current: true,
            target_revisions_current: true,
            validation_digest_current: true,
            policy_version_current: true,
            run_cancelled: false,
        }
    }

    pub const fn missing() -> Self {
        Self {
            review_request_present: false,
            proposal_revision_current: false,
            target_revisions_current: false,
            validation_digest_current: false,
            policy_version_current: false,
            run_cancelled: false,
        }
    }

    #[cfg(test)]
    pub const fn cancelled_run() -> Self {
        Self {
            run_cancelled: true,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_targets() -> Self {
        Self {
            target_revisions_current: false,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_validation() -> Self {
        Self {
            validation_digest_current: false,
            ..Self::fresh()
        }
    }

    #[cfg(test)]
    pub const fn stale_policy() -> Self {
        Self {
            policy_version_current: false,
            ..Self::fresh()
        }
    }

    fn blocker(self, command: CommandKind) -> Option<ActionEligibility> {
        if !self.review_request_present {
            return Some(ActionEligibility::denied(
                command,
                "review request is required",
            ));
        }
        if self.run_cancelled {
            return Some(ActionEligibility::denied(
                command,
                "review decision is stale because the linked run was cancelled",
            ));
        }
        if !self.proposal_revision_current {
            return Some(ActionEligibility::denied(
                command,
                "review decision is stale for the current proposal revision",
            ));
        }
        if !self.target_revisions_current {
            return Some(ActionEligibility::denied(
                command,
                "review decision is stale for the current target revisions",
            ));
        }
        if !self.validation_digest_current {
            return Some(ActionEligibility::denied(
                command,
                "review decision is stale for the current validation digest",
            ));
        }
        if !self.policy_version_current {
            return Some(ActionEligibility::denied(
                command,
                "review decision is stale for the current policy version",
            ));
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollbackChildEligibility {
    pub child_key: String,
    pub operation: ChangesetOperationKind,
    pub preimage_available: bool,
}

impl RollbackChildEligibility {
    pub fn new(
        child_key: impl Into<String>,
        operation: ChangesetOperationKind,
        preimage_available: bool,
    ) -> Self {
        Self {
            child_key: child_key.into(),
            operation,
            preimage_available,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransitionRequest {
    pub command: CommandKind,
    pub kind: ChangesetKind,
    pub current: ChangesetStatus,
    pub next: ChangesetStatus,
    pub operation_count: usize,
    pub validation: Option<ValidationFreshness>,
    pub approval: Option<ApprovalFreshness>,
    pub review_decision: Option<ReviewDecisionFreshness>,
}

impl TransitionRequest {
    pub fn new(
        command: CommandKind,
        kind: ChangesetKind,
        current: ChangesetStatus,
        next: ChangesetStatus,
    ) -> Self {
        Self {
            command,
            kind,
            current,
            next,
            operation_count: 1,
            validation: None,
            approval: None,
            review_decision: None,
        }
    }

    pub fn with_operation_count(mut self, operation_count: usize) -> Self {
        self.operation_count = operation_count;
        self
    }

    pub fn with_validation(mut self, validation: ValidationFreshness) -> Self {
        self.validation = Some(validation);
        self
    }

    pub fn with_approval(mut self, approval: ApprovalFreshness) -> Self {
        self.approval = Some(approval);
        self
    }

    pub fn with_review_decision(mut self, review_decision: ReviewDecisionFreshness) -> Self {
        self.review_decision = Some(review_decision);
        self
    }
}

pub fn command_lifecycle_scope(command: CommandKind) -> CommandLifecycleScope {
    match command {
        CommandKind::CreateProposal | CommandKind::CreateRollback => {
            CommandLifecycleScope::InitialChangeset
        }
        CommandKind::ValidateProposal | CommandKind::Respond => {
            CommandLifecycleScope::StatusPreserving
        }
        CommandKind::AppendDraft
        | CommandKind::ReplaceDraft
        | CommandKind::SubmitForReview
        | CommandKind::CancelProposal
        | CommandKind::CancelRun
        | CommandKind::Approve
        | CommandKind::Reject
        | CommandKind::EditProposal
        | CommandKind::Rebase
        | CommandKind::Supersede
        | CommandKind::RequestApply => CommandLifecycleScope::ChangesetTransition,
        CommandKind::CreateSession
        | CommandKind::StartPromptTurn
        | CommandKind::CompleteRun
        | CommandKind::CancelSession
        | CommandKind::CloseSession
        | CommandKind::ResumeRun
        | CommandKind::ClaimReview
        | CommandKind::ReleaseReview
        | CommandKind::AcquireLease
        | CommandKind::RenewLease
        | CommandKind::ReleaseLease
        | CommandKind::SetOperationMode
        | CommandKind::DirectWrite
        | CommandKind::MapLangGraphRuntime
        | CommandKind::RequestToolPermission
        | CommandKind::CreateFeedbackBatch
        | CommandKind::CreateComment
        | CommandKind::UpdateComment
        | CommandKind::DeleteComment
        | CommandKind::ReadContext
        | CommandKind::SearchGraph
        | CommandKind::SubscribeEvents
        | CommandKind::RecoverEventStream => CommandLifecycleScope::NotChangesetLifecycle,
    }
}

pub fn initial_changeset_status_eligibility(
    kind: ChangesetKind,
    status: ChangesetStatus,
) -> ActionEligibility {
    let command = match kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => CommandKind::CreateProposal,
        ChangesetKind::Rollback => CommandKind::CreateRollback,
    };
    let allowed = matches!(
        (kind, status),
        (
            ChangesetKind::Authoring | ChangesetKind::Direct,
            ChangesetStatus::Draft
        ) | (ChangesetKind::Rollback, ChangesetStatus::RollbackProposed)
    );
    if allowed {
        ActionEligibility::allowed(command)
    } else {
        ActionEligibility::denied(
            command,
            format!("`{status:?}` is not a valid initial `{kind:?}` changeset status"),
        )
    }
}

pub fn submit_for_review_transition_eligibility(
    record: &ChangesetAggregateRecord,
    validation: ValidationFreshness,
) -> ActionEligibility {
    let next = match record.kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::NeedsReview,
        ChangesetKind::Rollback => ChangesetStatus::NeedsReview,
    };
    transition_eligibility(
        TransitionRequest::new(
            CommandKind::SubmitForReview,
            record.kind,
            record.status,
            next,
        )
        .with_operation_count(record.operation_count)
        .with_validation(validation),
    )
}

pub fn approve_transition_eligibility(
    record: &ChangesetAggregateRecord,
    review_decision: ReviewDecisionFreshness,
    validation: ValidationFreshness,
) -> ActionEligibility {
    transition_eligibility(
        TransitionRequest::new(
            CommandKind::Approve,
            record.kind,
            record.status,
            ChangesetStatus::Approved,
        )
        .with_operation_count(record.operation_count)
        .with_review_decision(review_decision)
        .with_validation(validation),
    )
}

pub fn reject_transition_eligibility(
    record: &ChangesetAggregateRecord,
    review_decision: ReviewDecisionFreshness,
    validation: ValidationFreshness,
) -> ActionEligibility {
    transition_eligibility(
        TransitionRequest::new(
            CommandKind::Reject,
            record.kind,
            record.status,
            ChangesetStatus::Rejected,
        )
        .with_operation_count(record.operation_count)
        .with_review_decision(review_decision)
        .with_validation(validation),
    )
}

/// The served eligibility of the request-changes / reviewer-edit verdict (the third
/// review action, W13.P24). It drives the changeset back through the kind-aware
/// `EditProposal` arc (`NeedsReview|Approved -> Draft` / `RollbackProposed`). Unlike
/// approve/reject it attaches NO review-decision or validation freshness: requesting
/// changes is feedback, deliberately legal on a stale or unvalidated review (that is
/// exactly why it is being sent back). This is the SINGLE predicate the approval
/// decision path and the review-station projection both consult, so the served
/// eligibility can never drift from what `submit_decision` will accept.
pub fn edit_proposal_transition_eligibility(
    record: &ChangesetAggregateRecord,
) -> ActionEligibility {
    let next = match record.kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::Draft,
        ChangesetKind::Rollback => ChangesetStatus::RollbackProposed,
    };
    transition_eligibility(
        TransitionRequest::new(CommandKind::EditProposal, record.kind, record.status, next)
            .with_operation_count(record.operation_count),
    )
}

pub fn apply_transition_eligibility(
    record: &ChangesetAggregateRecord,
    approval: ApprovalFreshness,
    validation: ValidationFreshness,
) -> ActionEligibility {
    transition_eligibility(
        TransitionRequest::new(
            CommandKind::RequestApply,
            record.kind,
            record.status,
            ChangesetStatus::Applying,
        )
        .with_operation_count(record.operation_count)
        .with_approval(approval)
        .with_validation(validation),
    )
}

pub fn apply_completion_transition_eligibility(
    record: &ChangesetAggregateRecord,
    next: ChangesetStatus,
) -> ActionEligibility {
    transition_eligibility(
        TransitionRequest::new(CommandKind::RequestApply, record.kind, record.status, next)
            .with_operation_count(record.operation_count),
    )
}

/// The kill-switch POLICY-REQUEUE arc (P48-R1): `Approved → NeedsReview`. When a mode
/// downgrade stales a not-yet-applied system approval, the changeset is re-queued for
/// human review through ONE declared arc — never a synthetic `Approved → Draft → …`
/// re-draft (which would distort provenance and leak an undeclared arc into the
/// projections and event stream). Legal ONLY for the SYSTEM actor over an `Approved`
/// head (the caller supplies the staled-system-approval context). It is a policy
/// action, not a user command, so it carries `SubmitForReview` as its nearest verb.
pub fn policy_requeue_transition_eligibility(
    record: &ChangesetAggregateRecord,
    actor: &ActorRef,
) -> ActionEligibility {
    if actor.kind != ActorKind::System {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            "policy requeue is a system-actor action",
        );
    }
    if record.status != ChangesetStatus::Approved {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            format!(
                "policy requeue requires an approved head, not `{:?}`",
                record.status
            ),
        );
    }
    // The arc itself is declared in the append vocabulary
    // (`append_allows_status_transition`: Approved → NeedsReview); this helper is the
    // fine gate (system actor + approved head) the requeue caller checks first.
    ActionEligibility::allowed(CommandKind::SubmitForReview)
}

pub fn create_rollback_eligibility(
    source: &ChangesetAggregateRecord,
    requested_source_children: &[RollbackChildEligibility],
) -> ActionEligibility {
    if source.status != ChangesetStatus::Applied {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            format!(
                "rollback source status `{:?}` is not applied",
                source.status
            ),
        );
    }
    if requested_source_children.is_empty() {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            "rollback must name at least one source child",
        );
    }
    if requested_source_children.len() > source.operation_count {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            "rollback names more source children than the applied changeset contains",
        );
    }
    if requested_source_children.len() != 1 {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            "V1 rollback supports exactly one preimage-restored source child",
        );
    }
    let child = &requested_source_children[0];
    let Some(source_child) = source
        .children
        .iter()
        .find(|source_child| source_child.child_key == child.child_key)
    else {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            format!(
                "rollback source child `{}` does not exist on the applied changeset",
                child.child_key
            ),
        );
    };
    if source_child.operation != child.operation {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            format!(
                "rollback source child `{}` operation `{:?}` does not match requested rollback operation `{:?}`",
                child.child_key, source_child.operation, child.operation
            ),
        );
    }
    if !matches!(
        child.operation,
        ChangesetOperationKind::ReplaceBody
            | ChangesetOperationKind::EditFrontmatter
            | ChangesetOperationKind::Rename
            | ChangesetOperationKind::SectionEdit
            | ChangesetOperationKind::SetPlanStepState
    ) {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            format!(
                "rollback_unavailable: operation `{:?}` has no V1 inverse",
                child.operation
            ),
        );
    }
    if !child.preimage_available {
        return ActionEligibility::denied(
            CommandKind::CreateRollback,
            "rollback_unavailable: required preimage is unavailable",
        );
    }
    ActionEligibility::allowed(CommandKind::CreateRollback)
}

pub fn ledger_append_transition_blocker(
    previous: Option<&ChangesetAggregateRecord>,
    next: &ChangesetAggregateRecord,
) -> Option<String> {
    let Some(previous) = previous else {
        let eligibility = initial_changeset_status_eligibility(next.kind, next.status);
        return eligibility.reason;
    };
    if previous.kind != next.kind {
        return Some(format!(
            "changeset kind cannot change from `{:?}` to `{:?}`",
            previous.kind, next.kind
        ));
    }
    if let Some(reason) = status_kind_blocker(previous.kind, previous.status) {
        return Some(reason);
    }
    if let Some(reason) = status_kind_blocker(next.kind, next.status) {
        return Some(reason);
    }
    if previous.status.is_terminal() {
        return Some(format!(
            "terminal changeset status `{:?}` cannot transition",
            previous.status
        ));
    }
    if enters_or_completes_apply(previous.status, next.status) {
        if previous.operation_count != 1 || next.operation_count != 1 {
            return Some("V1 apply supports exactly one child operation".to_string());
        }
        if !apply_child_content_preserved(previous, next) {
            return Some(
                "apply lifecycle revisions must preserve the reviewed child operation".to_string(),
            );
        }
    }
    if append_allows_status_transition(previous.kind, previous.status, next.status) {
        None
    } else {
        Some(format!(
            "append-only ledger cannot transition `{:?}` from `{:?}` to `{:?}`",
            previous.kind, previous.status, next.status
        ))
    }
}

fn enters_or_completes_apply(current: ChangesetStatus, next: ChangesetStatus) -> bool {
    (current == ChangesetStatus::Approved && next == ChangesetStatus::Applying)
        || (current == ChangesetStatus::Applying
            && matches!(
                next,
                ChangesetStatus::Applied | ChangesetStatus::Failed | ChangesetStatus::Conflicted
            ))
}

fn apply_child_content_preserved(
    previous: &ChangesetAggregateRecord,
    next: &ChangesetAggregateRecord,
) -> bool {
    let ([previous], [next]) = (previous.children.as_slice(), next.children.as_slice()) else {
        return false;
    };
    previous.changeset_id == next.changeset_id
        && previous.child_key == next.child_key
        && previous.target_order == next.target_order
        && previous.operation == next.operation
        && previous.target == next.target
        && previous.base_revision == next.base_revision
        && previous.current_revision == next.current_revision
        && previous.materialized_operation == next.materialized_operation
        && previous.material_digest == next.material_digest
        && previous.validation_digest == next.validation_digest
}

pub fn transition_eligibility(request: TransitionRequest) -> ActionEligibility {
    if command_lifecycle_scope(request.command) == CommandLifecycleScope::NotChangesetLifecycle {
        return ActionEligibility::denied(
            request.command,
            "command is not a changeset lifecycle command",
        );
    }
    if command_lifecycle_scope(request.command) == CommandLifecycleScope::InitialChangeset {
        return ActionEligibility::denied(
            request.command,
            "initial changeset commands do not transition an existing changeset",
        );
    }
    if let Some(reason) = status_kind_blocker(request.kind, request.current) {
        return ActionEligibility::denied(request.command, reason);
    }
    if let Some(reason) = status_kind_blocker(request.kind, request.next) {
        return ActionEligibility::denied(request.command, reason);
    }
    if request.current.is_terminal() {
        return ActionEligibility::denied(
            request.command,
            format!(
                "terminal changeset status `{:?}` cannot transition",
                request.current
            ),
        );
    }
    if !command_allows_transition(request) {
        return ActionEligibility::denied(
            request.command,
            format!(
                "command `{:?}` cannot transition `{:?}` from `{:?}` to `{:?}`",
                request.command, request.kind, request.current, request.next
            ),
        );
    }
    if request.command == CommandKind::SubmitForReview
        && let Some(blocker) = request
            .validation
            .unwrap_or_else(ValidationFreshness::missing)
            .blocker(request.command)
    {
        return blocker;
    }
    if matches!(request.command, CommandKind::Approve | CommandKind::Reject) {
        if let Some(blocker) = request
            .review_decision
            .unwrap_or_else(ReviewDecisionFreshness::missing)
            .blocker(request.command)
        {
            return blocker;
        }
        if let Some(blocker) = request
            .validation
            .unwrap_or_else(ValidationFreshness::missing)
            .blocker(request.command)
        {
            return blocker;
        }
    }
    if request.command == CommandKind::RequestApply {
        if request.operation_count != 1 {
            return ActionEligibility::denied(
                request.command,
                "V1 apply supports exactly one child operation",
            );
        }
        if request.current == ChangesetStatus::Approved && request.next == ChangesetStatus::Applying
        {
            if let Some(blocker) = request
                .approval
                .unwrap_or_else(ApprovalFreshness::missing)
                .blocker(request.command)
            {
                return blocker;
            }
            if let Some(blocker) = request
                .validation
                .unwrap_or_else(ValidationFreshness::missing)
                .blocker(request.command)
            {
                return blocker;
            }
        }
    }
    ActionEligibility::allowed(request.command)
}

fn status_kind_blocker(kind: ChangesetKind, status: ChangesetStatus) -> Option<String> {
    if is_reserved_v1_status(status) {
        return Some(format!(
            "status `{status:?}` is reserved and unreachable in V1"
        ));
    }
    if kind == ChangesetKind::Authoring && status == ChangesetStatus::RollbackProposed {
        return Some("`rollback_proposed` is valid only for rollback changesets".to_string());
    }
    None
}

fn is_reserved_v1_status(status: ChangesetStatus) -> bool {
    matches!(
        status,
        ChangesetStatus::PartiallyApplied | ChangesetStatus::CompensationRequired
    )
}

fn command_allows_transition(request: TransitionRequest) -> bool {
    match request.command {
        CommandKind::AppendDraft | CommandKind::ReplaceDraft => {
            request.kind == ChangesetKind::Authoring
                && matches!(
                    request.current,
                    ChangesetStatus::Draft | ChangesetStatus::Proposed
                )
                && request.next == ChangesetStatus::Draft
        }
        CommandKind::ValidateProposal => {
            request.kind.is_authoring_like()
                && matches!(
                    request.current,
                    ChangesetStatus::Draft | ChangesetStatus::Proposed
                )
                && request.next == ChangesetStatus::Proposed
        }
        CommandKind::SubmitForReview => match request.kind {
            ChangesetKind::Authoring | ChangesetKind::Direct => {
                matches!(
                    request.current,
                    ChangesetStatus::Draft | ChangesetStatus::Proposed
                ) && request.next == ChangesetStatus::NeedsReview
            }
            ChangesetKind::Rollback => {
                request.current == ChangesetStatus::RollbackProposed
                    && request.next == ChangesetStatus::NeedsReview
            }
        },
        CommandKind::Approve => {
            request.current == ChangesetStatus::NeedsReview
                && request.next == ChangesetStatus::Approved
        }
        CommandKind::Reject => {
            request.current == ChangesetStatus::NeedsReview
                && request.next == ChangesetStatus::Rejected
        }
        CommandKind::EditProposal => {
            matches!(
                request.current,
                ChangesetStatus::NeedsReview | ChangesetStatus::Approved
            ) && request.next
                == match request.kind {
                    ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::Draft,
                    ChangesetKind::Rollback => ChangesetStatus::RollbackProposed,
                }
        }
        CommandKind::Respond => {
            request.current == ChangesetStatus::NeedsReview
                && request.next == ChangesetStatus::NeedsReview
        }
        CommandKind::RequestApply => {
            (request.current == ChangesetStatus::Approved
                && request.next == ChangesetStatus::Applying)
                || (request.current == ChangesetStatus::Applying
                    && matches!(
                        request.next,
                        ChangesetStatus::Applied
                            | ChangesetStatus::Failed
                            | ChangesetStatus::Conflicted
                    ))
        }
        CommandKind::CancelProposal | CommandKind::CancelRun => {
            is_cancellable(request.current) && request.next == ChangesetStatus::Cancelled
        }
        CommandKind::Supersede => {
            is_cancellable(request.current) && request.next == ChangesetStatus::Superseded
        }
        CommandKind::Rebase => {
            request.current == ChangesetStatus::Conflicted
                && request.next
                    == match request.kind {
                        ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::Draft,
                        ChangesetKind::Rollback => ChangesetStatus::RollbackProposed,
                    }
        }
        _ => false,
    }
}

fn append_allows_status_transition(
    kind: ChangesetKind,
    current: ChangesetStatus,
    next: ChangesetStatus,
) -> bool {
    match kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => match current {
            ChangesetStatus::Draft => matches!(
                next,
                ChangesetStatus::Draft
                    | ChangesetStatus::Proposed
                    | ChangesetStatus::NeedsReview
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Generating => matches!(
                next,
                ChangesetStatus::Draft | ChangesetStatus::Failed | ChangesetStatus::Cancelled
            ),
            ChangesetStatus::Proposed => matches!(
                next,
                ChangesetStatus::Draft
                    | ChangesetStatus::Proposed
                    | ChangesetStatus::NeedsReview
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::NeedsReview => matches!(
                next,
                ChangesetStatus::NeedsReview
                    | ChangesetStatus::Approved
                    | ChangesetStatus::Rejected
                    | ChangesetStatus::Draft
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Approved => matches!(
                next,
                ChangesetStatus::Applying
                    | ChangesetStatus::NeedsReview
                    | ChangesetStatus::Draft
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Applying => matches!(
                next,
                ChangesetStatus::Applied | ChangesetStatus::Failed | ChangesetStatus::Conflicted
            ),
            ChangesetStatus::Conflicted => matches!(
                next,
                ChangesetStatus::Draft | ChangesetStatus::Cancelled | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Applied
            | ChangesetStatus::PartiallyApplied
            | ChangesetStatus::CompensationRequired
            | ChangesetStatus::Rejected
            | ChangesetStatus::Superseded
            | ChangesetStatus::Failed
            | ChangesetStatus::RollbackProposed
            | ChangesetStatus::Cancelled => false,
        },
        ChangesetKind::Rollback => match current {
            ChangesetStatus::RollbackProposed => matches!(
                next,
                ChangesetStatus::RollbackProposed
                    | ChangesetStatus::NeedsReview
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::NeedsReview => matches!(
                next,
                ChangesetStatus::NeedsReview
                    | ChangesetStatus::Approved
                    | ChangesetStatus::Rejected
                    | ChangesetStatus::RollbackProposed
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Approved => matches!(
                next,
                ChangesetStatus::Applying
                    | ChangesetStatus::RollbackProposed
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Applying => matches!(
                next,
                ChangesetStatus::Applied | ChangesetStatus::Failed | ChangesetStatus::Conflicted
            ),
            ChangesetStatus::Conflicted => matches!(
                next,
                ChangesetStatus::RollbackProposed
                    | ChangesetStatus::Cancelled
                    | ChangesetStatus::Superseded
            ),
            ChangesetStatus::Draft
            | ChangesetStatus::Generating
            | ChangesetStatus::Proposed
            | ChangesetStatus::Applied
            | ChangesetStatus::PartiallyApplied
            | ChangesetStatus::CompensationRequired
            | ChangesetStatus::Rejected
            | ChangesetStatus::Superseded
            | ChangesetStatus::Failed
            | ChangesetStatus::Cancelled => false,
        },
    }
}

fn is_cancellable(status: ChangesetStatus) -> bool {
    matches!(
        status,
        ChangesetStatus::Draft
            | ChangesetStatus::Generating
            | ChangesetStatus::Proposed
            | ChangesetStatus::NeedsReview
            | ChangesetStatus::Approved
            | ChangesetStatus::Conflicted
            | ChangesetStatus::RollbackProposed
    )
}

#[cfg(test)]
mod tests;
