//! Changeset approval requests and decisions (W03.P23).
//!
//! A `changeset_approval_request` is keyed by `proposal_id` and asks whether a
//! reviewed proposal revision may later be applied (approval-gates-review-state
//! ADR). This module persists the durable approval request + its approve / reject
//! / request-changes decision bound to the REVIEWED TUPLE (proposal revision,
//! validation digest, policy version), invalidates a pending approval when any of
//! that goes stale, and serves the durable approval snapshot. Decision handlers
//! are idempotent: a repeated decision replays the recorded outcome and never
//! double-decides.
//!
//! Approval SEMANTICS reuse the existing machinery rather than re-deriving it: the
//! status transition + freshness/stale gates live in `transitions` (approve /
//! reject eligibility over `ReviewDecisionFreshness`), the append-only status
//! history in `ledger`. This module adds the one thing above them: the review
//! decision record and the AGENT-SELF-APPROVAL ban.
//!
//! The self-approval ban targets AGENT self-approval SPECIFICALLY
//! (`automated_self_approval_blocker`): an agent is an untrusted writer and cannot
//! approve or apply its OWN side-effecting proposal (security-provenance ADR
//! `agents-cannot-self-approve-vault-writes`). A HUMAN approving their own
//! proposal is the operation-modes `kind=direct` self-approval and is explicitly
//! permitted; any distinct reviewer is permitted. It is NEVER a blanket
//! `actor == author` check — that would make the direct-changeset human save
//! structurally impossible.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::events::{LifecycleEventKind, approval_requested_event, review_decision_event};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorKind, ActorRef, ApprovalId, ChangesetId, ChangesetKind,
    ChangesetStatus, CommandKind, ProposalId, RevisionToken,
};
use super::store::outbox::AppendDecision;
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};
use super::transitions::{
    ReviewDecisionFreshness, ValidationFreshness, approve_transition_eligibility,
    edit_proposal_transition_eligibility, reject_transition_eligibility,
};

const APPROVAL_SCHEMA: &str = "authoring.approval.v1";

/// The V1 policy version. Approval policy is data (approval-policy-is-data), but
/// the policy STORE is a later security phase (Increment 5), so V1 pins ONE
/// constant version that the reviewed tuple binds to. Freshness is computed from
/// the reviewed tuple (proposal_revision / target_revisions / validation_digest)
/// vs current; policy staleness is a no-op-vs-constant in V1.
///
/// RETURN TRIGGER: when the policy store lands (W05.P24 / Increment 5), replace
/// this constant with the resolved policy version at review time, and a
/// policy-version change then makes an approval stale exactly like a revision or
/// digest change (`policy_version_current` already threads through the freshness
/// tuple for that day).
pub const V1_POLICY_VERSION: &str = "authoring.approval_policy.v1";

/// The V1 approval-request queue lifecycle (approval-gates-review-state ADR): a
/// request is `queued` until a reviewer decides, `decision_submitted` once a
/// decision is bound, then `closed`. Request-changes / edit-response loops that
/// re-open review are the Increment 5 remainder (W05.P24).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalQueueState {
    Queued,
    DecisionSubmitted,
    Closed,
}

impl ApprovalQueueState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::DecisionSubmitted => "decision_submitted",
            Self::Closed => "closed",
        }
    }
}

/// A recorded review decision. `approve` authorizes a later apply; `reject` is
/// terminal and preserves evidence; `request_changes` sends the proposal back for
/// revision (it invalidates the current review, like an edit).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    Reject,
    RequestChanges,
}

