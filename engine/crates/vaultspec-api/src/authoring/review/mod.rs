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

/// FAIL-SAFE parse of a P28 lineage token: `"<prefix><id>: <summary>"`. P28 ALWAYS emits a
/// COLON-TERMINATED id token, so the id is the first whitespace-delimited word after the
/// prefix and it MUST carry the trailing `:` — the colon is REQUIRED, never optional. This
/// is what distinguishes a real linkage from a plain-English summary that happens to open
/// with the prefix word: `"Replaces the old plan"` (first token `the`, no colon) yields
/// `None`, so an innocent author summary can never fabricate a false provenance link on the
/// audit surface, even when the coincidental word is a syntactically valid changeset id. A
/// missing prefix, a missing trailing colon, or an id that does not validate all yield
/// `None` — never a crash, never a wrong link.
fn parse_lineage_token(summary: &str, prefix: &str) -> Option<ChangesetId> {
    let rest = summary.strip_prefix(prefix)?;
    let token = rest.split_whitespace().next()?;
    let id = token.strip_suffix(':')?;
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
mod tests;
