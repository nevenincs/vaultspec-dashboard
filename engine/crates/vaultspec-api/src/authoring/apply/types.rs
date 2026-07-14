//! Apply-stage value types: the error/request/receipt/outcome shapes and the
//! conflict-kind classifier. Split from apply.rs; the orchestrator + helpers
//! live in the sibling modules.

use serde::{Deserialize, Serialize};

use super::super::model::{
    ActionEligibility, ActorRef, ApplyState, ChangesetId, IdempotencyKey, ProposalId, RevisionToken,
};
use super::super::store::StoreError;

pub(super) const RECEIPT_SCHEMA: &str = "authoring.apply_receipt.v1";
/// In-flight reservation TTL: a crashed apply between preflight and completion
/// leaves an `Applying` revision + an in-flight reservation. Within this window a
/// retry replays the same in-flight attempt (never a second apply); past it the
/// reservation is reclaimable so a genuinely dead attempt does not wedge forever.
pub(super) const IN_FLIGHT_TTL_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, thiserror::Error)]
pub enum ApplyError {
    #[error("changeset `{0}` has no ledger revision to apply")]
    NotFound(String),
    #[error(
        "approved changeset `{changeset_id}` child `{child_key}` has no materialized operation"
    )]
    MissingMaterialization {
        changeset_id: String,
        child_key: String,
    },
    #[error("apply idempotency key conflicts with a different recorded request")]
    Conflict,
    #[error("apply invariant violated: {0}")]
    Internal(String),
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

pub type Result<T> = std::result::Result<T, ApplyError>;

/// The applying actor's request. `proposal_id` locates the approval record;
/// `changeset_id` locates the ledger aggregate; both are supplied by the caller
/// (the route/tool), which holds them from the approval snapshot.
#[derive(Debug, Clone)]
pub struct ApplyRequest<'a> {
    pub changeset_id: &'a ChangesetId,
    pub proposal_id: &'a ProposalId,
    pub actor: &'a ActorRef,
    pub idempotency_key: &'a IdempotencyKey,
    /// The ADVISORY fencing token (W13.P26) the applying actor presents. Enforced ONLY
    /// when a live lease holds the target document's scope: a `None` or stale token against
    /// a live lease is refused as a denial value; with no live lease the apply proceeds.
    pub fencing_token: Option<i64>,
    pub now_ms: i64,
}

/// Whether a child materialized (`Applied`) or not (`Failed`). V1 is single-child,
/// so the changeset outcome equals its one child's outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyChildOutcome {
    Applied,
    Failed,
}

/// The durable per-child apply receipt. This is the audit-mandatory record of a
/// materialization attempt: what was written, the observed post-state, and the
/// core envelope forensics (status + schema string). It is persisted as the
/// idempotency [`RecordedOutcome`] payload and replayed verbatim on retry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyReceipt {
    pub schema_version: String,
    pub receipt_id: String,
    pub changeset_id: ChangesetId,
    /// The approved revision that was materialized.
    pub source_revision: RevisionToken,
    /// The `Applied`/`Failed` completion revision appended by this apply.
    pub result_revision: RevisionToken,
    pub state: ApplyState,
    pub child: ApplyChildReceipt,
    pub actor: ActorRef,
    pub idempotency_key: String,
    pub applied_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyChildReceipt {
    pub child_key: String,
    pub document_path: String,
    pub outcome: ApplyChildOutcome,
    /// The base blob the write was fenced against (`--expected-blob-hash`).
    pub base_blob_hash: String,
    /// The blob the materialized target should produce.
    pub expected_result_blob_hash: String,
    /// The document's blob hash observed after the attempt (post-state), when it
    /// could be read. `None` when the post-state was unreadable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_result_blob_hash: Option<String>,
    /// The core envelope `status`, when the core returned one (`None` on a kill).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_status: Option<String>,
    /// The core envelope `schema` string, retained for drift forensics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_schema: Option<String>,
    /// True when the outcome was resolved by post-state re-verification after an
    /// OUTCOME-INDETERMINATE adapter kill (Timeout / OutputTooLarge).
    pub resolved_via_post_verify: bool,
    /// A REDACTED failure category (never raw stderr/body/paths), when failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
    /// The created document's stable node id (W03.P09a) — `Some` only for a
    /// successfully-applied `CreateDocument` child (`None` for every other
    /// kind/outcome; `document_path` above already names an existing-doc
    /// kind's target, and a not-landed create has no identity to report).
    /// Lets a consumer (the direct-write outcome's frontend auto-open
    /// restore) resolve the new document without re-deriving its predicted
    /// path client-side — the SAME identity `PostVerifyExpectation::
    /// CreatedAt` already confirmed to recognize `Applied`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_node_id: Option<String>,
    /// The created document's stem, alongside `result_node_id`. Same
    /// `None`-for-every-other-case rule.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_stem: Option<String>,
}

