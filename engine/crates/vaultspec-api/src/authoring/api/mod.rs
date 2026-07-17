// W01.P04 defines versioned authoring DTOs and route fixtures. Later phases
// attach these shapes to handlers, stores, event streams, and agent tools.

use serde::{Deserialize, Serialize};
// `Value` is used only by the `#[cfg(test)]` DTOs below (the untyped list-page /
// snapshot fixtures); the typed DTOs carry concrete shapes (S18 narrowed the last
// production `Value` field, InterruptResumeRequest.decision, to a typed enum).
#[cfg(test)]
use serde_json::Value;

use super::leases::LeasePurpose;
use super::model::{
    ActorRef, ApprovalId, ChangesetId, CommandKind, DocumentRef, IdempotencyKey,
    ReviewDecisionKind, RevisionToken, SessionId,
};
use super::permissions::ToolPermissionDecisionKind;
use super::policy::OperationMode;
use super::sections::SectionSelector;

// Contract-test-only surface (the DTOs below are `#[cfg(test)]`; these imports
// serve them exclusively).
#[cfg(test)]
use super::model::{LeaseId, ReceiptRef, RunId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiVersion {
    V1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg(test)]
pub enum EndpointFamily {
    Session,
    Document,
    Proposal,
    Review,
    Apply,
    Rollback,
    Mode,
    DirectWrite,
    Lease,
    Stream,
    Recovery,
    ToolPermission,
    Interrupt,
    AgentToolExecute,
    Rebase,
    Replacement,
    ReviewClaim,
}

#[cfg(test)]
impl EndpointFamily {
    const ALL: &'static [Self] = &[
        Self::Session,
        Self::Document,
        Self::Proposal,
        Self::Review,
        Self::Apply,
        Self::Rollback,
        Self::Mode,
        Self::DirectWrite,
        Self::Lease,
        Self::Stream,
        Self::Recovery,
        Self::ToolPermission,
        Self::Interrupt,
        Self::AgentToolExecute,
        Self::Rebase,
        Self::Replacement,
        Self::ReviewClaim,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg(test)]
pub struct RouteFixture {
    pub family: EndpointFamily,
    pub method: &'static str,
    pub path_template: &'static str,
    pub command: Option<CommandKind>,
    pub mutating: bool,
    pub idempotency_required: bool,
    pub negative_contract_cases: &'static [&'static str],
}

