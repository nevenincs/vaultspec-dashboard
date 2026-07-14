//! http handlers (module-decomposition, contiguous domain slice). See ./mod.rs.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use ingest_struct::reader::blob_oid;
use serde_json::{Value, json};

use super::super::api::{
    DirectWriteRequest as DirectWriteRequestDto, ReviewClaimRequest, ReviewDecisionRequest,
    ReviewReleaseRequest, ReviewRespondRequest, SetOperationModeRequest, SubmitForReviewRequest,
};
use super::super::apply::ApplyRequest;
use super::super::approvals::{
    ApprovalDecision, ApprovalOutcome, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple,
    V1_POLICY_VERSION,
};
use super::super::conflicts::{document_lease_scope, existing_node_id};
use super::super::core_adapter::CoreAdapter;
use super::super::leases::LeaseOutcome;
use super::super::ledger::ChangesetAggregateRecord;
use super::super::model::{
    ActionEligibility, ActorKind, ActorRef, ApprovalId, ChangesetId, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, ReviewDecisionKind, RevisionToken,
};
use super::super::modes::{OperationModeUpdate, scope_id_for_worktree, system_actor};
use super::super::principal::ResolvedCommand;
use super::super::proposal::{
    ProposalCommandContext, ProposalCommandResult, SubmitProposalRequest, ValidateProposalRequest,
    validation_evidence,
};
use super::super::review::{
    ClaimReviewInput, MAX_PROVENANCE_ENTRIES, ReviewClaimOutcome, ReviewClaimPurpose,
};
use super::super::snapshots::SnapshotReader;
use super::super::store::{Result as StoreResult, Store, StoreError};
use super::super::transitions::ValidationFreshness;
use super::*;
use crate::app::{AppState, now_ms};

/// Fetch a changeset's latest ledger revision, or a typed `StaleRevision` fault
/// naming `action` (the caller's verb) when the changeset has no history at all.
/// Shared by the submit composition's own lookup AND the standalone
/// `validate_proposal` agent-tool dispatch, so the two never resolve "latest" two
/// different ways.
pub(super) fn latest_changeset_revision(
    store: &mut Store,
    changeset_id: &ChangesetId,
    action: &str,
) -> StoreResult<ChangesetAggregateRecord> {
    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.ledger().latest(changeset_id)
        })?
        .ok_or_else(|| {
            StoreError::StaleRevision(format!(
                "changeset `{changeset_id}` has no proposal history to {action}"
            ))
        })
}

/// Validate a drafted proposal against BACKEND-DERIVED worktree evidence
/// (`validation_evidence`) — the client never supplies validation material. This is
/// the SAME derivation + leaf-command call the submit composition's validate step
/// uses; the standalone `validate_proposal` agent-tool dispatch reuses it verbatim so
/// the two paths can never drift.
pub(super) fn validate_proposal_from_worktree(
    store: &mut Store,
    reader: &SnapshotReader,
    context: ProposalCommandContext,
    changeset_id: &ChangesetId,
    expected_revision: RevisionToken,
    summary: String,
    latest: &ChangesetAggregateRecord,
) -> StoreResult<ProposalCommandResult> {
    let (current_revisions, chunk_evidence) = validation_evidence(reader, latest)?;
    super::super::proposal::validate_proposal(
        store,
        context,
        ValidateProposalRequest {
            changeset_id: changeset_id.clone(),
            expected_revision,
            summary,
            current_revisions,
            chunk_evidence,
        },
    )
}

