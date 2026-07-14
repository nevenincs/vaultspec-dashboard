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

use super::api::{ChangesetChildOperationDraft, ChangesetOperationKind, CreateProposalRequest};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetHistory,
    ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorRef, ChangesetId, ChangesetKind, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, ReceiptId, RevisionToken,
};
use super::operations::MaterializedProposalOperation;
use super::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use super::store::idempotency::{
    IdempotencyConflict, IdempotencyKeyScope, IdempotencyRecord, IdempotencyScope,
    InFlightReservation, OutcomeKind, RecordedOutcome, ReplayLookup, ReserveDecision,
};
use super::store::unit_of_work::UnitOfWork;
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::{
    TransitionRequest, ValidationFreshness, initial_changeset_status_eligibility,
    submit_for_review_transition_eligibility, transition_eligibility,
};
use super::validation::{
    ChunkEvidenceStatus, ChunkValidationEvidence, CurrentRevisionObservation,
    ValidationStatusRecord, submit_for_review_eligibility, validate_changeset_material,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    /// The eligibility gate refused the command BEFORE any reservation: it rides
    /// the SUCCESS envelope as a denied value, reserving nothing and mutating
    /// nothing. Denials are values; errors are faults (never a `StoreError`).
    Denied {
        eligibility: ActionEligibility,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProposalSnapshot {
    pub history: ChangesetHistory,
    pub latest: Option<ChangesetAggregateRecord>,
    pub latest_validation: Option<ValidationStatusRecord>,
}

/// Open a new authoring (agent/human proposal) changeset — `kind=authoring`.
pub fn create_proposal(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: CreateProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    create_proposal_of_kind(store, reader, context, request, ChangesetKind::Authoring)
}

/// Open a human editor's DIRECT save changeset — `kind=direct` (operation-modes ADR;
/// P49-R2). Structurally identical to `create_proposal`, but the ledger records the
/// direct kind so the save is self-describing without a side-table join. It is
/// self-approved by the human downstream, not system-auto-approved.
pub fn create_direct_proposal(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: CreateProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    create_proposal_of_kind(store, reader, context, request, ChangesetKind::Direct)
}

fn create_proposal_of_kind(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    request: CreateProposalRequest,
    kind: ChangesetKind,
) -> StoreResult<ProposalCommandResult> {
    let request_digest = digest_value("proposal_request", &request)?;
    let scope = proposal_scope(&request.changeset_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
        run_idempotent(
            uow,
            &context,
            CommandCoordinates {
                command: CommandKind::CreateProposal,
                aggregate_id: request.changeset_id.clone(),
                scope,
                request_digest: request_digest.clone(),
            },
            || {
                if uow.sessions().session(&request.session_id)?.is_none() {
                    return Err(StoreError::Session(format!(
                        "session `{}` does not exist",
                        request.session_id
                    )));
                }
                Ok(admit_if_eligible(
                    initial_changeset_status_eligibility(kind, ChangesetStatus::Draft),
                    (),
                ))
            },
            |(), receipt_id| {
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
                    kind,
                    status: ChangesetStatus::Draft,
                    session_id: Some(request.session_id.clone()),
                    actor: context.actor.clone(),
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
            CommandCoordinates {
                command: CommandKind::ValidateProposal,
                aggregate_id: request.changeset_id.clone(),
                scope,
                request_digest: request_digest.clone(),
            },
            || {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                Ok(admit_if_eligible(
                    TransitionRequest::new(
                        CommandKind::ValidateProposal,
                        latest.kind,
                        latest.status,
                        ChangesetStatus::Proposed,
                    )
                    .with_operation_count(latest.operation_count)
                    .into_eligibility(),
                    latest,
                ))
            },
            |latest, receipt_id| {
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
                    &context.actor,
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
            CommandCoordinates {
                command: CommandKind::SubmitForReview,
                aggregate_id: request.changeset_id.clone(),
                scope,
                request_digest: request_digest.clone(),
            },
            || {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                let validation = uow
                    .validations()
                    .record_by_digest(&request.validation_digest)?;
                let eligibility = submit_for_review_eligibility(
                    validation.as_ref(),
                    Some(&request.validation_digest),
                );
                if !eligibility.allowed {
                    return Ok(GateOutcome::Deny(eligibility));
                }
                let validation = validation.as_ref().ok_or_else(|| {
                    StoreError::Validation("proposal has no validation digest".to_string())
                })?;
                ensure_latest_revision_binds_validation(&latest, validation)?;
                let validation_freshness =
                    validation_freshness(Some(validation), &request.validation_digest);
                Ok(admit_if_eligible(
                    submit_for_review_transition_eligibility(&latest, validation_freshness),
                    latest,
                ))
            },
            |latest, receipt_id| {
                let record = revision_from_existing(
                    &latest,
                    &context.actor,
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

/// Derive the validation evidence (current-revision observations + chunk evidence)
/// for a changeset's latest materialized children from the live worktree — the
/// server-side inputs the submit route feeds to [`validate_proposal`] so the
/// validation pass is composed on the BACKEND, never supplied by the client. A
/// whole-document ReplaceBody proposal validates against its captured base blob.
pub fn validation_evidence(
    reader: &SnapshotReader,
    latest: &ChangesetAggregateRecord,
) -> StoreResult<(
    Vec<CurrentRevisionObservation>,
    Vec<ChunkValidationEvidence>,
)> {
    let mut current_revisions = Vec::with_capacity(latest.children.len());
    let mut chunk_evidence = Vec::with_capacity(latest.children.len());
    for child in &latest.children {
        let operation = child.materialized_operation.as_ref().ok_or_else(|| {
            StoreError::Validation(format!(
                "changeset `{}` child `{}` has no materialized operation to validate",
                latest.changeset_id, child.child_key
            ))
        })?;
        // CreateDocument (W02.P05a) has no existing document to re-observe — the
        // shared `create_document_phantom_base` helper, never a live worktree
        // read (see its doc for why this must be the SAME derivation
        // `materialize_create_document` uses).
        if matches!(
            operation.target_snapshot.document,
            DocumentRef::ProvisionalCreate { .. }
        ) {
            let (empty_hash, phantom_revision) = super::operations::create_document_phantom_base();
            current_revisions.push(CurrentRevisionObservation {
                child_key: child.child_key.clone(),
                document: operation.target_snapshot.document.clone(),
                revision: phantom_revision,
                blob_hash: empty_hash,
            });
            chunk_evidence.push(ChunkValidationEvidence {
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
            });
            continue;
        }
        let snapshot = reader
            .require_current_base(&operation.target_snapshot.document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        current_revisions.push(CurrentRevisionObservation::from_snapshot(
            &child.child_key,
            &snapshot,
        ));
        chunk_evidence.push(ChunkValidationEvidence {
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
        });
    }
    Ok((current_revisions, chunk_evidence))
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
            CommandCoordinates {
                command,
                aggregate_id: request.changeset_id.clone(),
                scope,
                request_digest: request_digest.clone(),
            },
            || {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                Ok(admit_if_eligible(
                    TransitionRequest::new(
                        command,
                        latest.kind,
                        latest.status,
                        ChangesetStatus::Draft,
                    )
                    .with_operation_count(latest.operation_count)
                    .into_eligibility(),
                    latest,
                ))
            },
            |latest, receipt_id| {
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
                    &context.actor,
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
            CommandCoordinates {
                command,
                aggregate_id: request.changeset_id.clone(),
                scope,
                request_digest: request_digest.clone(),
            },
            || {
                let latest =
                    require_latest(uow, &request.changeset_id, &request.expected_revision)?;
                Ok(admit_if_eligible(
                    TransitionRequest::new(command, latest.kind, latest.status, next)
                        .with_operation_count(latest.operation_count)
                        .into_eligibility(),
                    latest,
                ))
            },
            |latest, receipt_id| {
                let record = revision_from_existing(
                    &latest,
                    &context.actor,
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

/// The eligibility gate's decision, evaluated BEFORE any idempotency reservation
/// (denials-are-values ADR; mirrors `apply`'s `Preflight::Denied`). `Admit`
/// carries the loaded precondition state the handler needs, so the aggregate is
/// read once; `Deny` rides the SUCCESS envelope as a value and reserves nothing.
enum GateOutcome<L> {
    Admit(L),
    Deny(ActionEligibility),
}

/// Fold an eligibility check into a gate outcome: allowed admits with the loaded
/// state; a denial becomes a `Deny` VALUE, never an `Err` (errors are faults).
fn admit_if_eligible<L>(eligibility: ActionEligibility, loaded: L) -> GateOutcome<L> {
    if eligibility.allowed {
        GateOutcome::Admit(loaded)
    } else {
        GateOutcome::Deny(eligibility)
    }
}

fn idempotency_conflict(conflict: &IdempotencyConflict) -> StoreError {
    StoreError::Idempotency(format!(
        "idempotency key `{}` conflicts with existing proposal command scope `{}`",
        conflict.key_scope.key.as_str(),
        conflict.existing_scope.id
    ))
}

/// The idempotency coordinates of one proposal command: which command it is, the
/// changeset it targets, and the scope + request digest that dedupe a retry.
struct CommandCoordinates {
    command: CommandKind,
    aggregate_id: ChangesetId,
    scope: IdempotencyScope,
    request_digest: String,
}

fn run_idempotent<L>(
    uow: &UnitOfWork<'_>,
    context: &ProposalCommandContext,
    coordinates: CommandCoordinates,
    gate: impl FnOnce() -> StoreResult<GateOutcome<L>>,
    handler: impl FnOnce(L, &ReceiptId) -> StoreResult<ProposalCommandOutcome>,
) -> StoreResult<ProposalCommandResult> {
    let CommandCoordinates {
        command,
        aggregate_id,
        scope,
        request_digest,
    } = coordinates;
    let _actor_record = uow.actors().ensure_active(&context.actor)?;
    let key_scope = IdempotencyKeyScope::new(
        context.actor.clone(),
        command,
        context.idempotency_key.clone(),
    );
    let receipt_id = receipt_id(command, &aggregate_id, &request_digest)?;

    // Replay / in-flight FIRST: a recorded outcome replays regardless of the
    // current aggregate state, and a still-live attempt is reported in-flight —
    // neither re-runs the eligibility gate (idempotency wins over re-evaluation).
    match uow
        .idempotency()
        .lookup_replay(&key_scope, &scope, &request_digest, context.now_ms)?
    {
        ReplayLookup::Replay(record) => {
            return Ok(ProposalCommandResult::Replayed {
                idempotency: record,
            });
        }
        ReplayLookup::InFlight(record) => {
            return Ok(ProposalCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReplayLookup::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
        // A never-seen key, or an EXPIRED prior attempt safe to re-run (a proposal
        // command is a single atomic ledger append): proceed to the gate.
        ReplayLookup::None | ReplayLookup::Expired(_) => {}
    }

    // Fresh command: run the eligibility gate BEFORE reserving. A denial leaves
    // the store untouched and rides the success envelope as a value.
    let loaded = match gate()? {
        GateOutcome::Admit(loaded) => loaded,
        GateOutcome::Deny(eligibility) => {
            return Ok(ProposalCommandResult::Denied { eligibility });
        }
    };

    // Reserve the attempt, mutate under the reserved receipt, record the outcome.
    let reservation = match uow.idempotency().reserve_in_flight(
        key_scope,
        scope,
        request_digest,
        receipt_id,
        context.now_ms,
        context.in_flight_expires_at_ms,
    )? {
        ReserveDecision::Reserved(reservation) => reservation,
        // A concurrent writer landed the same key between the lookup and here.
        ReserveDecision::Replay(record) => {
            return Ok(ProposalCommandResult::Replayed {
                idempotency: record,
            });
        }
        ReserveDecision::InFlight(record) => {
            return Ok(ProposalCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReserveDecision::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
    };
    let outcome = handler(loaded, &reservation.receipt_id)?;
    let idempotency = record_outcome(uow, &reservation, &outcome, context)?;
    Ok(ProposalCommandResult::Accepted {
        outcome,
        idempotency,
    })
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

/// Materialize every draft in a propose-surface request (`create_proposal`,
/// `append_draft`, `replace_draft`), dispatching on the draft's operation kind
/// exactly like `apply.rs`'s `build_write_invocation`/`post_verify_expectation`
/// dispatch on it — so a new migrated kind extends by adding an arm here, and
/// an unhandled kind fails LOUD (a typed `StoreError`), never silently
/// materializing the wrong shape.
///
/// `CreateDocument` (W02.P05a) is the ODD ONE OUT, mirroring
/// `MaterializedProposalOperation::materialize_create_document`'s own doc: its
/// target has no existing document to snapshot or preimage against, so it
/// takes the ONLY early branch, contributing NOTHING to `preimages` — the
/// phantom preimage `materialize_create_document` builds internally is
/// explicitly never persisted (there is nothing real to restore). Every other
/// kind shares the existing-document preimage-capture + base-snapshot path
/// below, exactly as before this generalization.
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
        if draft.operation == ChangesetOperationKind::CreateDocument {
            let operation = MaterializedProposalOperation::materialize_create_document(
                changeset_id,
                draft.clone(),
                now_ms,
            )
            .map_err(|err| StoreError::Validation(err.to_string()))?;
            materialized.push(operation);
            continue;
        }
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: preimage_id(changeset_id, &draft.child_key, request_digest),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: draft.child_key.clone(),
                document: draft.target.document.clone(),
                captured_at_ms: now_ms,
            })
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let base_snapshot = reader
            .require_current_base(&draft.target.document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let operation = match draft.operation {
            ChangesetOperationKind::ReplaceBody => {
                MaterializedProposalOperation::materialize_replace_body(
                    changeset_id,
                    draft.clone(),
                    &base_snapshot,
                    &preimage,
                )
            }
            ChangesetOperationKind::EditFrontmatter => {
                MaterializedProposalOperation::materialize_edit_frontmatter(
                    changeset_id,
                    draft.clone(),
                    &base_snapshot,
                    &preimage,
                )
            }
            ChangesetOperationKind::Rename => MaterializedProposalOperation::materialize_rename(
                changeset_id,
                draft.clone(),
                &base_snapshot,
                &preimage,
            ),
            ChangesetOperationKind::SectionEdit => {
                MaterializedProposalOperation::materialize_section_edit(
                    changeset_id,
                    draft.clone(),
                    &base_snapshot,
                    &preimage,
                )
            }
            ChangesetOperationKind::SetPlanStepState => {
                MaterializedProposalOperation::materialize_set_plan_step_state(
                    changeset_id,
                    draft.clone(),
                    &base_snapshot,
                    &preimage,
                )
            }
            other => {
                return Err(StoreError::Validation(format!(
                    "operation `{}` kind `{other:?}` is not supported for proposal \
                     materialization",
                    draft.child_key
                )));
            }
        }
        .map_err(|err| StoreError::Validation(err.to_string()))?;
        preimages.push(preimage);
        materialized.push(operation);
    }
    Ok(MaterializedDrafts {
        preimages,
        materialized,
    })
}

/// Persist the preimages for a set of freshly materialized child operations. Shared by
/// proposal creation, draft mutation, and explicit rebase (`rebase.rs`). A preimage is
/// keyed by its stable id (`preimage:{changeset}:{child}`), so re-materializing the SAME
/// child re-visits the SAME row: an equivalent capture (the draft-mutation case, where
/// the base is unchanged) dedups; a CHANGED capture (the rebase case, where the base
/// advanced) UPDATES the stored "before" to the rebased base so rollback material never
/// goes stale. It never inserts a duplicate tuple, and never silently keeps a stale
/// preimage.
pub(crate) fn store_preimages(
    uow: &UnitOfWork<'_>,
    preimages: &[PreimageRecord],
) -> StoreResult<()> {
    for preimage in preimages {
        if let Some(existing) = uow.snapshots().preimage(&preimage.preimage_id)? {
            if equivalent_preimage_payload(&existing, preimage) {
                continue;
            }
            uow.snapshots().update_preimage(preimage)?;
            continue;
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
    actor: &ActorRef,
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
        actor: actor.clone(),
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
        // A client-supplied `expected_revision` that no longer matches the ledger
        // head is an optimistic-concurrency CONFLICT ("your base is stale"), not an
        // infrastructure fault — the route maps it to a 409, never a 5xx.
        return Err(StoreError::StaleRevision(format!(
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

pub(crate) fn preimage_id(
    changeset_id: &ChangesetId,
    child_key: &str,
    _request_digest: &str,
) -> String {
    format!("preimage:{}:{}", changeset_id.as_str(), child_key)
}

fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

#[cfg(test)]
mod tests;