#[cfg(test)]
pub const ROUTE_FIXTURES: &[RouteFixture] = &[
    RouteFixture {
        family: EndpointFamily::Session,
        method: "POST",
        path_template: "/authoring/v1/sessions",
        command: Some(CommandKind::CreateSession),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &["missing_idempotency_key", "unknown_field", "wrong_method"],
    },
    RouteFixture {
        family: EndpointFamily::Document,
        method: "GET",
        path_template: "/authoring/v1/documents/{document_ref}/snapshot",
        command: None,
        mutating: false,
        idempotency_required: false,
        negative_contract_cases: &["unknown_document_ref", "wrong_method"],
    },
    RouteFixture {
        family: EndpointFamily::Proposal,
        method: "POST",
        path_template: "/authoring/v1/proposals",
        command: Some(CommandKind::CreateProposal),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_base_revision",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Proposal,
        method: "POST",
        path_template: "/authoring/v1/proposals/{changeset_id}/submit",
        command: Some(CommandKind::SubmitForReview),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_expected_revision",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Proposal,
        method: "POST",
        path_template: "/authoring/v1/proposals/{changeset_id}/append",
        command: Some(CommandKind::AppendDraft),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_expected_revision",
            "path_body_changeset_mismatch",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Proposal,
        method: "POST",
        path_template: "/authoring/v1/proposals/{changeset_id}/replace",
        command: Some(CommandKind::ReplaceDraft),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_expected_revision",
            "path_body_changeset_mismatch",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Review,
        method: "POST",
        path_template: "/authoring/v1/reviews/{approval_id}/decisions",
        command: Some(CommandKind::Approve),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_review_revision",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Apply,
        method: "POST",
        path_template: "/authoring/v1/apply-requests",
        command: Some(CommandKind::RequestApply),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &["missing_idempotency_key", "stale_approval", "unknown_field"],
    },
    RouteFixture {
        family: EndpointFamily::Rollback,
        method: "POST",
        path_template: "/authoring/v1/rollback-proposals",
        command: Some(CommandKind::CreateRollback),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "rollback_unavailable",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Mode,
        method: "POST",
        path_template: "/authoring/v1/mode",
        command: Some(CommandKind::SetOperationMode),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &["missing_idempotency_key", "unknown_field"],
    },
    RouteFixture {
        family: EndpointFamily::DirectWrite,
        method: "POST",
        path_template: "/authoring/v1/direct-writes",
        command: Some(CommandKind::DirectWrite),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_base_revision",
            "agent_self_approval",
            "unknown_field",
        ],
    },
    RouteFixture {
        family: EndpointFamily::Lease,
        method: "POST",
        path_template: "/authoring/v1/leases",
        command: Some(CommandKind::AcquireLease),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &["missing_idempotency_key", "lease_conflict", "unknown_field"],
    },
    RouteFixture {
        family: EndpointFamily::Stream,
        method: "GET",
        path_template: "/authoring/v1/events",
        command: Some(CommandKind::SubscribeEvents),
        mutating: false,
        idempotency_required: false,
        negative_contract_cases: &["bad_last_seq", "wrong_method"],
    },
    RouteFixture {
        family: EndpointFamily::Recovery,
        method: "GET",
        path_template: "/authoring/v1/recovery",
        command: Some(CommandKind::RecoverEventStream),
        mutating: false,
        idempotency_required: false,
        negative_contract_cases: &["bad_last_seq", "unknown_session"],
    },
    // W12.P41 A2: the human decision on a queued tool-permission request.
    RouteFixture {
        family: EndpointFamily::ToolPermission,
        method: "POST",
        path_template: "/authoring/v1/agent-tools/{tool_call_id}/permission-decision",
        command: Some(CommandKind::RequestToolPermission),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "unknown_tool_call",
            "unknown_field",
        ],
    },
    // W12.P41 A2: resume a paused run by resolving its interrupt (P32, replay-safe).
    RouteFixture {
        family: EndpointFamily::Interrupt,
        method: "POST",
        path_template: "/authoring/v1/interrupts/{interrupt_id}/resume",
        command: Some(CommandKind::ResumeRun),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "unknown_interrupt",
            "unknown_field",
        ],
    },
    // W12.P41 A3b: the agent-tool executor run loop — a semantic tool call resolves
    // through the P22/P32 gate and, when granted, dispatches to the mapped backend
    // command (here `create_proposal`, the `propose_changeset`/create alias).
    RouteFixture {
        family: EndpointFamily::AgentToolExecute,
        method: "POST",
        path_template: "/authoring/v1/runs/{run_id}/agent-tools/execute",
        command: Some(CommandKind::CreateProposal),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &["missing_idempotency_key", "unknown_tool", "unknown_field"],
    },
    // W14.P42a S260: explicit rebase of a conflicted changeset in place (P28).
    RouteFixture {
        family: EndpointFamily::Rebase,
        method: "POST",
        path_template: "/authoring/v1/proposals/{changeset_id}/rebase",
        command: Some(CommandKind::Rebase),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_expected_revision",
            "path_body_changeset_mismatch",
            "unknown_field",
        ],
    },
    // W14.P42a S260: supersede a stale-but-not-conflicted source with a fresh candidate (P28).
    RouteFixture {
        family: EndpointFamily::Replacement,
        method: "POST",
        path_template: "/authoring/v1/replacement-proposals",
        command: Some(CommandKind::Supersede),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "stale_source_revision",
            "unknown_field",
        ],
    },
    // W14.P42a S261: advisory review-station claim (P24). The claim route represents the
    // family; release/respond share it (mounted, floor-authorized) like the lease actions.
    RouteFixture {
        family: EndpointFamily::ReviewClaim,
        method: "POST",
        path_template: "/authoring/v1/review-claims",
        command: Some(CommandKind::ClaimReview),
        mutating: true,
        idempotency_required: true,
        negative_contract_cases: &[
            "missing_idempotency_key",
            "claim_contended",
            "unknown_field",
        ],
    },
];

