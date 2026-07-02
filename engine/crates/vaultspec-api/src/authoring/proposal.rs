//! Proposal command handlers.
//!
//! W03.P17 owns backend-owned proposal creation, draft mutation, validation,
//! review submission, supersession, cancellation, and snapshot reconstruction.
//! It deliberately does not create approval records, apply jobs, routes,
//! projections, actors, operation modes, LangGraph state, or core adapter calls.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::api::{ChangesetChildOperationDraft, CreateProposalRequest};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetHistory,
    ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorRef, ChangesetId, ChangesetKind, ChangesetStatus, CommandKind,
    IdempotencyKey, ReceiptId, RevisionToken,
};
use super::operations::MaterializedProposalOperation;
use super::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use super::store::idempotency::{
    IdempotencyKeyScope, IdempotencyRecord, IdempotencyScope, InFlightReservation, OutcomeKind,
    RecordedOutcome, ReserveDecision,
};
use super::store::unit_of_work::UnitOfWork;
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::{
    TransitionRequest, ValidationFreshness, initial_changeset_status_eligibility,
    submit_for_review_transition_eligibility, transition_eligibility,
};
use super::validation::{
    ChunkValidationEvidence, CurrentRevisionObservation, ValidationStatusRecord,
    submit_for_review_eligibility, validate_changeset_material,
};

