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
/// drafted body (or, for a rename, the drafted target stem) while re-basing against the
/// fresh revision. Reuses the P27 detector to classify the source: an `AnchorDrift`
/// finding cannot be auto-rebased and denies the command. Only existing-document,
/// materialized `ReplaceBody`/`Rename` children are carry-forwardable; anything else
/// denies rather than silently dropping the edit intent.
///
/// `CreateDocument` (W02.P05) is denied here too, at the VERY FIRST check (its target is
/// a `ProvisionalCreate`, never `DocumentRef::Existing`) — deliberately, not an
/// oversight: a create has no prior REVISION to rebase against (nothing existed to drift
/// from), so "carry forward onto the current base" is not a meaningful operation for it.
/// A `Conflicted` create-in-progress is an honest DENY (see
/// `create_document_child_is_denied_carry_forward_not_dropped` below), never a silent
/// drop of the child from the carried set.
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
        if !matches!(
            child.operation,
            ChangesetOperationKind::ReplaceBody | ChangesetOperationKind::Rename
        ) {
            return CarriedDrafts::Denied(ActionEligibility::denied(
                command,
                format!(
                    "cannot carry forward child `{}`: only whole-document replace-body and \
                     rename operations are rebaseable in V1 (found `{:?}`)",
                    child.child_key, child.operation
                ),
            ));
        }
        // Re-resolve the target to the CURRENT worktree revision. Anchor drift was ruled
        // out above; a resolve failure here would be the same class, so it denies too.
        // The DRAFTED node id is still valid to resolve by here (unlike a rollback's
        // post-APPLY resolution): a rebase re-materializes a NOT-YET-APPLIED draft, so
        // a Rename child's proposed move never actually happened on disk.
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
        // PRESERVE the drafted intent (body for a replace, target stem for a
        // rename); RE-BASE onto the current revision.
        let draft_mutation = match child.operation {
            ChangesetOperationKind::Rename => {
                let Some(new_stem) = operation.rename_edit.clone() else {
                    return CarriedDrafts::Denied(ActionEligibility::denied(
                        command,
                        format!(
                            "cannot carry forward child `{}`: rename carries no recorded \
                             target stem",
                            child.child_key
                        ),
                    ));
                };
                DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: String::new(),
                    frontmatter: None,
                    new_stem: Some(new_stem),
                    section_selector: None,
                    plan_step: None,
                }
            }
            _ => DraftMutation {
                mode: DraftMode::WholeDocument,
                body: operation.target_snapshot.payload_text.clone(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        drafts.push(ChangesetChildOperationDraft {
            child_key: child.child_key.clone(),
            operation: child.operation,
            target: TargetRevisionFence {
                document: current.clone(),
                base_revision: Some(current_revision.clone()),
                current_revision: Some(current_revision.clone()),
            },
            draft: draft_mutation,
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
) -> StoreResult<Vec<ChangesetChildOperationInput>> {
    let mut preimages = Vec::with_capacity(drafts.len());
    let mut children = Vec::with_capacity(drafts.len());
    for draft in drafts {
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                // The shared `preimage_id` derives a stable id from changeset + child and
                // ignores its third arg, so no request digest is threaded here.
                preimage_id: preimage_id(changeset_id, &draft.child_key, ""),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: draft.child_key.clone(),
                document: draft.target.document.clone(),
                captured_at_ms: now_ms,
            })
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let base_snapshot = reader
            .require_current_base(&draft.target.document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        // Dispatch on the carried draft's OWN operation kind — mirrors
        // `apply::build_write_invocation`'s per-kind selection.
        let operation = match draft.operation {
            ChangesetOperationKind::Rename => MaterializedProposalOperation::materialize_rename(
                changeset_id,
                draft.clone(),
                &base_snapshot,
                &preimage,
            ),
            _ => MaterializedProposalOperation::materialize_replace_body(
                changeset_id,
                draft.clone(),
                &base_snapshot,
                &preimage,
            ),
        }
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

fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

#[cfg(test)]
mod tests;
