//! Direct-write changeset step pipeline: session/proposal/review orchestration
//! helpers that execute_direct_write composes. Split from direct_write.rs.

use std::time::Instant;

use ingest_struct::reader::blob_oid;

use super::super::actors::actor_kind_name;
use super::super::api::{
    ChangesetChildOperationDraft, CreateProposalRequest, CreateSessionRequest, DirectWriteRequest,
};
use super::super::apply::ApplyError;
use super::super::approvals::{
    ApprovalDecision, ApprovalError, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple,
    V1_POLICY_VERSION,
};
use super::super::documents::{DocumentResolver, ExistingDocumentLookup};
use super::super::ledger::ChangesetAggregateRecord;
use super::super::model::{
    ActionEligibility, ActorRef, ApprovalId, ChangesetId, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, ProposalId, ReceiptId, RevisionToken, SessionId,
};
use super::super::proposal::{
    ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, SubmitProposalRequest,
    ValidateProposalRequest, validation_evidence,
};
use super::super::snapshots::SnapshotReader;
use super::super::store::{Result as StoreResult, Store, StoreError};
use super::super::transitions::ValidationFreshness;
use super::super::validation::ValidationStatusRecord;
use super::types::{COMMAND_IN_FLIGHT_TTL_MS, COMMAND_OUTCOME_TTL_MS};

pub(super) fn ensure_direct_session(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
) -> StoreResult<()> {
    store.with_unit_of_work(CommandKind::CreateSession, |uow| {
        if uow.sessions().session(&ids.session_id)?.is_none() {
            let record = uow.sessions().create_session(
                ids.session_id.clone(),
                CreateSessionRequest {
                    scope: "direct-write".to_string(),
                    title: "Direct editor save".to_string(),
                },
                actor.clone(),
                now_ms,
            )?;
            super::super::session::append_session_created_event(
                uow,
                &record,
                actor,
                Some(idempotency_key.clone()),
                Some(CommandKind::DirectWrite),
                &direct_session_receipt_id(ids)?,
                now_ms,
            )?;
        }
        Ok(())
    })
}