const OUTCOME_SCHEMA: &str = "authoring.proposal_command_outcome.v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProposalCommandContext {
    pub actor: ActorRef,
    pub idempotency_key: IdempotencyKey,
    pub now_ms: i64,
    pub in_flight_expires_at_ms: Option<i64>,
    pub outcome_expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DraftProposalRequest {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
    pub operations: Vec<ChangesetChildOperationDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ValidateProposalRequest {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
    pub current_revisions: Vec<CurrentRevisionObservation>,
    pub chunk_evidence: Vec<ChunkValidationEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SubmitProposalRequest {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub validation_digest: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TerminalProposalRequest {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProposalCommandOutcome {
    pub schema_version: String,
    pub command: CommandKind,
    pub changeset_id: ChangesetId,
    pub changeset_revision: RevisionToken,
    pub status: ChangesetStatus,
    pub receipt_id: ReceiptId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_digest: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProposalCommandResult {
    Accepted {
        outcome: ProposalCommandOutcome,
        idempotency: IdempotencyRecord,
    },
    Replayed {
        idempotency: IdempotencyRecord,
    },
    InFlight {
        idempotency: IdempotencyRecord,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProposalSnapshot {
    pub history: ChangesetHistory,
    pub latest: Option<ChangesetAggregateRecord>,
    pub latest_validation: Option<ValidationStatusRecord>,
}

pub fn create_proposal(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: CreateProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(&request.changeset_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
        run_idempotent(
            uow,
            &context,
            CommandKind::CreateProposal,
            request.changeset_id.clone(),
            scope,
            request_digest.clone(),
            |receipt_id| {
                ensure_allowed(initial_changeset_status_eligibility(
                    ChangesetKind::Authoring,
                    ChangesetStatus::Draft,
                ))?;
                let operations = materialize_drafts(
                    reader,
                    &request.changeset_id,
                    &request.operations,
                    context.now_ms,
                    &request_digest,
                )?;
                store_preimages(uow, &operations.preimages)?;
                let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: request.changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(request.session_id.clone()),
                    summary: request.summary.clone(),
                    children: child_inputs_from_materialized(operations.materialized, None, None),
                    created_at_ms: context.now_ms,
                })
                .map_err(|err| StoreError::Ledger(err.to_string()))?;
                uow.ledger().append_revision(&record)?;
                Ok(outcome(
                    CommandKind::CreateProposal,
                    &record,
                    receipt_id,
                    None,
                ))
            },
        )
    })
}

pub fn append_draft(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: DraftProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    mutate_draft(
        store,
        reader,
        context,
        request,
        CommandKind::AppendDraft,
        DraftMutationMode::Append,
    )
}

pub fn replace_draft(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: DraftProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    mutate_draft(
        store,
        reader,
        context,
        request,
        CommandKind::ReplaceDraft,
        DraftMutationMode::Replace,
    )
}

pub fn validate_proposal(
    store: &mut Store,
    context: ProposalCommandContext,
    request: ValidateProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(
        &request.changeset_id,
        Some(&request.expected_revision),
        &request_digest,
    );
    store.with_unit_of_work(CommandKind::ValidateProposal, |uow| {
        run_idempotent(
            uow,
            &context,
            CommandKind::ValidateProposal,
            request.changeset_id.clone(),
            scope,
            request_digest.clone(),
            |receipt_id| {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                ensure_allowed(
                    TransitionRequest::new(
                        CommandKind::ValidateProposal,
                        latest.kind,
                        latest.status,
                        ChangesetStatus::Proposed,
                    )
                    .with_operation_count(latest.operation_count)
                    .into_eligibility(),
                )?;
                let operations = materialized_from_record(&latest)?;
                let validation = validate_changeset_material(
                    &operations,
                    &request.current_revisions,
                    &request.chunk_evidence,
                    context.now_ms,
                )
                .map_err(|err| StoreError::Validation(err.to_string()))?;
                uow.validations().store_record(&validation)?;
                let record = revision_from_existing(
                    &latest,
                    ChangesetStatus::Proposed,
                    request.summary.clone(),
                    child_inputs_from_record(
                        &latest,
                        Some(validation.material_digest.clone()),
                        Some(validation.validation_digest.clone()),
                    ),
                    context.now_ms,
                )?;
                uow.ledger().append_revision(&record)?;
                Ok(outcome(
                    CommandKind::ValidateProposal,
                    &record,
                    receipt_id,
                    Some(validation.validation_digest.clone()),
                ))
            },
        )
    })
}

pub fn submit_for_review(
    store: &mut Store,
    context: ProposalCommandContext,
    request: SubmitProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(
        &request.changeset_id,
        Some(&request.expected_revision),
        &request_digest,
    );
    store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        run_idempotent(
            uow,
            &context,
            CommandKind::SubmitForReview,
            request.changeset_id.clone(),
            scope,
            request_digest.clone(),
            |receipt_id| {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                let validation = uow
                    .validations()
                    .record_by_digest(&request.validation_digest)?;
                ensure_allowed(submit_for_review_eligibility(
                    validation.as_ref(),
                    Some(&request.validation_digest),
                ))?;
                let validation = validation.as_ref().ok_or_else(|| {
                    StoreError::Validation("proposal has no validation digest".to_string())
                })?;
                ensure_latest_revision_binds_validation(&latest, validation)?;
                let validation_freshness =
                    validation_freshness(Some(validation), &request.validation_digest);
                ensure_allowed(submit_for_review_transition_eligibility(
                    &latest,
                    validation_freshness,
                ))?;
                let record = revision_from_existing(
                    &latest,
                    ChangesetStatus::NeedsReview,
                    request.summary.clone(),
                    child_inputs_from_record(&latest, None, None),
                    context.now_ms,
                )?;
                uow.ledger().append_revision(&record)?;
                Ok(outcome(
                    CommandKind::SubmitForReview,
                    &record,
                    receipt_id,
                    Some(request.validation_digest.clone()),
                ))
            },
        )
    })
}

pub fn cancel_proposal(
    store: &mut Store,
    context: ProposalCommandContext,
    request: TerminalProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    terminal_transition(
        store,
        context,
        request,
        CommandKind::CancelProposal,
        ChangesetStatus::Cancelled,
    )
}

pub fn supersede_proposal(
    store: &mut Store,
    context: ProposalCommandContext,
    request: TerminalProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    terminal_transition(
        store,
        context,
        request,
        CommandKind::Supersede,
        ChangesetStatus::Superseded,
    )
}

pub fn proposal_snapshot(
    uow: &UnitOfWork<'_>,
    changeset_id: &ChangesetId,
) -> StoreResult<ProposalSnapshot> {
    let history = uow.ledger().history(changeset_id)?;
    let latest = history.latest().cloned();
    let latest_validation = uow.validations().latest_for_changeset(changeset_id)?;
    Ok(ProposalSnapshot {
        history,
        latest,
        latest_validation,
    })
}

#[derive(Debug, Clone, Copy)]
enum DraftMutationMode {
    Append,
    Replace,
}

fn mutate_draft(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: DraftProposalRequest,
    command: CommandKind,
    mode: DraftMutationMode,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(
        &request.changeset_id,
        Some(&request.expected_revision),
        &request_digest,
    );
    store.with_unit_of_work(command, |uow| {
        run_idempotent(
            uow,
            &context,
            command,
            request.changeset_id.clone(),
            scope,
            request_digest.clone(),
            |receipt_id| {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                ensure_allowed(
                    TransitionRequest::new(
                        command,
                        latest.kind,
                        latest.status,
                        ChangesetStatus::Draft,
                    )
                    .with_operation_count(latest.operation_count)
                    .into_eligibility(),
                )?;
                let operations = materialize_drafts(
                    reader,
                    &request.changeset_id,
                    &request.operations,
                    context.now_ms,
                    &request_digest,
                )?;
                store_preimages(uow, &operations.preimages)?;
                let mut children = match mode {
                    DraftMutationMode::Append => child_inputs_from_record(&latest, None, None),
                    DraftMutationMode::Replace => Vec::new(),
                };
                children.extend(child_inputs_from_materialized(
                    operations.materialized,
                    None,
                    None,
                ));
                let record = revision_from_existing(
                    &latest,
                    ChangesetStatus::Draft,
                    request.summary.clone(),
                    children,
                    context.now_ms,
                )?;
                uow.ledger().append_revision(&record)?;
                Ok(outcome(command, &record, receipt_id, None))
            },
        )
    })
}

fn terminal_transition(
    store: &mut Store,
    context: ProposalCommandContext,
    request: TerminalProposalRequest,
    command: CommandKind,
    next: ChangesetStatus,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(
        &request.changeset_id,
        Some(&request.expected_revision),
        &request_digest,
    );
    store.with_unit_of_work(command, |uow| {
        run_idempotent(
            uow,
            &context,
            command,
            request.changeset_id.clone(),
            scope,
            request_digest.clone(),
            |receipt_id| {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                ensure_allowed(
                    TransitionRequest::new(command, latest.kind, latest.status, next)
                        .with_operation_count(latest.operation_count)
                        .into_eligibility(),
                )?;
                let record = revision_from_existing(
                    &latest,
                    next,
                    request.summary.clone(),
                    child_inputs_from_record(&latest, None, None),
                    context.now_ms,
                )?;
                uow.ledger().append_revision(&record)?;
                Ok(outcome(command, &record, receipt_id, None))
            },
        )
    })
}

trait TransitionRequestExt {
    fn into_eligibility(self) -> ActionEligibility;
}

impl TransitionRequestExt for TransitionRequest {
    fn into_eligibility(self) -> ActionEligibility {
        transition_eligibility(self)
    }
}

fn run_idempotent(
    uow: &UnitOfWork<'_>,
    context: &ProposalCommandContext,
    command: CommandKind,
    aggregate_id: ChangesetId,
    scope: IdempotencyScope,
    request_digest: String,
    handler: impl FnOnce(&ReceiptId) -> StoreResult<ProposalCommandOutcome>,
) -> StoreResult<ProposalCommandResult> {
    let key_scope = IdempotencyKeyScope::new(
        context.actor.clone(),
        command,
        context.idempotency_key.clone(),
    );
    let receipt_id = receipt_id(command, &aggregate_id, &request_digest)?;
    let decision = uow.idempotency().reserve_in_flight(
        key_scope,
        scope,
        request_digest,
        receipt_id,
        context.now_ms,
        context.in_flight_expires_at_ms,
    )?;
    match decision {
        ReserveDecision::Reserved(reservation) => {
            let outcome = handler(&reservation.receipt_id)?;
            let idempotency = record_outcome(uow, &reservation, &outcome, context)?;
            Ok(ProposalCommandResult::Accepted {
                outcome,
                idempotency,
            })
        }
        ReserveDecision::Replay(record) => Ok(ProposalCommandResult::Replayed {
            idempotency: record,
        }),
        ReserveDecision::InFlight(record) => Ok(ProposalCommandResult::InFlight {
            idempotency: record,
        }),
        ReserveDecision::Conflict(conflict) => Err(StoreError::Idempotency(format!(
            "idempotency key `{}` conflicts with existing proposal command scope `{}`",
            conflict.key_scope.key.as_str(),
            conflict.existing_scope.id
        ))),
    }
}

fn record_outcome(
    uow: &UnitOfWork<'_>,
    reservation: &InFlightReservation,
    outcome: &ProposalCommandOutcome,
    context: &ProposalCommandContext,
) -> StoreResult<IdempotencyRecord> {
    let payload =
        serde_json::to_value(outcome).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    uow.idempotency().record_outcome(
        reservation,
        RecordedOutcome {
            kind: OutcomeKind::Accepted,
            aggregate_kind: "changeset".to_string(),
            aggregate_id: outcome.changeset_id.as_str().to_string(),
            schema: OUTCOME_SCHEMA.to_string(),
            payload,
            http_status: Some(202),
            completed_at_ms: context.now_ms,
            outcome_expires_at_ms: context.outcome_expires_at_ms,
        },
        context.now_ms,
    )
}

struct MaterializedDrafts {
    preimages: Vec<PreimageRecord>,
    materialized: Vec<MaterializedProposalOperation>,
}

fn materialize_drafts(
    reader: &SnapshotReader,
    changeset_id: &ChangesetId,
    drafts: &[ChangesetChildOperationDraft],
    now_ms: i64,
    request_digest: &str,
) -> StoreResult<MaterializedDrafts> {
    let mut preimages = Vec::with_capacity(drafts.len());
    let mut materialized = Vec::with_capacity(drafts.len());
    for draft in drafts {
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: preimage_id(changeset_id, &draft.child_key, request_digest),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: draft.child_key.clone(),
                document: draft.target.document.clone(),
                captured_at_ms: now_ms,
            })
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let operation = MaterializedProposalOperation::materialize_replace_body(
            changeset_id,
            draft.clone(),
            &reader
                .require_current_base(&draft.target.document)
                .map_err(|err| StoreError::Snapshot(err.to_string()))?,
            &preimage,
        )
        .map_err(|err| StoreError::Validation(err.to_string()))?;
        preimages.push(preimage);
        materialized.push(operation);
    }
    Ok(MaterializedDrafts {
        preimages,
        materialized,
    })
}