impl ApprovalDecision {
    fn as_str(self) -> &'static str {
        match self {
            Self::Approve => "approve",
            Self::Reject => "reject",
            Self::RequestChanges => "request_changes",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ApprovalError {
    #[error("approval request `{0}` does not exist")]
    UnknownRequest(String),
    #[error("no approval request exists for proposal `{0}`")]
    NoRequestForProposal(String),
    #[error("changeset `{0}` has no ledger revision to review")]
    MissingChangeset(String),
    #[error("approval decision is not permitted: {0}")]
    NotPermitted(String),
    #[error("approval request for proposal `{0}` is already closed")]
    AlreadyClosed(String),
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

pub type Result<T> = std::result::Result<T, ApprovalError>;

/// The reviewed tuple an approval binds to (approvals-bind-to-reviewed-revision):
/// an approval is valid ONLY for this proposal revision, validation digest, and
/// policy version. Any change makes the pending approval stale.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewedTuple {
    pub proposal_revision: RevisionToken,
    pub validation_digest: String,
    pub policy_version: String,
}

/// Input to open a changeset approval request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRequestInput {
    pub approval_id: ApprovalId,
    pub proposal_id: ProposalId,
    pub changeset_id: ChangesetId,
    pub reviewed: ReviewedTuple,
    pub idempotency_key: String,
    pub created_at_ms: i64,
}

/// Input to submit a review decision: the decision + reviewer, plus the CURRENT
/// proposal freshness inputs the decision is gated against (grouped so the
/// decision context travels as one value rather than a wide argument list).
#[derive(Debug, Clone)]
pub struct ReviewDecisionInput<'a> {
    pub proposal_id: &'a ProposalId,
    pub decision: ApprovalDecision,
    pub reviewer: &'a ActorRef,
    pub validation: ValidationFreshness,
    pub current_validation_digest: &'a str,
    pub current_policy_version: &'a str,
    pub run_cancelled: bool,
    pub comment: Option<String>,
    pub decided_at_ms: i64,
}

/// A recorded review decision bound to the reviewer and the reviewed tuple.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecisionRecord {
    pub decision: ApprovalDecision,
    pub reviewer: ActorRef,
    pub resulting_status: ChangesetStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub decided_at_ms: i64,
}

/// The durable approval request + decision. This IS the backend-served product
/// state (review-actions-are-backend-served): the queue state, the reviewed
/// tuple, the reviewer, and the decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovalRequestRecord {
    pub schema_version: String,
    pub approval_id: ApprovalId,
    pub proposal_id: ProposalId,
    pub changeset_id: ChangesetId,
    pub queue_state: ApprovalQueueState,
    pub reviewed: ReviewedTuple,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<ReviewDecisionRecord>,
    /// True once the reviewed tuple no longer matches the current proposal: a
    /// stale pending approval cannot be decided or applied.
    pub stale: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stale_reason: Option<String>,
    pub idempotency_key: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl ApprovalRequestRecord {
    fn queued(input: ApprovalRequestInput) -> Self {
        Self {
            schema_version: APPROVAL_SCHEMA.to_string(),
            approval_id: input.approval_id,
            proposal_id: input.proposal_id,
            changeset_id: input.changeset_id,
            queue_state: ApprovalQueueState::Queued,
            reviewed: input.reviewed,
            decision: None,
            stale: false,
            stale_reason: None,
            idempotency_key: input.idempotency_key,
            created_at_ms: input.created_at_ms,
            updated_at_ms: input.created_at_ms,
        }
    }
}

/// The AUTOMATED-SELF-APPROVAL ban (security-provenance ADR
/// `agents-cannot-self-approve-vault-writes`). An untrusted automated actor
/// cannot approve or apply the proposal it PROPOSED. `origin_author` is the
/// PROPOSING actor — the FIRST revision of the changeset chain (ledger `origin`),
/// NEVER `latest().actor` (which becomes the reviewer after an approval revision
/// is appended; keying on latest would defeat the ban on the P36 apply path).
///
/// Denies when the approver is an automated writer (Agent or ToolExecutor) AND it
/// is the origin author itself (`approver.id == origin_author.id`) OR it is acting
/// ON BEHALF of the origin author (`approver.delegated_by == origin_author.id`).
/// A HUMAN approving their own proposal (operation-modes `kind=direct`) and any
/// distinct reviewer pass — it is never a blanket `approver == author`.
///
/// The ADR bans an automated actor approving OR APPLYING its own side-effecting
/// proposal, so this is the ONE reusable check for both gates: P23 wires it into
/// the approve path (below); P36 apply-authorization MUST reuse this same function
/// with the applying actor + the ORIGIN author (do not re-derive it there).
pub fn automated_self_approval_blocker(
    command: CommandKind,
    approver: &ActorRef,
    origin_author: &ActorRef,
) -> Option<ActionEligibility> {
    let approver_is_automated = matches!(approver.kind, ActorKind::Agent | ActorKind::ToolExecutor);
    let approves_as_origin = approver.id == origin_author.id;
    let approves_on_behalf_of_origin = approver.delegated_by.as_ref() == Some(&origin_author.id);
    if approver_is_automated && (approves_as_origin || approves_on_behalf_of_origin) {
        return Some(ActionEligibility::denied(
            command,
            "an automated actor cannot approve or apply its own proposal, \
             or one it proposed on behalf of (agents-cannot-self-approve-vault-writes)",
        ));
    }
    None
}