/// WHY an apply-preflight denied, when structurally known (W05.P14) — set at
/// the SAME point the `ActionEligibility` reason string is built, from the
/// SAME structured source (a `ConflictKind` finding, or the self-approval
/// blocker), never derived by matching the reason text afterward. `None`
/// (every OTHER preflight denial: multi-child, transition-ineligible,
/// unsupported operation kind, stale fencing token) is an honest
/// "unclassified" — a caller collapses it to its own generic/`other` value,
/// never a guess.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ApplyDenialKind {
    /// `ConflictKind::RenameTargetCollision` / `CreateDocumentPathCollision`.
    PathCollision,
    /// `ConflictKind::StaleBaseRevision` / `StaleWholeDocumentDraft` /
    /// `SectionSelectorUnresolved`.
    StaleBase,
    /// The automated-self-approval blocker (`automated_self_approval_blocker`)
    /// refused an automated actor applying its own (or a delegated) proposal.
    SelfApproval,
}

/// The two `ConflictKind` classes a caller needs to distinguish structurally
/// (W05.P14); every other `ConflictKind` (`OverlappingHunks`, `AnchorDrift`,
/// `PolicyConflict` — none of which the apply preflight's EMPTY-lease
/// `detect_conflicts` call can even produce for `PolicyConflict`) is honestly
/// unclassified here, not force-fit into one of these two.
pub(super) fn classify_conflict_kind(
    kind: super::super::conflicts::ConflictKind,
) -> Option<ApplyDenialKind> {
    use super::super::conflicts::ConflictKind;
    match kind {
        ConflictKind::RenameTargetCollision | ConflictKind::CreateDocumentPathCollision => {
            Some(ApplyDenialKind::PathCollision)
        }
        ConflictKind::StaleBaseRevision
        | ConflictKind::StaleWholeDocumentDraft
        | ConflictKind::SectionSelectorUnresolved => Some(ApplyDenialKind::StaleBase),
        ConflictKind::OverlappingHunks
        | ConflictKind::AnchorDrift
        | ConflictKind::PolicyConflict => None,
    }
}

/// The command outcome. A policy denial carries `eligibility.denied` and no
/// receipt; a completed attempt (success OR recorded failure) carries a receipt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyOutcome {
    pub eligibility: ActionEligibility,
    pub receipt: Option<ApplyReceipt>,
    /// True when this call replayed an already-recorded receipt (idempotency).
    pub replayed: bool,
    /// True when a prior attempt for this key is still in flight (continue, do not
    /// re-apply).
    pub in_flight: bool,
    /// The structured reason a `Preflight::Denied` fired, when known (W05.P14).
    /// `None` for every non-denial outcome and for an unclassified denial.
    pub(crate) denial_kind: Option<ApplyDenialKind>,
}

impl ApplyReceipt {
    pub(super) fn is_applied(&self) -> bool {
        matches!(self.state, ApplyState::Applied)
    }
}