fn store_preimages(uow: &UnitOfWork<'_>, preimages: &[PreimageRecord]) -> StoreResult<()> {
    for preimage in preimages {
        if let Some(existing) = uow.snapshots().preimage(&preimage.preimage_id)? {
            if equivalent_preimage_payload(&existing, preimage) {
                continue;
            }
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` already exists with different payload",
                preimage.preimage_id
            )));
        }
        uow.snapshots().store_preimage(preimage)?;
    }
    Ok(())
}

fn equivalent_preimage_payload(left: &PreimageRecord, right: &PreimageRecord) -> bool {
    left.preimage_id == right.preimage_id
        && left.changeset_id == right.changeset_id
        && left.operation_id == right.operation_id
        && left.document == right.document
        && left.document_node_id == right.document_node_id
        && left.document_path == right.document_path
        && left.base_revision == right.base_revision
        && left.blob_hash == right.blob_hash
        && left.payload_hash == right.payload_hash
        && left.payload_text == right.payload_text
        && left.payload_bytes == right.payload_bytes
        && left.retention_record_kind == right.retention_record_kind
        && left.retention_record_id == right.retention_record_id
}

fn materialized_from_record(
    record: &ChangesetAggregateRecord,
) -> StoreResult<Vec<MaterializedProposalOperation>> {
    record
        .children
        .iter()
        .map(|child| {
            child.materialized_operation.clone().ok_or_else(|| {
                StoreError::Validation(format!(
                    "changeset `{}` child `{}` has no materialized proposal operation",
                    record.changeset_id, child.child_key
                ))
            })
        })
        .collect()
}

fn child_inputs_from_materialized(
    operations: Vec<MaterializedProposalOperation>,
    material_digest: Option<String>,
    validation_digest: Option<String>,
) -> Vec<ChangesetChildOperationInput> {
    operations
        .into_iter()
        .map(|operation| ChangesetChildOperationInput {
            child_key: operation.child_key.clone(),
            operation: operation.operation,
            target: operation.target.clone(),
            materialized_operation: Some(operation),
            material_digest: material_digest.clone(),
            validation_digest: validation_digest.clone(),
        })
        .collect()
}

fn child_inputs_from_record(
    record: &ChangesetAggregateRecord,
    material_digest: Option<String>,
    validation_digest: Option<String>,
) -> Vec<ChangesetChildOperationInput> {
    record
        .children
        .iter()
        .map(|child| ChangesetChildOperationInput {
            child_key: child.child_key.clone(),
            operation: child.operation,
            target: child.target.clone(),
            materialized_operation: child.materialized_operation.clone(),
            material_digest: material_digest
                .clone()
                .or_else(|| child.material_digest.clone()),
            validation_digest: validation_digest
                .clone()
                .or_else(|| child.validation_digest.clone()),
        })
        .collect()
}

fn revision_from_existing(
    previous: &ChangesetAggregateRecord,
    status: ChangesetStatus,
    summary: String,
    children: Vec<ChangesetChildOperationInput>,
    now_ms: i64,
) -> StoreResult<ChangesetAggregateRecord> {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: previous.changeset_id.clone(),
        previous_revision: Some(previous.changeset_revision.clone()),
        kind: previous.kind,
        status,
        session_id: previous.session_id.clone(),
        summary,
        children,
        created_at_ms: now_ms,
    })
    .map_err(|err| StoreError::Ledger(err.to_string()))
}

fn require_latest(
    uow: &UnitOfWork<'_>,
    changeset_id: &ChangesetId,
    expected_revision: &RevisionToken,
) -> StoreResult<ChangesetAggregateRecord> {
    let latest = uow.ledger().latest(changeset_id)?.ok_or_else(|| {
        StoreError::Ledger(format!(
            "changeset `{changeset_id}` has no proposal history"
        ))
    })?;
    if latest.changeset_revision != *expected_revision {
        return Err(StoreError::Ledger(format!(
            "changeset `{changeset_id}` expected revision `{expected_revision}` but latest is `{}`",
            latest.changeset_revision
        )));
    }
    Ok(latest)
}

fn validation_freshness(
    record: Option<&ValidationStatusRecord>,
    reviewed_validation_digest: &str,
) -> ValidationFreshness {
    let Some(record) = record else {
        return ValidationFreshness::missing();
    };
    ValidationFreshness {
        record_present: true,
        approval_ready: record.approval_ready,
        digest_matches_reviewed: record.validation_digest == reviewed_validation_digest,
    }
}

fn ensure_latest_revision_binds_validation(
    latest: &ChangesetAggregateRecord,
    validation: &ValidationStatusRecord,
) -> StoreResult<()> {
    if latest.operation_count != validation.operation_count {
        return Err(StoreError::Validation(format!(
            "validation digest `{}` is stale for the current proposal operation count",
            validation.validation_digest
        )));
    }
    let all_children_bound = latest.children.iter().all(|child| {
        child.material_digest.as_deref() == Some(validation.material_digest.as_str())
            && child.validation_digest.as_deref() == Some(validation.validation_digest.as_str())
    });
    if all_children_bound {
        Ok(())
    } else {
        Err(StoreError::Validation(format!(
            "validation digest `{}` is not bound to the current proposal revision",
            validation.validation_digest
        )))
    }
}

fn ensure_allowed(eligibility: ActionEligibility) -> StoreResult<()> {
    if eligibility.allowed {
        Ok(())
    } else {
        Err(StoreError::Ledger(eligibility.reason.unwrap_or_else(
            || "proposal command is not eligible".to_string(),
        )))
    }
}

fn outcome(
    command: CommandKind,
    record: &ChangesetAggregateRecord,
    receipt_id: &ReceiptId,
    validation_digest: Option<String>,
) -> ProposalCommandOutcome {
    ProposalCommandOutcome {
        schema_version: OUTCOME_SCHEMA.to_string(),
        command,
        changeset_id: record.changeset_id.clone(),
        changeset_revision: record.changeset_revision.clone(),
        status: record.status,
        receipt_id: receipt_id.clone(),
        validation_digest,
    }
}

fn proposal_scope(
    changeset_id: &ChangesetId,
    expected_revision: Option<&RevisionToken>,
    request_digest: &str,
) -> IdempotencyScope {
    IdempotencyScope::new(
        "changeset",
        changeset_id.as_str(),
        expected_revision.map(ToString::to_string),
        digest_value(
            "proposal_scope",
            &json!({
                "changeset_id": changeset_id,
                "expected_revision": expected_revision,
                "request_digest": request_digest,
            }),
        )
        .expect("scope digest serializes"),
    )
}

fn digest_value(prefix: &str, value: &impl Serialize) -> StoreResult<String> {
    let bytes =
        serde_json::to_vec(value).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    Ok(format!("{prefix}:{}", blob_oid(&bytes)))
}

fn receipt_id(
    command: CommandKind,
    changeset_id: &ChangesetId,
    request_digest: &str,
) -> StoreResult<ReceiptId> {
    ReceiptId::new(format!(
        "receipt:{:?}:{}:{}",
        command,
        changeset_id.as_str(),
        digest_suffix(request_digest)
    ))
    .map_err(|err| StoreError::Idempotency(err.to_string()))
}

fn preimage_id(changeset_id: &ChangesetId, child_key: &str, _request_digest: &str) -> String {
    format!("preimage:{}:{}", changeset_id.as_str(), child_key)
}

fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::api::{
        ChangesetOperationKind, DraftMode, DraftMutation, TargetRevisionFence,
    };
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::model::{ActorId, ActorKind, DocumentRef, SessionId};
    use crate::authoring::store::idempotency::IdempotencyState;
    use crate::authoring::validation::ChunkEvidenceStatus;

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        write_doc(
            dir.path(),
            ".vault/plan/proposal-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nold body\n",
        );
        let store = Store::open(&dir.path().join(".vault")).unwrap();
        (dir, store)
    }

    fn reader(root: &Path) -> SnapshotReader {
        SnapshotReader::for_worktree(root)
    }

    fn resolved_doc(root: &Path) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("proposal-plan".to_string()))
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("test document must be existing");
        };
        base_revision.clone()
    }

    fn changeset_id(value: &str) -> ChangesetId {
        ChangesetId::new(value).unwrap()
    }

    fn session_id() -> SessionId {
        SessionId::new("session_1").unwrap()
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:proposal-tests").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn context(key: &str, now_ms: i64) -> ProposalCommandContext {
        ProposalCommandContext {
            actor: actor(),
            idempotency_key: IdempotencyKey::new(key).unwrap(),
            now_ms,
            in_flight_expires_at_ms: Some(now_ms + 60_000),
            outcome_expires_at_ms: None,
        }
    }

    fn valid_body(label: &str) -> String {
        format!("---\ntags:\n  - '#plan'\n---\n\n# Plan\n\n{label}\n")
    }

    fn invalid_body(label: &str) -> String {
        format!("---\ntags: [unterminated\n---\n\n# Plan\n\n{label}\n")
    }

    fn draft_for(
        root: &Path,
        child_key: &str,
        body: impl Into<String>,
    ) -> ChangesetChildOperationDraft {
        let document = resolved_doc(root);
        let revision = base_revision(&document);
        ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: body.into(),
            },
        }
    }

    fn create_request(
        root: &Path,
        changeset_id: ChangesetId,
        child_key: &str,
        body: impl Into<String>,
    ) -> CreateProposalRequest {
        CreateProposalRequest {
            session_id: session_id(),
            changeset_id,
            summary: "create proposal".to_string(),
            operations: vec![draft_for(root, child_key, body)],
        }
    }

    fn draft_request(
        root: &Path,
        changeset_id: ChangesetId,
        expected_revision: RevisionToken,
        child_key: &str,
        body: impl Into<String>,
    ) -> DraftProposalRequest {
        DraftProposalRequest {
            changeset_id,
            expected_revision,
            summary: "mutate draft".to_string(),
            operations: vec![draft_for(root, child_key, body)],
        }
    }

    fn terminal_request(
        changeset_id: ChangesetId,
        expected_revision: RevisionToken,
        summary: &str,
    ) -> TerminalProposalRequest {
        TerminalProposalRequest {
            changeset_id,
            expected_revision,
            summary: summary.to_string(),
        }
    }

    fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
        match result {
            ProposalCommandResult::Accepted { outcome, .. } => outcome,
            other => panic!("expected accepted command result, got {other:?}"),
        }
    }

    fn assert_replayed(result: ProposalCommandResult) {
        match result {
            ProposalCommandResult::Replayed { idempotency } => {
                assert_eq!(idempotency.state, IdempotencyState::Recorded);
                assert!(idempotency.outcome.is_some());
            }
            other => panic!("expected replayed command result, got {other:?}"),
        }
    }

    fn latest_record(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetAggregateRecord {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().latest(changeset_id)
            })
            .unwrap()
            .expect("proposal has latest revision")
    }

    fn history(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetHistory {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().history(changeset_id)
            })
            .unwrap()
    }

    fn snapshot(store: &mut Store, changeset_id: &ChangesetId) -> ProposalSnapshot {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                proposal_snapshot(uow, changeset_id)
            })
            .unwrap()
    }

    fn validation_inputs(
        root: &Path,
        latest: &ChangesetAggregateRecord,
    ) -> (
        Vec<CurrentRevisionObservation>,
        Vec<ChunkValidationEvidence>,
    ) {
        let reader = reader(root);
        latest
            .children
            .iter()
            .map(|child| {
                let operation = child
                    .materialized_operation
                    .as_ref()
                    .expect("proposal child is materialized");
                let snapshot = reader
                    .require_current_base(&operation.target_snapshot.document)
                    .unwrap();
                let current =
                    CurrentRevisionObservation::from_snapshot(&child.child_key, &snapshot);
                let chunk = ChunkValidationEvidence {
                    child_key: child.child_key.clone(),
                    evidence_id: format!("chunk:{}", child.child_key),
                    document: operation.target_snapshot.document.clone(),
                    base_revision: operation.target_snapshot.base_revision.clone(),
                    chunker_version: "whole_document_v1".to_string(),
                    range: "bytes:0..all".to_string(),
                    content_hash: operation.review_diff.base_blob_hash.clone(),
                    observed_revision: Some(operation.target_snapshot.base_revision.clone()),
                    observed_content_hash: Some(operation.review_diff.base_blob_hash.clone()),
                    status: ChunkEvidenceStatus::Current,
                };
                (current, chunk)
            })
            .unzip()
    }

    fn validate_latest(
        store: &mut Store,
        root: &Path,
        changeset_id: &ChangesetId,
        key: &str,
        now_ms: i64,
    ) -> ProposalCommandOutcome {
        let latest = latest_record(store, changeset_id);
        let (current_revisions, chunk_evidence) = validation_inputs(root, &latest);
        accepted(
            validate_proposal(
                store,
                context(key, now_ms),
                ValidateProposalRequest {
                    changeset_id: changeset_id.clone(),
                    expected_revision: latest.changeset_revision,
                    summary: "validate proposal".to_string(),
                    current_revisions,
                    chunk_evidence,
                },
            )
            .unwrap(),
        )
    }

    #[test]
    fn draft_commands_append_ordered_revisions_and_replace_children() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_order");

        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:order", 100),
                create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let appended = accepted(
            append_draft(
                &mut store,
                &reader,
                context("idem:append:order", 101),
                draft_request(
                    root,
                    changeset_id.clone(),
                    created.changeset_revision.clone(),
                    "child_2",
                    valid_body("second"),
                ),
            )
            .unwrap(),
        );
        let replaced = accepted(
            replace_draft(
                &mut store,
                &reader,
                context("idem:replace:order", 102),
                draft_request(
                    root,
                    changeset_id.clone(),
                    appended.changeset_revision.clone(),
                    "child_3",
                    valid_body("third"),
                ),
            )
            .unwrap(),
        );

        let history = history(&mut store, &changeset_id);
        assert_eq!(history.revisions.len(), 3);
        assert_eq!(history.revisions[0].previous_revision, None);
        assert_eq!(
            history.revisions[1].previous_revision,
            Some(created.changeset_revision)
        );
        assert_eq!(
            history.revisions[2].previous_revision,
            Some(appended.changeset_revision)
        );
        assert_eq!(history.revisions[0].children[0].child_key, "child_1");
        assert_eq!(
            history.revisions[1]
                .children
                .iter()
                .map(|child| child.child_key.as_str())
                .collect::<Vec<_>>(),
            vec!["child_1", "child_2"]
        );
        assert_eq!(history.revisions[2].children.len(), 1);
        assert_eq!(history.revisions[2].children[0].child_key, "child_3");
        assert_eq!(
            history.latest().unwrap().changeset_revision,
            replaced.changeset_revision
        );
    }

    #[test]
    fn duplicate_create_replays_without_second_ledger_write() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_replay");
        let request = create_request(root, changeset_id.clone(), "child_1", valid_body("first"));

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:replay", 100),
                request.clone(),
            )
            .unwrap(),
        );
        assert_replayed(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:replay", 200),
                request,
            )
            .unwrap(),
        );

        assert_eq!(history(&mut store, &changeset_id).revisions.len(), 1);
    }

    #[test]
    fn same_idempotency_key_conflicts_on_changed_request_without_second_write() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_idempotency_conflict");

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:conflict", 100),
                create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let err = create_proposal(
            &mut store,
            &reader,
            context("idem:create:conflict", 101),
            create_request(root, changeset_id.clone(), "child_1", valid_body("changed")),
        )
        .unwrap_err();

        assert!(err.to_string().contains("conflicts"), "{err}");
        assert_eq!(history(&mut store, &changeset_id).revisions.len(), 1);
    }

    #[test]
    fn submit_requires_validation_bound_to_latest_revision() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_validation");

        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:validation", 100),
                create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let first_validation =
            validate_latest(&mut store, root, &changeset_id, "idem:validate:first", 101);
        let first_digest = first_validation
            .validation_digest
            .clone()
            .expect("validation returns digest");

        let stale_submit = submit_for_review(
            &mut store,
            context("idem:submit:missing", 102),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: first_validation.changeset_revision.clone(),
                validation_digest: "validation:missing".to_string(),
                summary: "submit missing validation".to_string(),
            },
        )
        .unwrap_err();
        assert!(
            stale_submit.to_string().contains("validation"),
            "{stale_submit}"
        );

        let replaced = accepted(
            replace_draft(
                &mut store,
                &reader,
                context("idem:replace:validation", 103),
                draft_request(
                    root,
                    changeset_id.clone(),
                    first_validation.changeset_revision.clone(),
                    "child_1",
                    valid_body("second"),
                ),
            )
            .unwrap(),
        );
        assert_ne!(replaced.changeset_revision, created.changeset_revision);
        let second_validation =
            validate_latest(&mut store, root, &changeset_id, "idem:validate:second", 104);

        let old_digest_submit = submit_for_review(
            &mut store,
            context("idem:submit:old-digest", 105),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: second_validation.changeset_revision.clone(),
                validation_digest: first_digest,
                summary: "submit old validation".to_string(),
            },
        )
        .unwrap_err();
        assert!(
            old_digest_submit
                .to_string()
                .contains("current proposal revision"),
            "{old_digest_submit}"
        );

        let submitted = accepted(
            submit_for_review(
                &mut store,
                context("idem:submit:latest", 106),
                SubmitProposalRequest {
                    changeset_id: changeset_id.clone(),
                    expected_revision: second_validation.changeset_revision,
                    validation_digest: second_validation.validation_digest.unwrap(),
                    summary: "submit latest validation".to_string(),
                },
            )
            .unwrap(),
        );
        assert_eq!(submitted.status, ChangesetStatus::NeedsReview);
    }

    #[test]
    fn submit_rejects_latest_validation_that_is_not_approval_ready() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_invalid_validation");

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:invalid", 100),
                create_request(
                    root,
                    changeset_id.clone(),
                    "child_1",
                    invalid_body("missing frontmatter"),
                ),
            )
            .unwrap(),
        );
        let validation = validate_latest(
            &mut store,
            root,
            &changeset_id,
            "idem:validate:invalid",
            101,
        );
        let validation_digest = validation
            .validation_digest
            .clone()
            .expect("validation returns digest");
        let invalid_snapshot = snapshot(&mut store, &changeset_id);
        let latest_validation = invalid_snapshot
            .latest_validation
            .expect("invalid validation is still recorded");
        assert_eq!(latest_validation.validation_digest, validation_digest);
        assert!(!latest_validation.approval_ready);

        let rejected = submit_for_review(
            &mut store,
            context("idem:submit:invalid", 102),
            SubmitProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: validation.changeset_revision,
                validation_digest,
                summary: "submit invalid validation".to_string(),
            },
        )
        .unwrap_err();

        assert!(
            rejected.to_string().contains("not reviewable"),
            "{rejected}"
        );
        let final_snapshot = snapshot(&mut store, &changeset_id);
        assert_eq!(final_snapshot.history.revisions.len(), 2);
        assert_eq!(
            final_snapshot.latest.unwrap().status,
            ChangesetStatus::Proposed
        );
    }

    #[test]
    fn proposal_snapshot_reconstructs_history_and_latest_validation() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let changeset_id = changeset_id("changeset_snapshot");

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:snapshot", 100),
                create_request(root, changeset_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let validation = validate_latest(
            &mut store,
            root,
            &changeset_id,
            "idem:validate:snapshot",
            101,
        );
        let validation_digest = validation
            .validation_digest
            .clone()
            .expect("validation returns digest");

        let snapshot = snapshot(&mut store, &changeset_id);
        assert_eq!(snapshot.history.revisions.len(), 2);
        assert_eq!(snapshot.latest.unwrap().status, ChangesetStatus::Proposed);
        assert_eq!(
            snapshot.latest_validation.unwrap().validation_digest,
            validation_digest
        );
    }

    #[test]
    fn cancellation_and_supersession_are_terminal() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = reader(root);
        let cancelled_id = changeset_id("changeset_cancelled");
        let superseded_id = changeset_id("changeset_superseded");

        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:cancelled", 100),
                create_request(root, cancelled_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let cancelled = accepted(
            cancel_proposal(
                &mut store,
                context("idem:cancel", 101),
                terminal_request(
                    cancelled_id.clone(),
                    created.changeset_revision,
                    "cancel proposal",
                ),
            )
            .unwrap(),
        );
        assert_eq!(cancelled.status, ChangesetStatus::Cancelled);
        let terminal_append = append_draft(
            &mut store,
            &reader,
            context("idem:append:cancelled", 102),
            draft_request(
                root,
                cancelled_id.clone(),
                cancelled.changeset_revision,
                "child_2",
                valid_body("blocked"),
            ),
        )
        .unwrap_err();
        assert!(
            terminal_append.to_string().contains("terminal"),
            "{terminal_append}"
        );

        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:superseded", 200),
                create_request(root, superseded_id.clone(), "child_1", valid_body("first")),
            )
            .unwrap(),
        );
        let superseded = accepted(
            supersede_proposal(
                &mut store,
                context("idem:supersede", 201),
                terminal_request(
                    superseded_id.clone(),
                    created.changeset_revision,
                    "supersede proposal",
                ),
            )
            .unwrap(),
        );
        assert_eq!(superseded.status, ChangesetStatus::Superseded);
        let terminal_validate = validate_proposal(
            &mut store,
            context("idem:validate:superseded", 202),
            ValidateProposalRequest {
                changeset_id: superseded_id,
                expected_revision: superseded.changeset_revision,
                summary: "validate terminal proposal".to_string(),
                current_revisions: Vec::new(),
                chunk_evidence: Vec::new(),
            },
        )
        .unwrap_err();
        assert!(
            terminal_validate.to_string().contains("terminal"),
            "{terminal_validate}"
        );
    }
}
