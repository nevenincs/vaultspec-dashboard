// W01.P03 is the vocabulary definition phase. Downstream W01.P04+ phases wire
// these types into DTOs, command handlers, stores, and frontend fixtures.
#![allow(dead_code)]

use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoringModelError {
    field: &'static str,
    value: String,
    reason: &'static str,
}

impl AuthoringModelError {
    fn new(field: &'static str, value: &str, reason: &'static str) -> Self {
        Self {
            field,
            value: value.to_string(),
            reason,
        }
    }
}

impl fmt::Display for AuthoringModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} `{}` is invalid: {}",
            self.field, self.value, self.reason
        )
    }
}

impl std::error::Error for AuthoringModelError {}

pub(crate) fn validate_authoring_token(
    field: &'static str,
    value: &str,
) -> Result<String, AuthoringModelError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AuthoringModelError::new(field, value, "must not be empty"));
    }
    if trimmed.len() > 160 {
        return Err(AuthoringModelError::new(
            field,
            value,
            "must be at most 160 bytes",
        ));
    }
    if trimmed != value {
        return Err(AuthoringModelError::new(
            field,
            value,
            "must not carry surrounding whitespace",
        ));
    }
    if !trimmed
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b':' | b'.' | b'/'))
    {
        return Err(AuthoringModelError::new(
            field,
            value,
            "must contain only ascii letters, digits, '_', '-', ':', '.', or '/'",
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_token(field: &'static str, value: &str) -> Result<String, AuthoringModelError> {
    validate_authoring_token(field, value)
}

macro_rules! id_type {
    ($name:ident, $field:literal) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            #[allow(dead_code)]
            pub fn new(value: impl AsRef<str>) -> Result<Self, AuthoringModelError> {
                validate_token($field, value.as_ref()).map(Self)
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl TryFrom<String> for $name {
            type Error = AuthoringModelError;

            fn try_from(value: String) -> Result<Self, Self::Error> {
                Self::new(value)
            }
        }

        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

id_type!(ActorId, "actor_id");
id_type!(ChangesetId, "changeset_id");
id_type!(SessionId, "session_id");
id_type!(RunId, "run_id");
id_type!(ProposalId, "proposal_id");
id_type!(ApprovalId, "approval_id");
id_type!(LeaseId, "lease_id");
id_type!(CommentId, "comment_id");
id_type!(ReceiptId, "receipt_id");
id_type!(IdempotencyKey, "idempotency_key");
id_type!(RevisionToken, "revision_token");
id_type!(ToolCallId, "tool_call_id");
id_type!(InterruptId, "interrupt_id");
id_type!(LangGraphThreadId, "langgraph_thread_id");
id_type!(LangGraphRunId, "langgraph_run_id");
id_type!(LangGraphCheckpointId, "langgraph_checkpoint_id");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorKind {
    Human,
    Agent,
    System,
    ToolExecutor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorRef {
    pub id: ActorId,
    pub kind: ActorKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delegated_by: Option<ActorId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProvisionalCollisionStatus {
    Unknown,
    Available,
    Conflicting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DocumentRef {
    Existing {
        scope: String,
        node_id: String,
        stem: String,
        path: String,
        doc_type: String,
        base_revision: RevisionToken,
    },
    ProvisionalCreate {
        provisional_doc_id: String,
        doc_type: String,
        feature: String,
        title: String,
        collision_status: ProvisionalCollisionStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        proposed_stem: Option<String>,
    },
    RenameTarget {
        source: Box<DocumentRef>,
        proposed_stem: String,
        proposed_node_id: String,
    },
    MaterializedResult {
        reviewed: Box<DocumentRef>,
        result_node_id: String,
        result_path: String,
        result_revision: RevisionToken,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandKind {
    CreateSession,
    StartPromptTurn,
    CancelRun,
    ResumeRun,
    CreateProposal,
    CancelProposal,
    AppendDraft,
    ReplaceDraft,
    ValidateProposal,
    SubmitForReview,
    ClaimReview,
    ReleaseReview,
    Approve,
    Reject,
    EditProposal,
    Respond,
    Rebase,
    Supersede,
    AcquireLease,
    RenewLease,
    ReleaseLease,
    RequestApply,
    CreateRollback,
    SetOperationMode,
    DirectWrite,
    MapLangGraphRuntime,
    RequestToolPermission,
    CreateComment,
    UpdateComment,
    DeleteComment,
    ReadContext,
    SearchGraph,
    SubscribeEvents,
    RecoverEventStream,
}

impl CommandKind {
    pub(crate) const ALL: &'static [Self] = &[
        Self::CreateSession,
        Self::StartPromptTurn,
        Self::CancelRun,
        Self::ResumeRun,
        Self::CreateProposal,
        Self::CancelProposal,
        Self::AppendDraft,
        Self::ReplaceDraft,
        Self::ValidateProposal,
        Self::SubmitForReview,
        Self::ClaimReview,
        Self::ReleaseReview,
        Self::Approve,
        Self::Reject,
        Self::EditProposal,
        Self::Respond,
        Self::Rebase,
        Self::Supersede,
        Self::AcquireLease,
        Self::RenewLease,
        Self::ReleaseLease,
        Self::RequestApply,
        Self::CreateRollback,
        Self::SetOperationMode,
        Self::DirectWrite,
        Self::MapLangGraphRuntime,
        Self::RequestToolPermission,
        Self::CreateComment,
        Self::UpdateComment,
        Self::DeleteComment,
        Self::ReadContext,
        Self::SearchGraph,
        Self::SubscribeEvents,
        Self::RecoverEventStream,
    ];

    pub fn requires_unit_of_work(self) -> bool {
        !matches!(
            self,
            Self::ReadContext
                | Self::SearchGraph
                | Self::SubscribeEvents
                | Self::RecoverEventStream
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangesetKind {
    Authoring,
    /// A human editor's direct save (operation-modes ADR `kind=direct`): a
    /// self-approved changeset that traverses the SAME lifecycle as `Authoring`
    /// (propose → review → approve → apply) — so it is "authoring-like" everywhere
    /// the lifecycle vocabulary is applied. The KIND is what makes the ledger
    /// self-describing about a direct save; it never forks the lifecycle.
    Direct,
    Rollback,
}

impl ChangesetKind {
    /// Whether this kind follows the standard authoring lifecycle BEHAVIOUR. `Direct`
    /// is authoring-like (a self-approved authoring save that traverses the same
    /// states); `Rollback` is not (it is a `RollbackProposed`-rooted inverse
    /// changeset). Centralizes the `Authoring | Direct` behaviour so a new
    /// authoring-like kind never silently mis-behaves in a scattered `== Authoring`
    /// comparison (P49-R2).
    ///
    /// USE PER-SITE (arch-reviewer P49-R2 bar). A `ChangesetKind` comparison falls in
    /// one of THREE semantic classes — decide each consciously, do NOT blanket-swap:
    /// - **authoring-like BEHAVIOUR** (transitions, apply, rollback-source eligibility,
    ///   risk classification): use `is_authoring_like()` — `Direct` MATCHES.
    /// - **is `Authoring` SPECIFICALLY** (provenance identity — "was this an agent
    ///   proposal, not a human direct save"): keep `== ChangesetKind::Authoring` —
    ///   `Direct` must NOT match.
    /// - **is NOT `Rollback`** (a different question): keep the `== Rollback` check —
    ///   `Direct` naturally takes the non-rollback path.
    pub fn is_authoring_like(self) -> bool {
        matches!(self, Self::Authoring | Self::Direct)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangesetStatus {
    Draft,
    Generating,
    Proposed,
    NeedsReview,
    Approved,
    Applying,
    Applied,
    PartiallyApplied,
    CompensationRequired,
    Rejected,
    Conflicted,
    Superseded,
    Failed,
    RollbackProposed,
    Cancelled,
}

impl ChangesetStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Applied | Self::Rejected | Self::Superseded | Self::Failed | Self::Cancelled
        )
    }

    pub fn is_review_request_status_candidate(self) -> bool {
        matches!(self, Self::Draft | Self::Proposed)
    }

    pub fn is_apply_request_status_candidate(self) -> bool {
        matches!(self, Self::Approved)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecisionKind {
    Approve,
    Reject,
    Edit,
    Respond,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyState {
    NotRequested,
    Requested,
    Running,
    Applied,
    PartiallyApplied,
    CompensationRequired,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReceiptRef {
    pub id: ReceiptId,
    pub command: CommandKind,
    pub actor: ActorRef,
    pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LangGraphRef {
    pub thread_id: LangGraphThreadId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<LangGraphRunId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint_id: Option<LangGraphCheckpointId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionEligibility {
    pub command: CommandKind,
    pub allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl ActionEligibility {
    pub fn allowed(command: CommandKind) -> Self {
        Self {
            command,
            allowed: true,
            reason: None,
        }
    }

    pub fn denied(command: CommandKind, reason: impl Into<String>) -> Self {
        Self {
            command,
            allowed: false,
            reason: Some(reason.into()),
        }
    }
}

pub fn review_request_status_blocker(status: ChangesetStatus) -> Option<ActionEligibility> {
    if status.is_review_request_status_candidate() {
        None
    } else {
        Some(ActionEligibility::denied(
            CommandKind::SubmitForReview,
            format!("changeset status `{status:?}` is not reviewable"),
        ))
    }
}

pub fn apply_request_status_blocker(status: ChangesetStatus) -> Option<ActionEligibility> {
    if status.is_apply_request_status_candidate() {
        None
    } else {
        Some(ActionEligibility::denied(
            CommandKind::RequestApply,
            format!("changeset status `{status:?}` is not approved"),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn identifiers_reject_empty_whitespace_and_unsafe_characters() {
        assert!(ChangesetId::new("changeset_123").is_ok());
        assert!(ProposalId::new("proposal_123").is_ok());
        assert!(InterruptId::new("interrupt:run/1").is_ok());
        assert!(ProposalId::new("").is_err());
        assert!(ProposalId::new(" proposal_123").is_err());
        assert!(ProposalId::new("proposal 123").is_err());
        assert!(ProposalId::new("proposal<script>").is_err());
    }

    #[test]
    fn identifiers_reject_overlong_values() {
        let value = "p".repeat(161);
        assert!(ProposalId::new(&value).is_err());
    }

    #[test]
    fn identifier_deserialization_validates_wire_values() {
        let id: ProposalId = serde_json::from_value(json!("proposal_123")).unwrap();
        assert_eq!(id.as_str(), "proposal_123");

        let err = serde_json::from_value::<ProposalId>(json!("bad id")).unwrap_err();
        assert!(
            err.to_string().contains("proposal_id"),
            "error identifies the invalid field: {err}"
        );
    }

    #[test]
    fn canonical_statuses_serialize_as_snake_case() {
        assert_eq!(
            serde_json::to_value(ChangesetStatus::NeedsReview).unwrap(),
            json!("needs_review")
        );
        assert_eq!(
            serde_json::to_value(ChangesetStatus::PartiallyApplied).unwrap(),
            json!("partially_applied")
        );
        assert_eq!(
            serde_json::to_value(CommandKind::RequestApply).unwrap(),
            json!("request_apply")
        );
        assert_eq!(
            serde_json::to_value(CommandKind::CancelProposal).unwrap(),
            json!("cancel_proposal")
        );
        assert_eq!(
            serde_json::to_value(CommandKind::EditProposal).unwrap(),
            json!("edit_proposal")
        );
        assert_eq!(
            serde_json::to_value(ReviewDecisionKind::Edit).unwrap(),
            json!("edit")
        );
        assert_eq!(
            serde_json::to_value(ActorKind::ToolExecutor).unwrap(),
            json!("tool_executor")
        );
    }

    #[test]
    fn frontend_and_agent_commands_share_semantic_non_core_names() {
        for command in CommandKind::ALL {
            let value = serde_json::to_value(command).unwrap();
            let name = value.as_str().unwrap();
            assert!(
                !name.contains("core") && !name.contains("vaultspec_core"),
                "authoring command names must stay semantic: {name}"
            );
        }
    }

    #[test]
    fn terminal_and_action_eligibility_are_backend_owned() {
        assert!(ChangesetStatus::Applied.is_terminal());
        assert!(ChangesetStatus::Rejected.is_terminal());
        assert!(!ChangesetStatus::Approved.is_terminal());

        assert!(ChangesetStatus::Draft.is_review_request_status_candidate());
        assert!(ChangesetStatus::Proposed.is_review_request_status_candidate());
        assert!(!ChangesetStatus::Generating.is_review_request_status_candidate());
        assert!(!ChangesetStatus::Conflicted.is_review_request_status_candidate());
        assert!(review_request_status_blocker(ChangesetStatus::Draft).is_none());
        let review_blocker = review_request_status_blocker(ChangesetStatus::Generating).unwrap();
        assert_eq!(review_blocker.command, CommandKind::SubmitForReview);
        assert!(!review_blocker.allowed);

        assert!(ChangesetStatus::Approved.is_apply_request_status_candidate());
        assert!(apply_request_status_blocker(ChangesetStatus::Approved).is_none());

        let ineligible = apply_request_status_blocker(ChangesetStatus::Draft).unwrap();
        assert_eq!(ineligible.command, CommandKind::RequestApply);
        assert!(!ineligible.allowed);
        assert!(
            ineligible
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("not approved"))
        );
    }

    #[test]
    fn document_ref_distinguishes_existing_provisional_rename_and_result_refs() {
        let existing = DocumentRef::Existing {
            scope: "scope_a".to_string(),
            node_id: "doc:adr-1".to_string(),
            stem: "adr-1".to_string(),
            path: ".vault/adr/adr-1.md".to_string(),
            doc_type: "adr".to_string(),
            base_revision: RevisionToken::new("blob:abc123").unwrap(),
        };
        let provisional = DocumentRef::ProvisionalCreate {
            provisional_doc_id: "prov_1".to_string(),
            doc_type: "plan".to_string(),
            feature: "agentic-spec-authoring-backend".to_string(),
            title: "Agentic plan".to_string(),
            collision_status: ProvisionalCollisionStatus::Available,
            proposed_stem: Some("agentic-plan".to_string()),
        };
        let rename = DocumentRef::RenameTarget {
            source: Box::new(existing.clone()),
            proposed_stem: "adr-2".to_string(),
            proposed_node_id: "doc:adr-2".to_string(),
        };
        let result = DocumentRef::MaterializedResult {
            reviewed: Box::new(rename),
            result_node_id: "doc:adr-2".to_string(),
            result_path: ".vault/adr/adr-2.md".to_string(),
            result_revision: RevisionToken::new("blob:def456").unwrap(),
        };

        assert_eq!(serde_json::to_value(&existing).unwrap()["kind"], "existing");
        assert_eq!(
            serde_json::to_value(&provisional).unwrap()["kind"],
            "provisional_create"
        );
        assert_eq!(
            serde_json::to_value(&provisional).unwrap()["collision_status"],
            "available"
        );
        assert_eq!(
            serde_json::to_value(&result).unwrap()["kind"],
            "materialized_result"
        );
    }

    #[test]
    fn receipt_refs_carry_actor_command_and_idempotency_identity() {
        let actor = ActorRef {
            id: ActorId::new("human:alice").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        };
        let receipt = ReceiptRef {
            id: ReceiptId::new("receipt_1").unwrap(),
            command: CommandKind::CreateProposal,
            actor,
            idempotency_key: IdempotencyKey::new("idem:create:1").unwrap(),
        };

        let value = serde_json::to_value(receipt).unwrap();
        assert_eq!(value["command"], "create_proposal");
        assert_eq!(value["actor"]["kind"], "human");
        assert_eq!(value["idempotency_key"], "idem:create:1");
    }
}