/// The wire envelope for a mutating authoring command. It carries NO actor
/// (ASA-010, security-provenance ADR): a client-supplied actor would make
/// `kind:Human` claimable and the automated-self-approval ban cosmetic. Actor
/// identity resolves ONLY from the server-held principal seam (the per-principal
/// actor token → the principal-resolution middleware → `ResolvedCommand`), so the
/// wire type simply has no `actor` field — `deny_unknown_fields` then rejects any
/// client that still sends one with a loud typed 4xx (a compile-time + wire-time
/// fence, not per-route vigilance).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelope<T> {
    pub api_version: ApiVersion,
    pub command: CommandKind,
    pub idempotency_key: IdempotencyKey,
    pub payload: T,
}

#[cfg(test)]
impl<T> CommandEnvelope<T> {
    fn new(command: CommandKind, idempotency_key: IdempotencyKey, payload: T) -> Self {
        Self {
            api_version: ApiVersion::V1,
            command,
            idempotency_key,
            payload,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct ReadEnvelope<T> {
    pub api_version: ApiVersion,
    pub payload: T,
}

#[cfg(test)]
impl<T> ReadEnvelope<T> {
    fn new(payload: T) -> Self {
        Self {
            api_version: ApiVersion::V1,
            payload,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionRequest {
    pub scope: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartPromptTurnRequest {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// The immutable feedback batch this turn consumes (agent-wire-gaps ADR D7 /
    /// feedback-loop ADR D4). Verified at submit: the batch must exist and belong
    /// to this session; the reference is recorded on the turn so every revision is
    /// auditable to the exact batch it consumed. Opaque to a2a — only the id rides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_batch_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancelRunRequest {
    pub reason: String,
}

/// The terminal outcome a run driver reports through `complete` (D1). The bounded
/// two-token vocabulary rides inside the existing `RunStatus`, so one command and one
/// `run.completed` event cover both arms. An absent `outcome` on the wire means
/// `Completed`, preserving the shipped callers that predate this field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    #[default]
    Completed,
    Failed,
}

/// Settle an active run into its terminal state (D1). The `outcome` names `completed`
/// or `failed` (absent means `completed`, preserving the shipped callers); a `failed`
/// outcome may carry a `failure_reason` (validated like the cancel reason) that the
/// run record and the `run.completed` event carry, while a `completed` outcome must
/// carry none. Unlike a cancel it leaves the owning session `Active` so further turns
/// may follow. The optional `summary` is a human-facing note the event carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompleteRunRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<RunOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
}

/// Explicitly terminate a whole session (D2), cancelling its active run if one exists
/// and voiding any queued turns. Distinct from `CancelRunRequest`, which since D2 is
/// run-scoped and leaves the session `Active`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancelSessionRequest {
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResumeRunRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct DocumentSnapshotRequest {
    pub document: DocumentRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<DocumentChunkRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct DocumentChunkRequest {
    pub offset: u64,
    pub limit: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProposalRequest {
    pub session_id: SessionId,
    pub changeset_id: ChangesetId,
    pub summary: String,
    pub operations: Vec<ChangesetChildOperationDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetChildOperationDraft {
    pub child_key: String,
    pub operation: ChangesetOperationKind,
    pub target: TargetRevisionFence,
    pub draft: DraftMutation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangesetOperationKind {
    CreateDocument,
    ReplaceBody,
    AppendBody,
    EditFrontmatter,
    Rename,
    Archive,
    Unarchive,
    Link,
    SectionEdit,
    SetPlanStepState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetRevisionFence {
    pub document: DocumentRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<RevisionToken>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftMutation {
    pub mode: DraftMode,
    pub body: String,
    /// The field-level payload for `EditFrontmatter` (W02.P03): the `date`/`tags`/
    /// `related` values the `SetFrontmatter` core capability accepts, edited
    /// individually rather than by reconstructing the whole document text.
    /// `None`/absent for every other operation kind; `body` carries no meaning for
    /// a field-level edit and must be empty (R1: no accepted-but-ignored field).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontmatter: Option<FrontmatterEditFields>,
    /// The field-level payload for `Rename` (W02.P04): the target stem the
    /// `Rename` core capability accepts (`--to`). A bare, identity-bearing stem
    /// — never a path. `None`/absent for every other operation kind; `body`
    /// carries no meaning for a rename and must be empty (R1 discipline, same
    /// as `frontmatter`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_stem: Option<String>,
    /// The field-level payload for `SectionEdit` (section-scoped-operations
    /// ADR): the selector (structural anchor, base-relative range hint,
    /// expected selected-content hash) the resolver exact-resolves against the
    /// base body before splicing `body` — the NEW section content, reused
    /// exactly as `ReplaceBody` reuses `body` for whole-document content —
    /// into the resolved range. `None`/absent for every other operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section_selector: Option<super::sections::SectionSelector>,
    /// The field-level payload for `SetPlanStepState` (authoring-surface ADR
    /// D1): the canonical step id + desired open/closed state the `check` /
    /// `uncheck` plan CLI verb carries. `None`/absent for every other operation
    /// kind; `body` carries no meaning for a plan tick and must be empty (R1
    /// discipline, same as `frontmatter`/`new_stem`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_step: Option<PlanStepEdit>,
}

/// The `SetPlanStepState` field-level payload (authoring-surface ADR D1): the
/// canonical step id (`S##`) and the desired open/closed state. The plan CLI
/// verb is idempotent, so re-requesting the state a Step already holds is a
/// no-op, not an error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanStepEdit {
    pub step_id: String,
    pub state: PlanStepState,
}

/// The desired state of a plan Step's checkbox. `Checked` closes the Step
/// (`vault plan step check`), `Unchecked` re-opens it (`vault plan step
/// uncheck`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepState {
    Checked,
    Unchecked,
}

impl PlanStepState {
    /// Whether the desired state closes the Step — the `check` (`true`) vs
    /// `uncheck` (`false`) selector the core capability builder takes.
    pub fn is_checked(self) -> bool {
        matches!(self, PlanStepState::Checked)
    }
}

/// The `EditFrontmatter` field-level payload: exactly the fields the
/// `SetFrontmatter` core capability supports (`--date`, `--tags`, `--related`).
/// Each field is edited only when present; an absent field is left untouched by
/// both the materialized preview and the apply-time core write.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FrontmatterEditFields {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related: Option<Vec<String>>,
}

impl FrontmatterEditFields {
    pub fn is_empty(&self) -> bool {
        self.date.is_none() && self.tags.is_none() && self.related.is_none()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftMode {
    WholeDocument,
    Append,
    SectionScoped,
}

/// Wire payload for `POST /authoring/v1/proposals/{changeset_id}/submit`: move a
/// drafted proposal into review. The route COMPOSES the validation pass and the
/// approval-request opening SERVER-SIDE (neither is a separate wire verb), so the
/// client sends only the revision fence it last saw and the review summary; the
/// changeset id travels in the path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SubmitForReviewRequest {
    pub expected_revision: RevisionToken,
    pub summary: String,
}

/// Wire payload for `POST /authoring/v1/actor-tokens` — the machine-bearer-gated
/// bootstrap seam that mints a per-principal actor token. It names the actor to
/// provision (registered active so its commands do not 403 on `ensure_active`) and
/// an optional lifetime (clamped bounded by the issue path). This is NOT a
/// collaborator command family, so it carries no idempotency envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IssueActorTokenRequest {
    pub actor: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifetime_ms: Option<u64>,
}

/// Wire payload for `POST /authoring/v1/mode`: set the active worktree's
/// operation mode. The scope is backend-derived from the active worktree rather
/// than client-claimed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetOperationModeRequest {
    pub mode: OperationMode,
}

/// Wire payload for `POST /authoring/v1/direct-writes`: a human editor save
/// routed through the authoring ledger. The actor is still middleware-resolved
/// from the principal token; the payload names the target, the operation
/// kind, and that kind's own payload (W02.P06 generalizes this beyond
/// whole-document body replacement) — mirroring how a propose draft
/// (`ChangesetChildOperationDraft`/`DraftMutation`) carries each kind: one
/// discriminator field plus optional per-kind payload fields, `None`/empty for
/// every kind that does not use them (no accepted-but-ignored field, the same
/// R1 discipline the propose draft enforces).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteRequest {
    /// The existing document targeted by `ReplaceBody`/`EditFrontmatter`/
    /// `Rename`. Absent for `CreateDocument`, which names its target through
    /// `create` instead (there is no existing document to reference).
    #[serde(rename = "ref", default, skip_serializing_if = "Option::is_none")]
    pub doc_ref: Option<String>,
    pub operation: ChangesetOperationKind,
    /// `ReplaceBody` payload. Empty for every other kind.
    #[serde(default)]
    pub body: String,
    /// `EditFrontmatter` payload. `None` for every other kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontmatter: Option<FrontmatterEditFields>,
    /// `Rename` payload — the target stem. `None` for every other kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_stem: Option<String>,
    /// `CreateDocument` payload. `None` for every other kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create: Option<DirectWriteCreateParams>,
    /// `SetPlanStepState` payload — the canonical step id + desired state
    /// (authoring-surface ADR D1). `None` for every other kind. The plan
    /// document is named by `ref`, and `expected_blob_hash` fences it (the
    /// engine-side stale-base substitute for the plan CLI's absent
    /// expected-blob-hash flag).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_step: Option<PlanStepEdit>,
    /// The optimistic editor base for an existing-document operation —
    /// required for `ReplaceBody`/`EditFrontmatter`/`Rename`, absent for
    /// `CreateDocument` (nothing exists yet to fence against).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_blob_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// The OPTIONAL scope pin (W02.P06, closing the W01.P02 review): the
    /// workspace scope id (`scope_id_for_worktree`, the SAME string a client
    /// already sees served back on e.g. the `/authoring/v1/mode` response)
    /// the editor was looking at when it issued this save. When present, it
    /// MUST match the server's CURRENT active workspace or the save is
    /// refused as a denial value — never silently applied against a
    /// different worktree after a scope-switch race. Absent proceeds against
    /// whatever is currently active (backward-compatible; restores the
    /// retired legacy `/ops/core` write's scope immunity).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// `CreateDocument`'s direct-write payload: the typed create params a human
/// editor's "new document" save supplies, mirroring `DocumentRef::
/// ProvisionalCreate`'s own fields (minus the server-assigned
/// `provisional_doc_id`/`collision_status`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteCreateParams {
    pub doc_type: String,
    pub feature: String,
    pub title: String,
    #[serde(default)]
    pub related: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecisionRequest {
    pub proposal_id: super::model::ProposalId,
    pub approval_id: ApprovalId,
    pub decision: ReviewDecisionKind,
    pub reviewed_revision: RevisionToken,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// V1 apply names only the changeset + the approval it applies. The approved
/// per-child targets are re-derived from the applied record and re-fenced by the
/// core write, so no client-supplied `targets` block exists (R1: an accepted-but-
/// ignored field is a contract lie).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyRequest {
    pub changeset_id: ChangesetId,
    pub approval_id: ApprovalId,
    /// The ADVISORY fencing token (W13.P26) the applying actor presents. Optional and
    /// CONSUMED (not an accepted-but-ignored field): the apply preflight enforces it only
    /// when a live lease holds the target document's scope — a stale or absent token
    /// against a live lease is refused as a denial value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fencing_token: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackRequest {
    pub source_changeset_id: ChangesetId,
    pub source_children: Vec<RollbackChildSource>,
    pub reason: String,
}

/// A named source child to roll back. The operation kind + revision fence are
/// AUTHORITATIVE from the applied source record, so the client names only the child
/// key (R1: no accepted-but-ignored `target`/`materialized_revision`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackChildSource {
    pub source_child_key: String,
}

/// Acquire (or re-acquire) an advisory lease on a target document's scope. The server
/// derives the per-document lease scope from the active workspace + the target's node id
/// (the P27 `document_lease_scope` convention), so acquire and apply-time fencing agree on
/// the fenced scope. The holder is the middleware-resolved principal, never a body claim;
/// the fencing token is issued server-side and returned in the response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseAcquireRequest {
    pub target: DocumentRef,
    pub purpose: LeasePurpose,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttl_ms: Option<u64>,
}

/// Renew a live advisory lease's TTL window (owner-only; the fencing token is unchanged).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseRenewRequest {
    pub target: DocumentRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttl_ms: Option<u64>,
}

/// Release a live advisory lease (owner-only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseReleaseRequest {
    pub target: DocumentRef,
}

/// Create a section-anchored comment on a document (authoring-surface ADR D2). The
/// document node id is the route path param; the worktree path is derived server-side
/// from it through the confined `DocumentResolver` (never a client-supplied path).
/// `selector` is the heading-section anchor + expected content hash the client
/// computes from the live section; `body` is the comment text (size-capped
/// engine-side). The author is the middleware-resolved principal, never a body claim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateCommentRequest {
    pub selector: SectionSelector,
    pub body: String,
}

/// Freeze the reviewer's chosen comments into an immutable, digest-addressed
/// feedback batch (agent-wire-gaps ADR D7 / feedback-loop ADR D3+D4). The author
/// is the middleware-resolved principal; the served receipt is
/// `{batch_id, digest}` and the next turn carries `batch_id` as opaque data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateFeedbackBatchRequest {
    pub session_id: SessionId,
    pub source_document: String,
    pub source_revision: String,
    pub items: Vec<super::feedback::FeedbackBatchItem>,
    #[serde(default)]
    pub instruction: Option<String>,
}

/// Mutate an existing comment (authoring-surface ADR D2): edit the body, toggle the
/// resolved flag, or explicitly re-anchor to the current section state. Exactly one
/// tagged operation per PATCH — re-anchor is never a silent side effect of a read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommentUpdateRequest {
    EditBody { body: String },
    SetResolved { resolved: bool },
    Reanchor { selector: SectionSelector },
}

