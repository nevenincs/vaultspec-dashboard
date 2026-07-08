//! Explicit rebase and supersession commands (W13.P28).
//!
//! The concurrency-leases-conflicts ADR is emphatic that rebase is EXPLICIT and
//! never a silent mutation: "A conflicted proposal can be regenerated or rebased
//! into a new proposal revision against the current document state. Any automatic
//! or LLM-assisted rebase produces a new reviewable candidate and invalidates prior
//! approvals." This module lands the two user-visible flows that realize that
//! sentence over the machinery earlier phases already built:
//!
//! 1. IN-PLACE REBASE (`rebase_proposal`). A changeset whose apply attempt landed it
//!    in `Conflicted` is rebased onto the CURRENT document state through the one
//!    declared `Rebase: Conflicted -> Draft` arc (Rollback: `Conflicted ->
//!    RollbackProposed`). The drafted body — the human/agent's semantic edit intent —
//!    is PRESERVED while each `ReplaceBody` child is re-materialized against the
//!    current base, so the edit is re-based, never lost. The result is a NEW ledger
//!    revision on the SAME changeset that re-enters review (`Draft`); it is not an
//!    approval and carries none forward.
//!
//! 2. REPLACEMENT PROPOSAL (`create_replacement_proposal`). A proposal that is stale
//!    but not yet `Conflicted` (e.g. a `NeedsReview`/`Approved` head whose base drifted,
//!    which the P27 detector surfaces as a read-time report) has no in-place arc. The
//!    explicit flow is CREATE-then-SUPERSEDE: seed a brand-new changeset from the
//!    original's carried-forward operations FIRST, then supersede the original. This
//!    ordering never orphans a superseded original on a failed create, and — because
//!    both legs are idempotency-keyed — a replay after a crash between the two legs
//!    completes the supersede when the create already landed.
//!
//! CARRY-FORWARD + ANCHOR DRIFT. Both flows share one `carry_forward_drafts` pass,
//! which reuses the P27 `detect_conflicts` detector to classify the source. A
//! `StaleBaseRevision`/`StaleWholeDocumentDraft` child is safe to re-base (re-materialize
//! against the fresh base, body preserved). `AnchorDrift` — the target's identity moved
//! or was removed — CANNOT be auto-rebased: dropping the child would silently lose the
//! edit intent, and re-targeting it is a human decision. So drift DENIES the command as
//! a VALUE, pointing the caller at drafting a replacement against the corrected target.
//!
//! FAULT vs VALUE. A mismatched `expected_revision` is an optimistic-concurrency FAULT
//! (`Err(StaleRevision)`, mapped to 409 by the route), matching the rest of the proposal
//! surface. A non-`Conflicted` head, a terminal source, or an anchor-drift child is a
//! DENIED VALUE that rides the success envelope and mutates nothing.
//!
//! This phase deliberately owns no route wiring, projection, or event surface (later
//! phases) and needs no migration: it composes the existing ledger, transition,
//! conflict, snapshot, and proposal-command primitives. It mirrors — never imports —
//! `proposal.rs`'s private idempotency loop so the most-shared proposal module is not
//! touched.
#![allow(dead_code)]

use std::path::Path;

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, CreateProposalRequest, DraftMode,
    DraftMutation, TargetRevisionFence,
};
use super::conflicts::{ConflictKind, detect_conflicts};
use super::documents::{DocumentResolver, ExistingDocumentLookup};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ChangesetId, ChangesetKind, ChangesetStatus, CommandKind, DocumentRef,
    ReceiptId, RevisionToken,
};
use super::operations::MaterializedProposalOperation;
use super::proposal::{
    ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, TerminalProposalRequest,
    create_proposal, preimage_id, store_preimages, supersede_proposal,
};
use super::snapshots::{PreimageCaptureRequest, SnapshotReader};
use super::store::idempotency::{
    IdempotencyConflict, IdempotencyKeyScope, IdempotencyRecord, IdempotencyScope,
    InFlightReservation, OutcomeKind, RecordedOutcome, ReplayLookup, ReserveDecision,
};
use super::store::unit_of_work::UnitOfWork;
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::{TransitionRequest, transition_eligibility};

/// The command-outcome schema shared with the rest of the proposal command surface, so
/// a rebase outcome serializes with the same wire shape as every other lifecycle command.
const OUTCOME_SCHEMA: &str = "authoring.proposal_command_outcome.v1";

/// Explicit in-place rebase of a conflicted changeset. The changeset id travels in the
/// request; `expected_revision` fences the optimistic-concurrency check against the
/// current ledger head.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RebaseProposalRequest {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
}

/// Explicit replacement-proposal creation: supersede a stale-but-not-conflicted source
/// with a fresh candidate seeded from its carried-forward operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateReplacementProposalRequest {
    pub source_changeset_id: ChangesetId,
    pub source_expected_revision: RevisionToken,
    pub replacement_changeset_id: ChangesetId,
    pub summary: String,
}

/// The result of a two-legged replacement flow. `replacement` is the create leg's
/// result (a `Denied` value when the source is terminal or a child anchor-drifted, in
/// which case NOTHING is created or superseded). `supersession` is present only when the
/// replacement create landed, so the source is never superseded without a replacement.
#[derive(Debug)]
pub struct ReplacementProposalResult {
    pub replacement: ProposalCommandResult,
    pub supersession: Option<ProposalCommandResult>,
}

