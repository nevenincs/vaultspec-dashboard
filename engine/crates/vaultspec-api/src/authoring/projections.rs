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
//! V1 SKELETON SUBSET (agentic plan W03.P18): the proposal list, action
//! eligibility, conflict reason, validation status, and rollback availability the
//! walking-skeleton review station needs. Corpus-wide review COUNTS and
//! per-document ACTIVITY rollups are the Increment 3 remainder (W11.P50) and are
//! deliberately NOT computed here — a count over a bounded page would be a lie
//! (wire-contract: counts are computed over the full pre-truncation set), so the
//! honest skeleton serves the bounded list and defers the rollups.
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
#![allow(dead_code)]

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::approvals::{
    ApprovalDecision, ApprovalQueueState, ApprovalRequestRecord, V1_POLICY_VERSION,
};
use super::ledger::{ChangesetAggregateRecord, ChangesetChildOperationRecord};
use super::model::{
    ActionEligibility, ActorRef, ChangesetId, ChangesetKind, ChangesetStatus, DocumentRef,
    RevisionToken,
};
use super::snapshots::SnapshotReader;
use super::store::StoreError;
use super::store::unit_of_work::{Repository, UnitOfWork};
use super::transitions::{
    ApprovalFreshness, ReviewDecisionFreshness, RollbackChildEligibility, ValidationFreshness,
    apply_transition_eligibility, approve_transition_eligibility, create_rollback_eligibility,
    reject_transition_eligibility, submit_for_review_transition_eligibility,
};
use super::validation::{ValidationStatus, ValidationStatusRecord};