pub(super) fn direct_session_receipt_id(ids: &DirectWriteIds) -> StoreResult<ReceiptId> {
    ReceiptId::new(format!(
        "receipt:direct-session:{}",
        ids.session_id.as_str()
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

pub(super) struct DirectProposalInput {
    pub(super) summary: String,
    pub(super) draft: ChangesetChildOperationDraft,
}

/// Open the direct-changeset draft through `create_direct_proposal`, which
/// routes into the SAME `materialize_drafts` per-kind dispatch (W02.P05a)
/// the standard propose surface uses — a direct-write save is materialized
/// through the IDENTICAL per-kind materializers, never a re-implementation.
pub(super) fn ensure_proposal_created(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
    input: DirectProposalInput,
) -> StoreResult<bool> {
    let result = super::super::proposal::create_direct_proposal(
        store,
        reader,
        context(actor, &step_key(idempotency_key, "create")?, now_ms),
        CreateProposalRequest {
            session_id: ids.session_id.clone(),
            changeset_id: ids.changeset_id.clone(),
            summary: input.summary,
            operations: vec![input.draft],
        },
    )?;
    match reduce_step(result)? {
        StepOutcome::Outcome => Ok(false),
        StepOutcome::InFlight => Ok(true),
        StepOutcome::Denied(eligibility) => Err(StoreError::Validation(format!(
            "direct write create denied: {:?}",
            eligibility.reason
        ))),
    }
}

pub(super) enum ReviewOpen {
    Ready(ReviewReady),
    InFlight,
}

pub(super) fn ensure_review_open(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
    summary: &str,
) -> StoreResult<ReviewOpen> {
    loop {
        let latest = latest_record(store, &ids.changeset_id)?;
        match latest.status {
            ChangesetStatus::Draft => {
                if validate_latest(
                    store,
                    reader,
                    actor,
                    idempotency_key,
                    now_ms,
                    &latest,
                    summary,
                )? {
                    return Ok(ReviewOpen::InFlight);
                }
            }
            ChangesetStatus::Proposed => {
                if submit_latest(store, actor, idempotency_key, now_ms, &latest, summary)? {
                    return Ok(ReviewOpen::InFlight);
                }
            }
            ChangesetStatus::NeedsReview
            | ChangesetStatus::Approved
            | ChangesetStatus::Applying
            | ChangesetStatus::Applied
            | ChangesetStatus::Failed => {
                let validation_digest = validation_digest_for(store, &ids.changeset_id, &latest)?;
                return Ok(ReviewOpen::Ready(ReviewReady {
                    needs_review_revision: latest.changeset_revision,
                    validation_digest,
                }));
            }
            other => {
                return Err(StoreError::Validation(format!(
                    "direct write changeset `{}` is not reviewable from status `{other:?}`",
                    ids.changeset_id
                )));
            }
        }
    }
}

pub(super) fn validate_latest(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    latest: &ChangesetAggregateRecord,
    summary: &str,
) -> StoreResult<bool> {
    let (current_revisions, chunk_evidence) = validation_evidence(reader, latest)?;
    let result = super::super::proposal::validate_proposal(
        store,
        context(actor, &step_key(idempotency_key, "validate")?, now_ms),
        ValidateProposalRequest {
            changeset_id: latest.changeset_id.clone(),
            expected_revision: latest.changeset_revision.clone(),
            summary: summary.to_string(),
            current_revisions,
            chunk_evidence,
        },
    )?;
    match reduce_step(result)? {
        StepOutcome::Outcome => Ok(false),
        StepOutcome::InFlight => Ok(true),
        StepOutcome::Denied(eligibility) => Err(StoreError::Validation(format!(
            "direct write validation denied: {:?}",
            eligibility.reason
        ))),
    }
}

pub(super) fn submit_latest(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    latest: &ChangesetAggregateRecord,
    summary: &str,
) -> StoreResult<bool> {
    let validation_digest = validation_digest_for(store, &latest.changeset_id, latest)?;
    let result = super::super::proposal::submit_for_review(
        store,
        context(actor, &step_key(idempotency_key, "submit")?, now_ms),
        SubmitProposalRequest {
            changeset_id: latest.changeset_id.clone(),
            expected_revision: latest.changeset_revision.clone(),
            validation_digest,
            summary: summary.to_string(),
        },
    )?;
    match reduce_step(result)? {
        StepOutcome::Outcome => Ok(false),
        StepOutcome::InFlight => Ok(true),
        StepOutcome::Denied(eligibility) => Err(StoreError::Validation(format!(
            "direct write submit denied: {:?}",
            eligibility.reason
        ))),
    }
}

pub(super) fn ensure_human_approval(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
    review: &ReviewReady,
) -> StoreResult<super::super::approvals::ApprovalOutcome> {
    store.with_unit_of_work(CommandKind::Approve, |uow| {
        let latest = uow.ledger().latest(&ids.changeset_id)?.ok_or_else(|| {
            StoreError::Ledger(format!(
                "direct write changeset `{}` vanished before approval",
                ids.changeset_id
            ))
        })?;
        let validation = uow.validations().latest_for_changeset(&ids.changeset_id)?;
        let current_digest = validation
            .as_ref()
            .map(|record| record.validation_digest.as_str())
            .unwrap_or(review.validation_digest.as_str());
        let approval = uow
            .approvals()
            .request_approval(ApprovalRequestInput {
                approval_id: ids.approval_id.clone(),
                proposal_id: ids.proposal_id.clone(),
                changeset_id: ids.changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: review.needs_review_revision.clone(),
                    validation_digest: review.validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: step_key(idempotency_key, "approval-request")?.to_string(),
                created_at_ms: now_ms,
            })
            .map_err(approval_err_to_store)?;
        if !approval.eligibility.allowed {
            return Ok(approval);
        }
        let decision = uow
            .approvals()
            .submit_decision(ReviewDecisionInput {
                proposal_id: &ids.proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: actor,
                validation: validation_freshness(validation.as_ref(), &review.validation_digest),
                current_validation_digest: current_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: Some("direct editor save self-approval".to_string()),
                decided_at_ms: now_ms,
            })
            .map_err(approval_err_to_store)?;
        if !decision.eligibility.allowed {
            return Ok(decision);
        }
        if !matches!(
            latest.status,
            ChangesetStatus::NeedsReview
                | ChangesetStatus::Approved
                | ChangesetStatus::Applying
                | ChangesetStatus::Applied
                | ChangesetStatus::Failed
        ) {
            return Err(StoreError::Validation(format!(
                "direct write approval observed unexpected status `{:?}`",
                latest.status
            )));
        }
        Ok(decision)
    })
}

#[derive(Debug, Clone)]
pub(super) struct ReviewReady {
    needs_review_revision: RevisionToken,
    validation_digest: String,
}

#[derive(Debug, Clone)]
pub(super) struct DirectWriteIds {
    pub(super) session_id: SessionId,
    pub(super) changeset_id: ChangesetId,
    pub(super) proposal_id: ProposalId,
    pub(super) approval_id: ApprovalId,
}

impl DirectWriteIds {
    pub(super) fn new(actor: &ActorRef, idempotency_key: &IdempotencyKey) -> StoreResult<Self> {
        let delegated = actor
            .delegated_by
            .as_ref()
            .map(|id| id.as_str())
            .unwrap_or("");
        let digest = blob_oid(
            format!(
                "{}|{}|{}|{}",
                actor_kind_name(actor.kind),
                actor.id,
                delegated,
                idempotency_key
            )
            .as_bytes(),
        );
        let changeset_id = ChangesetId::new(format!("direct:{digest}"))
            .map_err(|err| StoreError::Ledger(err.to_string()))?;
        let proposal_id = derive_proposal_id(&changeset_id)?;
        let approval_id = derive_approval_id(&changeset_id)?;
        let session_id = SessionId::new(format!("direct-session:{digest}"))
            .map_err(|err| StoreError::Ledger(err.to_string()))?;
        Ok(Self {
            session_id,
            changeset_id,
            proposal_id,
            approval_id,
        })
    }
}

#[derive(Debug)]
pub(super) enum StepOutcome {
    Outcome,
    Denied(ActionEligibility),
    InFlight,
}

pub(super) fn reduce_step(result: ProposalCommandResult) -> StoreResult<StepOutcome> {
    Ok(match result {
        ProposalCommandResult::Accepted { outcome, .. } => {
            let _ = outcome;
            StepOutcome::Outcome
        }
        ProposalCommandResult::Replayed { idempotency } => {
            let payload = idempotency.outcome.ok_or_else(|| {
                StoreError::Idempotency(
                    "replayed proposal command carries no recorded outcome".to_string(),
                )
            })?;
            let _outcome: ProposalCommandOutcome = serde_json::from_value(payload.payload)
                .map_err(|err| {
                    StoreError::Idempotency(format!(
                        "recorded proposal outcome is unreadable: {err}"
                    ))
                })?;
            StepOutcome::Outcome
        }
        ProposalCommandResult::InFlight { .. } => StepOutcome::InFlight,
        ProposalCommandResult::Denied { eligibility } => StepOutcome::Denied(eligibility),
    })
}

pub(super) fn context(
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
) -> ProposalCommandContext {
    ProposalCommandContext {
        actor: actor.clone(),
        idempotency_key: idempotency_key.clone(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + COMMAND_IN_FLIGHT_TTL_MS),
        outcome_expires_at_ms: Some(now_ms + COMMAND_OUTCOME_TTL_MS),
    }
}

pub(super) fn latest_record(
    store: &mut Store,
    changeset_id: &ChangesetId,
) -> StoreResult<ChangesetAggregateRecord> {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().latest(changeset_id)
        })?
        .ok_or_else(|| {
            StoreError::Ledger(format!(
                "changeset `{changeset_id}` has no direct write proposal history"
            ))
        })
}

pub(super) fn validation_digest_for(
    store: &mut Store,
    changeset_id: &ChangesetId,
    latest: &ChangesetAggregateRecord,
) -> StoreResult<String> {
    if let Some(digest) = latest
        .children
        .iter()
        .find_map(|child| child.validation_digest.clone())
    {
        return Ok(digest);
    }
    let record = store.with_unit_of_work(CommandKind::ValidateProposal, |uow| {
        uow.validations().latest_for_changeset(changeset_id)
    })?;
    record
        .map(|record| record.validation_digest)
        .ok_or_else(|| StoreError::Validation("direct write has no validation digest".to_string()))
}

pub(super) fn validation_freshness(
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

pub(super) fn resolve_existing_document(
    resolver: &DocumentResolver,
    doc_ref: &str,
) -> StoreResult<DocumentRef> {
    let lookup = if doc_ref.starts_with("doc:") {
        ExistingDocumentLookup::NodeId(doc_ref.to_string())
    } else if doc_ref.contains('/') || doc_ref.ends_with(".md") {
        ExistingDocumentLookup::Path(doc_ref.to_string())
    } else {
        ExistingDocumentLookup::Stem(doc_ref.to_string())
    };
    resolver
        .resolve_existing(lookup)
        .map_err(|err| StoreError::Snapshot(err.to_string()))
}

pub(super) fn with_base_revision(
    document: DocumentRef,
    blob_hash: &str,
) -> StoreResult<DocumentRef> {
    let base_revision = RevisionToken::new(format!("blob:{blob_hash}"))
        .map_err(|err| StoreError::Snapshot(err.to_string()))?;
    match document {
        DocumentRef::Existing {
            scope,
            node_id,
            stem,
            path,
            doc_type,
            ..
        } => Ok(DocumentRef::Existing {
            scope,
            node_id,
            stem,
            path,
            doc_type,
            base_revision,
        }),
        _ => Err(StoreError::Snapshot(
            "direct write requires an existing document".to_string(),
        )),
    }
}

pub(super) fn base_revision(document: &DocumentRef) -> Option<RevisionToken> {
    match document {
        DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
        _ => None,
    }
}

pub(super) fn validate_blob_hash(value: &str) -> StoreResult<String> {
    let ok = value.len() == 40
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    if ok {
        Ok(value.to_string())
    } else {
        Err(StoreError::Validation(
            "expected_blob_hash must be a 40-char lowercase hex git blob OID".to_string(),
        ))
    }
}

pub(super) fn request_digest(payload: &DirectWriteRequest) -> StoreResult<String> {
    let json = serde_json::to_vec(payload)
        .map_err(|err| StoreError::Idempotency(format!("direct write digest: {err}")))?;
    Ok(blob_oid(&json))
}

pub(super) fn direct_summary(summary: Option<&str>, doc_ref: &str) -> String {
    summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Editor save {doc_ref}"))
}

pub(super) fn derive_proposal_id(changeset_id: &ChangesetId) -> StoreResult<ProposalId> {
    ProposalId::new(format!(
        "proposal:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived proposal id is invalid: {err}")))
}

pub(super) fn derive_approval_id(changeset_id: &ChangesetId) -> StoreResult<ApprovalId> {
    ApprovalId::new(format!(
        "approval:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived approval id is invalid: {err}")))
}

