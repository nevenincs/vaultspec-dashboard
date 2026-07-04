// W01.P04 defines versioned authoring DTOs and route fixtures. Later phases
// attach these shapes to handlers, stores, event streams, and agent tools.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::model::{
    ActorId, ActorKind, ActorRef, ApprovalId, ChangesetId, CommandKind, DocumentRef,
    IdempotencyKey, InterruptId, LangGraphCheckpointId, LangGraphRef, LangGraphRunId,
    LangGraphThreadId, LeaseId, ProvisionalCollisionStatus, ReceiptId, ReceiptRef,
    ReviewDecisionKind, RevisionToken, RunId, SessionId,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiVersion {
    V1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EndpointFamily {
    Session,
    Document,
    Proposal,
    Review,
    Apply,
    Rollback,
    Lease,
    Stream,
    Recovery,
}

impl EndpointFamily {
    const ALL: &'static [Self] = &[
        Self::Session,
        Self::Document,
        Self::Proposal,
        Self::Review,
        Self::Apply,
        Self::Rollback,
        Self::Lease,
        Self::Stream,
        Self::Recovery,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RouteFixture {
    pub family: EndpointFamily,
    pub method: &'static str,
    pub path_template: &'static str,
    pub command: Option<CommandKind>,
    pub mutating: bool,
    pub idempotency_required: bool,
    pub negative_contract_cases: &'static [&'static str],
}

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
pub struct ReadEnvelope<T> {
    pub api_version: ApiVersion,
    pub payload: T,
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub langgraph: Option<LangGraphRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentSnapshotRequest {
    pub document: DocumentRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<DocumentChunkRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftMode {
    WholeDocument,
    Append,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecisionRequest {
    pub proposal_id: super::model::ProposalId,
    pub approval_id: ApprovalId,
    pub decision: ReviewDecisionKind,
    pub reviewed_revision: RevisionToken,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interrupt_id: Option<InterruptId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyRequest {
    pub changeset_id: ChangesetId,
    pub approval_id: ApprovalId,
    pub targets: Vec<ApplyTargetExpectation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyTargetExpectation {
    pub child_key: String,
    pub target: TargetRevisionFence,
    pub approved_proposal_revision: RevisionToken,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackRequest {
    pub source_changeset_id: ChangesetId,
    pub source_children: Vec<RollbackChildSource>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackChildSource {
    pub source_child_key: String,
    pub target: TargetRevisionFence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub materialized_revision: Option<RevisionToken>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseRequest {
    pub lease_id: LeaseId,
    pub target: DocumentRef,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StreamSubscribeRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seq: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
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
    Lease {
        lease_id: LeaseId,
    },
    Stream {
        latest_seq: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandReceiptStatus {
    Accepted,
    Replayed,
    InFlight,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandReceiptDto {
    pub api_version: ApiVersion,
    pub status: CommandReceiptStatus,
    pub aggregate: AggregateRef,
    pub receipt: ReceiptRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListPageDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub items: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub aggregate: AggregateRef,
    pub latest_outbox_seq: u64,
    pub snapshot: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypedErrorDto {
    pub api_version: ApiVersion,
    pub error_kind: String,
    pub error: String,
    pub status: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DegradedSnapshotDto {
    pub api_version: ApiVersion,
    pub family: EndpointFamily,
    pub unavailable_tier: String,
    pub reason: String,
    pub snapshot: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

pub fn request_fixture(family: EndpointFamily) -> Value {
    match family {
        EndpointFamily::Session => command_value(CommandEnvelope::new(
            CommandKind::CreateSession,
            idempotency_key("idem:session:create"),
            CreateSessionRequest {
                scope: "scope_a".to_string(),
                title: "Agentic authoring".to_string(),
                langgraph: Some(langgraph_fixture()),
            },
        )),
        EndpointFamily::Document => read_value(DocumentSnapshotRequest {
            document: existing_document_fixture(),
            revision: Some(revision("blob:abc123")),
            chunk: Some(DocumentChunkRequest {
                offset: 0,
                limit: 4096,
            }),
        }),
        EndpointFamily::Proposal => command_value(CommandEnvelope::new(
            CommandKind::CreateProposal,
            idempotency_key("idem:proposal:create"),
            CreateProposalRequest {
                session_id: session_id(),
                changeset_id: changeset_id(),
                summary: "Rewrite the ADR introduction".to_string(),
                operations: vec![
                    ChangesetChildOperationDraft {
                        child_key: "child_1".to_string(),
                        operation: ChangesetOperationKind::ReplaceBody,
                        target: target_revision_fence(
                            existing_document_fixture(),
                            Some("blob:abc123"),
                            Some("blob:abc123"),
                        ),
                        draft: DraftMutation {
                            mode: DraftMode::WholeDocument,
                            body: "draft body".to_string(),
                        },
                    },
                    ChangesetChildOperationDraft {
                        child_key: "child_2".to_string(),
                        operation: ChangesetOperationKind::CreateDocument,
                        target: target_revision_fence(provisional_document_fixture(), None, None),
                        draft: DraftMutation {
                            mode: DraftMode::WholeDocument,
                            body: "new document body".to_string(),
                        },
                    },
                ],
            },
        )),
        EndpointFamily::Review => command_value(CommandEnvelope::new(
            CommandKind::Approve,
            idempotency_key("idem:review:approve"),
            ReviewDecisionRequest {
                proposal_id: proposal_id(),
                approval_id: approval_id(),
                decision: ReviewDecisionKind::Approve,
                reviewed_revision: revision("proposal:rev1"),
                interrupt_id: Some(interrupt_id()),
                comment: Some("approved".to_string()),
            },
        )),
        EndpointFamily::Apply => command_value(CommandEnvelope::new(
            CommandKind::RequestApply,
            idempotency_key("idem:apply:request"),
            ApplyRequest {
                changeset_id: changeset_id(),
                approval_id: approval_id(),
                targets: vec![
                    ApplyTargetExpectation {
                        child_key: "child_1".to_string(),
                        target: target_revision_fence(
                            existing_document_fixture(),
                            Some("blob:abc123"),
                            Some("blob:abc123"),
                        ),
                        approved_proposal_revision: revision("proposal:rev1"),
                    },
                    ApplyTargetExpectation {
                        child_key: "child_2".to_string(),
                        target: target_revision_fence(provisional_document_fixture(), None, None),
                        approved_proposal_revision: revision("proposal:rev1"),
                    },
                ],
            },
        )),
        EndpointFamily::Rollback => command_value(CommandEnvelope::new(
            CommandKind::CreateRollback,
            idempotency_key("idem:rollback:create"),
            RollbackRequest {
                source_changeset_id: changeset_id(),
                source_children: vec![
                    RollbackChildSource {
                        source_child_key: "child_1".to_string(),
                        target: target_revision_fence(
                            existing_document_fixture(),
                            Some("blob:def456"),
                            Some("blob:def456"),
                        ),
                        materialized_revision: Some(revision("blob:def456")),
                    },
                    RollbackChildSource {
                        source_child_key: "child_2".to_string(),
                        target: target_revision_fence(
                            second_existing_document_fixture(),
                            Some("blob:ghi789"),
                            Some("blob:ghi789"),
                        ),
                        materialized_revision: Some(revision("blob:ghi789")),
                    },
                ],
                reason: "restore reviewed preimage".to_string(),
            },
        )),
        EndpointFamily::Lease => command_value(CommandEnvelope::new(
            CommandKind::AcquireLease,
            idempotency_key("idem:lease:acquire"),
            LeaseRequest {
                lease_id: LeaseId::new("lease_1").unwrap(),
                target: existing_document_fixture(),
                ttl_ms: 30_000,
            },
        )),
        EndpointFamily::Stream => read_value(StreamSubscribeRequest { last_seq: Some(41) }),
        EndpointFamily::Recovery => read_value(RecoveryRequest {
            session_id: Some(session_id()),
            run_id: Some(RunId::new("run_1").unwrap()),
            last_seq: Some(41),
        }),
    }
}

pub fn response_fixture(family: EndpointFamily) -> Value {
    let aggregate = match family {
        EndpointFamily::Session | EndpointFamily::Recovery => AggregateRef::Session {
            session_id: session_id(),
        },
        EndpointFamily::Document => AggregateRef::Document {
            document: existing_document_fixture(),
        },
        EndpointFamily::Proposal | EndpointFamily::Apply => AggregateRef::Changeset {
            changeset_id: changeset_id(),
        },
        EndpointFamily::Review => AggregateRef::Approval {
            approval_id: approval_id(),
        },
        EndpointFamily::Rollback => AggregateRef::Changeset {
            changeset_id: ChangesetId::new("changeset_rollback_1").unwrap(),
        },
        EndpointFamily::Lease => AggregateRef::Lease {
            lease_id: LeaseId::new("lease_1").unwrap(),
        },
        EndpointFamily::Stream => AggregateRef::Stream { latest_seq: 42 },
    };

    serde_json::to_value(SnapshotDto {
        api_version: ApiVersion::V1,
        family,
        aggregate,
        latest_outbox_seq: 42,
        snapshot: json!({
            "status": "fixture",
            "tiered_recovery": true,
        }),
    })
    .expect("fixture response serializes")
}

pub fn list_page_fixture(family: EndpointFamily) -> ListPageDto {
    ListPageDto {
        api_version: ApiVersion::V1,
        family,
        items: vec![response_fixture(family)],
        next_cursor: Some("cursor_42".to_string()),
    }
}

pub fn typed_error_fixture() -> TypedErrorDto {
    TypedErrorDto {
        api_version: ApiVersion::V1,
        error_kind: "authoring_validation_failed".to_string(),
        error: "request violates the authoring v1 schema".to_string(),
        status: 400,
    }
}

pub fn degraded_snapshot_fixture(family: EndpointFamily) -> DegradedSnapshotDto {
    DegradedSnapshotDto {
        api_version: ApiVersion::V1,
        family,
        unavailable_tier: "semantic".to_string(),
        reason: "authoring projection unavailable".to_string(),
        snapshot: json!({"available": false}),
    }
}

pub fn event_fixture() -> AuthoringEventDto {
    AuthoringEventDto {
        schema_version: ApiVersion::V1,
        seq: 42,
        event: AuthoringEventKind::ApprovalResolved,
        aggregate: AggregateRef::Approval {
            approval_id: approval_id(),
        },
        actor: actor_fixture(),
        timestamp_ms: 1_775_000_000_000,
        idempotency_key: Some(idempotency_key("idem:review:approve")),
        payload: json!({
            "decision": ReviewDecisionKind::Approve,
            "proposal_id": proposal_id(),
        }),
    }
}

fn command_value<T: Serialize>(request: CommandEnvelope<T>) -> Value {
    serde_json::to_value(request).expect("command fixture serializes")
}

fn read_value<T: Serialize>(payload: T) -> Value {
    serde_json::to_value(ReadEnvelope::new(payload)).expect("read fixture serializes")
}

fn actor_fixture() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:alice").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

fn langgraph_fixture() -> LangGraphRef {
    LangGraphRef {
        thread_id: LangGraphThreadId::new("thread_1").unwrap(),
        run_id: Some(LangGraphRunId::new("lg_run_1").unwrap()),
        checkpoint_id: Some(LangGraphCheckpointId::new("checkpoint_1").unwrap()),
    }
}

fn existing_document_fixture() -> DocumentRef {
    DocumentRef::Existing {
        scope: "scope_a".to_string(),
        node_id: "doc:adr-1".to_string(),
        stem: "adr-1".to_string(),
        path: ".vault/adr/adr-1.md".to_string(),
        doc_type: "adr".to_string(),
        base_revision: revision("blob:abc123"),
    }
}

fn provisional_document_fixture() -> DocumentRef {
    DocumentRef::ProvisionalCreate {
        provisional_doc_id: "provisional_doc_1".to_string(),
        doc_type: "plan".to_string(),
        feature: super::FEATURE_TAG.to_string(),
        title: "Agentic Plan".to_string(),
        collision_status: ProvisionalCollisionStatus::Available,
        proposed_stem: Some("agentic-plan".to_string()),
    }
}

fn second_existing_document_fixture() -> DocumentRef {
    DocumentRef::Existing {
        scope: "scope_a".to_string(),
        node_id: "doc:plan-1".to_string(),
        stem: "plan-1".to_string(),
        path: ".vault/plan/plan-1.md".to_string(),
        doc_type: "plan".to_string(),
        base_revision: revision("blob:ghi789"),
    }
}

fn target_revision_fence(
    document: DocumentRef,
    base_revision: Option<&str>,
    current_revision: Option<&str>,
) -> TargetRevisionFence {
    TargetRevisionFence {
        document,
        base_revision: base_revision.map(revision),
        current_revision: current_revision.map(revision),
    }
}

fn receipt(command: CommandKind, key: &str) -> ReceiptRef {
    ReceiptRef {
        id: ReceiptId::new("receipt_1").unwrap(),
        command,
        actor: actor_fixture(),
        idempotency_key: idempotency_key(key),
    }
}

fn idempotency_key(value: &str) -> IdempotencyKey {
    IdempotencyKey::new(value).unwrap()
}

fn revision(value: &str) -> RevisionToken {
    RevisionToken::new(value).unwrap()
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn changeset_id() -> ChangesetId {
    ChangesetId::new("changeset_1").unwrap()
}

fn proposal_id() -> super::model::ProposalId {
    super::model::ProposalId::new("proposal_1").unwrap()
}

fn approval_id() -> ApprovalId {
    ApprovalId::new("approval_1").unwrap()
}

fn interrupt_id() -> InterruptId {
    InterruptId::new("interrupt_1").unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use std::collections::HashSet;
    use std::sync::Arc;

    fn fixture_state() -> (tempfile::TempDir, Arc<crate::app::AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path()
                .join(".vault/plan/2026-06-30-authoring-api-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    #[test]
    fn route_fixtures_cover_every_family_with_versioned_authoring_paths() {
        let expected: HashSet<EndpointFamily> = EndpointFamily::ALL.iter().copied().collect();
        let actual: HashSet<EndpointFamily> = ROUTE_FIXTURES
            .iter()
            .map(|fixture| fixture.family)
            .collect();
        assert_eq!(
            actual, expected,
            "every endpoint family has a route fixture"
        );

        for fixture in ROUTE_FIXTURES {
            assert!(
                fixture.path_template.starts_with("/authoring/v1/"),
                "authoring route fixtures are versioned: {fixture:?}"
            );
            assert!(
                !fixture.negative_contract_cases.is_empty(),
                "every fixture carries at least one negative contract case: {fixture:?}"
            );
            assert_eq!(
                fixture.idempotency_required, fixture.mutating,
                "only mutating fixtures require idempotency in W01.P04: {fixture:?}"
            );
        }
    }

    #[test]
    fn request_and_response_fixtures_are_versioned_for_every_family() {
        for family in EndpointFamily::ALL {
            let request = request_fixture(*family);
            let response = response_fixture(*family);
            assert_eq!(request["api_version"], "v1", "request fixture: {family:?}");
            assert_eq!(
                response["api_version"], "v1",
                "response fixture: {family:?}"
            );
            assert_eq!(response["latest_outbox_seq"], 42);
        }
    }

    #[test]
    fn command_envelope_carries_no_actor_requires_idempotency_and_rejects_unknown_fields() {
        let valid = request_fixture(EndpointFamily::Session);
        let parsed: CommandEnvelope<CreateSessionRequest> =
            serde_json::from_value(valid).expect("valid command fixture parses");
        assert_eq!(parsed.command, CommandKind::CreateSession);
        assert_eq!(parsed.idempotency_key.as_str(), "idem:session:create");

        // A2.3 FALSIFIER: the wire envelope has NO actor field, so a client that
        // tries to CLAIM an identity in the body is rejected as an unknown field
        // (deny_unknown_fields) — kind:Human can never be smuggled. Actor resolves
        // only from the principal token via ResolvedCommand.
        let claims_actor = json!({
            "api_version": "v1",
            "command": "create_session",
            "actor": {"id": "human:alice", "kind": "human"},
            "idempotency_key": "idem:session:create",
            "payload": {"scope": "scope_a", "title": "Agentic authoring"}
        });
        let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(claims_actor)
            .unwrap_err();
        assert!(
            err.to_string().contains("unknown field") && err.to_string().contains("actor"),
            "a body-claimed actor is rejected as an unknown field (A2.3): {err}"
        );

        let missing_key = json!({
            "api_version": "v1",
            "command": "create_session",
            "payload": {"scope": "scope_a", "title": "Agentic authoring"}
        });
        let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(missing_key)
            .unwrap_err();
        assert!(
            err.to_string().contains("idempotency_key"),
            "missing idempotency key is rejected: {err}"
        );

        let unknown_top_level = json!({
            "api_version": "v1",
            "command": "create_session",
            "idempotency_key": "idem:session:create",
            "payload": {"scope": "scope_a", "title": "Agentic authoring"},
            "core_verb": "vault set-body"
        });
        let err =
            serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_top_level)
                .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown top-level fields are rejected: {err}"
        );

        let unknown_payload = json!({
            "api_version": "v1",
            "command": "create_session",
            "actor": {"id": "human:alice", "kind": "human"},
            "idempotency_key": "idem:session:create",
            "payload": {
                "scope": "scope_a",
                "title": "Agentic authoring",
                "extra": true
            }
        });
        let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_payload)
            .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown payload fields are rejected: {err}"
        );
    }

    #[test]
    fn nested_authoring_context_rejects_unknown_fields() {
        let unknown_actor = json!({
            "api_version": "v1",
            "command": "create_session",
            "actor": {
                "id": "human:alice",
                "kind": "human",
                "display_name": "Alice"
            },
            "idempotency_key": "idem:session:create",
            "payload": {"scope": "scope_a", "title": "Agentic authoring"}
        });
        let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_actor)
            .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown actor fields are rejected: {err}"
        );

        let unknown_langgraph = json!({
            "api_version": "v1",
            "command": "create_session",
            "actor": {"id": "human:alice", "kind": "human"},
            "idempotency_key": "idem:session:create",
            "payload": {
                "scope": "scope_a",
                "title": "Agentic authoring",
                "langgraph": {
                    "thread_id": "thread_1",
                    "checkpoint_id": "checkpoint_1",
                    "checkpoint_payload": {}
                }
            }
        });
        let err =
            serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_langgraph)
                .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown langgraph fields are rejected: {err}"
        );

        let unknown_document_ref = json!({
            "api_version": "v1",
            "payload": {
                "document": {
                    "kind": "existing",
                    "scope": "scope_a",
                    "node_id": "doc:adr-1",
                    "stem": "adr-1",
                    "path": ".vault/adr/adr-1.md",
                    "doc_type": "adr",
                    "base_revision": "blob:abc123",
                    "derived_title": "ADR 1"
                }
            }
        });
        let err =
            serde_json::from_value::<ReadEnvelope<DocumentSnapshotRequest>>(unknown_document_ref)
                .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown document_ref fields are rejected: {err}"
        );

        let unknown_aggregate = json!({
            "api_version": "v1",
            "family": "proposal",
            "aggregate": {
                "kind": "changeset",
                "changeset_id": "changeset_1",
                "derived_status": "approved"
            },
            "latest_outbox_seq": 42,
            "snapshot": {"status": "fixture"}
        });
        let err = serde_json::from_value::<SnapshotDto>(unknown_aggregate).unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown aggregate fields are rejected: {err}"
        );
    }

    #[test]
    fn change_fixtures_carry_child_operations_and_revision_fences() {
        let proposal_value = request_fixture(EndpointFamily::Proposal);
        assert!(
            proposal_value["payload"].get("target").is_none(),
            "proposal fixture must not collapse to a single top-level target"
        );
        assert!(
            proposal_value["payload"].get("draft").is_none(),
            "proposal fixture must not collapse to a single top-level draft"
        );

        let proposal: CommandEnvelope<CreateProposalRequest> =
            serde_json::from_value(proposal_value).unwrap();
        assert_eq!(
            proposal.payload.operations.len(),
            2,
            "proposal fixture carries child operations"
        );
        assert!(
            proposal.payload.operations.iter().any(|operation| {
                operation.target.base_revision.is_some()
                    && operation.target.current_revision.is_some()
            }),
            "existing targets carry base and current revision fences"
        );

        let apply: CommandEnvelope<ApplyRequest> =
            serde_json::from_value(request_fixture(EndpointFamily::Apply)).unwrap();
        assert_eq!(
            apply.payload.targets.len(),
            proposal.payload.operations.len(),
            "apply names each reviewed child target"
        );
        assert!(
            apply
                .payload
                .targets
                .iter()
                .any(|target| target.target.current_revision.is_some()),
            "apply carries per-target current revision observations"
        );

        let rollback: CommandEnvelope<RollbackRequest> =
            serde_json::from_value(request_fixture(EndpointFamily::Rollback)).unwrap();
        assert_eq!(
            rollback.payload.source_children.len(),
            2,
            "rollback names source children explicitly"
        );
        assert!(
            rollback
                .payload
                .source_children
                .iter()
                .all(|source| source.materialized_revision.is_some()),
            "rollback sources retain materialized revision evidence"
        );
    }

    #[test]
    fn future_or_wrong_versions_reject() {
        let mut future = request_fixture(EndpointFamily::Session);
        future["api_version"] = json!("v2");
        let err =
            serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(future).unwrap_err();
        assert!(
            err.to_string().contains("unknown variant"),
            "future request versions reject until explicitly supported: {err}"
        );

        let mut event = serde_json::to_value(event_fixture()).unwrap();
        event["schema_version"] = json!("v2");
        let err = serde_json::from_value::<AuthoringEventDto>(event).unwrap_err();
        assert!(
            err.to_string().contains("unknown variant"),
            "future event schema versions reject until explicitly supported: {err}"
        );
    }

    #[test]
    fn semantic_fixtures_do_not_expose_core_shaped_verbs() {
        for fixture in ROUTE_FIXTURES {
            let route = fixture.path_template;
            assert!(!route.contains("/ops/core"), "route is semantic: {route}");
            assert!(
                !route.contains("vaultspec-core"),
                "route is semantic: {route}"
            );
            if let Some(command) = fixture.command {
                let value = serde_json::to_value(command).unwrap();
                let command_name = value.as_str().unwrap();
                assert!(
                    !command_name.contains("core") && !command_name.contains("vaultspec_core"),
                    "command is semantic: {command_name}"
                );
            }
        }
    }

    #[test]
    fn response_fixtures_are_tiered_when_served_through_authoring_envelope() {
        let (_dir, state) = fixture_state();
        let Json(body) =
            super::super::response::snapshot(&state, response_fixture(EndpointFamily::Recovery));

        assert_eq!(body["data"]["api_version"], "v1");
        assert_eq!(body["data"]["family"], "recovery");
        assert_eq!(body["data"]["latest_outbox_seq"], 42);
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "versioned recovery fixture rides the shared tiers envelope"
        );

        let Json(degraded) = super::super::response::degraded_snapshot(
            &state,
            "semantic",
            "authoring projection unavailable",
            serde_json::to_value(degraded_snapshot_fixture(EndpointFamily::Recovery)).unwrap(),
        );
        assert_eq!(degraded["data"]["api_version"], "v1");
        assert_eq!(degraded["data"]["unavailable_tier"], "semantic");
        assert_eq!(degraded["tiers"]["semantic"]["available"], false);
    }

    #[test]
    fn list_error_and_degraded_fixtures_are_versioned() {
        let page = serde_json::to_value(list_page_fixture(EndpointFamily::Review)).unwrap();
        let error = serde_json::to_value(typed_error_fixture()).unwrap();
        let degraded =
            serde_json::to_value(degraded_snapshot_fixture(EndpointFamily::Stream)).unwrap();

        assert_eq!(page["api_version"], "v1");
        assert_eq!(page["family"], "review");
        assert_eq!(page["next_cursor"], "cursor_42");
        assert_eq!(error["api_version"], "v1");
        assert_eq!(error["error_kind"], "authoring_validation_failed");
        assert_eq!(degraded["api_version"], "v1");
        assert_eq!(degraded["family"], "stream");
        assert_eq!(degraded["unavailable_tier"], "semantic");
    }

    #[test]
    fn lifecycle_event_fixtures_are_versioned_and_not_status_names() {
        let event = serde_json::to_value(event_fixture()).unwrap();

        assert_eq!(event["schema_version"], "v1");
        assert_eq!(event["timestamp_ms"], 1_775_000_000_000i64);
        assert_eq!(event["event"], "approval_resolved");
        assert_ne!(
            event["event"], "approved",
            "events are transition records, not a second status vocabulary"
        );
        assert_eq!(event["payload"]["decision"], "approve");
        assert_eq!(event["idempotency_key"], "idem:review:approve");
    }

    #[test]
    fn document_fixture_covers_provisional_create_identity() {
        let document = serde_json::to_value(provisional_document_fixture()).unwrap();

        assert_eq!(document["kind"], "provisional_create");
        assert_eq!(document["provisional_doc_id"], "provisional_doc_1");
        assert_eq!(document["collision_status"], "available");
    }

    #[test]
    fn document_response_fixture_preserves_document_identity() {
        let response = response_fixture(EndpointFamily::Document);

        assert_eq!(response["aggregate"]["kind"], "document");
        assert_eq!(response["aggregate"]["document"]["kind"], "existing");
        assert_eq!(
            response["aggregate"]["document"]["base_revision"],
            "blob:abc123"
        );
    }

    #[test]
    fn command_receipt_fixture_carries_actor_command_and_idempotency() {
        let dto = CommandReceiptDto {
            api_version: ApiVersion::V1,
            status: CommandReceiptStatus::Accepted,
            aggregate: AggregateRef::Proposal {
                proposal_id: proposal_id(),
            },
            receipt: receipt(CommandKind::CreateProposal, "idem:proposal:create"),
        };
        let value = serde_json::to_value(dto).unwrap();

        assert_eq!(value["api_version"], "v1");
        assert_eq!(value["status"], "accepted");
        assert_eq!(value["receipt"]["command"], "create_proposal");
        assert_eq!(value["receipt"]["actor"]["kind"], "human");
        assert_eq!(value["receipt"]["idempotency_key"], "idem:proposal:create");
    }
}
