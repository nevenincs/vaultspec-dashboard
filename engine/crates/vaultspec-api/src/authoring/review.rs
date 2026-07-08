//! Review-station queues and provenance audit (W13.P24).
//!
//! The review-station-state ADR names a backend-served projection over proposals,
//! approval requests, assignments, and policy: the queue of work waiting for humans,
//! which item is claimed, what is waiting on an agent, and which actions are allowed. The
//! V1 queue item state is FOUR (ASA-003): `queued`, `claimed`, `decision_submitted`,
//! `closed`. This module lands the two capabilities W11.P50's count/list projections
//! deferred:
//!
//! 1. CLAIM OVERLAY. A claim is an ADVISORY assignment (review-claims-are-not-authority):
//!    it coordinates reviewers but NEVER bypasses policy, freshness, validation, or apply
//!    checks. It is stored as a SEPARATE one-row-per-changeset advisory record (mirroring
//!    the advisory lease + tool-permission claim patterns), NOT as a new `ApprovalQueue
//!    State` — so the served four-state item is a projection COMPOSITION of the approval
//!    decision-lifecycle (`queued`/`decision_submitted`/`closed`) and the live claim
//!    overlay (`claimed`). Wider-vocabulary facts the ADR reserves — staleness, conflict,
//!    an in-flight clarification — stay as projection FIELDS, never states. Like the
//!    advisory lease, a claim is TTL-bounded and reclaimed expire-on-read: a crashed
//!    reviewer never strands an item.
//!
//! 2. PROVENANCE AUDIT. A bounded, REDACTED read projection over the existing append-only
//!    trail — the ledger revision chain (who took the changeset to each status, when),
//!    the approval decision (the reviewer + decision + comment), and the structured
//!    lineage. It reads NO new durable table: the ledger + approvals + preimage fingerprints
//!    ARE the trail, so this is a pure read (projections hold no state). REDACTION is
//!    load-bearing (security-provenance ADR): the trail serves ids, hashes, revisions, and
//!    actors, NEVER raw prompts, traces, preimage bodies, or tool outputs. The rebase/
//!    supersession lineage W13.P28 records minimally in free-text summaries is FORMALIZED
//!    here into structured served fields (`replaces` / `superseded_by` / `rebased_from`),
//!    parsed FAIL-SAFE — a summary that does not match the well-defined token format
//!    yields an ABSENT field, never a crash or a wrong link. (A durable structured lineage
//!    column is a future hardening if the prose-parse proves brittle.)
//!
//! DENIALS ARE VALUES: an expected refusal — claiming an item another reviewer holds, a
//! non-holder release, an automated proposer trying to review its own work — rides the
//! success envelope as an [`ActionEligibility`]; only store faults are `Err`.
#![allow(dead_code)]

use std::collections::BTreeSet;
use std::path::Path;

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::actors::actor_kind_name;
use super::approvals::{
    ApprovalDecision, ApprovalQueueState, ApprovalRequestRecord, automated_self_approval_blocker,
};
use super::ledger::ChangesetAggregateRecord;
use super::model::{
    ActionEligibility, ActorRef, ChangesetId, ChangesetStatus, CommandKind, RevisionToken,
};
use super::projections::{ApprovalStateProjection, ProposalProjection};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

const REVIEW_CLAIM_SCHEMA: &str = "authoring.review_claim.v1";

/// The default advisory review-claim window (resource-bounds: a bounded TTL at creation).
/// A claim past it EXPIRES on the next touch and frees the item; a reviewer re-claims to
/// keep coordinating.
pub const DEFAULT_REVIEW_CLAIM_TTL_MS: i64 = 15 * 60 * 1000;

/// The bounded review-station queue page cap.
pub const MAX_REVIEW_QUEUE_ITEMS: usize = 200;

/// The bounded provenance-trail entry cap (resource-bounds: every query result is
/// bounded with an explicit cap + honest truncation).
pub const MAX_PROVENANCE_ENTRIES: usize = 200;

/// A bounded cap on the clarification comment recorded on a claim (resource-bounds).
const MAX_CLARIFICATION_BYTES: usize = 4 * 1024;

/// Why a reviewer is holding an item: an active `review` assignment, or a `clarify`
/// exchange in flight. Advisory only — the purpose annotates intent, never authority.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewClaimPurpose {
    Review,
    Clarify,
}

/// The lifecycle of a changeset's single review-claim row. `held` is a live advisory
/// claim; `released` was explicitly given up by its holder; `expired` lapsed past its TTL.
/// A `released`/`expired` row persists (one row per changeset) until re-claimed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewClaimState {
    Held,
    Released,
    Expired,
}

/// The latest in-flight clarification exchange recorded on a claimed item — a projection
/// FIELD, not a queue state (the item stays `claimed` while the exchange runs).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClarificationExchange {
    pub reviewer: ActorRef,
    pub comment: String,
    pub responded_at_ms: i64,
}

/// The durable, one-per-changeset advisory review-claim record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewClaimRecord {
    pub schema_version: String,
    pub claim_id: String,
    pub changeset_id: ChangesetId,
    pub purpose: ReviewClaimPurpose,
    pub state: ReviewClaimState,
    pub reviewer: ActorRef,
    pub idempotency_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_clarification: Option<ClarificationExchange>,
    pub claimed_at_ms: i64,
    pub expires_at_ms: i64,
    pub updated_at_ms: i64,
}

impl ReviewClaimRecord {
    /// True while the claim is `Held` and its TTL window has not lapsed — the only state
    /// in which it composes the served `claimed` item state.
    pub fn is_active(&self, now_ms: i64) -> bool {
        matches!(self.state, ReviewClaimState::Held) && now_ms < self.expires_at_ms
    }

    fn is_held(&self) -> bool {
        matches!(self.state, ReviewClaimState::Held)
    }
}

/// Input to claim (or re-claim) a changeset's review item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimReviewInput {
    pub changeset_id: ChangesetId,
    pub purpose: ReviewClaimPurpose,
    pub reviewer: ActorRef,
    pub idempotency_key: String,
    pub now_ms: i64,
    /// Claim window override; `None` uses [`DEFAULT_REVIEW_CLAIM_TTL_MS`].
    pub ttl_ms: Option<i64>,
}

/// The outcome of a claim operation: the item's current claim row (absent only when never
/// claimed), the served eligibility (did it take effect?), and whether this replayed an
/// already-recorded state (idempotency).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewClaimOutcome {
    pub record: Option<ReviewClaimRecord>,
    pub eligibility: ActionEligibility,
    pub replayed: bool,
}