/// The planned two-leg execution, separated from execution so a caller (and a test) can
/// prove the crash-between-legs recovery: the create leg is idempotency-keyed, so a
/// replay that re-plans and re-invokes create replays it and lets the supersede leg run.
pub(crate) enum ReplacementPlan {
    Ready {
        create_request: CreateProposalRequest,
        source_revision: RevisionToken,
    },
    Denied {
        eligibility: ActionEligibility,
    },
}

/// Rebase a `Conflicted` changeset onto the current document state, in place, producing
/// a NEW reviewable `Draft` (Rollback: `RollbackProposed`) revision on the same
/// changeset with every `ReplaceBody` child re-materialized against the fresh base and
/// the drafted body preserved. A non-`Conflicted` head or an anchor-drift child is a
/// `Denied` value; a stale `expected_revision` is an `Err(StaleRevision)` fault.
pub fn rebase_proposal(
    store: &mut Store,
    worktree_root: &Path,
    context: ProposalCommandContext,
    request: RebaseProposalRequest,
) -> StoreResult<ProposalCommandResult> {
    let reader = SnapshotReader::for_worktree(worktree_root);
    let request_digest = digest_value("rebase_request", &request)?;
    let scope = rebase_scope(
        &request.changeset_id,
        Some(&request.expected_revision),
        &request_digest,
    );
    store.with_unit_of_work(CommandKind::Rebase, |uow| {
        let _actor_record = uow.actors().ensure_active(&context.actor)?;
        let key_scope = IdempotencyKeyScope::new(
            context.actor.clone(),
            CommandKind::Rebase,
            context.idempotency_key.clone(),
        );
        let receipt_id = receipt_id(CommandKind::Rebase, &request.changeset_id, &request_digest)?;

        // Replay / in-flight FIRST: a recorded outcome replays regardless of the current
        // head, and a still-live attempt is reported in-flight. Neither re-runs the gate.
        match uow.idempotency().lookup_replay(
            &key_scope,
            &scope,
            &request_digest,
            context.now_ms,
        )? {
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
            ReplayLookup::None | ReplayLookup::Expired(_) => {}
        }

        // Gate BEFORE reserving: a stale fence is a fault; a non-conflicted head or an
        // anchor-drift child is a denied value that reserves and mutates nothing.
        let latest = require_latest(uow, &request.changeset_id, &request.expected_revision)?;
        let next = rebase_next_status(latest.kind);
        let eligibility = transition_eligibility(
            TransitionRequest::new(CommandKind::Rebase, latest.kind, latest.status, next)
                .with_operation_count(latest.operation_count),
        );
        if !eligibility.allowed {
            return Ok(ProposalCommandResult::Denied { eligibility });
        }
        let drafts =
            match carry_forward_drafts(worktree_root, &latest, CommandKind::Rebase, context.now_ms)
            {
                CarriedDrafts::Ready(drafts) => drafts,
                CarriedDrafts::Denied(eligibility) => {
                    return Ok(ProposalCommandResult::Denied { eligibility });
                }
            };

        // Reserve, then re-materialize the carried drafts against the current base and
        // append the new reviewable revision under the reserved receipt.
        let reservation = match uow.idempotency().reserve_in_flight(
            key_scope,
            scope,
            request_digest.clone(),
            receipt_id,
            context.now_ms,
            context.in_flight_expires_at_ms,
        )? {
            ReserveDecision::Reserved(reservation) => reservation,
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

        let children = materialize_carried_drafts(
            uow,
            &reader,
            &request.changeset_id,
            &drafts,
            context.now_ms,
            &request_digest,
        )?;
        let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: request.changeset_id.clone(),
            previous_revision: Some(latest.changeset_revision.clone()),
            kind: latest.kind,
            status: next,
            session_id: latest.session_id.clone(),
            actor: context.actor.clone(),
            summary: request.summary.clone(),
            children,
            created_at_ms: context.now_ms,
        })
        .map_err(|err| StoreError::Ledger(err.to_string()))?;
        uow.ledger().append_revision(&record)?;
        let outcome = ProposalCommandOutcome {
            schema_version: OUTCOME_SCHEMA.to_string(),
            command: CommandKind::Rebase,
            changeset_id: record.changeset_id.clone(),
            changeset_revision: record.changeset_revision.clone(),
            status: record.status,
            receipt_id: reservation.receipt_id.clone(),
            validation_digest: None,
        };
        let idempotency = record_outcome(uow, &reservation, &outcome, &context)?;
        Ok(ProposalCommandResult::Accepted {
            outcome,
            idempotency,
        })
    })
}

/// Plan a replacement: load the source, refuse a terminal source or an anchor-drift
/// child as a denied value, and otherwise assemble the carried-forward create request
/// plus the source's current revision (for the supersede leg). A stale
/// `source_expected_revision` is an `Err(StaleRevision)` fault.
pub(crate) fn plan_replacement(
    store: &mut Store,
    worktree_root: &Path,
    request: &CreateReplacementProposalRequest,
    now_ms: i64,
) -> StoreResult<ReplacementPlan> {
    store.with_unit_of_work(CommandKind::Supersede, |uow| {
        let latest = require_latest(
            uow,
            &request.source_changeset_id,
            &request.source_expected_revision,
        )?;
        // A terminal source (already applied, rejected, cancelled, superseded, or failed)
        // is not supersedable — refuse up front so we never create an orphan replacement.
        if latest.status.is_terminal() {
            return Ok(ReplacementPlan::Denied {
                eligibility: ActionEligibility::denied(
                    CommandKind::Supersede,
                    format!(
                        "cannot supersede a terminal changeset (source status `{:?}`)",
                        latest.status
                    ),
                ),
            });
        }
        let Some(session_id) = latest.session_id.clone() else {
            return Ok(ReplacementPlan::Denied {
                eligibility: ActionEligibility::denied(
                    CommandKind::CreateProposal,
                    "source changeset has no session to seed the replacement proposal",
                ),
            });
        };
        let drafts =
            match carry_forward_drafts(worktree_root, &latest, CommandKind::CreateProposal, now_ms)
            {
                CarriedDrafts::Ready(drafts) => drafts,
                CarriedDrafts::Denied(eligibility) => {
                    return Ok(ReplacementPlan::Denied { eligibility });
                }
            };
        let create_request = CreateProposalRequest {
            session_id,
            changeset_id: request.replacement_changeset_id.clone(),
            summary: format!(
                "Replaces {}: {}",
                request.source_changeset_id.as_str(),
                request.summary
            ),
            operations: drafts,
        };
        Ok(ReplacementPlan::Ready {
            create_request,
            source_revision: latest.changeset_revision,
        })
    })
}