/// Freshness of a pending approval against the CURRENT proposal: the reviewed
/// tuple must still match the ledger's current revision and the reviewed
/// validation digest / policy version. A cancelled run also invalidates it.
pub fn review_decision_freshness(
    request: &ApprovalRequestRecord,
    current: &ChangesetAggregateRecord,
    current_validation_digest: &str,
    current_policy_version: &str,
    run_cancelled: bool,
) -> ReviewDecisionFreshness {
    ReviewDecisionFreshness {
        review_request_present: true,
        proposal_revision_current: request.reviewed.proposal_revision == current.changeset_revision,
        target_revisions_current: !request.stale,
        validation_digest_current: request.reviewed.validation_digest == current_validation_digest,
        policy_version_current: request.reviewed.policy_version == current_policy_version,
        run_cancelled,
    }
}

/// The full eligibility of a review decision: the AGENT-SELF-APPROVAL ban first
/// (approve only), then the status + freshness/stale transition gate reused from
/// `transitions`. Pure: it decides, it does not persist.
pub fn review_decision_eligibility(
    decision: ApprovalDecision,
    approver: &ActorRef,
    origin_author: &ActorRef,
    current: &ChangesetAggregateRecord,
    freshness: ReviewDecisionFreshness,
    validation: ValidationFreshness,
) -> ActionEligibility {
    match decision {
        ApprovalDecision::Approve => {
            if let Some(blocked) =
                automated_self_approval_blocker(CommandKind::Approve, approver, origin_author)
            {
                return blocked;
            }
            approve_transition_eligibility(current, freshness, validation)
        }
        ApprovalDecision::Reject => reject_transition_eligibility(current, freshness, validation),
        // Request-changes ACTIVATES the deferred W05.P23 remainder (W13.P24): the reviewer
        // sends the proposal back for revision through the declared EditProposal arc
        // (NeedsReview|Approved -> Draft / RollbackProposed), which stales the reviewed
        // material. It is feedback, not an approval, so the self-approval ban does not
        // apply; it is gated only by the transition arc — a terminal or non-reviewable head
        // is refused as a denied value. The SAME `edit_proposal_transition_eligibility`
        // predicate backs the review-station projection's served eligibility, so what the
        // queue advertises can never drift from what this path accepts.
        ApprovalDecision::RequestChanges => edit_proposal_transition_eligibility(current),
    }
}

/// The status a permitted decision drives the changeset to. Request-changes reuses the
/// kind-aware EditProposal target so a rollback changeset returns to `RollbackProposed`,
/// never an illegal `Draft`.
fn resulting_status(decision: ApprovalDecision, kind: ChangesetKind) -> ChangesetStatus {
    match decision {
        ApprovalDecision::Approve => ChangesetStatus::Approved,
        ApprovalDecision::Reject => ChangesetStatus::Rejected,
        ApprovalDecision::RequestChanges => edit_proposal_target(kind),
    }
}

/// The revision-target the EditProposal arc drives a changeset back to for reviewer edits /
/// request-changes: `Draft` for an authoring-like changeset, `RollbackProposed` for a
/// rollback — matching `transitions::command_allows_transition` for `EditProposal`.
fn edit_proposal_target(kind: ChangesetKind) -> ChangesetStatus {
    match kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::Draft,
        ChangesetKind::Rollback => ChangesetStatus::RollbackProposed,
    }
}