/// The served review-station item state: a COMPOSITION of the approval decision-lifecycle
/// and the advisory claim overlay. A decided approval is `decision_submitted`/`closed`
/// regardless of a claim; an undecided item with a live claim is `claimed`, else `queued`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStationItemState {
    Queued,
    Claimed,
    DecisionSubmitted,
    Closed,
}

/// The advisory claim overlay served on a review-station item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewClaimProjection {
    pub reviewer: ActorRef,
    pub purpose: ReviewClaimPurpose,
    pub claimed_at_ms: i64,
    pub expires_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_clarification: Option<ClarificationExchange>,
}

/// One review-station queue item: the backend-served proposal projection plus the
/// composed four-state and the advisory claim overlay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewQueueItem {
    pub station_state: ReviewStationItemState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claim: Option<ReviewClaimProjection>,
    pub proposal: ProposalProjection,
}

/// A bounded page of review-station queue items (work waiting for humans). `truncated` is
/// set honestly when more needs-review items exist than the cap.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewQueueProjection {
    pub items: Vec<ReviewQueueItem>,
    pub truncated: bool,
    pub cap: usize,
}

/// A REDACTED reference to sensitive review material. The trail serves the material's
/// identity + content fingerprint ONLY — never its bytes (security-provenance redaction:
/// prompts, traces, preimage bodies, and tool outputs are policy-controlled).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RedactedMaterialRef {
    pub kind: String,
    pub id: String,
    pub content_hash: String,
    pub byte_len: i64,
}

/// The reviewer's recorded decision, surfaced on the provenance trail.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProvenanceDecision {
    pub reviewer: ActorRef,
    pub decision: ApprovalDecision,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub decided_at_ms: i64,
}

/// One append-only provenance entry: WHO took the changeset to WHICH status, WHEN, and
/// the REDACTED fingerprints of any material that produced it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProvenanceEntry {
    pub changeset_revision: RevisionToken,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_revision: Option<RevisionToken>,
    pub actor: ActorRef,
    pub status: ChangesetStatus,
    pub summary: String,
    pub created_at_ms: i64,
    pub materials: Vec<RedactedMaterialRef>,
}

/// The structured cross-changeset lineage FORMALIZED from what W13.P28 records minimally:
/// `rebased_from` is the in-place `Conflicted → Draft` predecessor (already structured via
/// the revision chain); `replaces` / `superseded_by` are parsed FAIL-SAFE from P28's
/// consistent summary tokens (`Replaces {id}` / `Superseded by {id}`).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProvenanceLineage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rebased_from: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replaces: Option<ChangesetId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<ChangesetId>,
}

/// The bounded, redacted provenance trail for one changeset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProvenanceTrailProjection {
    pub changeset_id: ChangesetId,
    pub entries: Vec<ProvenanceEntry>,
    pub lineage: ProvenanceLineage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<ProvenanceDecision>,
    pub truncated: bool,
    pub cap: usize,
}

/// The review-station repository: advisory claim/release/respond mutations over the
/// one-row-per-changeset claim table, plus the backend-served review-queue and provenance
/// read projections composed over the ledger, approvals, and claim overlay.
pub struct ReviewStationRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn review_station<'repo>(&'repo self) -> ReviewStationRepository<'repo, 'conn> {
        ReviewStationRepository {
            repo: self.repository("authoring_review_claims"),
            uow: self,
        }
    }
}

