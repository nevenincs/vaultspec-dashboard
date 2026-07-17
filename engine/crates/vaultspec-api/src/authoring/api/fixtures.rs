//! Contract-test request/response fixtures for the authoring v1 DTOs.

use super::*;
use crate::authoring::model::{ActorId, ActorKind, ProvisionalCollisionStatus, ReceiptId};
use crate::authoring::rebase::{CreateReplacementProposalRequest, RebaseProposalRequest};
use serde_json::json;

#[cfg(test)]
pub fn request_fixture(family: EndpointFamily) -> Value {
    match family {
        EndpointFamily::Session => command_value(CommandEnvelope::new(
            CommandKind::CreateSession,
            idempotency_key("idem:session:create"),
            CreateSessionRequest {
                scope: "scope_a".to_string(),
                title: "Agentic authoring".to_string(),
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
            create_proposal_request_fixture(),
        )),
        EndpointFamily::Review => command_value(CommandEnvelope::new(
            CommandKind::Approve,
            idempotency_key("idem:review:approve"),
            ReviewDecisionRequest {
                proposal_id: proposal_id(),
                approval_id: approval_id(),
                decision: ReviewDecisionKind::Approve,
                reviewed_revision: revision("proposal:rev1"),
                comment: Some("approved".to_string()),
            },
        )),
        EndpointFamily::Apply => command_value(CommandEnvelope::new(
            CommandKind::RequestApply,
            idempotency_key("idem:apply:request"),
            ApplyRequest {
                changeset_id: changeset_id(),
                approval_id: approval_id(),
                fencing_token: None,
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
                    },
                    RollbackChildSource {
                        source_child_key: "child_2".to_string(),
                    },
                ],
                reason: "restore reviewed preimage".to_string(),
            },
        )),
        EndpointFamily::Mode => command_value(CommandEnvelope::new(
            CommandKind::SetOperationMode,
            idempotency_key("idem:mode:set"),
            SetOperationModeRequest {
                mode: OperationMode::Autonomous,
            },
        )),
        EndpointFamily::DirectWrite => command_value(CommandEnvelope::new(
            CommandKind::DirectWrite,
            idempotency_key("idem:direct-write"),
            DirectWriteRequest {
                doc_ref: Some(".vault/adr/adr-1.md".to_string()),
                operation: ChangesetOperationKind::ReplaceBody,
                body: "directly saved body".to_string(),
                frontmatter: None,
                new_stem: None,
                create: None,
                plan_step: None,
                expected_blob_hash: Some("abc123abc123abc123abc123abc123abc123abcd".to_string()),
                summary: Some("Editor save".to_string()),
                scope: None,
            },
        )),
        EndpointFamily::Lease => command_value(CommandEnvelope::new(
            CommandKind::AcquireLease,
            idempotency_key("idem:lease:acquire"),
            LeaseAcquireRequest {
                target: existing_document_fixture(),
                purpose: LeasePurpose::WholeDocument,
                ttl_ms: Some(30_000),
            },
        )),
        EndpointFamily::Stream => read_value(StreamSubscribeRequest { last_seq: Some(41) }),
        EndpointFamily::Recovery => read_value(RecoveryRequest {
            session_id: Some(session_id()),
            run_id: Some(RunId::new("run_1").unwrap()),
            last_seq: Some(41),
        }),
        EndpointFamily::ToolPermission => command_value(CommandEnvelope::new(
            CommandKind::RequestToolPermission,
            idempotency_key("idem:tool-permission:decide"),
            ToolPermissionDecisionRequest {
                decision: ToolPermissionDecisionKind::Approve,
                comment: Some("approved".to_string()),
            },
        )),
        EndpointFamily::Interrupt => command_value(CommandEnvelope::new(
            CommandKind::ResumeRun,
            idempotency_key("idem:interrupt:resume"),
            InterruptResumeRequest {
                decision: json!({ "approve": true }),
            },
        )),
        // W12.P41 A3b: the route body is a bare `AgentToolCall` (not a domain DTO),
        // riding the SAME `CommandEnvelope` wire wrapper as every other command route
        // (`ResolvedCommand<AgentToolCall>` deserializes `CommandEnvelope<AgentToolCall>`).
        // Built by hand (rather than importing `tools::AgentToolCall`) so `api.rs` stays
        // the foundational, one-way-depended-on module — `tools.rs` depends on `api.rs`,
        // never the reverse.
        EndpointFamily::AgentToolExecute => command_value(CommandEnvelope::new(
            CommandKind::CreateProposal,
            idempotency_key("idem:agent-tool:execute"),
            json!({
                "tool_call_id": "tool_call_1",
                "name": "propose_changeset",
                "idempotency_key": "idem:propose:create",
                "input": propose_changeset_create_input(),
            }),
        )),
        EndpointFamily::Rebase => command_value(CommandEnvelope::new(
            CommandKind::Rebase,
            idempotency_key("idem:rebase:1"),
            RebaseProposalRequest {
                changeset_id: changeset_id(),
                expected_revision: revision("proposal:rev1"),
                summary: "rebase onto the current base".to_string(),
            },
        )),
        EndpointFamily::Replacement => command_value(CommandEnvelope::new(
            CommandKind::Supersede,
            idempotency_key("idem:replacement:1"),
            CreateReplacementProposalRequest {
                source_changeset_id: changeset_id(),
                source_expected_revision: revision("proposal:rev1"),
                replacement_changeset_id: ChangesetId::new("changeset_replacement_1").unwrap(),
                summary: "supersede the stale source".to_string(),
            },
        )),
        EndpointFamily::ReviewClaim => command_value(CommandEnvelope::new(
            CommandKind::ClaimReview,
            idempotency_key("idem:review-claim:1"),
            ReviewClaimRequest {
                changeset_id: changeset_id(),
                ttl_ms: Some(900_000),
            },
        )),
    }
}