/// The outcome a decision handler returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalOutcome {
    pub record: ApprovalRequestRecord,
    pub eligibility: ActionEligibility,
    /// True when this call replayed an already-recorded decision (idempotency).
    pub replayed: bool,
}

pub struct ApprovalRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn approvals<'repo>(&'repo self) -> ApprovalRepository<'repo, 'conn> {
        ApprovalRepository {
            repo: self.repository("authoring_approval_requests"),
            uow: self,
        }
    }
}

impl ApprovalRepository<'_, '_> {
    /// Open a changeset approval request (queued). Idempotent by proposal_id: a
    /// repeated request with the same idempotency key replays the stored record.
    pub fn request_approval(&self, input: ApprovalRequestInput) -> Result<ApprovalOutcome> {
        if let Some(existing) = self.latest_for_proposal(&input.proposal_id)? {
            if existing.idempotency_key == input.idempotency_key {
                let eligibility = ActionEligibility::allowed(CommandKind::SubmitForReview);
                return Ok(ApprovalOutcome {
                    record: existing,
                    eligibility,
                    replayed: true,
                });
            }
            // A2.2 hygiene: a re-request under a NEW idempotency key supersedes the
            // prior PENDING request. Retire it (stale + retention Superseded) so it
            // never leaks as an immortal Pending retention row.
            if existing.decision.is_none() && !existing.stale {
                let mut superseded = existing;
                superseded.stale = true;
                superseded.stale_reason = Some("superseded_by_new_request".to_string());
                superseded.updated_at_ms = input.created_at_ms.max(superseded.created_at_ms);
                self.store_record(&superseded)?;
                self.register_retention(&superseded, LifecycleStatus::Superseded)?;
            }
        }
        let record = ApprovalRequestRecord::queued(input);
        self.store_record(&record)?;
        // A pending approval is product state: register it in retention as
        // record_kind="approval"/Pending so compaction can never silently delete
        // it (approval-gates-review-state ADR; retention S40). Same unit of work.
        self.register_retention(&record, LifecycleStatus::Pending)?;
        // Publish the `approval.requested` lifecycle transition to the durable outbox
        // in the SAME commit boundary, so a downstream verdict subscriber parks the run
        // the instant the proposal enters review. Attributed to the submitting actor —
        // the current head's author (the submit moved it to NeedsReview under them).
        if let Some(head) = self.uow.ledger().latest(&record.changeset_id)? {
            let event = approval_requested_event(
                record.approval_id.as_str(),
                record.proposal_id.as_str(),
                record.changeset_id.as_str(),
                record.reviewed.proposal_revision.as_str(),
                head.actor,
                None,
                record.created_at_ms,
            )?;
            match self.uow.outbox().append_event(event)? {
                AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => {}
            }
        }
        Ok(ApprovalOutcome {
            record,
            eligibility: ActionEligibility::allowed(CommandKind::SubmitForReview),
            replayed: false,
        })
    }

    /// Register / update this approval's retention record (record_kind="approval",
    /// ReviewMaterial). `Pending` is protected from compaction; a decided approval
    /// moves to its terminal lifecycle. Shares the caller's unit of work.
    fn register_retention(
        &self,
        record: &ApprovalRequestRecord,
        lifecycle: LifecycleStatus,
    ) -> StoreResult<()> {
        let retention = RetentionRecord::new(
            RetentionRecordRef::new("approval", record.approval_id.as_str())?,
            "proposal",
            record.proposal_id.as_str(),
            RetentionClass::ReviewMaterial,
            lifecycle,
            record.reviewed.validation_digest.as_str(),
            record.updated_at_ms,
        )?;
        self.uow.retention().upsert_record(&retention)
    }