/// The submit composition: validate the drafted proposal (evidence derived from the
/// live worktree), submit it for review, and open its approval request — all
/// SERVER-SIDE, each step idempotent under the composed keys. A denial at validate
/// or submit rides back as a value; a store fault aborts.
pub(super) fn submit_for_review_composed(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now: i64,
    changeset_id: &ChangesetId,
    payload: &SubmitForReviewRequest,
) -> StoreResult<SubmitComposite> {
    // 1. VALIDATE — derive the evidence from the live worktree so the client never
    //    supplies validation material (the "compose validation server-side" rule).
    let latest = latest_changeset_revision(store, changeset_id, "submit")?;

    // R1 PARTIAL-SUBMIT WEDGE HEAL: the composition is three units of work, so a
    // crash between the submit and the approval-open leaves the head in NeedsReview
    // with NO approval — and a fresh-key retry would then deny at validate
    // (NeedsReview is not validatable), wedging the proposal unrecoverably. The
    // deterministic proposal/approval ids let us RESUME idempotently: an in-review
    // head skips validate+submit and (re-)opens the approval.
    if latest.status == ChangesetStatus::NeedsReview {
        return resume_submit_in_review(store, changeset_id, &latest, now);
    }
    if let Some(replay) =
        replay_submitted_if_already_advanced(store, changeset_id, &latest, idempotency_key)?
    {
        return Ok(replay);
    }

    let validate = validate_proposal_from_worktree(
        store,
        reader,
        proposal_context(actor.clone(), step_key(idempotency_key, "validate")?, now),
        changeset_id,
        payload.expected_revision.clone(),
        payload.summary.clone(),
        &latest,
    )?;
    let validated = match reduce_step(validate)? {
        StepOutcome::Outcome { outcome, .. } => outcome,
        StepOutcome::Denied(eligibility) => return Ok(SubmitComposite::Denied(eligibility)),
        StepOutcome::InFlight => return Ok(SubmitComposite::InFlight),
    };
    let validation_digest = validated
        .validation_digest
        .clone()
        .ok_or_else(|| StoreError::Validation("validation pass produced no digest".to_string()))?;

    // 2. SUBMIT — move the validated proposal to NeedsReview under its new revision.
    let submit = super::super::proposal::submit_for_review(
        store,
        proposal_context(actor.clone(), step_key(idempotency_key, "submit")?, now),
        SubmitProposalRequest {
            changeset_id: changeset_id.clone(),
            expected_revision: validated.changeset_revision.clone(),
            validation_digest: validation_digest.clone(),
            summary: payload.summary.clone(),
        },
    )?;
    let (submitted, replayed) = match reduce_step(submit)? {
        StepOutcome::Outcome { outcome, replayed } => (outcome, replayed),
        StepOutcome::Denied(eligibility) => return Ok(SubmitComposite::Denied(eligibility)),
        StepOutcome::InFlight => return Ok(SubmitComposite::InFlight),
    };
    let needs_review_revision = submitted.changeset_revision.clone();

    // 3. OPEN APPROVAL — server-driven (request_approval is domain plumbing, not a
    //    wire verb), idempotent by proposal id + the composed `:approval` key.
    let proposal_id = derive_proposal_id(changeset_id)?;
    let approval_id = derive_approval_id(changeset_id)?;
    let approval = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals()
            .request_approval(ApprovalRequestInput {
                approval_id: approval_id.clone(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: needs_review_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: format!("{}:approval", idempotency_key.as_str()),
                created_at_ms: now,
            })
            .map_err(approval_err_to_store)
    })?;

    Ok(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision,
        validation_digest,
        proposal_id,
        approval: Box::new(approval.record),
        replayed,
    })
}

/// Resume a submit whose changeset is ALREADY in review (R1 wedge heal). If the
/// approval already exists the submit is fully done → replay it; if it is ABSENT
/// (the crash window between submit and approval-open) → open it from the recorded
/// validation, healing the wedge idempotently under a deterministic key.
pub(super) fn resume_submit_in_review(
    store: &mut Store,
    changeset_id: &ChangesetId,
    latest: &ChangesetAggregateRecord,
    now: i64,
) -> StoreResult<SubmitComposite> {
    let proposal_id = derive_proposal_id(changeset_id)?;
    let existing = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals().latest_for_proposal(&proposal_id)
    })?;
    if let Some(approval) = existing {
        // Fully submitted already — an idempotent re-submit replays the state.
        return Ok(SubmitComposite::Submitted {
            changeset_id: changeset_id.clone(),
            needs_review_revision: approval.reviewed.proposal_revision.clone(),
            validation_digest: approval.reviewed.validation_digest.clone(),
            proposal_id,
            approval: Box::new(approval),
            replayed: true,
        });
    }

    // WEDGE: NeedsReview but no approval → open it from the recorded validation.
    let validation_digest = store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            uow.validations().latest_for_changeset(changeset_id)
        })?
        .map(|record| record.validation_digest)
        .ok_or_else(|| {
            StoreError::Validation(
                "submitted proposal has no validation record to resume its approval".to_string(),
            )
        })?;
    let needs_review_revision = latest.changeset_revision.clone();
    let approval_id = derive_approval_id(changeset_id)?;
    let approval = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals()
            .request_approval(ApprovalRequestInput {
                approval_id,
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: needs_review_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: format!("resume-approval:{changeset_id}"),
                created_at_ms: now,
            })
            .map_err(approval_err_to_store)
    })?;

    Ok(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision,
        validation_digest,
        proposal_id,
        approval: Box::new(approval.record),
        replayed: true,
    })
}