/// The bounded ceiling for one proposal-list projection page (resource-bounds:
/// every retained list carries a size cap at creation). A skeleton review station
/// shows a bounded working set; the corpus-wide paged listing is the Increment 3
/// remainder. A page at the cap sets `truncated`, never a silently-clipped read.
pub const MAX_PROJECTION_PROPOSALS: usize = 200;

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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovalStateProjection {
    pub present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_state: Option<ApprovalQueueState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<ApprovalDecision>,
    pub stale: bool,
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
/// conflict, action eligibility, and rollback availability.
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<ConflictProjection>,
    /// The backend-served action eligibility for the current status: each entry is
    /// an `ActionEligibility` (allowed + reason) the UI renders directly, never
    /// re-derives.
    pub eligibility: Vec<ActionEligibility>,
    pub rollback: RollbackAvailabilityProjection,
    pub created_at_ms: i64,
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
        Ok(ProposalListProjection {
            items,
            truncated,
            cap: MAX_PROJECTION_PROPOSALS,
        })
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
        let approval_state = approval_state(approval.as_ref());
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
            conflict,
            eligibility,
            rollback,
            created_at_ms: latest.created_at_ms,
        }))
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
                vec![
                    approve_transition_eligibility(latest, review, validation),
                    reject_transition_eligibility(latest, review, validation),
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

fn approval_state(record: Option<&ApprovalRequestRecord>) -> ApprovalStateProjection {
    match record {
        Some(record) => ApprovalStateProjection {
            present: true,
            queue_state: Some(record.queue_state),
            decision: record.decision.as_ref().map(|decision| decision.decision),
            stale: record.stale,
        },
        None => ApprovalStateProjection {
            present: false,
            queue_state: None,
            decision: None,
            stale: false,
        },
    }
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
mod tests {
    use std::path::Path;

    use ingest_struct::reader::read_from_worktree;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::api::{ChangesetOperationKind, TargetRevisionFence};
    use crate::authoring::approvals::{ApprovalRequestInput, ReviewedTuple};
    use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
    use crate::authoring::model::{
        ActorId, ActorKind, ApprovalId, ChangesetKind, CommandKind, ProposalId, SessionId,
    };
    use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    /// Write a `.vault/plan/<stem>.md` doc and return its current worktree revision
    /// (the real blob token), so a child's reviewed base can be pinned to reality
    /// (a fake `blob:xyz` would flag every changeset as conflicted).
    fn write_doc(root: &Path, stem: &str, body: &str) -> RevisionToken {
        let rel = format!(".vault/plan/{stem}.md");
        let path = root.join(&rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        let body = read_from_worktree(root, &rel).unwrap();
        RevisionToken::new(format!("blob:{}", body.blob_hash)).unwrap()
    }

    fn existing_doc(stem: &str, base: &RevisionToken) -> DocumentRef {
        DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{stem}"),
            stem: stem.to_string(),
            path: format!(".vault/plan/{stem}.md"),
            doc_type: "plan".to_string(),
            base_revision: base.clone(),
        }
    }

    fn child(child_key: &str, document: DocumentRef) -> ChangesetChildOperationInput {
        let base = match &document {
            DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
            _ => None,
        };
        ChangesetChildOperationInput {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: base.clone(),
                current_revision: base,
            },
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    fn record(
        changeset_id: &ChangesetId,
        previous: Option<RevisionToken>,
        status: ChangesetStatus,
        actor: &ActorRef,
        children: Vec<ChangesetChildOperationInput>,
        created_at_ms: i64,
    ) -> ChangesetAggregateRecord {
        ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: changeset_id.clone(),
            previous_revision: previous,
            kind: ChangesetKind::Authoring,
            status,
            session_id: Some(SessionId::new("session_1").unwrap()),
            actor: actor.clone(),
            summary: "projection proposal".to_string(),
            children,
            created_at_ms,
        })
        .unwrap()
    }

    fn temp_store(root: &Path) -> Store {
        let mut store = Store::open(&root.join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
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
        store
    }

    /// Append Draft then NeedsReview for `changeset_id`, returning the NeedsReview
    /// revision (the reviewable proposal revision).
    fn seed_needs_review(
        store: &mut Store,
        changeset_id: &ChangesetId,
        author: &ActorRef,
        children: impl Fn() -> Vec<ChangesetChildOperationInput>,
    ) -> RevisionToken {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft = record(
                    changeset_id,
                    None,
                    ChangesetStatus::Draft,
                    author,
                    children(),
                    10,
                );
                uow.ledger().append_revision(&draft)?;
                let needs_review = record(
                    changeset_id,
                    Some(draft.changeset_revision.clone()),
                    ChangesetStatus::NeedsReview,
                    author,
                    children(),
                    20,
                );
                uow.ledger().append_revision(&needs_review)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap()
    }

    fn request_approval(
        store: &mut Store,
        changeset_id: &ChangesetId,
        reviewed_revision: &RevisionToken,
    ) {
        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                uow.approvals()
                    .request_approval(ApprovalRequestInput {
                        approval_id: ApprovalId::new("approval_1").unwrap(),
                        proposal_id: ProposalId::new("proposal_1").unwrap(),
                        changeset_id: changeset_id.clone(),
                        reviewed: ReviewedTuple {
                            proposal_revision: reviewed_revision.clone(),
                            validation_digest: "validation:v1".to_string(),
                            policy_version: V1_POLICY_VERSION.to_string(),
                        },
                        idempotency_key: "idem:request:1".to_string(),
                        created_at_ms: 30,
                    })
                    .map_err(|err| StoreError::Approval(err.to_string()))?;
                Ok(())
            })
            .unwrap();
    }

    fn project(store: &mut Store, root: &Path, changeset_id: &ChangesetId) -> ProposalProjection {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.projections().project_proposal(changeset_id, root))
            })
            .unwrap()
            .unwrap()
            .unwrap()
    }

    #[test]
    fn needs_review_proposal_serves_approve_reject_eligibility() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "body\n");
        let mut store = temp_store(root);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let children = move || vec![child("child_1", existing_doc("projection-a", &base))];
        let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
        request_approval(&mut store, &changeset_id, &revision);

        let projection = project(&mut store, root, &changeset_id);

        assert_eq!(projection.status, ChangesetStatus::NeedsReview);
        assert_eq!(projection.origin_actor, author);
        assert!(projection.conflict.is_none(), "base matches the worktree");
        assert!(projection.approval.present);
        assert!(!projection.approval.stale);
        // Both review decisions are served, backend-owned. With no validation
        // record seeded, the served reason is the MISSING validation record
        // (absence is NOT staleness — a NeedsReview proposal that was never
        // validated is "not yet validated", not "stale digest"), and it is NOT a
        // target conflict (proving the live target-fence comparison passed on a
        // fresh worktree base). The eligibility reasons are backend-served.
        assert_eq!(projection.eligibility.len(), 2);
        assert!(
            projection.eligibility.iter().all(|entry| !entry.allowed
                && entry.reason.as_deref().is_some_and(|reason| {
                    reason.contains("validation record")
                        && !reason.contains("target revisions")
                        && !reason.contains("stale")
                })),
            "review decisions are served; the reason is the MISSING validation record, \
             not a stale digest or a target conflict: {:?}",
            projection.eligibility
        );
        assert!(!projection.rollback.available);
    }

    #[test]
    fn out_of_band_edit_surfaces_conflict_and_denies_review_targets() {
        // The advisory-A2.1 scenario: an UN-LEDGERED worktree edit moves the target
        // base after review. The stored approval is NOT stale, but the projection's
        // live target-fence comparison catches it — a conflict, and the review
        // eligibility is denied for stale target revisions.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "body\n");
        let mut store = temp_store(root);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let children = move || vec![child("child_1", existing_doc("projection-a", &base))];
        let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
        request_approval(&mut store, &changeset_id, &revision);

        // Human direct-saves the document out of band — the ledger/approval never
        // learns of it.
        write_doc(root, "projection-a", "changed out of band\n");

        let projection = project(&mut store, root, &changeset_id);

        let conflict = projection
            .conflict
            .expect("target-fence conflict is surfaced");
        assert_eq!(conflict.child_key, "child_1");
        assert!(conflict.reason.contains("changed since review"));
        assert!(
            projection.eligibility.iter().any(|entry| !entry.allowed
                && entry
                    .reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("target revisions"))),
            "review eligibility is denied for stale target revisions: {:?}",
            projection.eligibility
        );
    }

    #[test]
    fn projection_rebuilds_identically_after_restart() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "body\n");
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let children = move || vec![child("child_1", existing_doc("projection-a", &base))];

        let before = {
            let mut store = temp_store(root);
            let revision = seed_needs_review(&mut store, &changeset_id, &author, children);
            request_approval(&mut store, &changeset_id, &revision);
            project(&mut store, root, &changeset_id)
        };

        // Reopen the store from disk: a projection holds no state, so it rebuilds
        // byte-identically from durable rows.
        let mut reopened = Store::open(&root.join(".vault")).unwrap();
        let after = project(&mut reopened, root, &changeset_id);

        assert_eq!(before, after);
    }

    #[test]
    fn draft_proposal_serves_submit_eligibility_gated_on_validation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "body\n");
        let mut store = temp_store(root);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft = record(
                    &changeset_id,
                    None,
                    ChangesetStatus::Draft,
                    &author,
                    vec![child("child_1", existing_doc("projection-a", &base))],
                    10,
                );
                uow.ledger().append_revision(&draft)?;
                Ok(())
            })
            .unwrap();

        let projection = project(&mut store, root, &changeset_id);

        assert_eq!(projection.status, ChangesetStatus::Draft);
        assert!(!projection.validation.present, "no validation record yet");
        assert_eq!(projection.eligibility.len(), 1);
        let submit = &projection.eligibility[0];
        assert!(
            !submit.allowed
                && submit
                    .reason
                    .as_deref()
                    .is_some_and(|reason| reason.contains("validation record")),
            "submit is denied without a validation record: {submit:?}"
        );
    }

    #[test]
    fn applied_changeset_with_preimage_is_rollback_available() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "applied body\n");
        let mut store = temp_store(root);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("projection-a", &base);
        let children = {
            let doc = doc.clone();
            move || vec![child("child_1", doc.clone())]
        };

        // Walk the single-child apply lifecycle to Applied, then capture a preimage.
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft = record(
                    &changeset_id,
                    None,
                    ChangesetStatus::Draft,
                    &author,
                    children(),
                    10,
                );
                uow.ledger().append_revision(&draft)?;
                let needs_review = record(
                    &changeset_id,
                    Some(draft.changeset_revision.clone()),
                    ChangesetStatus::NeedsReview,
                    &author,
                    children(),
                    20,
                );
                uow.ledger().append_revision(&needs_review)?;
                let approved = record(
                    &changeset_id,
                    Some(needs_review.changeset_revision.clone()),
                    ChangesetStatus::Approved,
                    &reviewer,
                    children(),
                    30,
                );
                uow.ledger().append_revision(&approved)?;
                let applying = record(
                    &changeset_id,
                    Some(approved.changeset_revision.clone()),
                    ChangesetStatus::Applying,
                    &reviewer,
                    children(),
                    40,
                );
                uow.ledger().append_revision(&applying)?;
                let applied = record(
                    &changeset_id,
                    Some(applying.changeset_revision.clone()),
                    ChangesetStatus::Applied,
                    &reviewer,
                    children(),
                    50,
                );
                uow.ledger().append_revision(&applied)?;

                // Capture the rollback preimage for the applied child.
                let preimage = SnapshotReader::for_worktree(root)
                    .capture_preimage(PreimageCaptureRequest {
                        preimage_id: "preimage_1".to_string(),
                        changeset_id: changeset_id.as_str().to_string(),
                        operation_id: "child_1".to_string(),
                        document: doc.clone(),
                        captured_at_ms: 60,
                    })
                    .unwrap();
                uow.snapshots().store_preimage(&preimage)?;
                Ok(())
            })
            .unwrap();

        let projection = project(&mut store, root, &changeset_id);

        assert_eq!(projection.status, ChangesetStatus::Applied);
        assert!(
            projection.rollback.available,
            "applied changeset with a preimage is rollback-available: {:?}",
            projection.rollback
        );
        assert_eq!(projection.rollback.child_key.as_deref(), Some("child_1"));
        assert!(
            projection.eligibility.is_empty(),
            "an applied changeset exposes no standing lifecycle action"
        );
    }

    #[test]
    fn applied_changeset_without_preimage_is_rollback_unavailable() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "applied body\n");
        let mut store = temp_store(root);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let children = {
            let base = base.clone();
            move || vec![child("child_1", existing_doc("projection-a", &base))]
        };
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let mut previous: Option<RevisionToken> = None;
                for (status, at) in [
                    (ChangesetStatus::Draft, 10),
                    (ChangesetStatus::NeedsReview, 20),
                    (ChangesetStatus::Approved, 30),
                    (ChangesetStatus::Applying, 40),
                    (ChangesetStatus::Applied, 50),
                ] {
                    let author = if matches!(
                        status,
                        ChangesetStatus::Approved
                            | ChangesetStatus::Applying
                            | ChangesetStatus::Applied
                    ) {
                        &reviewer
                    } else {
                        &author
                    };
                    let revision = record(
                        &changeset_id,
                        previous.clone(),
                        status,
                        author,
                        children(),
                        at,
                    );
                    uow.ledger().append_revision(&revision)?;
                    previous = Some(revision.changeset_revision.clone());
                }
                Ok(())
            })
            .unwrap();

        let projection = project(&mut store, root, &changeset_id);

        assert!(!projection.rollback.available);
        assert!(
            projection
                .rollback
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("preimage")),
            "the unavailable reason names the missing preimage: {:?}",
            projection.rollback
        );
    }

    #[test]
    fn list_projection_is_bounded_and_reports_truncation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = write_doc(root, "projection-a", "body\n");
        let mut store = temp_store(root);
        let author = actor("agent:author", ActorKind::Agent);

        // Seed MAX + 5 distinct changesets (one Draft revision each).
        let total = MAX_PROJECTION_PROPOSALS + 5;
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for index in 0..total {
                    let changeset_id = ChangesetId::new(format!("changeset_{index}")).unwrap();
                    let draft = record(
                        &changeset_id,
                        None,
                        ChangesetStatus::Draft,
                        &author,
                        vec![child("child_1", existing_doc("projection-a", &base))],
                        index as i64,
                    );
                    uow.ledger().append_revision(&draft)?;
                }
                Ok(())
            })
            .unwrap();

        let page = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.projections().list_proposals(root))
            })
            .unwrap()
            .unwrap();

        assert_eq!(page.cap, MAX_PROJECTION_PROPOSALS);
        assert_eq!(
            page.items.len(),
            MAX_PROJECTION_PROPOSALS,
            "the page is bounded at the cap"
        );
        assert!(page.truncated, "a corpus over the cap reports truncation");
    }
}