    /// Submit a review decision. Runs the AGENT-SELF-APPROVAL ban + the transition
    /// gate, appends the resulting ledger status revision under the reviewer's
    /// identity, and records the decision durably. Idempotent: a repeated decision
    /// on an already-closed request replays the recorded outcome.
    pub fn submit_decision(&self, input: ReviewDecisionInput<'_>) -> Result<ApprovalOutcome> {
        let ReviewDecisionInput {
            proposal_id,
            decision,
            reviewer,
            validation,
            current_validation_digest,
            current_policy_version,
            run_cancelled,
            comment,
            decided_at_ms,
        } = input;

        let mut request = self
            .latest_for_proposal(proposal_id)?
            .ok_or_else(|| ApprovalError::NoRequestForProposal(proposal_id.to_string()))?;

        // Idempotent replay: an identical decision on an already-decided request
        // returns the recorded outcome, never a second decision.
        if let Some(existing) = &request.decision {
            if existing.decision == decision && existing.reviewer == *reviewer {
                let eligibility = ActionEligibility::allowed(decision_command(decision));
                return Ok(ApprovalOutcome {
                    record: request.clone(),
                    eligibility,
                    replayed: true,
                });
            }
            return Err(ApprovalError::NotPermitted(format!(
                "proposal `{proposal_id}` already has a `{}` decision by a different reviewer",
                existing.decision.as_str()
            )));
        }

        let current = self
            .uow
            .ledger()
            .latest(&request.changeset_id)?
            .ok_or_else(|| ApprovalError::MissingChangeset(request.changeset_id.to_string()))?;
        // The self-approval ban keys on the ORIGIN (proposing) author, not
        // `current.actor` — after an approval revision, latest().actor is the
        // reviewer (P23-R1). Read the first revision's actor.
        let origin = self
            .uow
            .ledger()
            .origin(&request.changeset_id)?
            .ok_or_else(|| ApprovalError::MissingChangeset(request.changeset_id.to_string()))?;

        let freshness = review_decision_freshness(
            &request,
            &current,
            current_validation_digest,
            current_policy_version,
            run_cancelled,
        );
        let eligibility = review_decision_eligibility(
            decision,
            reviewer,
            &origin.actor,
            &current,
            freshness,
            validation,
        );
        if !eligibility.allowed {
            return Ok(ApprovalOutcome {
                record: request,
                eligibility,
                replayed: false,
            });
        }

        // Append the status transition under the REVIEWER's identity (append-only
        // provenance: the reviewer made this decision).
        let next = append_status_transition(
            &current,
            resulting_status(decision, current.kind),
            reviewer,
            decided_at_ms,
        )?;
        self.uow.ledger().append_revision(&next)?;

        request.queue_state = ApprovalQueueState::Closed;
        request.decision = Some(ReviewDecisionRecord {
            decision,
            reviewer: reviewer.clone(),
            resulting_status: next.status,
            comment,
            decided_at_ms,
        });
        request.updated_at_ms = decided_at_ms;
        self.store_record(&request)?;
        // The decided approval leaves the pending state; move its retention
        // lifecycle in the SAME commit boundary as the ledger append + record
        // persist (state-store ADR: mutating command state moves atomically).
        let lifecycle = match decision {
            ApprovalDecision::Approve => LifecycleStatus::Active,
            ApprovalDecision::Reject => LifecycleStatus::Rejected,
            // Request-changes closes THIS review cycle (the proposal returns to draft/
            // rollback-proposed for revision; a re-submission opens a fresh request), so its
            // retention lifecycle is Superseded — decided evidence, no longer a protected
            // pending request.
            ApprovalDecision::RequestChanges => LifecycleStatus::Superseded,
        };
        self.register_retention(&request, lifecycle)?;
        // Publish the decision as a lifecycle transition on the durable outbox in the
        // SAME commit boundary as the ledger append + record persist, so a downstream
        // verdict subscriber resumes the parked run. The `decision` field is
        // authoritative for the verdict; `next` names the resulting status + revision.
        let decision_event = review_decision_event(
            decision_event_kind(decision),
            decision.as_str(),
            request.decision.as_ref().and_then(|d| d.comment.as_deref()),
            request.approval_id.as_str(),
            request.proposal_id.as_str(),
            request.changeset_id.as_str(),
            next.status,
            next.changeset_revision.as_str(),
            reviewer.clone(),
            decision_command(decision),
            decided_at_ms,
        )?;
        match self.uow.outbox().append_event(decision_event)? {
            AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => {}
        }

        Ok(ApprovalOutcome {
            record: request,
            eligibility,
            replayed: false,
        })
    }