/// Create a replacement proposal for a stale source and supersede the original. The two
/// legs are executed as the existing public `create_proposal` and `supersede_proposal`
/// commands, each idempotency-keyed under its own command kind, in CREATE-then-SUPERSEDE
/// order. A crash between the legs is recoverable: a replay re-plans, replays the landed
/// create, and runs the supersede fresh.
pub fn create_replacement_proposal(
    store: &mut Store,
    worktree_root: &Path,
    context: ProposalCommandContext,
    request: CreateReplacementProposalRequest,
) -> StoreResult<ReplacementProposalResult> {
    let reader = SnapshotReader::for_worktree(worktree_root);
    let (create_request, source_revision) =
        match plan_replacement(store, worktree_root, &request, context.now_ms)? {
            ReplacementPlan::Denied { eligibility } => {
                return Ok(ReplacementProposalResult {
                    replacement: ProposalCommandResult::Denied { eligibility },
                    supersession: None,
                });
            }
            ReplacementPlan::Ready {
                create_request,
                source_revision,
            } => (create_request, source_revision),
        };

    // Leg 1: create the replacement candidate. If it does not land (denied/in-flight),
    // do NOT supersede the source — the original stays intact.
    let replacement = create_proposal(store, &reader, context.clone(), create_request)?;
    let supersession = if result_landed(&replacement) {
        // Leg 2: supersede the source. Its own `require_latest` re-fences the head, so a
        // concurrent change surfaces as a fault here rather than a lost update.
        Some(supersede_proposal(
            store,
            context,
            TerminalProposalRequest {
                changeset_id: request.source_changeset_id.clone(),
                expected_revision: source_revision,
                summary: format!(
                    "Superseded by {}: {}",
                    request.replacement_changeset_id.as_str(),
                    request.summary
                ),
            },
        )?)
    } else {
        None
    };
    Ok(ReplacementProposalResult {
        replacement,
        supersession,
    })
}

/// Whether a command result landed a durable outcome (accepted or replayed a recorded
/// one) — the precondition for advancing to the supersede leg.
fn result_landed(result: &ProposalCommandResult) -> bool {
    matches!(
        result,
        ProposalCommandResult::Accepted { .. } | ProposalCommandResult::Replayed { .. }
    )
}

/// The carried-forward drafts for a source changeset, or a denial value.
enum CarriedDrafts {
    Ready(Vec<ChangesetChildOperationDraft>),
    Denied(ActionEligibility),
}