impl ReviewStationRepository<'_, '_> {
    /// Claim a changeset's review item. A live claim held by a DIFFERENT reviewer blocks
    /// the claim (denials-are-values). A live claim held by the SAME reviewer replays. A
    /// vacant/released/expired item issues a FRESH advisory claim. The self-review ban
    /// applies: an automated proposer cannot claim to review its own proposal.
    pub fn claim(&self, input: ClaimReviewInput) -> StoreResult<ReviewClaimOutcome> {
        self.uow.actors().ensure_active(&input.reviewer)?;
        let now = input.now_ms;

        if let Some(mut record) = self.current(&input.changeset_id)? {
            self.expire_in_place(&mut record, now)?;
            if record.is_active(now) {
                if record.reviewer == input.reviewer {
                    // Same reviewer re-claiming a live item is an idempotent hold.
                    return Ok(ReviewClaimOutcome {
                        eligibility: ActionEligibility::allowed(CommandKind::ClaimReview),
                        record: Some(record),
                        replayed: true,
                    });
                }
                return Ok(denied_with_record(
                    record,
                    CommandKind::ClaimReview,
                    "the review item is already claimed by a different reviewer; wait for \
                     release or expiry",
                ));
            }
        }

        // Advisory claim is a REVIEW action: the automated actor that proposed (or
        // proposed on behalf of) the origin author cannot claim to review its own work.
        if let Some(denied) = self.self_review_blocker(CommandKind::ClaimReview, &input)? {
            return Ok(ReviewClaimOutcome {
                record: self.current(&input.changeset_id)?,
                eligibility: denied,
                replayed: false,
            });
        }

        let ttl = input.ttl_ms.unwrap_or(DEFAULT_REVIEW_CLAIM_TTL_MS);
        let record = ReviewClaimRecord {
            schema_version: REVIEW_CLAIM_SCHEMA.to_string(),
            claim_id: claim_id_for(&input.changeset_id, now)?,
            changeset_id: input.changeset_id.clone(),
            purpose: input.purpose,
            state: ReviewClaimState::Held,
            reviewer: input.reviewer.clone(),
            idempotency_key: input.idempotency_key,
            latest_clarification: None,
            claimed_at_ms: now,
            expires_at_ms: now + ttl.max(1),
            updated_at_ms: now,
        };
        self.store_record(&record)?;
        Ok(ReviewClaimOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::ClaimReview),
            record: Some(record),
            replayed: false,
        })
    }

    /// Release a held review item. Only the holder may release (a non-holder release is a
    /// denied value). Releasing a never-claimed or already-released item is idempotent.
    pub fn release(
        &self,
        changeset_id: &ChangesetId,
        reviewer: &ActorRef,
        now_ms: i64,
    ) -> StoreResult<ReviewClaimOutcome> {
        self.uow.actors().ensure_active(reviewer)?;
        let Some(mut record) = self.current(changeset_id)? else {
            return Ok(denied_without_record(
                CommandKind::ReleaseReview,
                "no review claim exists on this changeset to release",
            ));
        };
        self.expire_in_place(&mut record, now_ms)?;
        if !record.is_held() {
            // Already released or expired: an idempotent no-op replay.
            return Ok(ReviewClaimOutcome {
                eligibility: ActionEligibility::allowed(CommandKind::ReleaseReview),
                record: Some(record),
                replayed: true,
            });
        }
        if record.reviewer != *reviewer {
            return Ok(denied_with_record(
                record,
                CommandKind::ReleaseReview,
                "only the reviewer holding this item may release it",
            ));
        }
        record.state = ReviewClaimState::Released;
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        Ok(ReviewClaimOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::ReleaseReview),
            record: Some(record),
            replayed: false,
        })
    }

    /// Record a clarification response on a held item (reuse of the status-preserving
    /// `Respond` arc: the item's changeset status is UNCHANGED and no ledger revision is
    /// appended; the exchange is a durable projection FIELD). Only the holder may respond,
    /// and only while the claim is live — the item stays `claimed` while the exchange runs.
    pub fn respond(
        &self,
        changeset_id: &ChangesetId,
        reviewer: &ActorRef,
        comment: String,
        now_ms: i64,
    ) -> StoreResult<ReviewClaimOutcome> {
        self.uow.actors().ensure_active(reviewer)?;
        let Some(mut record) = self.current(changeset_id)? else {
            return Ok(denied_without_record(
                CommandKind::Respond,
                "clarification requires an active claim on this review item",
            ));
        };
        self.expire_in_place(&mut record, now_ms)?;
        if !record.is_active(now_ms) {
            return Ok(denied_with_record(
                record,
                CommandKind::Respond,
                "clarification requires an active (unexpired) claim on this review item",
            ));
        }
        if record.reviewer != *reviewer {
            return Ok(denied_with_record(
                record,
                CommandKind::Respond,
                "only the reviewer holding this item may respond with clarification",
            ));
        }
        record.latest_clarification = Some(ClarificationExchange {
            reviewer: reviewer.clone(),
            comment: bound_comment(&comment),
            responded_at_ms: now_ms,
        });
        record.purpose = ReviewClaimPurpose::Clarify;
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        Ok(ReviewClaimOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::Respond),
            record: Some(record),
            replayed: false,
        })
    }

    /// The changeset's current claim row (raw, without an expire-on-read write). The caller
    /// interprets liveness through [`ReviewClaimRecord::is_active`].
    pub fn current(&self, changeset_id: &ChangesetId) -> StoreResult<Option<ReviewClaimRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json FROM authoring_review_claims WHERE changeset_id = ?1",
            [changeset_id.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_record(&json)?)),
            None => Ok(None),
        }
    }

    /// The changeset ids that currently hold a `held` claim row. Consumed by the corpus
    /// count projection to reclassify a `queued` approval as `claimed`. Like the advisory
    /// lease listing, a `held`-but-past-TTL row is reconciled on its next touch, so this
    /// reflects durable assignment; it is bounded by the one-row-per-changeset table.
    pub fn held_claim_changeset_ids(&self) -> StoreResult<BTreeSet<String>> {
        let rows = self.repo.query_collect(
            "SELECT changeset_id FROM authoring_review_claims WHERE state = 'held'",
            [],
            |row| row.get::<_, String>(0),
        )?;
        Ok(rows.into_iter().collect())
    }

    /// The backend-served review-station queue: needs-review changesets (the work waiting
    /// for humans), each with its composed four-state and advisory claim overlay. Bounded +
    /// honestly truncated.
    pub fn review_queue(
        &self,
        worktree_root: &Path,
        now_ms: i64,
    ) -> StoreResult<ReviewQueueProjection> {
        let probe = MAX_REVIEW_QUEUE_ITEMS + 1;
        let changeset_ids = self.repo.query_collect(
            "SELECT changeset_id
             FROM authoring_changeset_revisions
             WHERE seq IN (
                 SELECT MAX(seq) FROM authoring_changeset_revisions GROUP BY changeset_id
             )
               AND status = 'needs_review'
             ORDER BY seq DESC
             LIMIT ?1",
            rusqlite::params![probe as i64],
            |row| row.get::<_, String>(0),
        )?;
        let truncated = changeset_ids.len() > MAX_REVIEW_QUEUE_ITEMS;
        let mut items = Vec::with_capacity(changeset_ids.len().min(MAX_REVIEW_QUEUE_ITEMS));
        for raw_id in changeset_ids.into_iter().take(MAX_REVIEW_QUEUE_ITEMS) {
            let changeset_id =
                ChangesetId::new(&raw_id).map_err(|err| StoreError::Ledger(err.to_string()))?;
            let Some(proposal) = self
                .uow
                .projections()
                .project_proposal(&changeset_id, worktree_root)
                .map_err(|err| StoreError::ReviewStation(err.to_string()))?
            else {
                continue;
            };
            let claim = self.active_claim_projection(&changeset_id, now_ms)?;
            let station_state = compose_item_state(&proposal.approval, claim.is_some());
            items.push(ReviewQueueItem {
                station_state,
                claim,
                proposal,
            });
        }
        Ok(ReviewQueueProjection {
            items,
            truncated,
            cap: MAX_REVIEW_QUEUE_ITEMS,
        })
    }

    /// The bounded, REDACTED provenance trail for one changeset: the append-only ledger
    /// revision chain (newest-first, capped), the reviewer's decision, and the structured
    /// lineage. Returns `None` when the changeset has no ledger history. Redaction is
    /// structural: only preimage FINGERPRINTS (id + content hash) are surfaced, never bodies.
    pub fn changeset_provenance(
        &self,
        changeset_id: &ChangesetId,
        cap: usize,
    ) -> StoreResult<Option<ProvenanceTrailProjection>> {
        let history = self.uow.ledger().history(changeset_id)?;
        if history.revisions.is_empty() {
            return Ok(None);
        }
        // Lineage is computed over the FULL (inherently small) revision chain before the
        // entry list is bounded, so a truncated entry page never loses the linkage.
        let lineage = derive_lineage(&history.revisions);
        let total = history.revisions.len();
        let truncated = total > cap;
        let entries: Vec<ProvenanceEntry> = history
            .revisions
            .iter()
            .rev()
            .take(cap)
            .map(provenance_entry)
            .collect();
        let decision = self
            .latest_decision(changeset_id)?
            .and_then(|record| record.decision)
            .map(|decision| ProvenanceDecision {
                reviewer: decision.reviewer,
                decision: decision.decision,
                comment: decision.comment,
                decided_at_ms: decision.decided_at_ms,
            });
        Ok(Some(ProvenanceTrailProjection {
            changeset_id: changeset_id.clone(),
            entries,
            lineage,
            decision,
            truncated,
            cap,
        }))
    }

    fn active_claim_projection(
        &self,
        changeset_id: &ChangesetId,
        now_ms: i64,
    ) -> StoreResult<Option<ReviewClaimProjection>> {
        let Some(record) = self.current(changeset_id)? else {
            return Ok(None);
        };
        if !record.is_active(now_ms) {
            return Ok(None);
        }
        Ok(Some(ReviewClaimProjection {
            reviewer: record.reviewer,
            purpose: record.purpose,
            claimed_at_ms: record.claimed_at_ms,
            expires_at_ms: record.expires_at_ms,
            latest_clarification: record.latest_clarification,
        }))
    }

    fn latest_decision(
        &self,
        changeset_id: &ChangesetId,
    ) -> StoreResult<Option<ApprovalRequestRecord>> {
        let json = self
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
        match json {
            Some(json) => Ok(Some(
                serde_json::from_str(&json).map_err(|err| StoreError::Approval(err.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    fn self_review_blocker(
        &self,
        command: CommandKind,
        input: &ClaimReviewInput,
    ) -> StoreResult<Option<ActionEligibility>> {
        let Some(origin) = self.uow.ledger().origin(&input.changeset_id)? else {
            return Ok(None);
        };
        Ok(automated_self_approval_blocker(
            command,
            &input.reviewer,
            &origin.actor,
        ))
    }

    fn expire_in_place(&self, record: &mut ReviewClaimRecord, now_ms: i64) -> StoreResult<bool> {
        if !record.is_held() || now_ms < record.expires_at_ms {
            return Ok(false);
        }
        record.state = ReviewClaimState::Expired;
        record.updated_at_ms = now_ms;
        self.store_record(record)?;
        Ok(true)
    }

    fn store_record(&self, record: &ReviewClaimRecord) -> StoreResult<()> {
        validate_record(record)?;
        let record_json = serde_json::to_string(record)
            .map_err(|err| StoreError::ReviewStation(err.to_string()))?;
        let delegated_by = record
            .reviewer
            .delegated_by
            .as_ref()
            .map_or("", |id| id.as_str());
        self.repo.execute(
            "INSERT INTO authoring_review_claims
                (changeset_id, claim_id, purpose, state, reviewer_actor_id,
                 reviewer_actor_kind, reviewer_delegated_by_actor_id, idempotency_key,
                 record_json, claimed_at_ms, expires_at_ms, updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(changeset_id) DO UPDATE SET
                claim_id = excluded.claim_id,
                purpose = excluded.purpose,
                state = excluded.state,
                reviewer_actor_id = excluded.reviewer_actor_id,
                reviewer_actor_kind = excluded.reviewer_actor_kind,
                reviewer_delegated_by_actor_id = excluded.reviewer_delegated_by_actor_id,
                idempotency_key = excluded.idempotency_key,
                record_json = excluded.record_json,
                claimed_at_ms = excluded.claimed_at_ms,
                expires_at_ms = excluded.expires_at_ms,
                updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.changeset_id.as_str(),
                record.claim_id.as_str(),
                purpose_as_str(record.purpose),
                state_as_str(record.state),
                record.reviewer.id.as_str(),
                actor_kind_name(record.reviewer.kind),
                delegated_by,
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.claimed_at_ms,
                record.expires_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

/// Compose the served four-state item from the approval decision-lifecycle and the live
/// claim overlay. A decided approval wins (a claim never masks a submitted decision); an
/// undecided item is `claimed` while a live claim holds it, else `queued`.
fn compose_item_state(
    approval: &ApprovalStateProjection,
    has_active_claim: bool,
) -> ReviewStationItemState {
    match approval.queue_state {
        Some(ApprovalQueueState::DecisionSubmitted) => ReviewStationItemState::DecisionSubmitted,
        Some(ApprovalQueueState::Closed) => ReviewStationItemState::Closed,
        Some(ApprovalQueueState::Queued) | None => {
            if has_active_claim {
                ReviewStationItemState::Claimed
            } else {
                ReviewStationItemState::Queued
            }
        }
    }
}

/// Derive the structured lineage from the revision chain (`rebased_from`: the in-place
/// `Conflicted → Draft`/`RollbackProposed` predecessor) and the FAIL-SAFE summary-token
/// parse (`replaces` / `superseded_by`). The latest match of each wins.
fn derive_lineage(revisions: &[ChangesetAggregateRecord]) -> ProvenanceLineage {
    let mut lineage = ProvenanceLineage::default();
    for window in revisions.windows(2) {
        let [previous, current] = window else {
            continue;
        };
        let entered_rebase = matches!(
            current.status,
            ChangesetStatus::Draft | ChangesetStatus::RollbackProposed
        ) && previous.status == ChangesetStatus::Conflicted;
        if entered_rebase {
            lineage.rebased_from = Some(previous.changeset_revision.clone());
        }
    }
    for revision in revisions {
        if let Some(id) = parse_lineage_token(&revision.summary, "Replaces ") {
            lineage.replaces = Some(id);
        }
        if let Some(id) = parse_lineage_token(&revision.summary, "Superseded by ") {
            lineage.superseded_by = Some(id);
        }
    }
    lineage
}

/// FAIL-SAFE parse of a P28 lineage token: `"<prefix><id>: <summary>"`. A changeset id
/// carries no whitespace, so the first whitespace-delimited token after the prefix is the
/// id (with a trailing `:` stripped). A summary that does not match the format, or an id
/// that does not validate, yields `None` — never a crash, never a wrong link.
fn parse_lineage_token(summary: &str, prefix: &str) -> Option<ChangesetId> {
    let rest = summary.strip_prefix(prefix)?;
    let token = rest.split_whitespace().next()?;
    let id = token.strip_suffix(':').unwrap_or(token);
    ChangesetId::new(id).ok()
}

/// Build one redacted provenance entry from a ledger revision. The preimage REFERENCE
/// (id + content hash + byte length) is a fingerprint the [`super::operations::OperationPreimageRef`]
/// already carries — the raw preimage body lives only in the preimages table and is NEVER
/// joined here, so redaction is structural.
fn provenance_entry(revision: &ChangesetAggregateRecord) -> ProvenanceEntry {
    let materials = revision
        .children
        .iter()
        .filter_map(|child| child.materialized_operation.as_ref())
        .map(|operation| RedactedMaterialRef {
            kind: "preimage".to_string(),
            id: operation.preimage.preimage_id.clone(),
            content_hash: operation.preimage.payload_hash.clone(),
            byte_len: operation.preimage.payload_bytes,
        })
        .collect();
    ProvenanceEntry {
        changeset_revision: revision.changeset_revision.clone(),
        previous_revision: revision.previous_revision.clone(),
        actor: revision.actor.clone(),
        status: revision.status,
        summary: revision.summary.clone(),
        created_at_ms: revision.created_at_ms,
        materials,
    }
}

fn bound_comment(comment: &str) -> String {
    if comment.len() <= MAX_CLARIFICATION_BYTES {
        return comment.to_string();
    }
    let mut boundary = 0;
    for (index, _) in comment.char_indices() {
        if index > MAX_CLARIFICATION_BYTES {
            break;
        }
        boundary = index;
    }
    comment[..boundary].to_string()
}

fn denied_without_record(command: CommandKind, reason: impl Into<String>) -> ReviewClaimOutcome {
    ReviewClaimOutcome {
        record: None,
        eligibility: ActionEligibility::denied(command, reason),
        replayed: false,
    }
}

fn denied_with_record(
    record: ReviewClaimRecord,
    command: CommandKind,
    reason: impl Into<String>,
) -> ReviewClaimOutcome {
    ReviewClaimOutcome {
        record: Some(record),
        eligibility: ActionEligibility::denied(command, reason),
        replayed: false,
    }
}

fn claim_id_for(changeset_id: &ChangesetId, now_ms: i64) -> StoreResult<String> {
    let oid = blob_oid(format!("{}\u{0}{now_ms}", changeset_id.as_str()).as_bytes());
    Ok(format!("review_claim:{oid}"))
}

fn read_record(json: &str) -> StoreResult<ReviewClaimRecord> {
    serde_json::from_str(json).map_err(|err| StoreError::ReviewStation(err.to_string()))
}

fn validate_record(record: &ReviewClaimRecord) -> StoreResult<()> {
    if record.schema_version != REVIEW_CLAIM_SCHEMA {
        return Err(StoreError::ReviewStation(format!(
            "unsupported review claim schema `{}`",
            record.schema_version
        )));
    }
    if record.changeset_id.as_str().trim().is_empty() {
        return Err(StoreError::ReviewStation(
            "review claim changeset_id cannot be empty".to_string(),
        ));
    }
    if record.idempotency_key.trim().is_empty() {
        return Err(StoreError::ReviewStation(
            "review claim idempotency key cannot be empty".to_string(),
        ));
    }
    if record.updated_at_ms < record.claimed_at_ms {
        return Err(StoreError::ReviewStation(
            "updated_at_ms cannot be before claimed_at_ms".to_string(),
        ));
    }
    Ok(())
}

fn purpose_as_str(purpose: ReviewClaimPurpose) -> &'static str {
    match purpose {
        ReviewClaimPurpose::Review => "review",
        ReviewClaimPurpose::Clarify => "clarify",
    }
}

fn state_as_str(state: ReviewClaimState) -> &'static str {
    match state {
        ReviewClaimState::Held => "held",
        ReviewClaimState::Released => "released",
        ReviewClaimState::Expired => "expired",
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput, ActorStatus};
    use crate::authoring::api::{
        ChangesetChildOperationDraft, ChangesetOperationKind, CreateProposalRequest,
        CreateSessionRequest, DraftMode, DraftMutation, TargetRevisionFence,
    };
    use crate::authoring::approvals::{ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple};
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
    use crate::authoring::model::{
        ActorId, ActorKind, ApprovalId, DocumentRef, ProposalId, SessionId,
    };
    use crate::authoring::proposal::{
        ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, create_proposal,
        validate_proposal,
    };
    use crate::authoring::snapshots::SnapshotReader;
    use crate::authoring::store::Store;
    use crate::authoring::transitions::ValidationFreshness;
    use crate::authoring::validation::{ChunkEvidenceStatus, ChunkValidationEvidence};

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        register_actor(&mut store, author());
        register_actor(&mut store, reviewer());
        register_actor(&mut store, second_reviewer());
        create_session(&mut store);
        (dir, store)
    }

    fn register_actor(store: &mut Store, actor: ActorRef) {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput {
                    actor: actor.clone(),
                    display: ActorDisplayMetadata::new("Review station test actor", None),
                    status: ActorStatus::Active,
                    created_at_ms: 1,
                    updated_at_ms: 1,
                })?;
                Ok(())
            })
            .unwrap();
    }

    fn create_session(store: &mut Store) {
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.sessions().create_session(
                    session_id(),
                    CreateSessionRequest {
                        scope: "review-tests".to_string(),
                        title: "Review station test session".to_string(),
                    },
                    author(),
                    1,
                )?;
                Ok(())
            })
            .unwrap();
    }

    fn author() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:review-author").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn reviewer() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn second_reviewer() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:second-reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn session_id() -> SessionId {
        SessionId::new("session_1").unwrap()
    }

    fn changeset_id(value: &str) -> ChangesetId {
        ChangesetId::new(value).unwrap()
    }

    fn valid_body(label: &str) -> String {
        format!("---\ntags:\n  - '#plan'\n---\n\n# Plan\n\n{label}\n")
    }

    fn resolved_doc(root: &Path, stem: &str) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("existing document expected");
        };
        base_revision.clone()
    }

    fn context(actor: ActorRef, key: &str, now_ms: i64) -> ProposalCommandContext {
        ProposalCommandContext {
            actor,
            idempotency_key: crate::authoring::model::IdempotencyKey::new(key).unwrap(),
            now_ms,
            in_flight_expires_at_ms: Some(now_ms + 60_000),
            outcome_expires_at_ms: None,
        }
    }

    fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
        match result {
            ProposalCommandResult::Accepted { outcome, .. } => outcome,
            other => panic!("expected accepted, got {other:?}"),
        }
    }

    /// Create + validate a proposal against `stem`, leaving it materialized and validated
    /// (ready to submit for review). Returns the changeset id and the validation digest.
    fn create_and_validate(
        store: &mut Store,
        root: &Path,
        id: &ChangesetId,
        stem: &str,
        body: &str,
        base_now: i64,
    ) -> String {
        let reader = SnapshotReader::for_worktree(root);
        let document = resolved_doc(root, stem);
        let revision = base_revision(&document);
        accepted(
            create_proposal(
                store,
                &reader,
                context(author(), &format!("idem:create:{}", id.as_str()), base_now),
                CreateProposalRequest {
                    session_id: session_id(),
                    changeset_id: id.clone(),
                    summary: "review this proposal".to_string(),
                    operations: vec![ChangesetChildOperationDraft {
                        child_key: "child_1".to_string(),
                        operation: ChangesetOperationKind::ReplaceBody,
                        target: TargetRevisionFence {
                            document: document.clone(),
                            base_revision: Some(revision.clone()),
                            current_revision: Some(revision.clone()),
                        },
                        draft: DraftMutation {
                            mode: DraftMode::WholeDocument,
                            body: body.to_string(),
                        },
                    }],
                },
            )
            .unwrap(),
        );
        let latest = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(id))
            .unwrap()
            .unwrap();
        let operation = latest.children[0]
            .materialized_operation
            .as_ref()
            .unwrap()
            .clone();
        let current = crate::authoring::validation::CurrentRevisionObservation::from_snapshot(
            "child_1",
            &reader
                .require_current_base(&operation.target_snapshot.document)
                .unwrap(),
        );
        let chunk = ChunkValidationEvidence {
            child_key: "child_1".to_string(),
            evidence_id: "chunk:child_1".to_string(),
            document: operation.target_snapshot.document.clone(),
            base_revision: operation.target_snapshot.base_revision.clone(),
            chunker_version: "whole_document_v1".to_string(),
            range: "bytes:0..all".to_string(),
            content_hash: operation.review_diff.base_blob_hash.clone(),
            observed_revision: Some(operation.target_snapshot.base_revision.clone()),
            observed_content_hash: Some(operation.review_diff.base_blob_hash.clone()),
            status: ChunkEvidenceStatus::Current,
        };
        let validated = accepted(
            validate_proposal(
                store,
                context(
                    author(),
                    &format!("idem:validate:{}", id.as_str()),
                    base_now + 1,
                ),
                crate::authoring::proposal::ValidateProposalRequest {
                    changeset_id: id.clone(),
                    expected_revision: latest.changeset_revision,
                    summary: "validate".to_string(),
                    current_revisions: vec![current],
                    chunk_evidence: vec![chunk],
                },
            )
            .unwrap(),
        );
        validated.validation_digest.unwrap()
    }

    /// Drive a validated proposal into `NeedsReview` and open its approval request, so the
    /// review station sees a real queued item.
    fn submit_and_open_approval(
        store: &mut Store,
        id: &ChangesetId,
        validation_digest: &str,
        now_ms: i64,
    ) {
        // The submit transition (Proposed -> NeedsReview) under the reviewer path.
        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                let latest = uow.ledger().latest(id)?.unwrap();
                let next = crate::authoring::ledger::ChangesetAggregateRecord::new(
                    ChangesetRevisionInput {
                        changeset_id: id.clone(),
                        previous_revision: Some(latest.changeset_revision.clone()),
                        kind: latest.kind,
                        status: ChangesetStatus::NeedsReview,
                        session_id: latest.session_id.clone(),
                        actor: author(),
                        summary: latest.summary.clone(),
                        children: latest
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
                            .collect(),
                        created_at_ms: now_ms,
                    },
                )
                .map_err(|err| StoreError::Ledger(err.to_string()))?;
                uow.ledger().append_revision(&next)?;
                let proposal_id = ProposalId::new(format!("proposal:{}", id.as_str())).unwrap();
                uow.approvals()
                    .request_approval(ApprovalRequestInput {
                        approval_id: ApprovalId::new(format!("approval:{}", id.as_str())).unwrap(),
                        proposal_id,
                        changeset_id: id.clone(),
                        reviewed: ReviewedTuple {
                            proposal_revision: next.changeset_revision.clone(),
                            validation_digest: validation_digest.to_string(),
                            policy_version: crate::authoring::approvals::V1_POLICY_VERSION
                                .to_string(),
                        },
                        idempotency_key: format!("idem:approval:{}", id.as_str()),
                        created_at_ms: now_ms,
                    })
                    .map_err(|err| StoreError::Approval(err.to_string()))?;
                Ok(())
            })
            .unwrap();
    }

    fn needs_review_item(store: &mut Store, root: &Path, id: &ChangesetId, stem: &str, now: i64) {
        write_doc(root, &format!(".vault/plan/{stem}.md"), &valid_body("base"));
        let digest = create_and_validate(store, root, id, stem, &valid_body("edited"), now);
        submit_and_open_approval(store, id, &digest, now + 10);
    }

    fn claim(
        store: &mut Store,
        id: &ChangesetId,
        reviewer: ActorRef,
        now: i64,
    ) -> ReviewClaimOutcome {
        store
            .with_unit_of_work(CommandKind::ClaimReview, |uow| {
                uow.review_station().claim(ClaimReviewInput {
                    changeset_id: id.clone(),
                    purpose: ReviewClaimPurpose::Review,
                    reviewer,
                    idempotency_key: format!("idem:claim:{}", id.as_str()),
                    now_ms: now,
                    ttl_ms: None,
                })
            })
            .unwrap()
    }

    fn queue(store: &mut Store, root: &Path, now: i64) -> ReviewQueueProjection {
        store
            .with_unit_of_work(CommandKind::ClaimReview, |uow| {
                uow.review_station().review_queue(root, now)
            })
            .unwrap()
    }

    fn item_for<'a>(queue: &'a ReviewQueueProjection, id: &ChangesetId) -> &'a ReviewQueueItem {
        queue
            .items
            .iter()
            .find(|item| &item.proposal.changeset_id == id)
            .expect("queue item present")
    }

    #[test]
    fn pending_queue_lists_only_needs_review_items_as_queued() {
        let (dir, mut store) = temp_store();
        let root = dir.path();

        // Two needs-review items, plus a draft that must NOT appear in the review queue.
        let a = changeset_id("changeset_pending_a");
        let b = changeset_id("changeset_pending_b");
        needs_review_item(&mut store, root, &a, "pending-a", 100);
        needs_review_item(&mut store, root, &b, "pending-b", 200);

        let draft = changeset_id("changeset_pending_draft");
        write_doc(root, ".vault/plan/pending-draft.md", &valid_body("base"));
        create_and_validate(
            &mut store,
            root,
            &draft,
            "pending-draft",
            &valid_body("x"),
            300,
        );

        let queue = queue(&mut store, root, 1_000);
        assert_eq!(queue.items.len(), 2, "only needs-review items are queued");
        assert!(!queue.truncated);
        assert!(
            queue
                .items
                .iter()
                .all(|item| item.proposal.status == ChangesetStatus::NeedsReview),
            "every queue item is needs-review"
        );
        // With no claims, every item is `queued` and carries no claim overlay.
        for item in &queue.items {
            assert_eq!(item.station_state, ReviewStationItemState::Queued);
            assert!(item.claim.is_none());
        }
        assert!(
            !queue
                .items
                .iter()
                .any(|item| item.proposal.changeset_id == draft),
            "a draft never enters the review queue"
        );
    }

    #[test]
    fn claiming_an_item_composes_the_claimed_state_and_overlay() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_claim");
        needs_review_item(&mut store, root, &id, "claim-plan", 100);

        let outcome = claim(&mut store, &id, reviewer(), 1_000);
        assert!(outcome.eligibility.allowed, "{:?}", outcome.eligibility);
        assert!(!outcome.replayed);

        let queue = queue(&mut store, root, 1_010);
        let item = item_for(&queue, &id);
        assert_eq!(item.station_state, ReviewStationItemState::Claimed);
        let overlay = item.claim.as_ref().expect("claim overlay served");
        assert_eq!(overlay.reviewer, reviewer());
        assert_eq!(overlay.purpose, ReviewClaimPurpose::Review);
        assert!(overlay.expires_at_ms > 1_000);

        // A different reviewer cannot claim a held item — the denial is a value, and the
        // held claim is unchanged (advisory coordination, not authority theft).
        let contended = claim(&mut store, &id, second_reviewer(), 1_020);
        assert!(!contended.eligibility.allowed);
        assert!(
            contended
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("different reviewer")),
            "{:?}",
            contended.eligibility
        );
        assert_eq!(
            contended.record.unwrap().reviewer,
            reviewer(),
            "the original holder still holds the item"
        );

        // The claim NEVER changes the proposal's approval truth (claim is advisory).
        assert_eq!(
            item.proposal.approval.queue_state,
            Some(ApprovalQueueState::Queued)
        );
    }

    #[test]
    fn releasing_an_item_returns_it_to_the_queued_state() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_release");
        needs_review_item(&mut store, root, &id, "release-plan", 100);
        claim(&mut store, &id, reviewer(), 1_000);

        // A non-holder cannot release (denied value, item still held).
        let non_holder = store
            .with_unit_of_work(CommandKind::ReleaseReview, |uow| {
                uow.review_station().release(&id, &second_reviewer(), 1_005)
            })
            .unwrap();
        assert!(!non_holder.eligibility.allowed);
        assert!(
            non_holder
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("only the reviewer holding")),
            "{:?}",
            non_holder.eligibility
        );
        assert_eq!(
            queue(&mut store, root, 1_006)
                .items
                .iter()
                .find(|item| item.proposal.changeset_id == id)
                .unwrap()
                .station_state,
            ReviewStationItemState::Claimed
        );

        // The holder releases → the item returns to `queued` with no claim overlay.
        let released = store
            .with_unit_of_work(CommandKind::ReleaseReview, |uow| {
                uow.review_station().release(&id, &reviewer(), 1_010)
            })
            .unwrap();
        assert!(released.eligibility.allowed);
        assert_eq!(released.record.unwrap().state, ReviewClaimState::Released);

        let item = item_for(&queue(&mut store, root, 1_020), &id).clone();
        assert_eq!(item.station_state, ReviewStationItemState::Queued);
        assert!(item.claim.is_none());
    }

    #[test]
    fn clarification_records_the_exchange_and_keeps_the_item_claimed() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_clarify");
        needs_review_item(&mut store, root, &id, "clarify-plan", 100);
        claim(&mut store, &id, reviewer(), 1_000);

        // Respond requires the holder; a non-holder is denied.
        let non_holder = store
            .with_unit_of_work(CommandKind::Respond, |uow| {
                uow.review_station().respond(
                    &id,
                    &second_reviewer(),
                    "please clarify the intent".to_string(),
                    1_005,
                )
            })
            .unwrap();
        assert!(!non_holder.eligibility.allowed);

        let responded = store
            .with_unit_of_work(CommandKind::Respond, |uow| {
                uow.review_station().respond(
                    &id,
                    &reviewer(),
                    "please cite the source revision".to_string(),
                    1_010,
                )
            })
            .unwrap();
        assert!(responded.eligibility.allowed, "{:?}", responded.eligibility);

        // The item stays claimed; the clarification is a served FIELD, and the changeset
        // status is unchanged (status-preserving respond arc).
        let item = item_for(&queue(&mut store, root, 1_020), &id).clone();
        assert_eq!(item.station_state, ReviewStationItemState::Claimed);
        let clarification = item
            .claim
            .as_ref()
            .unwrap()
            .latest_clarification
            .as_ref()
            .expect("clarification served");
        assert_eq!(clarification.reviewer, reviewer());
        assert_eq!(clarification.comment, "please cite the source revision");
        assert_eq!(item.proposal.status, ChangesetStatus::NeedsReview);
    }

    #[test]
    fn reviewer_edit_request_changes_returns_the_proposal_to_draft() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_reviewer_edit");
        let digest = {
            write_doc(root, ".vault/plan/edit-plan.md", &valid_body("base"));
            let d = create_and_validate(&mut store, root, &id, "edit-plan", &valid_body("v1"), 100);
            submit_and_open_approval(&mut store, &id, &d, 110);
            d
        };
        claim(&mut store, &id, reviewer(), 1_000);

        // The reviewer requests changes: the now-activated decision drives the EditProposal
        // arc (NeedsReview -> Draft) under the reviewer's identity, a reviewer edit.
        let proposal_id = ProposalId::new(format!("proposal:{}", id.as_str())).unwrap();
        let outcome = store
            .with_unit_of_work(CommandKind::EditProposal, |uow| {
                uow.approvals()
                    .submit_decision(ReviewDecisionInput {
                        proposal_id: &proposal_id,
                        decision: ApprovalDecision::RequestChanges,
                        reviewer: &reviewer(),
                        validation: ValidationFreshness::fresh(),
                        current_validation_digest: &digest,
                        current_policy_version: crate::authoring::approvals::V1_POLICY_VERSION,
                        run_cancelled: false,
                        comment: Some("tighten the second paragraph".to_string()),
                        decided_at_ms: 1_100,
                    })
                    .map_err(|err| StoreError::Approval(err.to_string()))
            })
            .unwrap();
        assert!(
            outcome.eligibility.allowed,
            "request-changes is activated: {:?}",
            outcome.eligibility
        );

        // The changeset is back to Draft, under the REVIEWER's identity, and it leaves the
        // needs-review queue.
        let latest = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(&id))
            .unwrap()
            .unwrap();
        assert_eq!(latest.status, ChangesetStatus::Draft);
        assert_eq!(latest.actor, reviewer(), "the reviewer authored the edit");
        assert_eq!(
            outcome.record.decision.unwrap().decision,
            ApprovalDecision::RequestChanges
        );
        assert!(
            !queue(&mut store, root, 1_200)
                .items
                .iter()
                .any(|item| item.proposal.changeset_id == id),
            "a request-changes item leaves the review queue"
        );
    }

    #[test]
    fn provenance_trail_is_redacted_of_raw_preimage_bodies() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_provenance_redaction");
        // A distinctive base body whose text must NEVER appear in the served trail.
        let secret_body = valid_body("TOP-SECRET-PREIMAGE-BODY-marker");
        write_doc(root, ".vault/plan/redact-plan.md", &secret_body);
        let digest = create_and_validate(
            &mut store,
            root,
            &id,
            "redact-plan",
            &valid_body("edited"),
            100,
        );
        submit_and_open_approval(&mut store, &id, &digest, 110);

        let trail = store
            .with_unit_of_work(CommandKind::ClaimReview, |uow| {
                uow.review_station()
                    .changeset_provenance(&id, MAX_PROVENANCE_ENTRIES)
            })
            .unwrap()
            .expect("trail exists");

        // The trail carries the preimage FINGERPRINT (id + content hash), never the body.
        let material = trail
            .entries
            .iter()
            .flat_map(|entry| entry.materials.iter())
            .find(|material| material.kind == "preimage")
            .expect("a preimage fingerprint is surfaced");
        assert!(!material.id.is_empty());
        assert!(!material.content_hash.is_empty());
        assert!(material.byte_len > 0);

        // The load-bearing assertion: the raw preimage body text is absent from the entire
        // serialized provenance projection.
        let serialized = serde_json::to_string(&trail).unwrap();
        assert!(
            !serialized.contains("TOP-SECRET-PREIMAGE-BODY-marker"),
            "raw preimage body must be redacted from the provenance trail"
        );
        // Who-did-what is served: the proposing actor authored the first entry.
        assert!(trail.entries.iter().any(|entry| entry.actor == author()));
    }

    #[test]
    fn provenance_lineage_parses_p28_tokens_fail_safe() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        write_doc(root, ".vault/plan/lineage-plan.md", &valid_body("base"));

        // A replacement changeset whose Draft summary carries the P28 "Replaces {id}" token,
        // exactly as create_replacement_proposal writes it.
        let source = changeset_id("changeset_lineage_source");
        let replacement = changeset_id("changeset_lineage_replacement");
        let reader = SnapshotReader::for_worktree(root);
        let document = resolved_doc(root, "lineage-plan");
        let revision = base_revision(&document);
        accepted(
            create_proposal(
                &mut store,
                &reader,
                context(author(), "idem:create:lineage", 100),
                CreateProposalRequest {
                    session_id: session_id(),
                    changeset_id: replacement.clone(),
                    summary: format!(
                        "Replaces {}: regenerate against current base",
                        source.as_str()
                    ),
                    operations: vec![ChangesetChildOperationDraft {
                        child_key: "child_1".to_string(),
                        operation: ChangesetOperationKind::ReplaceBody,
                        target: TargetRevisionFence {
                            document,
                            base_revision: Some(revision.clone()),
                            current_revision: Some(revision),
                        },
                        draft: DraftMutation {
                            mode: DraftMode::WholeDocument,
                            body: valid_body("edited"),
                        },
                    }],
                },
            )
            .unwrap(),
        );

        let trail = store
            .with_unit_of_work(CommandKind::ClaimReview, |uow| {
                uow.review_station()
                    .changeset_provenance(&replacement, MAX_PROVENANCE_ENTRIES)
            })
            .unwrap()
            .unwrap();
        assert_eq!(
            trail.lineage.replaces.as_ref().map(|id| id.as_str()),
            Some(source.as_str()),
            "the structured `replaces` linkage is parsed from the P28 summary token"
        );
        assert!(trail.lineage.superseded_by.is_none());

        // Fail-safe: a summary that does not match yields no linkage, never a crash/wrong id.
        // No prefix, an invalid id token, and an empty rest all yield None.
        assert!(parse_lineage_token("just a normal summary", "Replaces ").is_none());
        assert!(parse_lineage_token("Replaces bad!id: x", "Replaces ").is_none());
        assert!(parse_lineage_token("Replaces ", "Replaces ").is_none());
    }

    #[test]
    fn provenance_query_results_are_bounded_and_truncated() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let id = changeset_id("changeset_bounded");
        write_doc(root, ".vault/plan/bounded-plan.md", &valid_body("base"));
        create_and_validate(
            &mut store,
            root,
            &id,
            "bounded-plan",
            &valid_body("v1"),
            100,
        );

        // Append many Draft revisions so the history exceeds a small query cap. Draft ->
        // Draft is a declared arc, so the real ledger accepts each append.
        let base = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.ledger().latest(&id))
            .unwrap()
            .unwrap();
        let mut previous = base;
        for n in 0..6 {
            let next =
                crate::authoring::ledger::ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: id.clone(),
                    previous_revision: Some(previous.changeset_revision.clone()),
                    kind: previous.kind,
                    status: ChangesetStatus::Draft,
                    session_id: previous.session_id.clone(),
                    actor: author(),
                    summary: format!("draft revision {n}"),
                    children: previous
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
                        .collect(),
                    created_at_ms: 200 + n,
                })
                .unwrap();
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    uow.ledger().append_revision(&next)
                })
                .unwrap();
            previous = next;
        }

        let cap = 3;
        let trail = store
            .with_unit_of_work(CommandKind::ClaimReview, |uow| {
                uow.review_station().changeset_provenance(&id, cap)
            })
            .unwrap()
            .unwrap();
        assert_eq!(trail.entries.len(), cap, "the entry page honors the cap");
        assert_eq!(trail.cap, cap);
        assert!(trail.truncated, "more revisions than the cap → truncated");
        // Newest-first: the capped page starts at the most recent revision.
        assert_eq!(trail.entries[0].summary, "draft revision 5");
    }
}
