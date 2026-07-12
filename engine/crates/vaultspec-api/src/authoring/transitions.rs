//! Lifecycle transition and eligibility decisions.
//!
//! W03.P16 owns pure status transition checks and stale-state guards. Command
//! handlers, approval records, apply receipts, routes, streams, sessions, and
//! core adapter calls are later phases.
#![allow(dead_code)]

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

    pub const fn cancelled_run() -> Self {
        Self {
            run_cancelled: true,
            ..Self::fresh()
        }
    }

    pub const fn stale_revision() -> Self {
        Self {
            proposal_revision_current: false,
            ..Self::fresh()
        }
    }

    pub const fn stale_targets() -> Self {
        Self {
            target_revisions_current: false,
            ..Self::fresh()
        }
    }

    pub const fn stale_validation() -> Self {
        Self {
            validation_digest_current: false,
            ..Self::fresh()
        }
    }

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

    pub const fn cancelled_run() -> Self {
        Self {
            run_cancelled: true,
            ..Self::fresh()
        }
    }

    pub const fn stale_revision() -> Self {
        Self {
            proposal_revision_current: false,
            ..Self::fresh()
        }
    }

    pub const fn stale_targets() -> Self {
        Self {
            target_revisions_current: false,
            ..Self::fresh()
        }
    }

    pub const fn stale_validation() -> Self {
        Self {
            validation_digest_current: false,
            ..Self::fresh()
        }
    }

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
mod tests {
    use super::*;
    use crate::authoring::api::{ChangesetOperationKind, TargetRevisionFence};
    use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
    use crate::authoring::model::{
        ActorId, ActorKind, ActorRef, ChangesetId, DocumentRef, ProvisionalCollisionStatus,
        RevisionToken, SessionId,
    };

    fn changeset_id(value: &str) -> ChangesetId {
        ChangesetId::new(value).unwrap()
    }

    fn session_id() -> SessionId {
        SessionId::new("session_1").unwrap()
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:transition-tests").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn revision(value: &str) -> RevisionToken {
        RevisionToken::new(value).unwrap()
    }