/// Replay a submit whose first request already advanced beyond review, such as
/// autonomous mode auto-applying the changeset before the client retry arrives.
/// The replay is keyed to the original approval-open step so a different submit
/// attempt cannot inherit an old approval.
pub(super) fn replay_submitted_if_already_advanced(
    store: &mut Store,
    changeset_id: &ChangesetId,
    latest: &ChangesetAggregateRecord,
    idempotency_key: &IdempotencyKey,
) -> StoreResult<Option<SubmitComposite>> {
    if matches!(
        latest.status,
        ChangesetStatus::Draft | ChangesetStatus::Proposed | ChangesetStatus::NeedsReview
    ) {
        return Ok(None);
    }
    let proposal_id = derive_proposal_id(changeset_id)?;
    let expected_key = format!("{}:approval", idempotency_key.as_str());
    let existing = store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
        uow.approvals().latest_for_proposal(&proposal_id)
    })?;
    let Some(approval) = existing else {
        return Ok(None);
    };
    if approval.idempotency_key != expected_key || approval.changeset_id != *changeset_id {
        return Ok(None);
    }
    Ok(Some(SubmitComposite::Submitted {
        changeset_id: changeset_id.clone(),
        needs_review_revision: approval.reviewed.proposal_revision.clone(),
        validation_digest: approval.reviewed.validation_digest.clone(),
        proposal_id,
        approval: Box::new(approval),
        replayed: true,
    }))
}

/// `POST /authoring/v1/proposals/{changeset_id}/submit` — move a drafted proposal
/// into review. The route COMPOSES the validation pass + the approval-request
/// opening SERVER-SIDE; the actor is the middleware-resolved principal.
pub async fn submit_for_review(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
    command: ResolvedCommand<SubmitForReviewRequest>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    match state.with_authoring_store(|store| {
        submit_for_review_composed(
            store,
            &reader,
            &actor,
            &idempotency_key,
            now,
            &changeset_id,
            &payload,
        )
    }) {
        Ok(composite) => {
            let mode_outcome =
                mode_after_submit(state.clone(), &composite, idempotency_key.clone(), now).await;
            match mode_outcome {
                Ok(outcome) => submit_composite_response(&state, composite, outcome),
                Err(err) => command_error_response(&state, &err),
            }
        }
        Err(err) => command_error_response(&state, &err),
    }
}

pub(super) async fn mode_after_submit(
    state: Arc<AppState>,
    composite: &SubmitComposite,
    idempotency_key: IdempotencyKey,
    now: i64,
) -> StoreResult<Option<ModePostSubmitOutcome>> {
    let SubmitComposite::Submitted {
        changeset_id,
        proposal_id: _,
        approval,
        ..
    } = composite
    else {
        return Ok(None);
    };
    let worktree_root = state.active_workspace_root();
    let scope_id = scope_id_for_worktree(&worktree_root);
    let approval = (**approval).clone();
    let changeset_id = changeset_id.clone();
    let state_for_blocking = state.clone();
    tokio::task::spawn_blocking(move || {
        let auto_approval = state_for_blocking.with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, now)
            })
        })?;
        let apply = if auto_approval.should_auto_apply() {
            let system = system_actor();
            let key = IdempotencyKey::new(format!(
                "mode-auto-apply:{}",
                blob_oid(idempotency_key.as_str().as_bytes())
            ))
            .map_err(|err| StoreError::Idempotency(format!("auto-apply key: {err}")))?;
            let adapter = CoreAdapter::detect();
            Some(state_for_blocking.with_authoring_store(|store| {
                super::super::apply::apply_changeset(
                    store,
                    &adapter,
                    &worktree_root,
                    ApplyRequest {
                        changeset_id: &changeset_id,
                        proposal_id: &approval.proposal_id,
                        actor: &system,
                        idempotency_key: &key,
                        // The system auto-apply presents no fencing token; advisory fencing
                        // refuses it only if a live human/agent lease holds the target.
                        fencing_token: None,
                        now_ms: now,
                    },
                )
                .map_err(apply_err_to_store)
            })?)
        } else {
            None
        };
        Ok(Some(ModePostSubmitOutcome {
            auto_approval,
            apply,
        }))
    })
    .await
    .map_err(|_| {
        StoreError::Mode(
            "operation-mode post-submit task did not complete; re-query the proposal".to_string(),
        )
    })?
}