    /// Invalidate a pending approval whose reviewed tuple no longer matches the
    /// current proposal (a stale base revision, changed validation, or changed
    /// policy). A stale pending approval cannot be decided or applied.
    pub fn invalidate_if_stale(
        &self,
        proposal_id: &ProposalId,
        current_proposal_revision: &RevisionToken,
        current_validation_digest: &str,
        current_policy_version: &str,
        now_ms: i64,
    ) -> Result<Option<ApprovalRequestRecord>> {
        let Some(mut request) = self.latest_for_proposal(proposal_id)? else {
            return Ok(None);
        };
        if request.queue_state == ApprovalQueueState::Closed {
            return Ok(Some(request));
        }
        let stale = &request.reviewed.proposal_revision != current_proposal_revision
            || request.reviewed.validation_digest != current_validation_digest
            || request.reviewed.policy_version != current_policy_version;
        if stale && !request.stale {
            request.stale = true;
            request.stale_reason = Some(stale_reason(
                &request,
                current_proposal_revision,
                current_validation_digest,
                current_policy_version,
            ));
            request.updated_at_ms = now_ms;
            self.store_record(&request)?;
        }
        Ok(Some(request))
    }

    pub fn store_record(&self, record: &ApprovalRequestRecord) -> StoreResult<()> {
        validate_record(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Approval(err.to_string()))?;
        let (reviewer_id, reviewer_kind) = match &record.decision {
            Some(decision) => (
                Some(decision.reviewer.id.as_str().to_string()),
                Some(super::actors::actor_kind_name(decision.reviewer.kind).to_string()),
            ),
            None => (None, None),
        };
        let decision = record.decision.as_ref().map(|d| d.decision.as_str());
        self.repo.execute(
            "INSERT INTO authoring_approval_requests
                (approval_id, proposal_id, changeset_id, queue_state, decision,
                 reviewer_actor_id, reviewer_actor_kind, reviewed_proposal_revision,
                 reviewed_validation_digest, policy_version, idempotency_key,
                 record_json, created_at_ms, updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(approval_id) DO UPDATE SET
                queue_state = excluded.queue_state,
                decision = excluded.decision,
                reviewer_actor_id = excluded.reviewer_actor_id,
                reviewer_actor_kind = excluded.reviewer_actor_kind,
                reviewed_proposal_revision = excluded.reviewed_proposal_revision,
                reviewed_validation_digest = excluded.reviewed_validation_digest,
                policy_version = excluded.policy_version,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.approval_id.as_str(),
                record.proposal_id.as_str(),
                record.changeset_id.as_str(),
                record.queue_state.as_str(),
                decision,
                reviewer_id,
                reviewer_kind,
                record.reviewed.proposal_revision.as_str(),
                record.reviewed.validation_digest.as_str(),
                record.reviewed.policy_version.as_str(),
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn record_by_approval(
        &self,
        approval_id: &ApprovalId,
    ) -> StoreResult<Option<ApprovalRequestRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_approval_requests
                 WHERE approval_id = ?1",
                [approval_id.as_str()],
                read_record,
            )?
            .map(validate_loaded)
            .transpose()
    }

    /// The durable approval snapshot for a proposal (the latest request row).
    pub fn latest_for_proposal(
        &self,
        proposal_id: &ProposalId,
    ) -> StoreResult<Option<ApprovalRequestRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_approval_requests
                 WHERE proposal_id = ?1
                 ORDER BY seq DESC
                 LIMIT 1",
                [proposal_id.as_str()],
                read_record,
            )?
            .map(validate_loaded)
            .transpose()
    }
}

fn decision_command(decision: ApprovalDecision) -> CommandKind {
    match decision {
        ApprovalDecision::Approve => CommandKind::Approve,
        ApprovalDecision::Reject => CommandKind::Reject,
        ApprovalDecision::RequestChanges => CommandKind::EditProposal,
    }
}

