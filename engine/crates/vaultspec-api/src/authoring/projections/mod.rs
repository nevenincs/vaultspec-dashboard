//! Backend-served review projections and action eligibility (W03.P18).
//!
//! A projection is a PURE READ over durable authoring product state (the ledger,
//! validation records, approval requests, preimages) plus the live worktree. It
//! holds NO state of its own, so it rebuilds identically after a restart — the
//! frontend-visible status, action eligibility, conflict reason, validation state,
//! and rollback availability are all derived here, backend-served, never inferred
//! in the client (architecture-boundaries: displayed/filterable state is
//! backend-served).
//!
//! V1 REVIEW PROJECTIONS (agentic plan W03.P18 + W11.P50): the proposal list,
//! action eligibility, conflict reason, validation status, rollback availability,
//! corpus-wide review COUNTS, and bounded per-document ACTIVITY rollups the
//! review station needs. Counts are computed over the full durable corpus before
//! any list cap is applied — never from the bounded proposal page — and activity
//! pages carry their own cap/truncation metadata.
//!
//! TARGET-FENCE FRESHNESS (arch-reviewer advisory A2.1 / ASA-007): the stored
//! approval freshness (`ReviewDecisionFreshness.target_revisions_current`) is a
//! placeholder — `approvals::invalidate_if_stale` compares only the proposal
//! revision, validation digest, and policy version, so a target document whose
//! base moved by an UN-LEDGERED human direct save (the ASA-007 transition window)
//! does not stale a pending approval. This module closes that gap for the
//! backend-served view: it re-reads each target document's CURRENT worktree
//! revision and compares it to the reviewed base, surfacing a conflict and
//! denying approve/apply eligibility when they diverge. (The apply-time floor
//! still independently re-checks the base hash, so this is defense-in-depth for
//! the UI, not the sole guard.)

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::api::ChangesetOperationKind;
use super::approvals::{
    ApprovalDecision, ApprovalQueueState, ApprovalRequestRecord, V1_POLICY_VERSION,
};
use super::conflicts::{
    ConflictReport, MAX_CONFLICT_HELD_LEASES, MAX_CONFLICT_SIBLINGS, detect_conflicts,
};
use super::ledger::{ChangesetAggregateRecord, ChangesetChildOperationRecord};
use super::model::{
    ActionEligibility, ActorRef, ApprovalId, ChangesetId, ChangesetKind, ChangesetStatus,
    DocumentRef, ProposalId, RevisionToken, RunId, SessionId,
};
use super::modes::{SystemPolicyApprovalRecord, scope_id_for_worktree};
use super::policy::{OperationMode, PolicyDecisionProjection, decide_changeset_approval};
use super::snapshots::SnapshotReader;
use super::store::StoreError;
use super::store::unit_of_work::{Repository, UnitOfWork};
use super::transitions::{
    ApprovalFreshness, ReviewDecisionFreshness, RollbackChildEligibility, ValidationFreshness,
    apply_transition_eligibility, approve_transition_eligibility, create_rollback_eligibility,
    edit_proposal_transition_eligibility, reject_transition_eligibility,
    submit_for_review_transition_eligibility,
};
use super::validation::{ValidationStatus, ValidationStatusRecord};

/// The bounded ceiling for one proposal-list projection page (resource-bounds:
/// every retained list carries a size cap at creation). A skeleton review station
/// shows a bounded working set; the corpus-wide paged listing is the Increment 3
/// remainder. A page at the cap sets `truncated`, never a silently-clipped read.
pub const MAX_PROJECTION_PROPOSALS: usize = 200;

/// The bounded ceiling for one per-document activity projection page. The read is
/// scoped by a backend-issued document activity key and reports `truncated` when
/// more durable ledger activity exists.
pub const MAX_DOCUMENT_ACTIVITY_ITEMS: usize = 100;

/// The maximum number of most-recent changeset heads one activity read may scan
/// while looking for matching document identities. Until the store has a durable
/// document-activity index, this keeps the repository read bounded and reports
/// `truncated` when the scan ceiling is reached before the corpus is exhausted.
pub const MAX_DOCUMENT_ACTIVITY_SCAN_ROWS: usize = 10_000;

/// The byte ceiling for ONE review-document text (base or proposed) served on the
/// DETAIL projection. resource-bounds: every serve is bounded at creation, and the
/// api-contract ADR's bounded-document-content forbids an unbounded whole-document
/// serve. A text over the cap is truncated at a char boundary and its
/// [`BoundedDocumentText::truncated`] flag is set, so the reviewer sees an HONEST
/// "more exists" marker rather than a silently-clipped body. Sized to hold a normal
/// `.vault/` document whole while still capping a pathological one.
pub const MAX_REVIEW_DOCUMENT_TEXT_BYTES: usize = 128 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ProjectionError {
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

pub type Result<T> = std::result::Result<T, ProjectionError>;

/// The validation state a reviewer sees for a proposal: whether a validation
/// record exists, its status, whether it is approval-ready, and its digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationStateProjection {
    pub present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ValidationStatus>,
    pub approval_ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_digest: Option<String>,
}

/// The approval state a reviewer sees: whether a request exists, its queue state,
/// the recorded decision (if any), and whether the pending approval is stale.
///
/// The `approval_id` / `proposal_id` / `reviewed_proposal_revision` IDENTITY fields
/// are sourced from the durable [`ApprovalRequestRecord`] the projection already
/// holds. A human reviewing FROM THE QUEUE never performed the submit, so they do
/// not hold the ids the submit response echoed — the projection must carry them so
/// the deny/approve path can name the approval, and the client never recomputes an
/// internal hash to derive them (wire-contract: stable keys are backend-served).
/// They are small identity fields, so they ride BOTH the list and detail routes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovalStateProjection {
    pub present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_state: Option<ApprovalQueueState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<ApprovalDecision>,
    pub stale: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<ApprovalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<ProposalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_proposal_revision: Option<RevisionToken>,
}