pub(super) fn step_key(base: &IdempotencyKey, step: &str) -> StoreResult<IdempotencyKey> {
    IdempotencyKey::new(format!("{}:{step}", base.as_str())).map_err(|err| {
        StoreError::Idempotency(format!("composed idempotency key is invalid: {err}"))
    })
}

pub(super) fn approval_err_to_store(err: ApprovalError) -> StoreError {
    match err {
        ApprovalError::Store(store) => store,
        other => StoreError::Approval(other.to_string()),
    }
}

pub(super) fn apply_err_to_store(err: ApplyError) -> StoreError {
    match err {
        ApplyError::Store(store) => store,
        ApplyError::Conflict => StoreError::Idempotency(
            "apply idempotency key conflicts with a different recorded request".to_string(),
        ),
        ApplyError::NotFound(detail) => {
            StoreError::StaleRevision(format!("apply target not found: {detail}"))
        }
        ApplyError::MissingMaterialization {
            changeset_id,
            child_key,
        } => StoreError::Ledger(format!(
            "approved changeset `{changeset_id}` child `{child_key}` is not materialized"
        )),
        ApplyError::Internal(detail) => {
            StoreError::Ledger(format!("apply invariant violated: {detail}"))
        }
    }
}

pub(super) fn elapsed_ms(started: Instant) -> i64 {
    started.elapsed().as_millis().min(i64::MAX as u128) as i64
}