/// The canonical lifecycle transition kind a decision publishes to the durable
/// outbox. Approve and request-changes both RESOLVE the open approval
/// (`approval.resolved`); reject is the terminal `proposal.rejected`. Request-changes
/// has no distinct changeset status of its own (the proposal returns to draft), so it
/// is observable ONLY from this live decision event — it rides `approval.resolved` and
/// is disambiguated by the authoritative payload `decision` field, which every
/// decision event carries regardless of kind.
fn decision_event_kind(decision: ApprovalDecision) -> LifecycleEventKind {
    match decision {
        ApprovalDecision::Approve | ApprovalDecision::RequestChanges => {
            LifecycleEventKind::ApprovalResolved
        }
        ApprovalDecision::Reject => LifecycleEventKind::ProposalRejected,
    }
}

/// Build the next ledger revision that carries the changeset to `next_status`
/// under the deciding `reviewer`, preserving the reviewed child operations.
fn append_status_transition(
    current: &ChangesetAggregateRecord,
    next_status: ChangesetStatus,
    reviewer: &ActorRef,
    decided_at_ms: i64,
) -> Result<ChangesetAggregateRecord> {
    let children = current
        .children
        .iter()
        .map(|child| ChangesetChildOperationInput {
            child_key: child.child_key.clone(),
            operation: child.operation,
            target: child.target.clone(),
            materialized_operation: child.materialized_operation.clone(),
            material_digest: child.material_digest.clone(),
            validation_digest: child.validation_digest.clone(),
        })
        .collect();
    let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: current.changeset_id.clone(),
        previous_revision: Some(current.changeset_revision.clone()),
        kind: current.kind,
        status: next_status,
        session_id: current.session_id.clone(),
        actor: reviewer.clone(),
        summary: current.summary.clone(),
        children,
        created_at_ms: decided_at_ms,
    })
    .map_err(|err| ApprovalError::Store(StoreError::Approval(err.to_string())))?;
    Ok(record)
}

fn stale_reason(
    request: &ApprovalRequestRecord,
    current_proposal_revision: &RevisionToken,
    current_validation_digest: &str,
    current_policy_version: &str,
) -> String {
    if &request.reviewed.proposal_revision != current_proposal_revision {
        "proposal_revision_changed".to_string()
    } else if request.reviewed.validation_digest != current_validation_digest {
        "validation_digest_changed".to_string()
    } else if request.reviewed.policy_version != current_policy_version {
        "policy_version_changed".to_string()
    } else {
        "approval_marked_stale".to_string()
    }
}

fn read_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<ApprovalRequestRecord> {
    let record_json: String = row.get(0)?;
    serde_json::from_str(&record_json).map_err(to_sql_error)
}

fn validate_loaded(record: ApprovalRequestRecord) -> StoreResult<ApprovalRequestRecord> {
    validate_record(&record)?;
    Ok(record)
}

fn validate_record(record: &ApprovalRequestRecord) -> StoreResult<()> {
    if record.schema_version != APPROVAL_SCHEMA {
        return Err(StoreError::Approval(format!(
            "unsupported approval schema `{}`",
            record.schema_version
        )));
    }
    if record.reviewed.validation_digest.trim().is_empty() {
        return Err(StoreError::Approval(
            "reviewed validation digest cannot be empty".to_string(),
        ));
    }
    if record.reviewed.policy_version.trim().is_empty() {
        return Err(StoreError::Approval(
            "reviewed policy version cannot be empty".to_string(),
        ));
    }
    if record.idempotency_key.trim().is_empty() {
        return Err(StoreError::Approval(
            "idempotency key cannot be empty".to_string(),
        ));
    }
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Approval(
            "updated_at_ms cannot be before created_at_ms".to_string(),
        ));
    }
    match (&record.queue_state, &record.decision) {
        (ApprovalQueueState::Closed, None) => Err(StoreError::Approval(
            "a closed approval request must carry a decision".to_string(),
        )),
        (ApprovalQueueState::Queued, Some(_)) => Err(StoreError::Approval(
            "a queued approval request cannot carry a decision".to_string(),
        )),
        _ => Ok(()),
    }
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests;