/// A target-document conflict: a child's reviewed base revision no longer matches
/// the current worktree revision (an out-of-band edit since review). This is the
/// backend-served signal the skeleton UI shows before an apply is attempted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConflictProjection {
    pub child_key: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_base_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<RevisionToken>,
}

/// Whether an applied changeset can be rolled back (a V1 whole-document preimage
/// restore), with an honest reason when it cannot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackAvailabilityProjection {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child_key: Option<String>,
}

/// The backend-served review projection for one changeset: its latest lifecycle
/// state plus every derived, frontend-visible value — validation, approval,
/// policy decision, conflict, action eligibility, and rollback availability.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProposalProjection {
    pub changeset_id: ChangesetId,
    pub changeset_revision: RevisionToken,
    pub kind: ChangesetKind,
    pub status: ChangesetStatus,
    pub summary: String,
    /// The actor of the latest revision (the reviewer after a decision).
    pub actor: ActorRef,
    /// The proposing (origin) author — distinct from `actor` after a review
    /// decision appends a revision under the reviewer.
    pub origin_actor: ActorRef,
    pub operation_count: usize,
    pub validation: ValidationStateProjection,
    pub approval: ApprovalStateProjection,
    /// The operation-mode approval policy decision the UI renders directly. The
    /// phase has no durable mode store yet, so the projection uses the policy
    /// default (`manual`) and no session override; W10.P48 replaces those inputs
    /// when mode scope is implemented without changing the served contract.
    pub policy: PolicyDecisionProjection,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<ConflictProjection>,
    /// The backend-served action eligibility for the current status: each entry is
    /// an `ActionEligibility` (allowed + reason) the UI renders directly, never
    /// re-derives.
    pub eligibility: Vec<ActionEligibility>,
    pub rollback: RollbackAvailabilityProjection,
    pub created_at_ms: i64,
    /// Provenance naming the producing fact (agent-wire-gaps D4): the session,
    /// run, and turn that created the changeset, read from the ORIGIN revision.
    /// Human/direct changesets serve `None`. Never part of any stable key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<RunId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

/// A bounded page of proposal projections. `truncated` is set when the corpus has
/// more changesets than the cap; the UI shows an honest "more exist" affordance
/// rather than a silently-clipped list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProposalListProjection {
    pub items: Vec<ProposalProjection>,
    pub truncated: bool,
    pub cap: usize,
    pub counts: ReviewCountProjection,
    pub applied_under_policy: AppliedUnderPolicyLaneProjection,
}

/// Corpus-wide review counts over the latest durable changeset and approval
/// records. This is intentionally separate from the bounded proposal page:
/// clients must never infer these values from `ProposalListProjection.items`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewCountProjection {
    pub total_changesets: usize,
    pub statuses: ChangesetStatusCounts,
    pub queues: ApprovalQueueCounts,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetStatusCounts {
    pub draft: usize,
    pub generating: usize,
    pub proposed: usize,
    pub needs_review: usize,
    pub approved: usize,
    pub applying: usize,
    pub applied: usize,
    pub partially_applied: usize,
    pub compensation_required: usize,
    pub rejected: usize,
    pub conflicted: usize,
    pub superseded: usize,
    pub failed: usize,
    pub rollback_proposed: usize,
    pub cancelled: usize,
}