/// Carry every child of `source` forward onto the CURRENT document state, preserving the
/// drafted body while re-basing against the fresh revision. Reuses the P27 detector to
/// classify the source: an `AnchorDrift` finding cannot be auto-rebased and denies the
/// command. Only existing-document, materialized `ReplaceBody` children (the V1
/// materialization subset) are carry-forwardable; anything else denies rather than
/// silently dropping the edit intent.
fn carry_forward_drafts(
    worktree_root: &Path,
    source: &ChangesetAggregateRecord,
    command: CommandKind,
    now_ms: i64,
) -> CarriedDrafts {
    // Sibling overlap and lease collisions are not carry-forward blockers (they are
    // reviewer-choice conflicts), so the detector runs with no siblings or leases; we
    // consult only its ANCHOR-DRIFT verdict, which an auto-rebase cannot resolve.
    let report = detect_conflicts(worktree_root, source, &[], &[], now_ms);
    if report
        .findings_of(ConflictKind::AnchorDrift)
        .next()
        .is_some()
    {
        return CarriedDrafts::Denied(ActionEligibility::denied(
            command,
            "cannot auto-rebase: a target document's identity moved or was removed since \
             the proposal was drafted; draft a replacement proposal against the corrected \
             target",
        ));
    }

    let resolver = DocumentResolver::for_worktree(worktree_root);
    let mut drafts = Vec::with_capacity(source.children.len());
    for child in &source.children {
        let DocumentRef::Existing { node_id, .. } = &child.target.document else {
            return CarriedDrafts::Denied(ActionEligibility::denied(
                command,
                format!(
                    "cannot carry forward child `{}`: only existing-document operations are \
                     rebaseable in V1",
                    child.child_key
                ),
            ));
        };
        let Some(operation) = child.materialized_operation.as_ref() else {
            return CarriedDrafts::Denied(ActionEligibility::denied(
                command,
                format!(
                    "cannot carry forward child `{}`: it has no materialized body to re-base",
                    child.child_key
                ),
            ));
        };
        if child.operation != ChangesetOperationKind::ReplaceBody {
            return CarriedDrafts::Denied(ActionEligibility::denied(
                command,
                format!(
                    "cannot carry forward child `{}`: only whole-document replace-body \
                     operations are rebaseable in V1 (found `{:?}`)",
                    child.child_key, child.operation
                ),
            ));
        }
        // Re-resolve the target to the CURRENT worktree revision. Anchor drift was ruled
        // out above; a resolve failure here would be the same class, so it denies too.
        let current = match resolver
            .resolve_existing(ExistingDocumentLookup::NodeId(node_id.clone()))
        {
            Ok(current) => current,
            Err(err) => {
                return CarriedDrafts::Denied(ActionEligibility::denied(
                    command,
                    format!(
                        "cannot carry forward child `{}`: target identity no longer resolves ({err})",
                        child.child_key
                    ),
                ));
            }
        };
        let DocumentRef::Existing {
            base_revision: current_revision,
            ..
        } = &current
        else {
            return CarriedDrafts::Denied(ActionEligibility::denied(
                command,
                format!(
                    "cannot carry forward child `{}`: resolved target is not an existing document",
                    child.child_key
                ),
            ));
        };
        // PRESERVE the drafted body; RE-BASE onto the current revision.
        drafts.push(ChangesetChildOperationDraft {
            child_key: child.child_key.clone(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: current.clone(),
                base_revision: Some(current_revision.clone()),
                current_revision: Some(current_revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: operation.target_snapshot.payload_text.clone(),
            },
        });
    }
    CarriedDrafts::Ready(drafts)
}

/// Re-materialize carried drafts against the current base and store their preimages,
/// producing the child inputs for the new in-place rebase revision. It reuses the SAME
/// stable preimage id and the SAME shared `store_preimages` path as proposal creation, so
/// a rebase re-visits the child's existing preimage row and UPDATES its stored "before"
/// to the rebased base — never inserting a duplicate `(changeset, operation, document)`
/// tuple, and never keeping a stale preimage.
fn materialize_carried_drafts(
    uow: &UnitOfWork<'_>,
    reader: &SnapshotReader,
    changeset_id: &ChangesetId,
    drafts: &[ChangesetChildOperationDraft],
    now_ms: i64,
    request_digest: &str,
) -> StoreResult<Vec<ChangesetChildOperationInput>> {
    let mut preimages = Vec::with_capacity(drafts.len());
    let mut children = Vec::with_capacity(drafts.len());
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
        let base_snapshot = reader
            .require_current_base(&draft.target.document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let operation = MaterializedProposalOperation::materialize_replace_body(
            changeset_id,
            draft.clone(),
            &base_snapshot,
            &preimage,
        )
        .map_err(|err| StoreError::Validation(err.to_string()))?;
        preimages.push(preimage);
        children.push(ChangesetChildOperationInput {
            child_key: operation.child_key.clone(),
            operation: operation.operation,
            target: operation.target.clone(),
            materialized_operation: Some(operation),
            material_digest: None,
            validation_digest: None,
        });
    }
    store_preimages(uow, &preimages)?;
    Ok(children)
}

fn rebase_next_status(kind: ChangesetKind) -> ChangesetStatus {
    match kind {
        ChangesetKind::Authoring | ChangesetKind::Direct => ChangesetStatus::Draft,
        ChangesetKind::Rollback => ChangesetStatus::RollbackProposed,
    }
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
        // A stale `expected_revision` is an optimistic-concurrency CONFLICT ("your base
        // is stale"), not an infrastructure fault — the route maps it to a 409.
        return Err(StoreError::StaleRevision(format!(
            "changeset `{changeset_id}` expected revision `{expected_revision}` but latest is `{}`",
            latest.changeset_revision
        )));
    }
    Ok(latest)
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

fn idempotency_conflict(conflict: &IdempotencyConflict) -> StoreError {
    StoreError::Idempotency(format!(
        "idempotency key `{}` conflicts with existing proposal command scope `{}`",
        conflict.key_scope.key.as_str(),
        conflict.existing_scope.id
    ))
}

fn rebase_scope(
    changeset_id: &ChangesetId,
    expected_revision: Option<&RevisionToken>,
    request_digest: &str,
) -> IdempotencyScope {
    IdempotencyScope::new(
        "changeset",
        changeset_id.as_str(),
        expected_revision.map(ToString::to_string),
        digest_value(
            "rebase_scope",
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

fn rebase_preimage_id(changeset_id: &ChangesetId, child_key: &str, request_digest: &str) -> String {
    format!(
        "preimage:{}:{}:rebase:{}",
        changeset_id.as_str(),
        child_key,
        digest_suffix(request_digest)
    )
}

fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput, ActorStatus};
    use crate::authoring::api::CreateSessionRequest;
    use crate::authoring::ledger::ChangesetHistory;
    use crate::authoring::model::{ActorId, ActorKind, ActorRef, IdempotencyKey, SessionId};

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn remove_doc(root: &Path, rel: &str) {
        std::fs::remove_file(root.join(rel)).unwrap();
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        register_actor_and_session(&mut store);
        (dir, store)
    }

    fn register_actor_and_session(store: &mut Store) {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput {
                    actor: actor(),
                    display: ActorDisplayMetadata::new("Rebase test actor", None),
                    status: ActorStatus::Active,
                    created_at_ms: 1,
                    updated_at_ms: 1,
                })?;
                uow.sessions().create_session(
                    session_id(),
                    CreateSessionRequest {
                        scope: "rebase-tests".to_string(),
                        title: "Rebase test session".to_string(),
                    },
                    actor(),
                    1,
                )?;
                Ok(())
            })
            .unwrap();
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:rebase-tests").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn session_id() -> SessionId {
        SessionId::new("session_1").unwrap()
    }

    fn changeset_id(value: &str) -> ChangesetId {
        ChangesetId::new(value).unwrap()
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

    fn resolved_doc(root: &Path, stem: &str) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("test document must be existing");
        };
        base_revision.clone()
    }

    fn create_request(
        root: &Path,
        changeset_id: ChangesetId,
        stem: &str,
        child_key: &str,
        body: impl Into<String>,
    ) -> CreateProposalRequest {
        let document = resolved_doc(root, stem);
        let revision = base_revision(&document);
        CreateProposalRequest {
            session_id: session_id(),
            changeset_id,
            summary: "create proposal".to_string(),
            operations: vec![ChangesetChildOperationDraft {
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
            }],
        }
    }

    /// A ReplaceBody child materialized under `changeset_id` against the current base of
    /// `stem`. Unlike copying another changeset's child, the embedded materialized
    /// `changeset_id` matches, so the ledger accepts it for a fresh lineage (e.g. a
    /// hand-built rollback lineage).
    fn materialized_child(
        root: &Path,
        changeset_id: &ChangesetId,
        stem: &str,
        child_key: &str,
        body: &str,
    ) -> ChangesetChildOperationInput {
        let document = resolved_doc(root, stem);
        let revision = base_revision(&document);
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap();
        let preimage = SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: format!("preimage:{}:{child_key}", changeset_id.as_str()),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: child_key.to_string(),
                document: document.clone(),
                captured_at_ms: 100,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: body.to_string(),
            },
        };
        let materialized = MaterializedProposalOperation::materialize_replace_body(
            changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        ChangesetChildOperationInput::from_materialized(
            materialized,
            format!("material:{child_key}"),
            format!("validation:{child_key}"),
        )
    }

    fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
        match result {
            ProposalCommandResult::Accepted { outcome, .. } => outcome,
            other => panic!("expected accepted result, got {other:?}"),
        }
    }

    fn denied(result: ProposalCommandResult) -> ActionEligibility {
        match result {
            ProposalCommandResult::Denied { eligibility } => eligibility,
            other => panic!("expected denied result, got {other:?}"),
        }
    }

    fn latest_record(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetAggregateRecord {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().latest(changeset_id)
            })
            .unwrap()
            .expect("changeset has a latest revision")
    }

    fn history(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetHistory {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().history(changeset_id)
            })
            .unwrap()
    }

    /// Append the source children forward unchanged into a new revision with `status`,
    /// through the REAL ledger (which validates the arc). Used to drive a changeset to a
    /// `Conflicted` head, which is only reachable through the apply-completion arc.
    fn append_status(
        store: &mut Store,
        changeset_id: &ChangesetId,
        status: ChangesetStatus,
        now_ms: i64,
    ) -> ChangesetAggregateRecord {
        let previous = latest_record(store, changeset_id);
        let children = previous
            .children
            .iter()
            .map(|child| ChangesetChildOperationInput {
                child_key: child.child_key.clone(),
                operation: child.operation,
                target: child.target.clone(),
                materialized_operation: child.materialized_operation.clone(),
                material_digest: child.material_digest.clone(),
                validation_digest: child.validation_digest.clone(),
            })
            .collect();
        let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: changeset_id.clone(),
            previous_revision: Some(previous.changeset_revision.clone()),
            kind: previous.kind,
            status,
            session_id: previous.session_id.clone(),
            actor: actor(),
            summary: format!("advance to {status:?}"),
            children,
            created_at_ms: now_ms,
        })
        .unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().append_revision(&record)
            })
            .unwrap();
        record
    }

    /// Drive a freshly-created authoring changeset all the way to a `Conflicted` head
    /// through the real declared arcs: Draft -> Proposed -> NeedsReview -> Approved ->
    /// Applying -> Conflicted (a failed apply attempt).
    fn drive_to_conflicted(store: &mut Store, changeset_id: &ChangesetId, now_ms: i64) {
        for (offset, status) in [
            ChangesetStatus::Proposed,
            ChangesetStatus::NeedsReview,
            ChangesetStatus::Approved,
            ChangesetStatus::Applying,
            ChangesetStatus::Conflicted,
        ]
        .into_iter()
        .enumerate()
        {
            append_status(store, changeset_id, status, now_ms + offset as i64 + 1);
        }
    }

    #[test]
    fn successful_rebase_produces_new_reviewable_draft_against_current_base() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);
        write_doc(root, ".vault/plan/rebase-plan.md", &valid_body("base one"));
        let id = changeset_id("changeset_rebase_ok");

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:ok", 100),
                create_request(
                    root,
                    id.clone(),
                    "rebase-plan",
                    "child_1",
                    valid_body("edited"),
                ),
            )
            .unwrap(),
        );
        let conflicted_child_base = base_revision(&resolved_doc(root, "rebase-plan"));
        drive_to_conflicted(&mut store, &id, 100);
        let conflicted = latest_record(&mut store, &id);
        assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

        // An out-of-band edit lands, so the conflicted child's recorded base is now stale
        // against the worktree.
        write_doc(
            root,
            ".vault/plan/rebase-plan.md",
            &valid_body("base two changed"),
        );
        let current_base = base_revision(&resolved_doc(root, "rebase-plan"));
        assert_ne!(current_base, conflicted_child_base);

        let outcome = accepted(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:ok", 200),
                RebaseProposalRequest {
                    changeset_id: id.clone(),
                    expected_revision: conflicted.changeset_revision.clone(),
                    summary: "rebase onto current base".to_string(),
                },
            )
            .unwrap(),
        );

        // The rebase re-enters review as a fresh Draft on the SAME changeset.
        assert_eq!(outcome.command, CommandKind::Rebase);
        assert_eq!(outcome.status, ChangesetStatus::Draft);
        let rebased = latest_record(&mut store, &id);
        assert_eq!(rebased.status, ChangesetStatus::Draft);
        assert_eq!(
            rebased.previous_revision.as_ref(),
            Some(&conflicted.changeset_revision),
            "the rebase revision descends from the conflicted head"
        );

        let child = &rebased.children[0];
        let operation = child
            .materialized_operation
            .as_ref()
            .expect("rebased child is re-materialized");
        // The drafted edit intent is PRESERVED; the base is RE-BASED onto the current rev.
        assert_eq!(operation.target_snapshot.payload_text, valid_body("edited"));
        assert_eq!(
            operation.target_snapshot.base_revision, current_base,
            "the child is re-based onto the current worktree revision"
        );
        assert_ne!(
            operation.target_snapshot.base_revision,
            conflicted_child_base
        );
    }

    #[test]
    fn failed_rebase_denies_non_conflicted_head_and_anchor_drift() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);

        // (a) A non-conflicted head cannot rebase: the arc is Conflicted -> Draft only.
        write_doc(root, ".vault/plan/live-plan.md", &valid_body("live"));
        let live = changeset_id("changeset_rebase_live");
        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:live", 100),
                create_request(
                    root,
                    live.clone(),
                    "live-plan",
                    "child_1",
                    valid_body("edit"),
                ),
            )
            .unwrap(),
        );
        let eligibility = denied(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:live", 101),
                RebaseProposalRequest {
                    changeset_id: live.clone(),
                    expected_revision: created.changeset_revision.clone(),
                    summary: "rebase a draft".to_string(),
                },
            )
            .unwrap(),
        );
        assert!(
            eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("cannot transition")),
            "{eligibility:?}"
        );
        // The head is untouched by a denial.
        assert_eq!(
            latest_record(&mut store, &live).changeset_revision,
            created.changeset_revision
        );

        // (b) An anchor-drifted conflicted proposal cannot be auto-rebased.
        write_doc(root, ".vault/plan/drift-plan.md", &valid_body("drift"));
        let drift = changeset_id("changeset_rebase_drift");
        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:drift", 200),
                create_request(
                    root,
                    drift.clone(),
                    "drift-plan",
                    "child_1",
                    valid_body("edit"),
                ),
            )
            .unwrap(),
        );
        drive_to_conflicted(&mut store, &drift, 200);
        let conflicted = latest_record(&mut store, &drift);
        assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

        // The target document is renamed: its recorded identity no longer resolves.
        remove_doc(root, ".vault/plan/drift-plan.md");
        write_doc(
            root,
            ".vault/plan/drift-plan-renamed.md",
            &valid_body("drift"),
        );

        let eligibility = denied(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:drift", 300),
                RebaseProposalRequest {
                    changeset_id: drift.clone(),
                    expected_revision: conflicted.changeset_revision.clone(),
                    summary: "rebase a drifted target".to_string(),
                },
            )
            .unwrap(),
        );
        assert!(
            eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("moved or was removed")),
            "{eligibility:?}"
        );
        // Denial mutated nothing: the source stays conflicted for an explicit decision.
        assert_eq!(
            latest_record(&mut store, &drift).status,
            ChangesetStatus::Conflicted
        );
    }

    #[test]
    fn superseded_original_yields_a_fresh_replacement_candidate() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);
        write_doc(root, ".vault/plan/replace-plan.md", &valid_body("base"));
        let source = changeset_id("changeset_replace_source");
        let replacement = changeset_id("changeset_replace_new");

        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:source", 100),
                create_request(
                    root,
                    source.clone(),
                    "replace-plan",
                    "child_1",
                    valid_body("intent"),
                ),
            )
            .unwrap(),
        );
        // Drive the source to a mid-lifecycle, non-terminal head (NeedsReview) that has
        // no in-place rebase arc, so replacement is the explicit path.
        append_status(&mut store, &source, ChangesetStatus::Proposed, 101);
        let needs_review = append_status(&mut store, &source, ChangesetStatus::NeedsReview, 102);
        assert_eq!(needs_review.status, ChangesetStatus::NeedsReview);

        // An out-of-band edit staled the source base.
        write_doc(
            root,
            ".vault/plan/replace-plan.md",
            &valid_body("changed base"),
        );
        let current_base = base_revision(&resolved_doc(root, "replace-plan"));

        let result = create_replacement_proposal(
            &mut store,
            root,
            context("idem:replace", 200),
            CreateReplacementProposalRequest {
                source_changeset_id: source.clone(),
                source_expected_revision: needs_review.changeset_revision.clone(),
                replacement_changeset_id: replacement.clone(),
                summary: "regenerate against current base".to_string(),
            },
        )
        .unwrap();

        let replacement_outcome = accepted(result.replacement);
        assert_eq!(replacement_outcome.changeset_id, replacement);
        let supersession = accepted(result.supersession.expect("source is superseded"));
        assert_eq!(supersession.status, ChangesetStatus::Superseded);

        // The original is now terminally superseded; the replacement is a fresh Draft.
        let source_head = latest_record(&mut store, &source);
        assert_eq!(source_head.status, ChangesetStatus::Superseded);
        assert!(
            source_head.summary.contains(replacement.as_str()),
            "the superseded revision cross-links its replacement: {}",
            source_head.summary
        );
        let replacement_head = latest_record(&mut store, &replacement);
        assert_eq!(replacement_head.status, ChangesetStatus::Draft);
        assert!(
            replacement_head.summary.contains(source.as_str()),
            "the replacement cross-links its source: {}",
            replacement_head.summary
        );
        // The edit intent is carried forward; the replacement is re-based onto the
        // current worktree revision.
        let child = &replacement_head.children[0];
        let operation = child
            .materialized_operation
            .as_ref()
            .expect("replacement child is materialized");
        assert_eq!(operation.target_snapshot.payload_text, valid_body("intent"));
        assert_eq!(operation.target_snapshot.base_revision, current_base);
    }

    #[test]
    fn cancelled_original_blocks_rebase_and_replacement() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);
        write_doc(root, ".vault/plan/cancelled-plan.md", &valid_body("base"));
        let source = changeset_id("changeset_cancelled_source");

        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:cancelled", 100),
                create_request(
                    root,
                    source.clone(),
                    "cancelled-plan",
                    "child_1",
                    valid_body("intent"),
                ),
            )
            .unwrap(),
        );
        let cancelled = append_status(&mut store, &source, ChangesetStatus::Cancelled, 101);
        assert_eq!(cancelled.status, ChangesetStatus::Cancelled);

        // A terminal (cancelled) head cannot rebase.
        let rebase_denial = denied(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:cancelled", 102),
                RebaseProposalRequest {
                    changeset_id: source.clone(),
                    expected_revision: cancelled.changeset_revision.clone(),
                    summary: "rebase a cancelled proposal".to_string(),
                },
            )
            .unwrap(),
        );
        assert!(
            rebase_denial
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("terminal")),
            "{rebase_denial:?}"
        );

        // A terminal source cannot be superseded, so no replacement is created and the
        // original is never orphaned.
        let replacement = changeset_id("changeset_cancelled_new");
        let result = create_replacement_proposal(
            &mut store,
            root,
            context("idem:replace:cancelled", 103),
            CreateReplacementProposalRequest {
                source_changeset_id: source.clone(),
                source_expected_revision: cancelled.changeset_revision.clone(),
                replacement_changeset_id: replacement.clone(),
                summary: "replace a cancelled proposal".to_string(),
            },
        )
        .unwrap();
        let denial = denied(result.replacement);
        assert!(
            denial
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("terminal")),
            "{denial:?}"
        );
        assert!(result.supersession.is_none(), "no supersede leg runs");
        // No replacement changeset was created; the source is untouched.
        assert!(
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| uow
                    .ledger()
                    .latest(&replacement))
                .unwrap()
                .is_none(),
            "a denied replacement creates nothing"
        );
        assert_eq!(
            latest_record(&mut store, &source).changeset_revision,
            cancelled.changeset_revision
        );
        assert_eq!(created.status, ChangesetStatus::Draft);
    }

    #[test]
    fn replayed_rebase_and_replacement_requests_are_idempotent() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);

        // --- In-place rebase replay ---
        write_doc(root, ".vault/plan/replay-plan.md", &valid_body("base"));
        let id = changeset_id("changeset_replay_rebase");
        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:replay", 100),
                create_request(
                    root,
                    id.clone(),
                    "replay-plan",
                    "child_1",
                    valid_body("edit"),
                ),
            )
            .unwrap(),
        );
        drive_to_conflicted(&mut store, &id, 100);
        let conflicted = latest_record(&mut store, &id);
        write_doc(root, ".vault/plan/replay-plan.md", &valid_body("changed"));

        let request = RebaseProposalRequest {
            changeset_id: id.clone(),
            expected_revision: conflicted.changeset_revision.clone(),
            summary: "rebase once".to_string(),
        };
        let first = accepted(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:replay", 200),
                request.clone(),
            )
            .unwrap(),
        );
        // A retry under the same key replays the recorded outcome without a second append.
        match rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:replay", 201),
            request,
        )
        .unwrap()
        {
            ProposalCommandResult::Replayed { idempotency } => {
                assert_eq!(idempotency.receipt_id.as_ref(), Some(&first.receipt_id));
            }
            other => panic!("expected replay, got {other:?}"),
        }
        assert_eq!(
            history(&mut store, &id).revisions.len(),
            7,
            "create + 5 drive arcs + one rebase; the replay adds nothing"
        );

        // --- Two-legged replacement replay, including crash-between-legs recovery ---
        write_doc(root, ".vault/plan/replace-replay.md", &valid_body("base"));
        let source = changeset_id("changeset_replay_source");
        let replacement = changeset_id("changeset_replay_new");
        let created = accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:replay-source", 300),
                create_request(
                    root,
                    source.clone(),
                    "replace-replay",
                    "child_1",
                    valid_body("intent"),
                ),
            )
            .unwrap(),
        );
        let request = CreateReplacementProposalRequest {
            source_changeset_id: source.clone(),
            source_expected_revision: created.changeset_revision.clone(),
            replacement_changeset_id: replacement.clone(),
            summary: "replace once".to_string(),
        };

        // Simulate a crash AFTER the create leg landed but BEFORE the supersede leg: land
        // the create leg directly under the same key the flow will use, so the flow's
        // create replays and only the supersede runs fresh.
        let ReplacementPlan::Ready { create_request, .. } =
            plan_replacement(&mut store, root, &request, 400).unwrap()
        else {
            panic!("replacement is plannable");
        };
        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:replace-replay", 400),
                create_request,
            )
            .unwrap(),
        );
        // The source is not yet superseded — the crash struck between the legs.
        assert_eq!(
            latest_record(&mut store, &source).status,
            ChangesetStatus::Draft
        );

        let recovered = create_replacement_proposal(
            &mut store,
            root,
            context("idem:replace-replay", 401),
            request.clone(),
        )
        .unwrap();
        // The create leg replays (no double create); the supersede leg completes.
        assert!(
            matches!(
                recovered.replacement,
                ProposalCommandResult::Replayed { .. }
            ),
            "the already-landed create replays: {:?}",
            recovered.replacement
        );
        let supersession = accepted(
            recovered
                .supersession
                .expect("supersede completes on replay"),
        );
        assert_eq!(supersession.status, ChangesetStatus::Superseded);
        assert_eq!(
            history(&mut store, &replacement).revisions.len(),
            1,
            "the replacement is created exactly once across the crash + replay"
        );
        assert_eq!(
            latest_record(&mut store, &source).status,
            ChangesetStatus::Superseded
        );

        // After both legs completed, the source head advanced to Superseded, so a
        // further replay of the ORIGINAL request — fenced on the source's old draft
        // revision — is a stale-fence fault, and neither changeset grows.
        let err = create_replacement_proposal(
            &mut store,
            root,
            context("idem:replace-replay", 402),
            request,
        )
        .unwrap_err();
        assert!(
            matches!(err, StoreError::StaleRevision(_)),
            "a completed replacement's source head has moved: {err}"
        );
        assert_eq!(history(&mut store, &replacement).revisions.len(), 1);
        assert_eq!(history(&mut store, &source).revisions.len(), 2);
    }

    #[test]
    fn stale_expected_revision_is_a_fault_not_a_denial() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let reader = SnapshotReader::for_worktree(root);
        write_doc(root, ".vault/plan/stale-plan.md", &valid_body("base"));
        let id = changeset_id("changeset_stale_fence");
        accepted(
            create_proposal(
                &mut store,
                &reader,
                context("idem:create:stale", 100),
                create_request(
                    root,
                    id.clone(),
                    "stale-plan",
                    "child_1",
                    valid_body("edit"),
                ),
            )
            .unwrap(),
        );
        drive_to_conflicted(&mut store, &id, 100);

        // A stale expected_revision is an optimistic-concurrency fault, mapped to 409.
        let err = rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:stale", 200),
            RebaseProposalRequest {
                changeset_id: id.clone(),
                expected_revision: RevisionToken::new("changeset:staleaaaaaaaa").unwrap(),
                summary: "rebase with a stale fence".to_string(),
            },
        )
        .unwrap_err();
        assert!(
            matches!(err, StoreError::StaleRevision(_)),
            "stale fence is a fault: {err}"
        );
    }

    #[test]
    fn rebase_of_a_rollback_changeset_preserves_kind_into_rollback_proposed() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        write_doc(root, ".vault/plan/rollback-plan.md", &valid_body("base"));

        // Build a ReplaceBody child materialized under the rollback changeset id, then
        // hand-append a ROLLBACK-kind lineage to a Conflicted head so the kind-preserving
        // rebase arc (Conflicted -> RollbackProposed) is exercised.
        let rollback_id = changeset_id("changeset_rollback_lineage");
        let child = materialized_child(
            root,
            &rollback_id,
            "rollback-plan",
            "child_1",
            &valid_body("intent"),
        );
        let mut previous: Option<ChangesetAggregateRecord> = None;
        for (offset, status) in [
            ChangesetStatus::RollbackProposed,
            ChangesetStatus::NeedsReview,
            ChangesetStatus::Approved,
            ChangesetStatus::Applying,
            ChangesetStatus::Conflicted,
        ]
        .into_iter()
        .enumerate()
        {
            let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: rollback_id.clone(),
                previous_revision: previous.as_ref().map(|r| r.changeset_revision.clone()),
                kind: ChangesetKind::Rollback,
                status,
                session_id: Some(session_id()),
                actor: actor(),
                summary: format!("rollback to {status:?}"),
                children: vec![child.clone()],
                created_at_ms: 100 + offset as i64,
            })
            .unwrap();
            store
                .with_unit_of_work(CommandKind::CreateRollback, |uow| {
                    uow.ledger().append_revision(&record)
                })
                .unwrap();
            previous = Some(record);
        }
        let conflicted = previous.expect("rollback lineage reached conflicted");
        assert_eq!(conflicted.kind, ChangesetKind::Rollback);
        assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

        write_doc(root, ".vault/plan/rollback-plan.md", &valid_body("changed"));
        let outcome = accepted(
            rebase_proposal(
                &mut store,
                root,
                context("idem:rebase:rollback", 300),
                RebaseProposalRequest {
                    changeset_id: rollback_id.clone(),
                    expected_revision: conflicted.changeset_revision.clone(),
                    summary: "rebase a conflicted rollback".to_string(),
                },
            )
            .unwrap(),
        );
        // A rollback rebase preserves its kind and re-enters review as RollbackProposed.
        assert_eq!(outcome.status, ChangesetStatus::RollbackProposed);
        let rebased = latest_record(&mut store, &rollback_id);
        assert_eq!(rebased.kind, ChangesetKind::Rollback);
        assert_eq!(rebased.status, ChangesetStatus::RollbackProposed);
    }
}