/// Delete a comment. Carries no payload fields; the command envelope supplies the
/// actor token and idempotency key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct DeleteCommentRequest {}

/// Claim (or idempotently re-claim) a changeset's advisory review item (W13.P24). The
/// claim purpose is always `review` (set server-side); the reviewer is the middleware-
/// resolved principal. A contended claim (a live claim by a different reviewer) rides the
/// 200 envelope as a denial value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewClaimRequest {
    pub changeset_id: ChangesetId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttl_ms: Option<u64>,
}

/// Release a held review claim (holder-only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewReleaseRequest {
    pub changeset_id: ChangesetId,
}

/// Record a clarification response on a held review item (holder-only; status-preserving —
/// the item stays `claimed` while the exchange runs).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewRespondRequest {
    pub changeset_id: ChangesetId,
    pub comment: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct StreamSubscribeRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seq: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct RecoveryRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<RunId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seq: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
#[cfg(test)]
pub enum AggregateRef {
    Session {
        session_id: SessionId,
    },
    Document {
        document: DocumentRef,
    },
    Changeset {
        changeset_id: ChangesetId,
    },
    Proposal {
        proposal_id: super::model::ProposalId,
    },
    Approval {
        approval_id: ApprovalId,
    },
    OperationMode {
        scope_id: String,
    },
    Lease {
        lease_id: LeaseId,
    },
    Stream {
        latest_seq: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg(test)]
pub enum CommandReceiptStatus {
    Accepted,
    Replayed,
    InFlight,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct CommandReceiptDto {
    pub api_version: ApiVersion,
    pub status: CommandReceiptStatus,
    pub aggregate: AggregateRef,
    pub receipt: ReceiptRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct ListPageDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub items: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct SnapshotDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub aggregate: AggregateRef,
    pub latest_outbox_seq: u64,
    pub snapshot: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct TypedErrorDto {
    pub api_version: ApiVersion,
    pub error_kind: String,
    pub error: String,
    pub status: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct DegradedSnapshotDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub unavailable_tier: String,
    pub reason: String,
    pub snapshot: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg(test)]
pub enum AuthoringEventKind {
    SessionCreated,
    ProposalUpdated,
    ValidationUpdated,
    ApprovalResolved,
    ApplyRecorded,
    RollbackCreated,
    LeaseUpdated,
    RecoverySnapshotServed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg(test)]
pub struct AuthoringEventDto {
    pub schema_version: ApiVersion,
    pub seq: u64,
    pub event: AuthoringEventKind,
    pub aggregate: AggregateRef,
    pub actor: ActorRef,
    pub timestamp_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<IdempotencyKey>,
    pub payload: Value,
}

/// The human decision on a queued tool-permission request (W12.P41). The reviewer is
/// the server-held principal (ASA-010), never a body claim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolPermissionDecisionRequest {
    pub decision: ToolPermissionDecisionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// Resume a paused run by resolving its interrupt with the typed decision schema
/// (W12.P41, P32 resolve-by-id — replay-safe; narrowed from an opaque `Value` by
/// agent-wire-gaps S18). The decision is the SAME [`InterruptResumeDecision`] the read
/// projection parses, so write and read speak one language (`tool_permission` | `steer`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterruptResumeRequest {
    pub decision: super::interrupts::InterruptResumeDecision,
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
pub(crate) use fixtures::*;

#[cfg(test)]
mod tests;