/// Map a composed submit outcome to its status + VALUE: a denial rides the 200
/// success envelope as a value; a still-in-flight step is 202; a completed submit
/// (or idempotent replay) serves the reviewed revision + derived ids + the opened
/// approval the reviewer drives the decision from. Shared by the `/submit` route AND
/// the `/execute` agent-tool seam's `request_approval` alias.
pub(super) fn submit_composite_value(
    composite: SubmitComposite,
    mode_outcome: Option<ModePostSubmitOutcome>,
) -> (StatusCode, Value) {
    match composite {
        SubmitComposite::Denied(eligibility) => (StatusCode::OK, denial_value(&eligibility)),
        SubmitComposite::InFlight => (StatusCode::ACCEPTED, json!({ "status": "in_flight" })),
        SubmitComposite::Submitted {
            changeset_id,
            needs_review_revision,
            validation_digest,
            proposal_id,
            approval,
            replayed,
        } => (
            StatusCode::OK,
            json!({
                "status": if replayed { "replayed" } else { "submitted" },
                "changeset_id": changeset_id.as_str(),
                "proposal_id": proposal_id.as_str(),
                "reviewed_revision": needs_review_revision,
                "validation_digest": validation_digest,
                "approval": approval,
                "mode": mode_post_submit_value(mode_outcome),
            }),
        ),
    }
}

pub(super) fn submit_composite_response(
    state: &AppState,
    composite: SubmitComposite,
    mode_outcome: Option<ModePostSubmitOutcome>,
) -> Response {
    let (status, value) = submit_composite_value(composite, mode_outcome);
    (status, super::super::response::snapshot(state, value)).into_response()
}

pub(super) fn mode_post_submit_value(outcome: Option<ModePostSubmitOutcome>) -> serde_json::Value {
    let Some(outcome) = outcome else {
        return serde_json::Value::Null;
    };
    let auto = outcome.auto_approval;
    json!({
        "policy": auto.policy,
        "auto_approval": {
            "status": if auto.approved() { "approved" } else { "not_applicable" },
            "eligibility": auto.eligibility,
            "approval": auto.approval,
            "system_policy_approval": auto.marker,
        },
        "auto_apply": outcome.apply.map(|apply| json!({
            "status": if apply.replayed { "replayed" } else if apply.in_flight { "in_flight" } else { "recorded" },
            "receipt": apply.receipt,
        })),
    })
}

// --- review decision (approve / reject) ---------------------------------------

