//! Direct-write value types: capabilities, status/denial/authority enums, and
//! the persisted record + outcome projections. Split from direct_write.rs; the
//! repository logic and step pipeline live in the sibling modules.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::super::apply::ApplyReceipt;
use super::super::approvals::ApprovalRequestRecord;
use super::super::model::{
    ActionEligibility, ActorRef, ApprovalId, ChangesetId, IdempotencyKey, ProposalId,
};

pub(super) const DIRECT_WRITE_RECORD_SCHEMA: &str = "authoring.direct_write_record.v1";
pub(super) const DIRECT_WRITE_CAPABILITIES_FILE: &str =
    ".vault/data/authoring-state/direct-write-capabilities.json";
pub(super) const COMMAND_IN_FLIGHT_TTL_MS: i64 = 60_000;
pub(super) const COMMAND_OUTCOME_TTL_MS: i64 = 24 * 3_600 * 1_000;

/// The direct-write feature gate. Direct-changeset is the SOLE editor-save
/// path (no legacy alternative remains), so `enabled` is a pure kill switch —
/// ON by default, overridable by hand-editing the capability file to `false`
/// (the same transition-era ops story the P49-R2 review banked as an advisory:
/// an admin route/setting seam should eventually own this).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteCapabilities {
    pub enabled: bool,
}

impl DirectWriteCapabilities {
    pub fn disabled() -> Self {
        Self { enabled: false }
    }

    pub fn enabled() -> Self {
        Self { enabled: true }
    }

    pub fn for_worktree(worktree_root: &Path) -> Self {
        let path = worktree_root.join(DIRECT_WRITE_CAPABILITIES_FILE);
        let Ok(raw) = fs::read_to_string(path) else {
            // No capability file: direct-changeset is authoritative by default.
            return Self::enabled();
        };
        // A present-but-unparseable file is an explicit admin artifact gone
        // stale — fail closed rather than silently reverting to the default.
        serde_json::from_str(&raw).unwrap_or_else(|_| Self::disabled())
    }

    #[cfg(test)]
    pub fn write_for_tests(worktree_root: &Path, capabilities: Self) {
        let path = worktree_root.join(DIRECT_WRITE_CAPABILITIES_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("direct-write capability parent exists");
        }
        fs::write(
            path,
            serde_json::to_string_pretty(&capabilities).expect("capabilities serialize"),
        )
        .expect("direct-write capabilities write");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectWriteStatus {
    Applied,
    Failed,
    InFlight,
    Conflict,
    Denied,
}

impl DirectWriteStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Applied => "applied",
            Self::Failed => "failed",
            Self::InFlight => "in_flight",
            Self::Conflict => "conflict",
            Self::Denied => "denied",
        }
    }
}

/// WHY a `Denied` direct-write outcome was refused, machine-readable (W05.P14)
/// — replaces the frontend's fragile substring match on `eligibility.reason`
/// text (a backend reason-WORDING change could silently break it). Set from a
/// STRUCTURED source at the SAME point the reason string is built — a
/// `ConflictKind` finding (via `apply::ApplyDenialKind`), or a classification
/// this module already knows by construction (the scope pin, the actor-kind
/// gate) — never by re-matching the reason text here either. Only meaningful
/// when `status == Denied`; every OTHER status carries `None`. A `Denied`
/// outcome ALWAYS carries `Some(_)` here, defaulting to `Other` rather than
/// omitting the field — the frontend can match on one concrete value, never
/// `null`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectWriteDenialKind {
    /// A `Rename`'s target stem, or a `CreateDocument`'s predicted path,
    /// already resolves to a (different) document
    /// (`ConflictKind::RenameTargetCollision` / `CreateDocumentPathCollision`).
    PathCollision,
    /// The target's base revision is behind the current worktree (an
    /// out-of-band edit landed since materialize) — reachable here only if a
    /// future reason-wording change stops matching the internal Conflict-vs-
    /// Denied routing's own (unchanged, still string-based) staleness check;
    /// today this case resolves to `DirectWriteStatus::Conflict` instead,
    /// with the richer `DirectWriteConflict` detail, before `denial_kind` is
    /// ever read.
    StaleBase,
    /// The scope pin (W02.P06) did not match the server's active workspace.
    ScopeMismatch,
    /// The actor is not human; direct editor saves require a human actor.
    ForbiddenActor,
    /// An automated actor was refused approving/applying its own proposal
    /// (`automated_self_approval_blocker`). Included for schema completeness
    /// and parity with the standard propose/approve route's own vocabulary;
    /// STRUCTURALLY UNREACHABLE via direct-write today, since the actor-kind
    /// gate above already requires a human actor before either the approval
    /// or apply stage runs, and the blocker only fires for an automated one.
    SelfApproval,
    /// A denial with no clean structured classification available (e.g. an
    /// approval-freshness refusal, a stale-validation-digest refusal, or any
    /// future denial reason this module has not been taught to classify).
    /// Honest, not a guess — never force-fit into one of the above.
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectWriteAuthority {
    DirectChangeset,
}

impl DirectWriteAuthority {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::DirectChangeset => "direct_changeset",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteConflict {
    pub document_ref: String,
    pub document_path: String,
    pub expected_blob_hash: String,
    pub actual_blob_hash: String,
    pub target_blob_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteRecord {
    pub schema_version: String,
    pub status: DirectWriteStatus,
    pub changeset_id: ChangesetId,
    pub proposal_id: ProposalId,
    pub approval_id: ApprovalId,
    pub document_ref: String,
    pub document_path: String,
    pub expected_blob_hash: String,
    pub target_blob_hash: String,
    pub actor: ActorRef,
    pub idempotency_key: IdempotencyKey,
    pub request_digest: String,
    pub authoritative_path: DirectWriteAuthority,
    pub direct_elapsed_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<DirectWriteConflict>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eligibility: Option<ActionEligibility>,
    /// The structured denial classification (W05.P14) — see
    /// [`DirectWriteDenialKind`]'s doc for the "always `Some` when `Denied`"
    /// discipline.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub denial_kind: Option<DirectWriteDenialKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<ApprovalRequestRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apply_receipt: Option<ApplyReceipt>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteOutcome {
    pub status: DirectWriteStatus,
    pub replayed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changeset_id: Option<ChangesetId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<ProposalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<ApprovalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<ApprovalRequestRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apply_receipt: Option<ApplyReceipt>,
    pub apply_replayed: bool,
    pub apply_in_flight: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<DirectWriteConflict>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eligibility: Option<ActionEligibility>,
    /// The structured denial classification (W05.P14) — see
    /// [`DirectWriteDenialKind`]'s doc for the "always `Some` when `Denied`"
    /// discipline.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub denial_kind: Option<DirectWriteDenialKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record: Option<DirectWriteRecord>,
}