impl ChangesetStatusCounts {
    fn add(&mut self, status: ChangesetStatus) {
        match status {
            ChangesetStatus::Draft => self.draft += 1,
            ChangesetStatus::Generating => self.generating += 1,
            ChangesetStatus::Proposed => self.proposed += 1,
            ChangesetStatus::NeedsReview => self.needs_review += 1,
            ChangesetStatus::Approved => self.approved += 1,
            ChangesetStatus::Applying => self.applying += 1,
            ChangesetStatus::Applied => self.applied += 1,
            ChangesetStatus::PartiallyApplied => self.partially_applied += 1,
            ChangesetStatus::CompensationRequired => self.compensation_required += 1,
            ChangesetStatus::Rejected => self.rejected += 1,
            ChangesetStatus::Conflicted => self.conflicted += 1,
            ChangesetStatus::Superseded => self.superseded += 1,
            ChangesetStatus::Failed => self.failed += 1,
            ChangesetStatus::RollbackProposed => self.rollback_proposed += 1,
            ChangesetStatus::Cancelled => self.cancelled += 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovalQueueCounts {
    pub queued: usize,
    /// Reserved for the review-station ADR's claimed state. The V1 store has not
    /// implemented claim/release rows yet, so this remains zero until that durable
    /// state exists rather than being guessed from client session state.
    pub claimed: usize,
    pub decision_submitted: usize,
    pub closed: usize,
}

impl ApprovalQueueCounts {
    fn add(&mut self, state: ApprovalQueueState) {
        match state {
            ApprovalQueueState::Queued => self.queued += 1,
            ApprovalQueueState::DecisionSubmitted => self.decision_submitted += 1,
            ApprovalQueueState::Closed => self.closed += 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentActivityPageProjection {
    pub document_key: String,
    pub items: Vec<DocumentActivityItemProjection>,
    pub truncated: bool,
    pub cap: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentActivityItemProjection {
    pub document: DocumentActivityIdentityProjection,
    pub ledger_seq: i64,
    pub child_key: String,
    pub target_order: usize,
    pub operation: ChangesetOperationKind,
    pub proposal: ProposalProjection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentActivityIdentityProjection {
    pub key: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provisional_doc_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposed_stem: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposed_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_path: Option<String>,
}

struct LatestChangesetRow {
    seq: i64,
    record: ChangesetAggregateRecord,
}

/// The after-the-fact lane item: a changeset that was applied under recorded
/// system-actor mode authority. The row carries the normal proposal projection so
/// rollback availability and action eligibility remain backend-served.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppliedUnderPolicyProjection {
    pub proposal: ProposalProjection,
    pub policy_id: String,
    pub policy_version: String,
    pub mode: OperationMode,
    pub system_actor: ActorRef,
    pub applied_at_ms: i64,
    pub acknowledgement_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppliedUnderPolicyLaneProjection {
    pub items: Vec<AppliedUnderPolicyProjection>,
    pub truncated: bool,
    pub cap: usize,
}

/// One whole-document text served on the review DETAIL projection, size-bounded
/// with an HONEST `truncated` flag — NEVER an unbounded serve (resource-bounds /
/// api-contract bounded-document-content). `total_bytes` is the full document size,
/// `returned_bytes` the served (possibly truncated) length.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BoundedDocumentText {
    pub text: String,
    pub truncated: bool,
    pub total_bytes: usize,
    pub returned_bytes: usize,
}

impl BoundedDocumentText {
    /// Bound `text` at [`MAX_REVIEW_DOCUMENT_TEXT_BYTES`], truncating at a char
    /// boundary and flagging honestly when the cap is reached.
    fn from_text(text: &str) -> Self {
        let total_bytes = text.len();
        if total_bytes <= MAX_REVIEW_DOCUMENT_TEXT_BYTES {
            return Self {
                text: text.to_string(),
                truncated: false,
                total_bytes,
                returned_bytes: total_bytes,
            };
        }
        let bounded = truncate_at_char_boundary(text, MAX_REVIEW_DOCUMENT_TEXT_BYTES);
        Self {
            text: bounded.to_string(),
            truncated: true,
            total_bytes,
            returned_bytes: bounded.len(),
        }
    }
}

/// The base + proposed whole-document texts for ONE materialized replace-body
/// operation, served ONLY on the review DETAIL projection so the client renders the
/// diff over them. NO server-side diff is computed here: the backend's whole
/// obligation is the two bounded texts; hunking is client-rendered presentation (a
/// diff is a DERIVED review artifact, never authority — agentic-change-format).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDocumentProjection {
    pub child_key: String,
    pub document: DocumentRef,
    /// The CURRENT worktree document body (read the same way apply reads its base).
    pub base: BoundedDocumentText,
    /// The proposed new body (the materialized target snapshot payload).
    pub proposed: BoundedDocumentText,
}

/// The review DETAIL projection: the proposal projection plus the per-operation
/// base+proposed bounded texts the review diff renders over.
///
/// DETAIL-ONLY BY SHAPE (arch-reviewer ASA-P40-diff-ruling, three bounds): the
/// bounded proposal LIST (`GET /proposals`, up to [`MAX_PROJECTION_PROPOSALS`] rows)
/// must never carry document bodies, so the texts live on THIS distinct type rather
/// than as a permanently-empty body field on the list's [`ProposalProjection`] row.
/// Only [`ProjectionRepository::project_proposal_detail`] (the single-changeset
/// detail route) builds it; `list_proposals` never does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProposalDetailProjection {
    pub proposal: ProposalProjection,
    pub review_documents: Vec<ReviewDocumentProjection>,
}

pub struct ProjectionRepository<'repo, 'conn> {
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn projections<'repo>(&'repo self) -> ProjectionRepository<'repo, 'conn> {
        ProjectionRepository { uow: self }
    }
}

impl ProjectionRepository<'_, '_> {
    /// The bounded proposal-list projection over the whole authoring store. Reads
    /// the most-recently-active changesets up to [`MAX_PROJECTION_PROPOSALS`] and
    /// projects each. `worktree_root` is the vault worktree (the parent of
    /// `.vault`) the target-fence comparison reads current document revisions from.
    pub fn list_proposals(&self, worktree_root: &Path) -> Result<ProposalListProjection> {
        // Read one page + 1 so a full corpus reports truncation honestly.
        let probe = MAX_PROJECTION_PROPOSALS + 1;
        let changeset_ids = self
            .uow
            .repository("authoring_changeset_revisions")
            .query_collect(
                "SELECT changeset_id
             FROM authoring_changeset_revisions
             GROUP BY changeset_id
             ORDER BY MAX(seq) DESC
             LIMIT ?1",
                rusqlite::params![probe as i64],
                |row| row.get::<_, String>(0),
            )?;
        let truncated = changeset_ids.len() > MAX_PROJECTION_PROPOSALS;
        let mut items = Vec::with_capacity(changeset_ids.len().min(MAX_PROJECTION_PROPOSALS));
        for raw_id in changeset_ids.into_iter().take(MAX_PROJECTION_PROPOSALS) {
            let changeset_id =
                ChangesetId::new(&raw_id).map_err(|err| StoreError::Ledger(err.to_string()))?;
            if let Some(projection) = self.project_proposal(&changeset_id, worktree_root)? {
                items.push(projection);
            }
        }
        let applied_under_policy = self.applied_under_policy_lane(worktree_root)?;
        let counts = self.review_counts()?;
        Ok(ProposalListProjection {
            items,
            truncated,
            cap: MAX_PROJECTION_PROPOSALS,
            counts,
            applied_under_policy,
        })
    }

    /// Corpus-wide count projection over latest durable changeset and approval
    /// rows. This deliberately ignores the bounded proposal page and therefore
    /// remains correct when the visible list is truncated.
    pub fn review_counts(&self) -> Result<ReviewCountProjection> {
        let latest_changesets = self.latest_changeset_rows()?;
        let mut statuses = ChangesetStatusCounts::default();
        for row in &latest_changesets {
            statuses.add(row.record.status);
        }

        // The `claimed` count is the review-station four-state composition (W13.P24): an
        // undecided (`queued`) approval whose changeset holds an advisory claim counts as
        // `claimed`, not `queued`. The claim is a separate advisory overlay, so this reads
        // the held-claim set and reclassifies. `held` reflects durable assignment; a
        // held-but-past-TTL row is reconciled expire-on-read on its next touch (matching the
        // advisory-lease listing), so this corpus rollup needs no clock.
        let held_claims = self.uow.review_station().held_claim_changeset_ids()?;
        let latest_approvals = self.latest_approval_records()?;
        let mut queues = ApprovalQueueCounts::default();
        for approval in latest_approvals {
            if approval.queue_state == ApprovalQueueState::Queued
                && held_claims.contains(approval.changeset_id.as_str())
            {
                queues.claimed += 1;
            } else {
                queues.add(approval.queue_state);
            }
        }

        Ok(ReviewCountProjection {
            total_changesets: latest_changesets.len(),
            statuses,
            queues,
        })
    }

    /// Per-document activity over latest durable ledger records, scoped by a
    /// backend-issued document activity key. The key comes from
    /// [`DocumentActivityIdentityProjection::key`] and is based on stable ids
    /// (`scope` + `node_id`, provisional id, proposed node id, or result id) rather
    /// than mutable paths alone.
    pub fn document_activity(
        &self,
        document_key: &str,
        worktree_root: &Path,
    ) -> Result<DocumentActivityPageProjection> {
        self.document_activity_bounded(document_key, MAX_DOCUMENT_ACTIVITY_ITEMS, worktree_root)
    }

    fn document_activity_bounded(
        &self,
        document_key: &str,
        cap: usize,
        worktree_root: &Path,
    ) -> Result<DocumentActivityPageProjection> {
        let probe = cap.saturating_add(1);
        let mut items = Vec::with_capacity(cap.min(MAX_DOCUMENT_ACTIVITY_ITEMS));
        let exhausted = self.for_each_latest_changeset_row_until(
            MAX_DOCUMENT_ACTIVITY_SCAN_ROWS as i64,
            |row| {
                for child in &row.record.children {
                    if self.push_matching_document_activity_item(
                        &mut items,
                        document_key,
                        row.seq,
                        child,
                        &row.record.changeset_id,
                        worktree_root,
                    )? && items.len() >= probe
                    {
                        return Ok(false);
                    }
                }
                Ok(true)
            },
        )?;
        let truncated = items.len() > cap || !exhausted;
        items.truncate(cap);
        Ok(DocumentActivityPageProjection {
            document_key: document_key.to_string(),
            items,
            truncated,
            cap,
        })
    }

    fn push_matching_document_activity_item(
        &self,
        items: &mut Vec<DocumentActivityItemProjection>,
        document_key: &str,
        ledger_seq: i64,
        child: &ChangesetChildOperationRecord,
        changeset_id: &ChangesetId,
        worktree_root: &Path,
    ) -> Result<bool> {
        let mut matched = false;
        for identity in document_activity_identities(&child.target.document) {
            if identity.key != document_key {
                continue;
            }
            matched = true;
            if let Some(proposal) = self.project_proposal(changeset_id, worktree_root)? {
                items.push(DocumentActivityItemProjection {
                    document: identity,
                    ledger_seq,
                    child_key: child.child_key.clone(),
                    target_order: child.target_order,
                    operation: child.operation,
                    proposal,
                });
            }
        }
        Ok(matched)
    }

    /// Project one changeset by id, or `None` when it has no ledger history.
    pub fn project_proposal(
        &self,
        changeset_id: &ChangesetId,
        worktree_root: &Path,
    ) -> Result<Option<ProposalProjection>> {
        let Some(latest) = self.uow.ledger().latest(changeset_id)? else {
            return Ok(None);
        };
        let origin = self
            .uow
            .ledger()
            .origin(changeset_id)?
            .unwrap_or_else(|| latest.clone());
        let validation_record = self.uow.validations().latest_for_changeset(changeset_id)?;
        let approval = self.latest_approval_for_changeset(changeset_id)?;

        // The target-fence comparison (advisory A2.1): the FIRST child whose
        // reviewed base no longer matches the current worktree revision is the
        // surfaced conflict, and it forces `target_revisions_current = false`.
        let conflict = latest
            .children
            .iter()
            .find_map(|child| child_target_conflict(worktree_root, child));
        let targets_current = conflict.is_none();

        let validation = validation_state(validation_record.as_ref());
        let requeue_reason = self.uow.modes().policy_requeue_reason(changeset_id)?;
        let approval_state = approval_state(approval.as_ref(), requeue_reason);
        let scope_id = scope_id_for_worktree(worktree_root);
        let scope_mode = self.uow.modes().current_mode(&scope_id)?;
        let policy = policy_decision(&latest, scope_mode);
        let eligibility = self.eligibility_for(
            &latest,
            &origin,
            validation_record.as_ref(),
            approval.as_ref(),
            targets_current,
        );
        let rollback = self.rollback_availability(&latest)?;

        Ok(Some(ProposalProjection {
            changeset_id: latest.changeset_id.clone(),
            changeset_revision: latest.changeset_revision.clone(),
            kind: latest.kind,
            status: latest.status,
            summary: latest.summary.clone(),
            actor: latest.actor.clone(),
            origin_actor: origin.actor.clone(),
            operation_count: latest.operation_count,
            validation,
            approval: approval_state,
            policy,
            conflict,
            eligibility,
            rollback,
            created_at_ms: latest.created_at_ms,
            session_id: origin.session_id.clone(),
            run_id: origin.run_id.clone(),
            turn_id: origin.turn_id.clone(),
        }))
    }

    fn applied_under_policy_lane(
        &self,
        worktree_root: &Path,
    ) -> Result<AppliedUnderPolicyLaneProjection> {
        let probe = MAX_PROJECTION_PROPOSALS + 1;
        let scope_id = scope_id_for_worktree(worktree_root);
        let markers = self
            .uow
            .modes()
            .applied_under_policy_markers(&scope_id, probe)?;
        let truncated = markers.len() > MAX_PROJECTION_PROPOSALS;
        let mut items = Vec::with_capacity(markers.len().min(MAX_PROJECTION_PROPOSALS));
        for marker in markers.into_iter().take(MAX_PROJECTION_PROPOSALS) {
            if let Some(proposal) = self.project_proposal(&marker.changeset_id, worktree_root)? {
                items.push(self.applied_under_policy_item(marker, proposal)?);
            }
        }
        Ok(AppliedUnderPolicyLaneProjection {
            items,
            truncated,
            cap: MAX_PROJECTION_PROPOSALS,
        })
    }

    fn applied_under_policy_item(
        &self,
        marker: SystemPolicyApprovalRecord,
        proposal: ProposalProjection,
    ) -> Result<AppliedUnderPolicyProjection> {
        let acknowledgement_count = self
            .uow
            .modes()
            .acknowledgement_count(&marker.changeset_id)?;
        Ok(AppliedUnderPolicyProjection {
            applied_at_ms: proposal.created_at_ms,
            proposal,
            policy_id: marker.policy_id,
            policy_version: marker.policy_version,
            mode: marker.mode,
            system_actor: marker.system_actor,
            acknowledgement_count,
        })
    }

    /// Project one changeset AS A DETAIL VIEW: the proposal projection plus the
    /// base+proposed bounded document texts for each materialized replace-body
    /// operation, so the client renders the review diff. Returns `None` when the
    /// changeset has no ledger history.
    ///
    /// DETAIL-ONLY: `list_proposals` never calls this, so a page of proposals never
    /// carries document bodies (bound #1). The base text is the CURRENT worktree body
    /// (read the same way `child_target_conflict` / apply read it — the projection
    /// already has cheap worktree access); the proposed text is the materialized
    /// target snapshot payload. Both are size-bounded (bound #2); no diff is computed
    /// server-side (bound #3).
    pub fn project_proposal_detail(
        &self,
        changeset_id: &ChangesetId,
        worktree_root: &Path,
    ) -> Result<Option<ProposalDetailProjection>> {
        let Some(proposal) = self.project_proposal(changeset_id, worktree_root)? else {
            return Ok(None);
        };
        // The proposal exists, so latest is present; re-read it for the child
        // operations (a single bounded-row read).
        let Some(latest) = self.uow.ledger().latest(changeset_id)? else {
            return Ok(None);
        };
        let mut review_documents = Vec::new();
        for child in &latest.children {
            if let Some(document) = self.review_document(child)? {
                review_documents.push(document);
            }
        }
        Ok(Some(ProposalDetailProjection {
            proposal,
            review_documents,
        }))
    }

    /// The backend-served base-revision CONFLICT REPORT for one changeset (W13.P27), a
    /// pure read ADDITIVE to the existing cheap `conflict` field on the proposal
    /// projection: the full deterministic detector over the CURRENT worktree, the live
    /// sibling proposals (overlap), and the held advisory leases (policy collision). `None`
    /// when the changeset does not exist. `now_ms` gates lease activeness.
    pub fn conflict_report(
        &self,
        changeset_id: &ChangesetId,
        worktree_root: &Path,
        now_ms: i64,
    ) -> Result<Option<ConflictReport>> {
        let Some(subject) = self.uow.ledger().latest(changeset_id)? else {
            return Ok(None);
        };
        let live_siblings = self.uow.ledger().latest_changesets(MAX_CONFLICT_SIBLINGS)?;
        let held_leases = self.uow.leases().list_leases(MAX_CONFLICT_HELD_LEASES)?;
        Ok(Some(detect_conflicts(
            worktree_root,
            &subject,
            &live_siblings,
            &held_leases,
            now_ms,
        )))
    }

    /// The backend-served action eligibility for the changeset's CURRENT status.
    /// Each candidate command's eligibility is computed through the shared
    /// `transitions` helpers (never re-derived), with the freshness tuples built
    /// from the live validation record, approval record, and the target-fence
    /// comparison.
    fn eligibility_for(
        &self,
        latest: &ChangesetAggregateRecord,
        _origin: &ChangesetAggregateRecord,
        validation_record: Option<&ValidationStatusRecord>,
        approval: Option<&ApprovalRequestRecord>,
        targets_current: bool,
    ) -> Vec<ActionEligibility> {
        let current_digest = validation_record.map(|record| record.validation_digest.as_str());
        let reviewed_digest = approval.map(|record| record.reviewed.validation_digest.as_str());
        let validation = validation_freshness(validation_record, reviewed_digest);

        match latest.status {
            ChangesetStatus::Draft | ChangesetStatus::Proposed => {
                vec![submit_for_review_transition_eligibility(latest, validation)]
            }
            ChangesetStatus::NeedsReview => {
                let review =
                    review_decision_freshness(latest, approval, current_digest, targets_current);
                // The three-verdict review vocabulary (approval-gates ADR, activated
                // W13.P24): approve and reject are freshness-gated; request-changes rides
                // the shared `edit_proposal` predicate (feedback, deliberately legal on a
                // stale or unvalidated review) so the queue advertises exactly what the
                // decision path accepts (review-actions-are-backend-served).
                vec![
                    approve_transition_eligibility(latest, review, validation),
                    reject_transition_eligibility(latest, review, validation),
                    edit_proposal_transition_eligibility(latest),
                ]
            }
            ChangesetStatus::Approved => {
                let approval_freshness =
                    approval_freshness(latest, approval, current_digest, targets_current);
                vec![apply_transition_eligibility(
                    latest,
                    approval_freshness,
                    validation,
                )]
            }
            // Applied surfaces its action through the `rollback` field; every other
            // (terminal or transient) status exposes no standing lifecycle action.
            _ => Vec::new(),
        }
    }

    /// Rollback availability for an APPLIED changeset (V1 whole-document preimage
    /// restore). Reuses `create_rollback_eligibility` over the applied children,
    /// with preimage presence read from the durable preimage store.
    fn rollback_availability(
        &self,
        latest: &ChangesetAggregateRecord,
    ) -> Result<RollbackAvailabilityProjection> {
        if latest.status != ChangesetStatus::Applied {
            return Ok(RollbackAvailabilityProjection {
                available: false,
                reason: Some("changeset is not applied".to_string()),
                child_key: None,
            });
        }
        let mut children = Vec::with_capacity(latest.children.len());
        for child in &latest.children {
            let preimage_available =
                self.preimage_present(&latest.changeset_id, &child.child_key)?;
            children.push(RollbackChildEligibility::new(
                child.child_key.clone(),
                child.operation,
                preimage_available,
            ));
        }
        let eligibility = create_rollback_eligibility(latest, &children);
        Ok(if eligibility.allowed {
            RollbackAvailabilityProjection {
                available: true,
                reason: None,
                child_key: children.first().map(|child| child.child_key.clone()),
            }
        } else {
            RollbackAvailabilityProjection {
                available: false,
                reason: eligibility.reason,
                child_key: children.first().map(|child| child.child_key.clone()),
            }
        })
    }

    /// Build the base+proposed bounded texts for one materialized replace-body
    /// child. The proposed text is the materialized target snapshot payload; the
    /// base text is the durable preimage payload captured at materialization time,
    /// not the current worktree body. That keeps after-the-fact review evidence
    /// intact after an autonomous apply has already changed the file.
    fn review_document(
        &self,
        child: &ChangesetChildOperationRecord,
    ) -> Result<Option<ReviewDocumentProjection>> {
        let Some(materialized) = child.materialized_operation.as_ref() else {
            return Ok(None);
        };
        let preimage = self
            .uow
            .snapshots()
            .preimage(&materialized.preimage.preimage_id)?;
        let Some(preimage) = preimage else {
            return Ok(None);
        };
        Ok(Some(ReviewDocumentProjection {
            child_key: child.child_key.clone(),
            document: child.target.document.clone(),
            base: BoundedDocumentText::from_text(&preimage.payload_text),
            proposed: BoundedDocumentText::from_text(&materialized.target_snapshot.payload_text),
        }))
    }

    /// The latest approval request for a changeset (by insert sequence), read by
    /// `changeset_id` directly — the approval store is keyed by `proposal_id`, and
    /// the projection enumerates changesets, so it reads the durable row directly
    /// rather than requiring a proposal id it does not hold.
    fn latest_approval_for_changeset(
        &self,
        changeset_id: &ChangesetId,
    ) -> Result<Option<ApprovalRequestRecord>> {
        let record = self
            .uow
            .repository("authoring_approval_requests")
            .query_optional(
                "SELECT record_json
             FROM authoring_approval_requests
             WHERE changeset_id = ?1
             ORDER BY seq DESC
             LIMIT 1",
                [changeset_id.as_str()],
                |row| row.get::<_, String>(0),
            )?;
        match record {
            Some(json) => {
                let record: ApprovalRequestRecord = serde_json::from_str(&json)
                    .map_err(|err| StoreError::Approval(err.to_string()))?;
                Ok(Some(record))
            }
            None => Ok(None),
        }
    }

    fn latest_changeset_rows(&self) -> Result<Vec<LatestChangesetRow>> {
        let mut latest = Vec::new();
        self.for_each_latest_changeset_row_until(i64::MAX, |row| {
            latest.push(row);
            Ok(true)
        })?;
        Ok(latest)
    }

    fn for_each_latest_changeset_row_until(
        &self,
        max_rows: i64,
        mut visit: impl FnMut(LatestChangesetRow) -> Result<bool>,
    ) -> Result<bool> {
        let mut visited = 0_i64;
        let mut exhausted = true;
        self.uow
            .repository("authoring_changeset_revisions")
            .query_for_each(
                "SELECT seq, changeset_id
                 FROM authoring_changeset_revisions
                 WHERE seq IN (
                     SELECT MAX(seq)
                     FROM authoring_changeset_revisions
                     GROUP BY changeset_id
                 )
                 ORDER BY seq DESC, changeset_id DESC
                 LIMIT ?1",
                [max_rows],
                |row| {
                    visited += 1;
                    let seq = row.get::<_, i64>(0)?;
                    let raw_changeset_id = row.get::<_, String>(1)?;
                    let changeset_id = ChangesetId::new(&raw_changeset_id)
                        .map_err(|err| StoreError::Ledger(err.to_string()))?;
                    let record = self.uow.ledger().latest(&changeset_id)?.ok_or_else(|| {
                        StoreError::Ledger(format!(
                            "latest changeset row `{raw_changeset_id}` has no ledger record"
                        ))
                    })?;
                    let keep_going = visit(LatestChangesetRow { seq, record })
                        .map_err(|err| StoreError::Ledger(err.to_string()))?;
                    if !keep_going {
                        exhausted = false;
                    }
                    Ok(keep_going)
                },
            )?;
        if visited == max_rows {
            let next_exists = self
                .uow
                .repository("authoring_changeset_revisions")
                .query_optional(
                    "SELECT 1
                     FROM authoring_changeset_revisions
                     WHERE seq IN (
                         SELECT MAX(seq)
                         FROM authoring_changeset_revisions
                         GROUP BY changeset_id
                     )
                     ORDER BY seq DESC, changeset_id DESC
                     LIMIT 1 OFFSET ?1",
                    [max_rows],
                    |row| row.get::<_, i64>(0),
                )?
                .is_some();
            exhausted = !next_exists;
        }
        Ok(exhausted)
    }

    fn latest_approval_records(&self) -> Result<Vec<ApprovalRequestRecord>> {
        let rows = self
            .uow
            .repository("authoring_approval_requests")
            .query_collect(
                "SELECT record_json
                 FROM authoring_approval_requests
                 WHERE seq IN (
                     SELECT MAX(seq)
                     FROM authoring_approval_requests
                     GROUP BY changeset_id
                 )
                 ORDER BY seq DESC, changeset_id DESC",
                [],
                |row| row.get::<_, String>(0),
            )?;
        rows.into_iter()
            .map(|json| {
                let record: ApprovalRequestRecord = serde_json::from_str(&json)
                    .map_err(|err| StoreError::Approval(err.to_string()))?;
                Ok(record)
            })
            .collect()
    }

    /// Whether a rollback preimage exists for a changeset child (operation id ==
    /// child key). A bounded existence read (`LIMIT 1`).
    fn preimage_present(&self, changeset_id: &ChangesetId, child_key: &str) -> Result<bool> {
        let found = self
            .uow
            .repository("authoring_document_preimages")
            .query_optional(
                "SELECT 1
             FROM authoring_document_preimages
             WHERE changeset_id = ?1
               AND operation_id = ?2
             LIMIT 1",
                rusqlite::params![changeset_id.as_str(), child_key],
                |row| row.get::<_, i64>(0),
            )?;
        Ok(found.is_some())
    }
}

fn document_activity_identities(document: &DocumentRef) -> Vec<DocumentActivityIdentityProjection> {
    let mut identities = vec![primary_document_activity_identity(document)];
    match document {
        DocumentRef::RenameTarget {
            source,
            proposed_stem,
            proposed_node_id,
        } => {
            identities.extend(document_activity_identities(source));
            identities.push(DocumentActivityIdentityProjection {
                key: format!("rename_target:{proposed_node_id}"),
                kind: "rename_target".to_string(),
                scope: None,
                node_id: None,
                stem: None,
                path: None,
                doc_type: document_doc_type(source),
                provisional_doc_id: None,
                feature: None,
                title: None,
                proposed_stem: Some(proposed_stem.clone()),
                proposed_node_id: Some(proposed_node_id.clone()),
                result_node_id: None,
                result_path: None,
            });
        }
        DocumentRef::MaterializedResult {
            reviewed,
            result_node_id,
            result_path,
            ..
        } => {
            identities.extend(document_activity_identities(reviewed));
            identities.push(DocumentActivityIdentityProjection {
                key: format!("materialized:{result_node_id}"),
                kind: "materialized_result".to_string(),
                scope: None,
                node_id: None,
                stem: None,
                path: Some(result_path.clone()),
                doc_type: document_doc_type(reviewed),
                provisional_doc_id: None,
                feature: None,
                title: None,
                proposed_stem: None,
                proposed_node_id: None,
                result_node_id: Some(result_node_id.clone()),
                result_path: Some(result_path.clone()),
            });
        }
        DocumentRef::Existing { .. } | DocumentRef::ProvisionalCreate { .. } => {}
    }
    identities.sort_by(|left, right| left.key.cmp(&right.key));
    identities.dedup_by(|left, right| left.key == right.key);
    identities
}

fn primary_document_activity_identity(
    document: &DocumentRef,
) -> DocumentActivityIdentityProjection {
    match document {
        DocumentRef::Existing {
            scope,
            node_id,
            stem,
            path,
            doc_type,
            ..
        } => DocumentActivityIdentityProjection {
            key: format!("existing:{scope}:{node_id}"),
            kind: "existing".to_string(),
            scope: Some(scope.clone()),
            node_id: Some(node_id.clone()),
            stem: Some(stem.clone()),
            path: Some(path.clone()),
            doc_type: Some(doc_type.clone()),
            provisional_doc_id: None,
            feature: None,
            title: None,
            proposed_stem: None,
            proposed_node_id: None,
            result_node_id: None,
            result_path: None,
        },
        DocumentRef::ProvisionalCreate {
            provisional_doc_id,
            doc_type,
            feature,
            title,
            proposed_stem,
            ..
        } => DocumentActivityIdentityProjection {
            key: format!("provisional:{provisional_doc_id}"),
            kind: "provisional_create".to_string(),
            scope: None,
            node_id: None,
            stem: None,
            path: None,
            doc_type: Some(doc_type.clone()),
            provisional_doc_id: Some(provisional_doc_id.clone()),
            feature: Some(feature.clone()),
            title: Some(title.clone()),
            proposed_stem: proposed_stem.clone(),
            proposed_node_id: None,
            result_node_id: None,
            result_path: None,
        },
        DocumentRef::RenameTarget { source, .. } => primary_document_activity_identity(source),
        DocumentRef::MaterializedResult { reviewed, .. } => {
            primary_document_activity_identity(reviewed)
        }
    }
}

fn document_doc_type(document: &DocumentRef) -> Option<String> {
    match document {
        DocumentRef::Existing { doc_type, .. }
        | DocumentRef::ProvisionalCreate { doc_type, .. } => Some(doc_type.clone()),
        DocumentRef::RenameTarget { source, .. }
        | DocumentRef::MaterializedResult {
            reviewed: source, ..
        } => document_doc_type(source),
    }
}

/// Compare a child's reviewed base revision to the current worktree revision. Only
/// an EXISTING target with a recorded base is checked; a provisional-create (no
/// base) has nothing to fence against. An unreadable current document is itself a
/// conflict (the base cannot be confirmed current), conservatively surfaced rather
/// than silently treated as fresh.
fn child_target_conflict(
    worktree_root: &Path,
    child: &ChangesetChildOperationRecord,
) -> Option<ConflictProjection> {
    if !matches!(child.target.document, DocumentRef::Existing { .. }) {
        return None;
    }
    let base = child.target.base_revision.as_ref()?;
    match SnapshotReader::for_worktree(worktree_root).capture_existing(&child.target.document) {
        Ok(snapshot) if &snapshot.revision == base => None,
        Ok(snapshot) => Some(ConflictProjection {
            child_key: child.child_key.clone(),
            reason: "target document changed since review (reviewed base revision is no longer \
                     the current worktree revision)"
                .to_string(),
            reviewed_base_revision: Some(base.clone()),
            current_revision: Some(snapshot.revision),
        }),
        Err(_) => Some(ConflictProjection {
            child_key: child.child_key.clone(),
            reason: "cannot confirm the current target document revision".to_string(),
            reviewed_base_revision: Some(base.clone()),
            current_revision: None,
        }),
    }
}

/// Truncate `value` to at most `max_bytes`, snapping DOWN to the nearest UTF-8 char
/// boundary so the returned slice is always valid UTF-8.
fn truncate_at_char_boundary(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut boundary = 0;
    for (index, _) in value.char_indices() {
        if index > max_bytes {
            break;
        }
        boundary = index;
    }
    &value[..boundary]
}

fn validation_state(record: Option<&ValidationStatusRecord>) -> ValidationStateProjection {
    match record {
        Some(record) => ValidationStateProjection {
            present: true,
            status: Some(record.status),
            approval_ready: record.approval_ready,
            validation_digest: Some(record.validation_digest.clone()),
        },
        None => ValidationStateProjection {
            present: false,
            status: None,
            approval_ready: false,
            validation_digest: None,
        },
    }
}

fn approval_state(
    record: Option<&ApprovalRequestRecord>,
    requeue_reason: Option<String>,
) -> ApprovalStateProjection {
    match record {
        Some(record) => ApprovalStateProjection {
            present: true,
            queue_state: Some(record.queue_state),
            decision: record.decision.as_ref().map(|decision| decision.decision),
            stale: record.stale,
            stale_reason: record.stale_reason.clone().or(requeue_reason),
            approval_id: Some(record.approval_id.clone()),
            proposal_id: Some(record.proposal_id.clone()),
            reviewed_proposal_revision: Some(record.reviewed.proposal_revision.clone()),
        },
        None => ApprovalStateProjection {
            present: false,
            queue_state: None,
            decision: None,
            stale: false,
            stale_reason: None,
            approval_id: None,
            proposal_id: None,
            reviewed_proposal_revision: None,
        },
    }
}

fn policy_decision(
    latest: &ChangesetAggregateRecord,
    scope_mode: OperationMode,
) -> PolicyDecisionProjection {
    let operations = latest
        .children
        .iter()
        .map(|child| child.operation)
        .collect::<Vec<_>>();
    decide_changeset_approval(scope_mode, None, latest.kind, &operations)
}

/// Build the validation freshness tuple. `digest_matches_reviewed` is true when no
/// reviewed digest exists yet (the submit-for-review path, before any approval),
/// and otherwise requires the current record digest to equal the reviewed one.
fn validation_freshness(
    record: Option<&ValidationStatusRecord>,
    reviewed_digest: Option<&str>,
) -> ValidationFreshness {
    let current_digest = record.map(|record| record.validation_digest.as_str());
    ValidationFreshness {
        record_present: record.is_some(),
        approval_ready: record.is_some_and(|record| record.status.approval_ready()),
        digest_matches_reviewed: match (current_digest, reviewed_digest) {
            (Some(current), Some(reviewed)) => current == reviewed,
            // No reviewed digest yet (pre-approval submit): the record vouches for
            // itself.
            (Some(_), None) => true,
            _ => false,
        },
    }
}

/// Build the review-decision freshness tuple for a NeedsReview changeset. The
/// `target_revisions_current` field is the advisory-A2.1 fix: it combines the
/// stored approval staleness with the live target-fence comparison.
fn review_decision_freshness(
    latest: &ChangesetAggregateRecord,
    approval: Option<&ApprovalRequestRecord>,
    current_validation_digest: Option<&str>,
    targets_current: bool,
) -> ReviewDecisionFreshness {
    ReviewDecisionFreshness {
        review_request_present: approval.is_some(),
        proposal_revision_current: approval
            .is_some_and(|record| record.reviewed.proposal_revision == latest.changeset_revision),
        target_revisions_current: targets_current && approval.is_some_and(|record| !record.stale),
        validation_digest_current: digest_current(approval, current_validation_digest),
        policy_version_current: approval
            .is_some_and(|record| record.reviewed.policy_version == V1_POLICY_VERSION),
        run_cancelled: false,
    }
}

/// Build the approval freshness tuple for an Approved changeset awaiting apply.
/// Mirrors [`review_decision_freshness`] with the advisory-A2.1 target fence.
fn approval_freshness(
    latest: &ChangesetAggregateRecord,
    approval: Option<&ApprovalRequestRecord>,
    current_validation_digest: Option<&str>,
    targets_current: bool,
) -> ApprovalFreshness {
    ApprovalFreshness {
        record_present: approval.is_some(),
        proposal_revision_current: approval
            .is_some_and(|record| record.reviewed.proposal_revision == latest.changeset_revision),
        target_revisions_current: targets_current && approval.is_some_and(|record| !record.stale),
        validation_digest_current: digest_current(approval, current_validation_digest),
        policy_version_current: approval
            .is_some_and(|record| record.reviewed.policy_version == V1_POLICY_VERSION),
        run_cancelled: false,
    }
}

/// Whether the reviewed validation digest still matches the current record digest.
///
/// ABSENCE IS NOT STALENESS: with an approval present but NO current validation
/// record (`current_validation_digest == None`), the actionable, user-facing reason
/// is the MISSING record — surfaced by the downstream validation-record blocker —
/// NOT a "stale digest". So an absent current digest reports as CURRENT here, and
/// the record-present check carries the real reason. The allow/deny OUTCOME is
/// unchanged (a missing record still blocks); only the served reason is corrected.
/// A PRESENT-but-different digest is genuine staleness and still returns false.
///
/// INVARIANT (arch-reviewer S89): the true-on-absence arm below is correct ONLY
/// because `ValidationFreshness::blocker` checks `record_present` BEFORE the digest
/// check (transitions.rs `blocker`). If those blocker checks are ever reordered so
/// the digest check runs first, the actionable "validation record required" reason
/// would no longer surface and the wrong "stale digest" reason would resurface here.
fn digest_current(
    approval: Option<&ApprovalRequestRecord>,
    current_validation_digest: Option<&str>,
) -> bool {
    match (approval, current_validation_digest) {
        (Some(record), Some(current)) => record.reviewed.validation_digest == current,
        // Absent current digest → report CURRENT so the downstream record-present
        // blocker owns the reason (see the INVARIANT above).
        (Some(_), None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests;