/// `POST /authoring/v1/reviews/{approval_id}/decisions` — record a reviewer's
/// approve/reject on an opened approval. The self-approval ban + freshness gate run
/// INSIDE `submit_decision`; the reviewer is the middleware-resolved principal, and
/// the current validation freshness is read from store state (never client-claimed).
pub async fn submit_review_decision(
    State(state): State<Arc<AppState>>,
    Path(approval_id): Path<String>,
    command: ResolvedCommand<ReviewDecisionRequest>,
) -> Response {
    let path_approval_id = match ApprovalId::new(&approval_id) {
        Ok(id) => id,
        Err(err) => {
            return super::super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid approval id: {err}"),
            )
            .into_response();
        }
    };
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    if path_approval_id != payload.approval_id {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "path approval id does not match the request body",
        )
        .into_response();
    }
    // FLIP (W14.P42a S261): `Respond` is a claim-based CLARIFICATION exchange, not an
    // approval decision — it never submits a decision and preserves the changeset status.
    // Route it to the review-station engine, resolving the changeset from the approval.
    if matches!(payload.decision, ReviewDecisionKind::Respond) {
        return respond_via_review_decision(&state, &actor, &payload, now);
    }
    let decision = match payload.decision {
        ReviewDecisionKind::Approve => ApprovalDecision::Approve,
        ReviewDecisionKind::Reject => ApprovalDecision::Reject,
        // FLIP: `Edit` → the request-changes / reviewer-edit loop. It flows through the SAME
        // approval engine as approve/reject; `submit_decision` applies the EditProposal arc
        // (NeedsReview|Approved -> Draft), staling the prior approval.
        ReviewDecisionKind::Edit => ApprovalDecision::RequestChanges,
        ReviewDecisionKind::Respond => {
            unreachable!("respond is routed to the review station above")
        }
    };
    let command_kind = match decision {
        ApprovalDecision::Approve => CommandKind::Approve,
        ApprovalDecision::Reject => CommandKind::Reject,
        ApprovalDecision::RequestChanges => CommandKind::EditProposal,
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(command_kind, |uow| {
            let approval = uow
                .approvals()
                .latest_for_proposal(&payload.proposal_id)?
                .ok_or_else(|| {
                    StoreError::Approval(format!(
                        "no approval request exists for proposal `{}`",
                        payload.proposal_id
                    ))
                })?;
            // R1: reviewed_revision is LOAD-BEARING — the reviewer attests the exact
            // revision the approval was opened against. A mismatch means they reviewed
            // a SUPERSEDED revision → a typed conflict (409), never a silently-ignored
            // field.
            if payload.reviewed_revision != approval.reviewed.proposal_revision {
                return Err(StoreError::StaleReview(format!(
                    "reviewed revision `{}` is stale — the approval was opened against `{}`",
                    payload.reviewed_revision, approval.reviewed.proposal_revision
                )));
            }
            // Cheap belt: the loaded approval must be the one named on the path
            // (unreachable under the V1 derived-id world, but guards a future where a
            // client names an approval id directly).
            if approval.approval_id != payload.approval_id {
                return Err(StoreError::Approval(format!(
                    "loaded approval `{}` does not match the requested approval `{}`",
                    approval.approval_id, payload.approval_id
                )));
            }
            let validation = uow
                .validations()
                .latest_for_changeset(&approval.changeset_id)?;
            let current_validation_digest = validation
                .as_ref()
                .map(|record| record.validation_digest.clone())
                .unwrap_or_default();
            let validation_freshness = ValidationFreshness {
                record_present: validation.is_some(),
                approval_ready: validation
                    .as_ref()
                    .map(|record| record.approval_ready)
                    .unwrap_or(false),
                digest_matches_reviewed: validation
                    .as_ref()
                    .map(|record| record.validation_digest == approval.reviewed.validation_digest)
                    .unwrap_or(false),
            };
            uow.approvals()
                .submit_decision(ReviewDecisionInput {
                    proposal_id: &payload.proposal_id,
                    decision,
                    reviewer: &actor,
                    validation: validation_freshness,
                    current_validation_digest: &current_validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: payload.comment.clone(),
                    decided_at_ms: now,
                })
                .map_err(approval_err_to_store)
        })
    }) {
        Ok(outcome) => approval_outcome_response(&state, outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

// --- review station: queue, claims, provenance (W13.P24, wired W14.P42a) -------

/// Map a review-claim operation outcome to its enveloped VALUE: allowed vs a denial value (a
/// contended claim, a non-holder release/respond, a self-review ban) with the item's current
/// advisory claim row (its holder, live window, and latest clarification exchange).
pub(super) fn review_claim_outcome_value(outcome: &ReviewClaimOutcome) -> Value {
    json!({
        "status": if outcome.eligibility.allowed { "allowed" } else { "denied" },
        "allowed": outcome.eligibility.allowed,
        "command": outcome.eligibility.command,
        "reason": outcome.eligibility.reason,
        "replayed": outcome.replayed,
        "claim": outcome.record.as_ref().map(|record| json!({
            "changeset_id": record.changeset_id,
            "state": record.state,
            "purpose": record.purpose,
            "reviewer": record.reviewer,
            "claimed_at_ms": record.claimed_at_ms,
            "expires_at_ms": record.expires_at_ms,
            "latest_clarification": record.latest_clarification,
        })),
    })
}

pub(super) fn review_claim_outcome_response(
    state: &AppState,
    outcome: &ReviewClaimOutcome,
) -> Response {
    super::super::response::snapshot(state, review_claim_outcome_value(outcome)).into_response()
}

/// `POST /authoring/v1/review-claims` — advisory claim of a changeset's review item. A live
/// claim by a DIFFERENT reviewer rides the 200 envelope as a denial value; the self-review
/// ban (an automated proposer cannot review its own work) is a denial too. The reviewer is
/// the middleware-resolved principal.
pub async fn claim_review(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<ReviewClaimRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    let input = ClaimReviewInput {
        changeset_id: payload.changeset_id,
        purpose: ReviewClaimPurpose::Review,
        reviewer: actor,
        idempotency_key: idempotency_key.as_str().to_string(),
        now_ms: now,
        ttl_ms: payload.ttl_ms.map(|ttl| ttl as i64),
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::ClaimReview, |uow| {
            uow.review_station().claim(input)
        })
    }) {
        Ok(outcome) => review_claim_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/review-claims/release` — release a held review claim (holder-only; a
/// non-holder release is a denial value and leaves the claim held by its owner).
pub async fn release_review(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<ReviewReleaseRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::ReleaseReview, |uow| {
            uow.review_station()
                .release(&payload.changeset_id, &actor, now)
        })
    }) {
        Ok(outcome) => review_claim_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// `POST /authoring/v1/review-claims/respond` — record a clarification response on a held
/// item (holder-only; status-preserving — the item stays `claimed`). A non-holder or an
/// absent/expired claim is a denial value.
pub async fn respond_review(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<ReviewRespondRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, _idempotency_key, payload) = command.into_parts();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::Respond, |uow| {
            uow.review_station()
                .respond(&payload.changeset_id, &actor, payload.comment, now)
        })
    }) {
        Ok(outcome) => review_claim_outcome_response(&state, &outcome),
        Err(err) => command_error_response(&state, &err),
    }
}

/// The `Respond` review-decision flip: a clarification exchange over the review-station
/// engine, resolving the changeset from the approval. It never submits an approval decision
/// and preserves the changeset status. An absent comment is a denial value.
pub(super) fn respond_via_review_decision(
    state: &AppState,
    actor: &ActorRef,
    payload: &ReviewDecisionRequest,
    now: i64,
) -> Response {
    let Some(comment) = payload.comment.clone() else {
        return denial_snapshot(
            state,
            &ActionEligibility::denied(
                CommandKind::Respond,
                "a clarification response requires a comment",
            ),
        );
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::Respond, |uow| {
            let approval = uow
                .approvals()
                .latest_for_proposal(&payload.proposal_id)?
                .ok_or_else(|| {
                    StoreError::Approval(format!(
                        "no approval request exists for proposal `{}`",
                        payload.proposal_id
                    ))
                })?;
            uow.review_station()
                .respond(&approval.changeset_id, actor, comment, now)
        })
    }) {
        Ok(outcome) => review_claim_outcome_response(state, &outcome),
        Err(err) => command_error_response(state, &err),
    }
}

/// `GET /authoring/v1/review-queue` — the bounded review-station queue (needs-review work
/// waiting for humans) with each item's composed four-state and advisory claim overlay. No
/// principal required (reads are unauthenticated); a store failure degrades to a typed 503.
pub async fn review_queue(State(state): State<Arc<AppState>>) -> Response {
    let now = now_ms();
    let worktree_root = state.active_workspace_root();
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.review_station().review_queue(&worktree_root, now)
        })
    }) {
        Ok(projection) => super::super::response::snapshot(
            &state,
            serde_json::to_value(projection).expect("review queue projection serializes"),
        )
        .into_response(),
        Err(err) => store_unavailable(&state, &err),
    }
}

/// `GET /authoring/v1/proposals/{changeset_id}/provenance` — the bounded, REDACTED
/// provenance trail for one changeset: the append-only revision chain, the reviewer's
/// decision, and the structured lineage. Redaction is structural — only material FINGERPRINTS
/// (id + content hash + byte length) are surfaced, never bodies. 404 for an unknown changeset.
pub async fn proposal_provenance(
    State(state): State<Arc<AppState>>,
    Path(changeset_id): Path<String>,
) -> Response {
    let changeset_id = match ChangesetId::new(&changeset_id) {
        Ok(id) => id,
        Err(err) => {
            return super::super::response::typed_error(
                &state,
                StatusCode::BAD_REQUEST,
                REQUEST_INVALID_KIND,
                &format!("invalid changeset id: {err}"),
            )
            .into_response();
        }
    };
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.review_station()
                .changeset_provenance(&changeset_id, MAX_PROVENANCE_ENTRIES)
        })
    }) {
        Ok(Some(trail)) => super::super::response::snapshot(
            &state,
            serde_json::to_value(trail).expect("provenance trail serializes"),
        )
        .into_response(),
        Ok(None) => super::super::response::typed_error(
            &state,
            StatusCode::NOT_FOUND,
            "authoring_proposal_not_found",
            "no such changeset",
        )
        .into_response(),
        Err(err) => store_unavailable(&state, &err),
    }
}

/// Map an approval decision outcome to its enveloped response: a refused decision
/// (the self-approval ban, a stale/ineligible review) rides the 200 success
/// envelope as a denied value; a permitted decision serves the durable approval.
pub(super) fn approval_outcome_response(state: &AppState, outcome: ApprovalOutcome) -> Response {
    if !outcome.eligibility.allowed {
        return denial_snapshot(state, &outcome.eligibility);
    }
    super::super::response::snapshot(
        state,
        json!({
            "status": if outcome.replayed { "replayed" } else { "decided" },
            "approval": outcome.record,
        }),
    )
    .into_response()
}

// --- operation mode writes ----------------------------------------------------

/// `POST /authoring/v1/mode` — set the active worktree operation mode. The scope
/// is backend-derived from the active workspace root, and the actor is the
/// middleware-resolved principal.
pub async fn set_operation_mode(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<SetOperationModeRequest>,
) -> Response {
    let now = now_ms();
    let (actor, _command, idempotency_key, payload) = command.into_parts();
    if !matches!(actor.kind, ActorKind::Human | ActorKind::System) {
        return denial_snapshot(
            &state,
            &ActionEligibility::denied(
                CommandKind::SetOperationMode,
                "only a human or system principal may change operation mode policy",
            ),
        );
    }
    let scope_id = scope_id_for_worktree(&state.active_workspace_root());
    match state.with_authoring_store(|store| {
        store.with_unit_of_work(CommandKind::SetOperationMode, |uow| {
            uow.modes()
                .set_scope_mode(&scope_id, payload.mode, &actor, &idempotency_key, now)
        })
    }) {
        Ok(update) => mode_update_response(&state, &scope_id, update),
        Err(err) => command_error_response(&state, &err),
    }
}

pub(super) fn mode_update_response(
    state: &AppState,
    scope_id: &str,
    update: OperationModeUpdate,
) -> Response {
    super::super::response::snapshot(
        state,
        json!({
            "status": if update.replayed { "replayed" } else { "recorded" },
            "scope_id": scope_id,
            "previous_mode": update.previous_mode,
            "mode": update.record.mode,
            "policy_id": update.record.policy_id,
            "policy_version": update.record.policy_version,
            "requeued_approvals": update.requeued_approvals,
        }),
    )
    .into_response()
}

// --- direct editor save -------------------------------------------------------

/// `POST /authoring/v1/direct-writes` — route a human editor save through the
/// authoring ledger as a self-approved direct changeset. Direct-changeset is
/// the sole materializer (W14.P47 retired the legacy `/ops/core` dual-run
/// comparison); `capabilities.enabled` is a pure kill switch, on by default.
pub async fn direct_write(
    State(state): State<Arc<AppState>>,
    command: ResolvedCommand<DirectWriteRequestDto>,
) -> Response {
    let now = now_ms();
    let (actor, command_kind, idempotency_key, payload) = command.into_parts();
    if command_kind != CommandKind::DirectWrite {
        return super::super::response::typed_error(
            &state,
            StatusCode::BAD_REQUEST,
            REQUEST_INVALID_KIND,
            "direct-write route requires command `direct_write`",
        )
        .into_response();
    }

    let worktree_root = state.active_workspace_root();
    let capabilities =
        super::super::direct_write::DirectWriteCapabilities::for_worktree(&worktree_root);
    if !capabilities.enabled {
        return super::super::response::typed_error(
            &state,
            StatusCode::SERVICE_UNAVAILABLE,
            "authoring_direct_write_disabled",
            "direct editor saves are not enabled by the backend capability state",
        )
        .into_response();
    }

    let adapter = CoreAdapter::detect();
    let state_for_blocking = state.clone();
    let joined = tokio::task::spawn_blocking(move || {
        state_for_blocking.with_authoring_store(|store| {
            super::super::direct_write::execute_direct_write(
                store,
                &adapter,
                &worktree_root,
                &actor,
                &idempotency_key,
                now,
                payload,
            )
        })
    })
    .await;

    match joined {
        Ok(Ok(outcome)) => direct_write_outcome_response(&state, outcome),
        Ok(Err(err)) => command_error_response(&state, &err),
        Err(_join) => super::super::response::typed_error(
            &state,
            StatusCode::INTERNAL_SERVER_ERROR,
            "authoring_direct_write_indeterminate",
            "the direct editor save did not complete; re-query the document and changeset before retrying",
        )
        .into_response(),
    }
}

pub(super) fn direct_write_outcome_response(
    state: &AppState,
    outcome: super::super::direct_write::DirectWriteOutcome,
) -> Response {
    if outcome.status == super::super::direct_write::DirectWriteStatus::InFlight {
        return (
            StatusCode::ACCEPTED,
            super::super::response::snapshot(state, json!({ "status": "in_flight" })),
        )
            .into_response();
    }
    let data = serde_json::to_value(&outcome).expect("direct write outcome serializes");
    super::super::response::snapshot(state, data).into_response()
}

// --- advisory leases (W13.P26, wired W14.P42a) --------------------------------

/// The per-document lease scope for a target: the SAME P27 `document_lease_scope`
/// convention (`{scope_id_for_worktree}::{node_id}`) the apply-time fencing check derives,
/// so acquire and apply agree on the fenced scope. `None` for a target with no fixed
/// document identity (a provisional create), which cannot be leased.
pub(super) fn lease_scope_for_target(state: &AppState, target: &DocumentRef) -> Option<String> {
    existing_node_id(target)
        .map(|node_id| document_lease_scope(&state.active_workspace_root(), &node_id))
}

/// The typed bad-request for a lease command whose target has no leasable document identity.
pub(super) fn lease_target_invalid(state: &AppState) -> Response {
    super::super::response::typed_error(
        state,
        StatusCode::BAD_REQUEST,
        REQUEST_INVALID_KIND,
        "an advisory lease requires an existing document target",
    )
    .into_response()
}

/// Map a lease operation outcome to its enveloped VALUE: allowed vs a denial value (a
/// concurrent-acquire block, a non-owner renew/release, an expired lease) with the scope's
/// current lease row — including the monotonic fencing token a holder presents at apply.
pub(super) fn lease_outcome_value(outcome: &LeaseOutcome) -> Value {
    json!({
        "status": if outcome.eligibility.allowed { "allowed" } else { "denied" },
        "allowed": outcome.eligibility.allowed,
        "command": outcome.eligibility.command,
        "reason": outcome.eligibility.reason,
        "replayed": outcome.replayed,
        "lease": outcome.record.as_ref().map(|record| json!({
            "scope_id": record.scope_id,
            "purpose": record.purpose,
            "holder": record.holder,
            "fencing_token": record.fencing_token,
            "state": record.state,
            "acquired_at_ms": record.acquired_at_ms,
            "expires_at_ms": record.expires_at_ms,
        })),
    })
}

pub(super) fn lease_outcome_response(state: &AppState, outcome: &LeaseOutcome) -> Response {
    super::super::response::snapshot(state, lease_outcome_value(outcome)).into_response()
}