#[cfg(test)]
pub fn response_fixture(family: EndpointFamily) -> Value {
    let aggregate = match family {
        EndpointFamily::Session
        | EndpointFamily::Recovery
        | EndpointFamily::ToolPermission
        | EndpointFamily::Interrupt => AggregateRef::Session {
            session_id: session_id(),
        },
        EndpointFamily::Document => AggregateRef::Document {
            document: existing_document_fixture(),
        },
        EndpointFamily::Proposal
        | EndpointFamily::Apply
        | EndpointFamily::DirectWrite
        | EndpointFamily::AgentToolExecute
        | EndpointFamily::Rebase
        | EndpointFamily::ReviewClaim => AggregateRef::Changeset {
            changeset_id: changeset_id(),
        },
        EndpointFamily::Replacement => AggregateRef::Changeset {
            changeset_id: ChangesetId::new("changeset_replacement_1").unwrap(),
        },
        EndpointFamily::Review => AggregateRef::Approval {
            approval_id: approval_id(),
        },
        EndpointFamily::Rollback => AggregateRef::Changeset {
            changeset_id: ChangesetId::new("changeset_rollback_1").unwrap(),
        },
        EndpointFamily::Mode => AggregateRef::OperationMode {
            scope_id: "worktree".to_string(),
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

#[cfg(test)]
pub fn list_page_fixture(family: EndpointFamily) -> ListPageDto {
    ListPageDto {
        api_version: ApiVersion::V1,
        family,
        items: vec![response_fixture(family)],
        next_cursor: Some("cursor_42".to_string()),
    }
}

#[cfg(test)]
pub fn typed_error_fixture() -> TypedErrorDto {
    TypedErrorDto {
        api_version: ApiVersion::V1,
        error_kind: "authoring_validation_failed".to_string(),
        error: "request violates the authoring v1 schema".to_string(),
        status: 400,
    }
}

#[cfg(test)]
pub fn degraded_snapshot_fixture(family: EndpointFamily) -> DegradedSnapshotDto {
    DegradedSnapshotDto {
        api_version: ApiVersion::V1,
        family,
        unavailable_tier: "semantic".to_string(),
        reason: "authoring projection unavailable".to_string(),
        snapshot: json!({"available": false}),
    }
}

#[cfg(test)]
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

#[cfg(test)]
fn command_value<T: Serialize>(request: CommandEnvelope<T>) -> Value {
    serde_json::to_value(request).expect("command fixture serializes")
}

#[cfg(test)]
fn read_value<T: Serialize>(payload: T) -> Value {
    serde_json::to_value(ReadEnvelope::new(payload)).expect("read fixture serializes")
}

/// The `create_proposal` request fixture: one `ReplaceBody` op over an existing
/// document + one `CreateDocument` op over a provisional one. Shared by the
/// `Proposal` family's request fixture AND the `AgentToolExecute` family's
/// `propose_changeset`/create tool-input fixture, so the two never drift.
#[cfg(test)]
fn create_proposal_request_fixture() -> CreateProposalRequest {
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
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: None,
                },
            },
            ChangesetChildOperationDraft {
                child_key: "child_2".to_string(),
                operation: ChangesetOperationKind::CreateDocument,
                target: target_revision_fence(provisional_document_fixture(), None, None),
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: "new document body".to_string(),
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: None,
                },
            },
        ],
    }
}

/// The `propose_changeset`/create semantic-tool input: the `CreateProposalRequest`
/// fixture flattened alongside the tool's `operation` discriminant tag (the wire
/// shape `tools::ProposeChangesetInput::Create` expects).
#[cfg(test)]
fn propose_changeset_create_input() -> Value {
    let mut value = serde_json::to_value(create_proposal_request_fixture())
        .expect("create-proposal fixture serializes");
    value["operation"] = json!("create");
    value
}

#[cfg(test)]
fn actor_fixture() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:alice").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

#[cfg(test)]
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

#[cfg(test)]
pub(super) fn provisional_document_fixture() -> DocumentRef {
    DocumentRef::ProvisionalCreate {
        provisional_doc_id: "provisional_doc_1".to_string(),
        doc_type: "plan".to_string(),
        feature: crate::authoring::FEATURE_TAG.to_string(),
        title: "Agentic Plan".to_string(),
        collision_status: ProvisionalCollisionStatus::Available,
        proposed_stem: Some("agentic-plan".to_string()),
        related: Vec::new(),
    }
}

#[cfg(test)]
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

#[cfg(test)]
pub(super) fn receipt(command: CommandKind, key: &str) -> ReceiptRef {
    ReceiptRef {
        id: ReceiptId::new("receipt_1").unwrap(),
        command,
        actor: actor_fixture(),
        idempotency_key: idempotency_key(key),
    }
}

#[cfg(test)]
pub(super) fn idempotency_key(value: &str) -> IdempotencyKey {
    IdempotencyKey::new(value).unwrap()
}

#[cfg(test)]
pub(super) fn revision(value: &str) -> RevisionToken {
    RevisionToken::new(value).unwrap()
}

#[cfg(test)]
fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

#[cfg(test)]
pub(super) fn changeset_id() -> ChangesetId {
    ChangesetId::new("changeset_1").unwrap()
}

#[cfg(test)]
pub(super) fn proposal_id() -> crate::authoring::model::ProposalId {
    crate::authoring::model::ProposalId::new("proposal_1").unwrap()
}

#[cfg(test)]
pub(super) fn approval_id() -> ApprovalId {
    ApprovalId::new("approval_1").unwrap()
}