    fn existing_doc(stem: &str, base_revision: &str) -> DocumentRef {
        DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{stem}"),
            stem: stem.to_string(),
            path: format!(".vault/plan/{stem}.md"),
            doc_type: "plan".to_string(),
            base_revision: revision(base_revision),
        }
    }

    fn provisional_doc() -> DocumentRef {
        DocumentRef::ProvisionalCreate {
            provisional_doc_id: "provisional_1".to_string(),
            doc_type: "plan".to_string(),
            feature: super::super::FEATURE_TAG.to_string(),
            title: "Create plan".to_string(),
            collision_status: ProvisionalCollisionStatus::Available,
            proposed_stem: Some("transition-new".to_string()),
        }
    }

    fn fence(document: DocumentRef) -> TargetRevisionFence {
        let base_revision = match &document {
            DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
            _ => None,
        };
        TargetRevisionFence {
            document,
            base_revision: base_revision.clone(),
            current_revision: base_revision,
        }
    }

    fn child(key: &str, document: DocumentRef) -> ChangesetChildOperationInput {
        ChangesetChildOperationInput {
            child_key: key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: fence(document),
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    fn record(
        kind: ChangesetKind,
        status: ChangesetStatus,
        children: Vec<ChangesetChildOperationInput>,
    ) -> ChangesetAggregateRecord {
        ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: changeset_id(match kind {
                ChangesetKind::Authoring | ChangesetKind::Direct => "changeset_1",
                ChangesetKind::Rollback => "rollback_changeset_1",
            }),
            previous_revision: None,
            kind,
            status,
            session_id: Some(session_id()),
            actor: actor(),
            summary: "transition proposal".to_string(),
            children,
            created_at_ms: 100,
        })
        .unwrap()
    }

    fn authoring_record(status: ChangesetStatus) -> ChangesetAggregateRecord {
        record(
            ChangesetKind::Authoring,
            status,
            vec![child(
                "child_1",
                existing_doc("transition-a", "blob:aaa111"),
            )],
        )
    }

    fn allowed(eligibility: ActionEligibility) {
        assert!(
            eligibility.allowed,
            "expected allowed, got {:?}",
            eligibility.reason
        );
    }

    fn denied_contains(eligibility: ActionEligibility, expected: &str) {
        assert!(!eligibility.allowed, "expected denied");
        let reason = eligibility.reason.expect("denial has reason");
        assert!(
            reason.contains(expected),
            "expected `{expected}` in `{reason}`"
        );
    }

    #[test]
    fn legal_transitions_allow_review_and_apply_path_but_reject_skips() {
        let proposal = authoring_record(ChangesetStatus::Draft);
        allowed(submit_for_review_transition_eligibility(
            &proposal,
            ValidationFreshness::fresh(),
        ));

        let reviewable = authoring_record(ChangesetStatus::NeedsReview);
        allowed(approve_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::fresh(),
            ValidationFreshness::fresh(),
        ));

        let approved = authoring_record(ChangesetStatus::Approved);
        allowed(apply_transition_eligibility(
            &approved,
            ApprovalFreshness::fresh(),
            ValidationFreshness::fresh(),
        ));
        let applying = authoring_record(ChangesetStatus::Applying);
        allowed(apply_completion_transition_eligibility(
            &applying,
            ChangesetStatus::Applied,
        ));
        allowed(apply_completion_transition_eligibility(
            &applying,
            ChangesetStatus::Failed,
        ));
        allowed(apply_completion_transition_eligibility(
            &applying,
            ChangesetStatus::Conflicted,
        ));

        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::Approve,
                ChangesetKind::Authoring,
                ChangesetStatus::Draft,
                ChangesetStatus::Approved,
            )),
            "cannot transition",
        );
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::RequestApply,
                ChangesetKind::Authoring,
                ChangesetStatus::NeedsReview,
                ChangesetStatus::Applied,
            )),
            "cannot transition",
        );
    }

    #[test]
    fn terminal_statuses_refuse_lifecycle_mutations() {
        for status in [
            ChangesetStatus::Applied,
            ChangesetStatus::Rejected,
            ChangesetStatus::Superseded,
            ChangesetStatus::Failed,
            ChangesetStatus::Cancelled,
        ] {
            denied_contains(
                transition_eligibility(TransitionRequest::new(
                    CommandKind::CancelProposal,
                    ChangesetKind::Authoring,
                    status,
                    ChangesetStatus::Cancelled,
                )),
                "terminal",
            );
        }
    }

    #[test]
    fn submit_for_review_requires_reviewable_status_and_fresh_validation() {
        let proposed = authoring_record(ChangesetStatus::Proposed);
        allowed(submit_for_review_transition_eligibility(
            &proposed,
            ValidationFreshness::fresh(),
        ));

        denied_contains(
            submit_for_review_transition_eligibility(&proposed, ValidationFreshness::missing()),
            "validation record",
        );
        denied_contains(
            submit_for_review_transition_eligibility(&proposed, ValidationFreshness::invalid()),
            "approval-ready",
        );
        denied_contains(
            submit_for_review_transition_eligibility(
                &proposed,
                ValidationFreshness::stale_digest(),
            ),
            "digest",
        );

        let approved = authoring_record(ChangesetStatus::Approved);
        denied_contains(
            submit_for_review_transition_eligibility(&approved, ValidationFreshness::fresh()),
            "cannot transition",
        );
    }

    #[test]
    fn approve_and_reject_are_only_review_state_decisions() {
        let reviewable = authoring_record(ChangesetStatus::NeedsReview);
        allowed(reject_transition_eligibility(
            &reviewable,
            ReviewDecisionFreshness::fresh(),
            ValidationFreshness::fresh(),
        ));
        denied_contains(
            reject_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::stale_validation(),
                ValidationFreshness::fresh(),
            ),
            "validation digest",
        );
        denied_contains(
            reject_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::cancelled_run(),
                ValidationFreshness::fresh(),
            ),
            "run was cancelled",
        );

        denied_contains(
            approve_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::missing(),
                ValidationFreshness::fresh(),
            ),
            "review request",
        );
        denied_contains(
            approve_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::stale_targets(),
                ValidationFreshness::fresh(),
            ),
            "target revisions",
        );
        denied_contains(
            approve_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::stale_policy(),
                ValidationFreshness::fresh(),
            ),
            "policy version",
        );
        denied_contains(
            approve_transition_eligibility(
                &reviewable,
                ReviewDecisionFreshness::fresh(),
                ValidationFreshness::stale_digest(),
            ),
            "validation digest",
        );
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::Approve,
                ChangesetKind::Authoring,
                ChangesetStatus::Rejected,
                ChangesetStatus::Approved,
            )),
            "terminal",
        );

        let rejected = authoring_record(ChangesetStatus::Rejected);
        denied_contains(
            apply_transition_eligibility(
                &rejected,
                ApprovalFreshness::fresh(),
                ValidationFreshness::fresh(),
            ),
            "terminal",
        );
    }

    #[test]
    fn request_apply_requires_single_child_and_fresh_approval_tuple() {
        let approved = authoring_record(ChangesetStatus::Approved);
        allowed(apply_transition_eligibility(
            &approved,
            ApprovalFreshness::fresh(),
            ValidationFreshness::fresh(),
        ));

        let multi_child = record(
            ChangesetKind::Authoring,
            ChangesetStatus::Approved,
            vec![
                child("child_1", existing_doc("transition-a", "blob:aaa111")),
                child("child_2", provisional_doc()),
            ],
        );
        denied_contains(
            apply_transition_eligibility(
                &multi_child,
                ApprovalFreshness::fresh(),
                ValidationFreshness::fresh(),
            ),
            "exactly one child",
        );
        denied_contains(
            apply_transition_eligibility(
                &approved,
                ApprovalFreshness::stale_revision(),
                ValidationFreshness::fresh(),
            ),
            "proposal revision",
        );
        denied_contains(
            apply_transition_eligibility(
                &approved,
                ApprovalFreshness::stale_targets(),
                ValidationFreshness::fresh(),
            ),
            "target revisions",
        );
        denied_contains(
            apply_transition_eligibility(
                &approved,
                ApprovalFreshness::stale_validation(),
                ValidationFreshness::fresh(),
            ),
            "validation digest",
        );
        denied_contains(
            apply_transition_eligibility(
                &approved,
                ApprovalFreshness::stale_policy(),
                ValidationFreshness::fresh(),
            ),
            "policy version",
        );
    }

    #[test]
    fn draft_mutation_commands_do_not_bypass_review_and_rebase_arcs() {
        allowed(transition_eligibility(TransitionRequest::new(
            CommandKind::ReplaceDraft,
            ChangesetKind::Authoring,
            ChangesetStatus::Proposed,
            ChangesetStatus::Draft,
        )));
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::ReplaceDraft,
                ChangesetKind::Authoring,
                ChangesetStatus::NeedsReview,
                ChangesetStatus::Draft,
            )),
            "cannot transition",
        );
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::AppendDraft,
                ChangesetKind::Authoring,
                ChangesetStatus::Approved,
                ChangesetStatus::Draft,
            )),
            "cannot transition",
        );
        allowed(transition_eligibility(TransitionRequest::new(
            CommandKind::EditProposal,
            ChangesetKind::Authoring,
            ChangesetStatus::NeedsReview,
            ChangesetStatus::Draft,
        )));
        allowed(transition_eligibility(TransitionRequest::new(
            CommandKind::Rebase,
            ChangesetKind::Authoring,
            ChangesetStatus::Conflicted,
            ChangesetStatus::Draft,
        )));
    }

    #[test]
    fn cancelled_run_invalidates_approval_and_blocks_apply() {
        let approved = authoring_record(ChangesetStatus::Approved);

        denied_contains(
            apply_transition_eligibility(
                &approved,
                ApprovalFreshness::cancelled_run(),
                ValidationFreshness::fresh(),
            ),
            "run was cancelled",
        );
    }

    #[test]
    fn staged_multi_document_statuses_are_reserved_and_unreachable() {
        denied_contains(
            transition_eligibility(
                TransitionRequest::new(
                    CommandKind::RequestApply,
                    ChangesetKind::Authoring,
                    ChangesetStatus::Approved,
                    ChangesetStatus::PartiallyApplied,
                )
                .with_approval(ApprovalFreshness::fresh())
                .with_validation(ValidationFreshness::fresh()),
            ),
            "reserved",
        );
        denied_contains(
            transition_eligibility(TransitionRequest::new(
                CommandKind::Supersede,
                ChangesetKind::Authoring,
                ChangesetStatus::CompensationRequired,
                ChangesetStatus::Superseded,
            )),
            "reserved",
        );
    }

    #[test]
    fn plan_step_tick_source_has_no_v1_rollback_inverse() {
        // A SetPlanStepState source MUST be refused for rollback: the plan-tick
        // preimage is captured (like every kind) but has no V1 inverse — a
        // check/uncheck inverse is a named follow-on, not built here — so the
        // eligibility gate must deny it BEFORE `rollback.rs` could ever route a
        // plan tick through its whole-document preimage-restore default arm.
        // This guard fails loudly if a future edit adds SetPlanStepState to the
        // rollback-eligible operation set (transitions `create_rollback_eligibility`).
        let source = record(
            ChangesetKind::Authoring,
            ChangesetStatus::Applied,
            vec![ChangesetChildOperationInput {
                child_key: "child_1".to_string(),
                operation: ChangesetOperationKind::SetPlanStepState,
                target: fence(existing_doc("tick-plan", "blob:aaa111")),
                materialized_operation: None,
                material_digest: None,
                validation_digest: None,
            }],
        );
        denied_contains(
            create_rollback_eligibility(
                &source,
                &[RollbackChildEligibility::new(
                    "child_1",
                    ChangesetOperationKind::SetPlanStepState,
                    true,
                )],
            ),
            "no V1 inverse",
        );
    }

    #[test]
    fn rollback_is_a_new_changeset_and_source_status_is_not_rewritten() {
        let source = authoring_record(ChangesetStatus::Applied);
        let preimage_child =
            RollbackChildEligibility::new("child_1", ChangesetOperationKind::ReplaceBody, true);
        allowed(create_rollback_eligibility(
            &source,
            std::slice::from_ref(&preimage_child),
        ));
        assert_eq!(
            source.status,
            ChangesetStatus::Applied,
            "rollback eligibility does not mutate the source changeset"
        );

        allowed(initial_changeset_status_eligibility(
            ChangesetKind::Rollback,
            ChangesetStatus::RollbackProposed,
        ));
        denied_contains(
            initial_changeset_status_eligibility(
                ChangesetKind::Authoring,
                ChangesetStatus::RollbackProposed,
            ),
            "not a valid initial",
        );

        let rejected = authoring_record(ChangesetStatus::Rejected);
        denied_contains(
            create_rollback_eligibility(&rejected, std::slice::from_ref(&preimage_child)),
            "not applied",
        );
        let multi_source = record(
            ChangesetKind::Authoring,
            ChangesetStatus::Applied,
            vec![
                child("child_1", existing_doc("transition-a", "blob:aaa111")),
                child("child_2", existing_doc("transition-b", "blob:bbb111")),
            ],
        );
        denied_contains(
            create_rollback_eligibility(
                &multi_source,
                &[
                    preimage_child.clone(),
                    RollbackChildEligibility::new(
                        "child_2",
                        ChangesetOperationKind::ReplaceBody,
                        true,
                    ),
                ],
            ),
            "exactly one",
        );
        denied_contains(
            create_rollback_eligibility(
                &source,
                &[RollbackChildEligibility::new(
                    "missing_child",
                    ChangesetOperationKind::ReplaceBody,
                    true,
                )],
            ),
            "does not exist",
        );
        denied_contains(
            create_rollback_eligibility(
                &source,
                &[RollbackChildEligibility::new(
                    "child_1",
                    ChangesetOperationKind::CreateDocument,
                    true,
                )],
            ),
            "does not match",
        );
        let create_source = record(
            ChangesetKind::Authoring,
            ChangesetStatus::Applied,
            vec![ChangesetChildOperationInput {
                child_key: "child_1".to_string(),
                operation: ChangesetOperationKind::CreateDocument,
                target: fence(provisional_doc()),
                materialized_operation: None,
                material_digest: None,
                validation_digest: None,
            }],
        );
        denied_contains(
            create_rollback_eligibility(
                &create_source,
                &[RollbackChildEligibility::new(
                    "child_1",
                    ChangesetOperationKind::CreateDocument,
                    true,
                )],
            ),
            "rollback_unavailable",
        );
        denied_contains(
            create_rollback_eligibility(
                &source,
                &[RollbackChildEligibility::new(
                    "child_1",
                    ChangesetOperationKind::ReplaceBody,
                    false,
                )],
            ),
            "required preimage",
        );
    }

    #[test]
    fn policy_requeue_arc_is_declared_and_gated_to_system_over_approved() {
        // P48-R1: the Approved→NeedsReview kill-switch arc is DECLARED in the append
        // vocabulary (so it is not a synthetic 2-hop leaking undeclared arcs).
        assert!(append_allows_status_transition(
            ChangesetKind::Authoring,
            ChangesetStatus::Approved,
            ChangesetStatus::NeedsReview,
        ));

        let approved = authoring_record(ChangesetStatus::Approved);
        let system = ActorRef {
            id: ActorId::new("system:modes").unwrap(),
            kind: ActorKind::System,
            delegated_by: None,
        };
        let human = ActorRef {
            id: ActorId::new("human:reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        };

        // Legal only for the system actor over an approved head.
        allowed(policy_requeue_transition_eligibility(&approved, &system));
        denied_contains(
            policy_requeue_transition_eligibility(&approved, &human),
            "system-actor",
        );
        let needs_review = authoring_record(ChangesetStatus::NeedsReview);
        denied_contains(
            policy_requeue_transition_eligibility(&needs_review, &system),
            "approved head",
        );
    }

    #[test]
    fn every_command_has_an_explicit_lifecycle_scope() {
        for command in CommandKind::ALL {
            let scope = command_lifecycle_scope(*command);
            match command {
                CommandKind::CreateProposal | CommandKind::CreateRollback => {
                    assert_eq!(scope, CommandLifecycleScope::InitialChangeset)
                }
                CommandKind::ReadContext
                | CommandKind::SearchGraph
                | CommandKind::SubscribeEvents
                | CommandKind::RecoverEventStream => {
                    assert_eq!(scope, CommandLifecycleScope::NotChangesetLifecycle)
                }
                _ => {
                    assert!(
                        matches!(
                            scope,
                            CommandLifecycleScope::ChangesetTransition
                                | CommandLifecycleScope::StatusPreserving
                                | CommandLifecycleScope::NotChangesetLifecycle
                        ),
                        "command has a declared lifecycle scope: {command:?}"
                    );
                }
            }
        }
    }
}
