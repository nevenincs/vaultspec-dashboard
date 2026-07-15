//! Approved-changeset apply materialization (W03.P36).
//!
//! Apply is the single side-effecting authoring command: it turns an APPROVED
//! changeset into a real `.vault/` document change by driving the internal
//! [`super::core_adapter`] (agentic-apply-materialization ADR). V1 is
//! SINGLE-CHILD (ASA-004): a multi-child changeset is refused with an honest
//! typed capability-limit result; the multi-document schema is retained, only
//! materialization is single-child until core grows a batch transaction.
//!
//! The command is idempotent (retry replays the recorded receipt or continues the
//! in-flight attempt, never applies twice), gated on lifecycle, apply-authorization,
//! approval freshness, validation status, and the base-revision fence, and it
//! records a durable per-child receipt. The receipt IS the idempotency
//! [`RecordedOutcome`] (never expiring — audit-mandatory), also registered as an
//! `audit_receipt` retention record and published on the outbox.
//!
//! LIFECYCLE-AND-LOCK DISCIPLINE. The core subprocess NEVER runs inside a SQLite
//! write transaction. Apply is three stages: (A) a preflight unit of work reserves
//! idempotency, gates, and appends the `Applying` revision; (B) the SYNC core
//! adapter invoke runs with NO transaction held (the caller — the P39 route —
//! wraps this whole function in `spawn_blocking`; it must never run on an async
//! worker); (C) a completion unit of work interprets the outcome, appends
//! `Applied`/`Failed`, records the receipt, and publishes.
//!
//! OUTCOME-INDETERMINATE CONTRACT (P35-R1). A [`CoreAdapterError`] whose
//! [`CoreAdapterError::is_outcome_indeterminate`] is true (Timeout / OutputTooLarge)
//! means the write outcome is UNKNOWN — the killed core, or on Windows its
//! surviving grandchild, may have completed it. Apply then RE-VERIFIES the target
//! document's post-state (blob hash) before recording a result, and FAILS CLOSED:
//! it records `Applied` only when the post-state provably matches the intended
//! result, never on the strength of a clean invoke alone.

use std::path::{Path, PathBuf};

use ingest_struct::reader::blob_oid;

use super::api::{ChangesetOperationKind, FrontmatterEditFields};
use super::approvals::{V1_POLICY_VERSION, automated_self_approval_blocker};
use super::conflicts::{
    ConflictFinding, ConflictKind, MAX_CONFLICT_SIBLINGS, detect_conflicts, document_lease_scope,
    existing_node_id,
};
use super::core_adapter::{CoreAdapter, CoreCapability, CoreInvocation, WriteArgs};
use super::events::{apply_recorded_event, apply_started_event};
use super::leases::validate_fencing_token;
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorRef, ApplyState, ChangesetId, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, ReceiptId, RevisionToken,
};
use super::snapshots::SnapshotReader;
use super::store::idempotency::{
    IdempotencyKeyScope, IdempotencyScope, InFlightReservation, OutcomeKind, RecordedOutcome,
    ReplayLookup, ReserveDecision,
};
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::store::unit_of_work::UnitOfWork;
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::{
    ApprovalFreshness, ValidationFreshness, apply_completion_transition_eligibility,
    apply_transition_eligibility,
};

mod resolution;
mod types;
use resolution::*;
pub use types::*;
use types::{IN_FLIGHT_TTL_MS, RECEIPT_SCHEMA};

/// Apply an approved single-child changeset. See the module docs for the
/// three-stage lock discipline. `worktree_root` is the changeset's checkout —
/// the core adapter's cwd AND the post-verify read root.
pub fn apply_changeset(
    store: &mut Store,
    adapter: &CoreAdapter,
    worktree_root: &Path,
    request: ApplyRequest<'_>,
) -> Result<ApplyOutcome> {
    // Stage A — preflight: replay/in-flight check, gate, reserve, append Applying.
    // The unit of work commits the reservation + `Applying` revision (or rolls
    // back on a StoreError); domain outcomes ride the inner `Result`.
    let prep = match store.with_unit_of_work(CommandKind::RequestApply, |uow| {
        preflight_in_uow(uow, worktree_root, &request)
    })?? {
        Preflight::Replay(receipt) => {
            return Ok(ApplyOutcome {
                eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
                receipt: Some(*receipt),
                replayed: true,
                in_flight: false,
                denial_kind: None,
            });
        }
        Preflight::InFlight => {
            return Ok(ApplyOutcome {
                eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
                receipt: None,
                replayed: false,
                in_flight: true,
                denial_kind: None,
            });
        }
        Preflight::Denied(eligibility, denial_kind) => {
            return Ok(ApplyOutcome {
                eligibility,
                receipt: None,
                replayed: false,
                in_flight: false,
                denial_kind,
            });
        }
        Preflight::Reclaim(prep) => {
            // A crashed prior attempt: DO NOT re-invoke the core — the write may
            // already have landed. Re-verify the document post-state (against the
            // recorded expected blob hash) and complete to the terminal receipt,
            // exactly the indeterminate-kill resolution (P36-R1).
            let resolution = post_state_resolution(
                worktree_root,
                &prep,
                "a prior apply attempt was interrupted and its reservation expired",
            );
            let receipt = store.with_unit_of_work(CommandKind::RequestApply, |uow| {
                complete_in_uow(uow, worktree_root, &prep, resolution, request.now_ms)
            })??;
            return Ok(ApplyOutcome {
                eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
                receipt: Some(receipt),
                replayed: false,
                in_flight: false,
                denial_kind: None,
            });
        }
        Preflight::Proceed(prep) => prep,
    };

    // Stage B — materialize with NO transaction held. The caller wraps this whole
    // function in `spawn_blocking`; `adapter.invoke` is the sync subprocess seam.
    // A single-invocation kind runs once; a `CreateDocument`-with-body runs the
    // ordered scaffold→body pair, each invocation individually capped/timed and
    // the child outcome fail-closed on the strengthened post-verify.
    let resolution = materialize_child(adapter, worktree_root, &prep);

    // Stage C — completion: append the terminal revision, record the receipt,
    // register retention, publish. One unit of work; all-or-nothing.
    let receipt = store.with_unit_of_work(CommandKind::RequestApply, |uow| {
        complete_in_uow(uow, worktree_root, &prep, resolution, request.now_ms)
    })??;
    Ok(ApplyOutcome {
        eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
        receipt: Some(receipt),
        replayed: false,
        in_flight: false,
        denial_kind: None,
    })
}

/// The carried preflight state that stage C needs. Owns everything so no DB
/// borrow crosses the subprocess call.
pub(super) struct ApplyPrep {
    reservation: InFlightReservation,
    receipt_id: ReceiptId,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    changeset_id: ChangesetId,
    source_revision: RevisionToken,
    /// The `Applying` revision appended in stage A — base for the completion hop.
    applying_record: ChangesetAggregateRecord,
    child_key: String,
    document: DocumentRef,
    document_path: String,
    base_blob_hash: String,
    expected_result_blob_hash: String,
    /// HOW to verify the write landed on an indeterminate-kill / crash-recovery
    /// post-verify — see [`PostVerifyExpectation`]. NEVER derive `Applied` from
    /// `expected_result_blob_hash` directly for a core-authoritative kind; go
    /// through this.
    post_verify: PostVerifyExpectation,
    invocation: CoreInvocation,
    /// The SECOND invocation of a two-step materialization, `Some` only for a
    /// `CreateDocument` whose materialized draft carries an authored body:
    /// `invocation` is the `vault add` scaffold, this is the `vault set-body`
    /// that writes the body under the scaffold's frontmatter. `None` for every
    /// single-invocation kind (the whole `.vault/` write is one core call).
    /// Core's `vault add` scaffolds from a template only — it has no
    /// body-on-stdin path — so a whole-document create MUST scaffold then write
    /// the body as an ordered pair, or it materializes the empty template.
    follow_up_invocation: Option<CoreInvocation>,
}

pub(super) enum Preflight {
    Replay(Box<ApplyReceipt>),
    InFlight,
    /// The eligibility denial, plus its structured classification when known
    /// (W05.P14) — `None` for an unclassified denial.
    Denied(ActionEligibility, Option<ApplyDenialKind>),
    Proceed(Box<ApplyPrep>),
    /// A prior attempt crashed between stage A and stage C, its in-flight
    /// reservation has EXPIRED, and the head is wedged in `Applying`. Resume
    /// completion by post-state re-verify only — NO core re-invoke (P36-R1).
    Reclaim(Box<ApplyPrep>),
}

fn preflight_in_uow(
    uow: &UnitOfWork<'_>,
    worktree_root: &Path,
    request: &ApplyRequest<'_>,
) -> StoreResult<std::result::Result<Preflight, ApplyError>> {
    let key_scope = IdempotencyKeyScope::new(
        request.actor.clone(),
        CommandKind::RequestApply,
        request.idempotency_key.clone(),
    );
    let latest = match uow.ledger().latest(request.changeset_id)? {
        Some(record) => record,
        None => return Ok(Err(ApplyError::NotFound(request.changeset_id.to_string()))),
    };

    let source_revision = latest.changeset_revision.clone();
    // The idempotency scope MUST be head-independent: after apply the ledger head
    // moves (Approved → Applied), so keying the scope on the current revision would
    // make a legitimate retry look like a different request (Conflict) instead of a
    // Replay. Key it on the changeset + actor + command only; the source revision
    // is recorded in the receipt, not the dedup identity.
    let scope = apply_scope(request.changeset_id);
    let request_digest = apply_request_digest(request.changeset_id, request.actor);

    // Idempotency FIRST: a completed apply replays even though its status is now
    // Applied (which would fail the gate below), and a live attempt continues.
    match uow
        .idempotency()
        .lookup_replay(&key_scope, &scope, &request_digest, request.now_ms)?
    {
        ReplayLookup::Replay(record) => {
            return Ok(receipt_from_outcome(&record).map(|r| Preflight::Replay(Box::new(r))));
        }
        ReplayLookup::InFlight(_) => return Ok(Ok(Preflight::InFlight)),
        ReplayLookup::Conflict(_) => return Ok(Err(ApplyError::Conflict)),
        ReplayLookup::Expired(record) => {
            // P36-R1: an EXPIRED reservation whose head is wedged in `Applying` is a
            // crashed attempt (a ghost `in_flight` before expiry, a permanent denial
            // after — the gate below only admits `Approved`). Reclaim it by resuming
            // completion instead of re-applying. One reclaim path heals both variants.
            if latest.status == ChangesetStatus::Applying {
                return build_reclaim_prep(request, worktree_root, &latest, &record, &key_scope);
            }
            // Any other head status: a fresh attempt (fall through to the gate).
        }
        ReplayLookup::None => {}
    }

    // GATE (no state mutated yet, so a denial leaks nothing).
    if latest.operation_count != 1 {
        return Ok(Ok(Preflight::Denied(
            ActionEligibility::denied(
                CommandKind::RequestApply,
                format!(
                    "V1 apply supports exactly one child operation; changeset carries {} \
                     (multi-child materialization is deferred until core provides a batch \
                     transaction)",
                    latest.operation_count
                ),
            ),
            None,
        )));
    }

    // Apply-authorization: the automated-self-approval ban keyed on the ORIGIN
    // (proposing) author — reuse P23's ONE check; do not re-derive it.
    let origin = match uow.ledger().origin(request.changeset_id)? {
        Some(record) => record,
        None => return Ok(Err(ApplyError::NotFound(request.changeset_id.to_string()))),
    };
    if let Some(denied) =
        automated_self_approval_blocker(CommandKind::RequestApply, request.actor, &origin.actor)
    {
        return Ok(Ok(Preflight::Denied(
            denied,
            Some(ApplyDenialKind::SelfApproval),
        )));
    }

    // Lifecycle + approval-freshness + validation-status gate.
    let approval = uow.approvals().latest_for_proposal(request.proposal_id)?;
    let validation = uow
        .validations()
        .latest_for_changeset(request.changeset_id)?;
    let approval_freshness = approval_freshness(approval.as_ref(), &latest, validation.as_ref());
    let validation_freshness = validation_freshness(validation.as_ref(), approval.as_ref());
    let eligibility =
        apply_transition_eligibility(&latest, approval_freshness, validation_freshness);
    if !eligibility.allowed {
        return Ok(Ok(Preflight::Denied(eligibility, None)));
    }

    // Base-revision conflict gate (W13.P27, wired W14.P42a). Consult the conflict detector
    // over the CURRENT worktree + live sibling proposals: a stale base, a stale whole-
    // document draft, an overlapping-hunk sibling, or an anchor drift refuses the apply as
    // a denial VALUE (no lease ever bypasses a revision check). Leases are passed EMPTY
    // here: the advisory-lease dimension (`PolicyConflict`) is owned by S258's fencing
    // (which admits the current token holder) and keys on the proposing actor, so gating
    // apply on it would over-refuse a legitimate token-holder apply; the served conflict
    // route surfaces it for the reviewer.
    let live_siblings = uow.ledger().latest_changesets(MAX_CONFLICT_SIBLINGS)?;
    let conflict_report =
        detect_conflicts(worktree_root, &latest, &live_siblings, &[], request.now_ms);
    // A CreateDocument path-collision against a SIBLING blocks the apply only when that
    // sibling can actually land at the path right now — i.e. it is Approved or Applying.
    // A draft/proposed/needs_review sibling (e.g. a revision the reviewer rejected back
    // to draft during a reject→revise cycle) cannot land without re-review, so it does
    // not compete for THIS apply; were it later revived, the existing-file variant of the
    // collision (which carries no sibling id) catches it. The served conflict projection
    // still surfaces the softer draft-vs-draft collision for reviewers. Every other
    // conflict kind blocks unchanged.
    if let Some(finding) = conflict_report
        .findings
        .iter()
        .find(|finding| conflict_blocks_apply(finding, &live_siblings))
    {
        return Ok(Ok(Preflight::Denied(
            ActionEligibility::denied(CommandKind::RequestApply, finding.reason.clone()),
            classify_conflict_kind(finding.kind),
        )));
    }

    // The single materialized child → the write invocation.
    let child = &latest.children[0];
    if !matches!(
        child.operation,
        ChangesetOperationKind::ReplaceBody
            | ChangesetOperationKind::EditFrontmatter
            | ChangesetOperationKind::Rename
            | ChangesetOperationKind::CreateDocument
            | ChangesetOperationKind::SectionEdit
            | ChangesetOperationKind::SetPlanStepState
    ) {
        return Ok(Ok(Preflight::Denied(
            ActionEligibility::denied(
                CommandKind::RequestApply,
                format!(
                    "V1 apply materializes only whole-document body replacement, frontmatter \
                     edits, rename, document creation, section-scoped edits, and plan-step \
                     ticks; operation `{:?}` is not yet supported",
                    child.operation
                ),
            ),
            None,
        )));
    }
    let Some(materialized) = child.materialized_operation.as_ref() else {
        return Ok(Err(ApplyError::MissingMaterialization {
            changeset_id: request.changeset_id.to_string(),
            child_key: child.child_key.clone(),
        }));
    };
    let document = materialized.target.document.clone();
    // CreateDocument has NO EXISTING PATH (nothing exists yet) and NO real base
    // blob to fence against (`materialized.base.blob_hash` is the PHANTOM
    // empty-content hash operations.rs documents) — it takes the ONLY early
    // branch here; every other kind shares the existing-document path/blob-hash
    // derivation below.
    let (document_path, base_blob_hash, core_base_blob_hash) =
        if child.operation == ChangesetOperationKind::CreateDocument {
            (
                String::new(),
                materialized.base.blob_hash.clone(),
                String::new(),
            )
        } else {
            let Some(document_path) = existing_path(&document) else {
                return Ok(Err(ApplyError::Internal(format!(
                    "materialized child `{}` target is not an existing document",
                    child.child_key
                ))));
            };
            let base_blob_hash = materialized.base.blob_hash.clone();
            let core_base_blob_hash =
                full_file_blob_hash(worktree_root, &document_path, &base_blob_hash);
            (document_path, base_blob_hash, core_base_blob_hash)
        };

    // ADVISORY fencing (W13.P26, wired W14.P42a). A lease NEVER establishes correctness
    // (leases-never-replace-revision-checks): the revision fence is the anti-stale-write
    // floor, and correctness must not depend on an unexpired lease. So the fence bites ONLY
    // a PRESENTED token that is stale/below the scope's current one (P26 monotonicity fences
    // a superseded editor out); an ABSENT token is a non-participant and PROCEEDS — omitting
    // the token gains nothing because a stale write is still caught by the revision check,
    // and denying it would strand every legitimate approved apply (system, direct-write, and
    // /execute all present no token). The scope key is the SAME per-document convention P27
    // conflict detection uses (`document_lease_scope`), so acquire and apply agree on it.
    // A `ProvisionalCreate` target carries no node id, so this block naturally
    // no-ops for CreateDocument — nothing to fence, nothing existed to lease.
    if let Some(node_id) = existing_node_id(&document) {
        let lease_scope = document_lease_scope(worktree_root, &node_id);
        let current_lease = uow.leases().current(&lease_scope)?;
        if current_lease
            .as_ref()
            .is_some_and(|lease| lease.is_active(request.now_ms))
        {
            let fence = match request.fencing_token {
                Some(token) => {
                    validate_fencing_token(current_lease.as_ref(), token, request.now_ms)
                }
                // Advisory: no token presented → not fencing-participating → proceed.
                None => ActionEligibility::allowed(CommandKind::RequestApply),
            };
            if !fence.allowed {
                return Ok(Ok(Preflight::Denied(fence, None)));
            }
        }
    }
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();
    let invocation = match build_write_invocation(
        child.operation,
        materialized,
        &document_path,
        core_base_blob_hash,
    ) {
        Ok(invocation) => invocation,
        Err(err) => return Ok(Err(err)),
    };
    let post_verify = match post_verify_expectation(child.operation, materialized) {
        Ok(post_verify) => post_verify,
        Err(err) => return Ok(Err(err)),
    };
    let follow_up_invocation = match build_create_body_follow_up(child.operation, materialized) {
        Ok(follow_up) => follow_up,
        Err(err) => return Ok(Err(err)),
    };

    // Reserve the attempt, then append the `Applying` revision under the applying
    // actor (records that materialization started — restart visibility). A
    // StoreError past this point rolls the whole unit of work (reservation
    // included) back.
    let receipt_id = receipt_id_for(request.changeset_id, &source_revision);
    let reservation = match uow.idempotency().reserve_in_flight(
        key_scope.clone(),
        scope,
        request_digest,
        receipt_id.clone(),
        request.now_ms,
        Some(request.now_ms + IN_FLIGHT_TTL_MS),
    )? {
        ReserveDecision::Reserved(reservation) => reservation,
        // A concurrent racer won the reservation between our lookup and here.
        ReserveDecision::InFlight(_) => return Ok(Ok(Preflight::InFlight)),
        ReserveDecision::Replay(record) => {
            return Ok(receipt_from_outcome(&record).map(|r| Preflight::Replay(Box::new(r))));
        }
        ReserveDecision::Conflict(_) => return Ok(Err(ApplyError::Conflict)),
    };

    let applying_record = next_revision(
        &latest,
        ChangesetStatus::Applying,
        request.actor,
        request.now_ms,
    )?;
    uow.ledger().append_revision(&applying_record)?;
    let started_event = apply_started_event(
        request.changeset_id.as_str(),
        source_revision.as_str(),
        applying_record.changeset_revision.as_str(),
        request.actor.clone(),
        request.idempotency_key.clone(),
        request.now_ms,
    )?;
    uow.outbox().append_event(started_event)?;

    Ok(Ok(Preflight::Proceed(Box::new(ApplyPrep {
        reservation,
        receipt_id,
        actor: request.actor.clone(),
        idempotency_key: request.idempotency_key.clone(),
        changeset_id: request.changeset_id.clone(),
        source_revision,
        applying_record,
        child_key: child.child_key.clone(),
        document,
        document_path,
        base_blob_hash,
        expected_result_blob_hash,
        post_verify,
        invocation,
        follow_up_invocation,
    }))))
}

/// Whether a conflict finding BLOCKS an apply. Every finding blocks EXCEPT a
/// CreateDocument path-collision whose competitor SIBLING cannot itself land right
/// now: only an `Approved`/`Applying` sibling genuinely races to create the path at
/// apply time. A `draft`/`proposed`/`needs_review` sibling (e.g. a revision the
/// reviewer rejected back to draft during a reject→revise cycle) needs re-review
/// before it could land, so it does not compete for THIS apply and must not deny it.
/// The existing-file variant of the collision carries no `conflicting_changeset_id`
/// and always blocks (core refuses to overwrite an on-disk file), so a revived dead
/// sibling is still caught the moment it actually competes.
fn conflict_blocks_apply(
    finding: &ConflictFinding,
    live_siblings: &[ChangesetAggregateRecord],
) -> bool {
    if finding.kind != ConflictKind::CreateDocumentPathCollision {
        return true;
    }
    let Some(conflicting_id) = finding.conflicting_changeset_id.as_ref() else {
        return true;
    };
    live_siblings
        .iter()
        .find(|sibling| &sibling.changeset_id == conflicting_id)
        .is_some_and(|sibling| {
            matches!(
                sibling.status,
                ChangesetStatus::Approved | ChangesetStatus::Applying
            )
        })
}

fn complete_in_uow(
    uow: &UnitOfWork<'_>,
    worktree_root: &Path,
    prep: &ApplyPrep,
    resolution: ChildResolution,
    now_ms: i64,
) -> StoreResult<std::result::Result<ApplyReceipt, ApplyError>> {
    let (result_status, apply_state) = match resolution.outcome {
        ApplyChildOutcome::Applied => (ChangesetStatus::Applied, ApplyState::Applied),
        ApplyChildOutcome::Failed => (ChangesetStatus::Failed, ApplyState::Failed),
    };
    // W03.P09a: a landed `CreateDocument` has no identity in `prep` (nothing
    // existed to resolve at prep time) — re-resolve it NOW, from the SAME
    // predicted stem `PostVerifyExpectation::CreatedAt` already confirmed,
    // so the receipt echoes the new document's real path/node-id/stem
    // instead of leaving them empty. `None` for every other kind/outcome
    // (self-guarded inside the helper), so `document_path` falls back to
    // `prep.document_path` exactly as before this change.
    let created_document = (resolution.outcome == ApplyChildOutcome::Applied)
        .then(|| resolve_created_document(worktree_root, prep))
        .flatten();
    let document_path = created_document
        .as_ref()
        .map(|created| created.path.clone())
        .unwrap_or_else(|| prep.document_path.clone());
    let (result_node_id, result_stem) = created_document
        .map(|created| (Some(created.node_id), Some(created.stem)))
        .unwrap_or((None, None));

    {
        // Append the terminal revision from the Applying base (single-child, content
        // preserved — the apply-lifecycle invariant the ledger blocker enforces).
        let completion_eligibility =
            apply_completion_transition_eligibility(&prep.applying_record, result_status);
        if !completion_eligibility.allowed {
            return Ok(Err(ApplyError::Internal(format!(
                "applying→{result_status:?} transition was rejected: {:?}",
                completion_eligibility.reason
            ))));
        }
        let result_record =
            next_revision(&prep.applying_record, result_status, &prep.actor, now_ms)?;
        uow.ledger().append_revision(&result_record)?;

        let receipt = ApplyReceipt {
            schema_version: RECEIPT_SCHEMA.to_string(),
            receipt_id: prep.receipt_id.as_str().to_string(),
            changeset_id: prep.changeset_id.clone(),
            source_revision: prep.source_revision.clone(),
            result_revision: result_record.changeset_revision.clone(),
            state: apply_state,
            child: ApplyChildReceipt {
                child_key: prep.child_key.clone(),
                document_path,
                outcome: resolution.outcome,
                base_blob_hash: prep.base_blob_hash.clone(),
                expected_result_blob_hash: prep.expected_result_blob_hash.clone(),
                observed_result_blob_hash: resolution.observed_result_blob_hash.clone(),
                core_status: resolution.core_status.clone(),
                core_schema: resolution.core_schema.clone(),
                resolved_via_post_verify: resolution.resolved_via_post_verify,
                diagnostic: resolution.diagnostic.clone(),
                result_node_id,
                result_stem,
            },
            actor: prep.actor.clone(),
            idempotency_key: prep.idempotency_key.as_str().to_string(),
            applied_at_ms: now_ms,
        };
        let receipt_payload = serde_json::to_value(&receipt)
            .map_err(|err| StoreError::Idempotency(err.to_string()))?;
        let content_hash = blob_oid(
            serde_json::to_vec(&receipt)
                .map_err(|err| StoreError::Idempotency(err.to_string()))?
                .as_slice(),
        );

        // Record the receipt as the idempotency OUTCOME — never expiring
        // (audit-mandatory). A retry of this key replays it verbatim.
        uow.idempotency().record_outcome(
            &prep.reservation,
            RecordedOutcome {
                kind: OutcomeKind::Accepted,
                aggregate_kind: "changeset".to_string(),
                aggregate_id: prep.changeset_id.as_str().to_string(),
                schema: RECEIPT_SCHEMA.to_string(),
                payload: receipt_payload.clone(),
                http_status: None,
                completed_at_ms: now_ms,
                outcome_expires_at_ms: None,
            },
            now_ms,
        )?;

        // Track the receipt as a protected audit_receipt so compaction keeps it.
        let lifecycle = if receipt.is_applied() {
            LifecycleStatus::Applied
        } else {
            LifecycleStatus::Active
        };
        let retention = RetentionRecord::new(
            RetentionRecordRef::new("apply_receipt", receipt.receipt_id.as_str())?,
            "changeset",
            prep.changeset_id.as_str(),
            RetentionClass::AuditReceipt,
            lifecycle,
            content_hash.as_str(),
            now_ms,
        )?;
        uow.retention().upsert_record(&retention)?;

        // Publish the durable authoring event (dedupe on the result revision so a
        // replay/retry never double-publishes).
        let event = apply_recorded_event(
            prep.changeset_id.as_str(),
            receipt.result_revision.as_str(),
            receipt_payload,
            receipt.state,
            prep.actor.clone(),
            prep.idempotency_key.clone(),
            now_ms,
        )?;
        uow.outbox().append_event(event)?;

        Ok(Ok(receipt))
    }
}

// --- helpers ---------------------------------------------------------------

/// Build the next ledger revision carrying `next_status` under `actor`, preserving
/// the reviewed child operations (the apply-lifecycle content invariant).
fn next_revision(
    current: &ChangesetAggregateRecord,
    next_status: ChangesetStatus,
    actor: &ActorRef,
    now_ms: i64,
) -> StoreResult<ChangesetAggregateRecord> {
    let children = current
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
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: current.changeset_id.clone(),
        previous_revision: Some(current.changeset_revision.clone()),
        kind: current.kind,
        status: next_status,
        session_id: current.session_id.clone(),
        actor: actor.clone(),
        summary: current.summary.clone(),
        children,
        created_at_ms: now_ms,
    })
    .map_err(|err| StoreError::Ledger(format!("building {next_status:?} revision: {err}")))
}

/// Read a document's CURRENT blob hash from the worktree (post-state verify).
pub(super) fn read_blob_hash(worktree_root: &Path, document: &DocumentRef) -> StoreResult<String> {
    SnapshotReader::for_worktree(PathBuf::from(worktree_root))
        .capture_existing(document)
        .map(|snapshot| snapshot.blob_hash)
        .map_err(|err| StoreError::Snapshot(err.to_string()))
}

/// Read a document's CURRENT text from the worktree — the semantic-post-verify
/// sibling of [`read_blob_hash`], used when the write is core-authoritative and
/// verification must inspect content rather than compare a preview-derived hash.
pub(super) fn read_document_text(
    worktree_root: &Path,
    document: &DocumentRef,
) -> StoreResult<String> {
    SnapshotReader::for_worktree(PathBuf::from(worktree_root))
        .capture_existing(document)
        .map(|snapshot| snapshot.text)
        .map_err(|err| StoreError::Snapshot(err.to_string()))
}

/// Select the core-adapter capability + build its argv for one materialized
/// child, keyed on the operation kind. The ONE place apply chooses HOW a
/// materialized operation is written: `ReplaceBody` streams the whole-document
/// preview to `SetBody`'s stdin; `EditFrontmatter` forwards its field-level
/// payload (threaded from the draft through `materialized.frontmatter_edit`) to
/// `SetFrontmatter`'s typed flags — never a body. A new operation kind (rename,
/// create) extends this match, not a duplicated invocation-build call site.
pub(super) fn build_write_invocation(
    operation: ChangesetOperationKind,
    materialized: &super::operations::MaterializedProposalOperation,
    document_path: &str,
    core_base_blob_hash: String,
) -> Result<CoreInvocation> {
    // CreateDocument is NOT a `write` over an existing doc ref at all — it is
    // its own `CoreInvocation` constructor (`vault add`, no `document_path`,
    // no `--expected-blob-hash`, no stdin body), so it takes the ONLY early
    // return here rather than being forced into the `CoreInvocation::write`
    // shape every other kind shares below.
    if operation == ChangesetOperationKind::CreateDocument {
        let DocumentRef::ProvisionalCreate {
            doc_type,
            feature,
            title,
            ..
        } = &materialized.target.document
        else {
            return Err(ApplyError::Internal(
                "materialized CreateDocument child target is not a provisional create".to_string(),
            ));
        };
        let Some(date) = materialized.create_document_date.as_deref() else {
            return Err(ApplyError::Internal(
                "materialized CreateDocument child carries no fixed create date".to_string(),
            ));
        };
        return CoreInvocation::create_document(doc_type, feature, Some(title.as_str()), date, &[])
            .map_err(|err| ApplyError::Internal(format!("invocation build failed: {err}")));
    }
    // SetPlanStepState is NOT a `write` over a document ref either — the plan CLI
    // verb takes a positional `<plan_ref> <S##>` and NO `--expected-blob-hash`
    // (authoring-surface ADR D1), so it takes its own early return via the
    // dedicated builder rather than the `CoreInvocation::write` shape. The
    // apply-time base fence is ENGINE-SIDE (the direct-write stale-base
    // pre-check + the preflight conflict detector), never on this invocation.
    if operation == ChangesetOperationKind::SetPlanStepState {
        let Some(plan_step) = materialized.plan_step_edit.as_ref() else {
            return Err(ApplyError::Internal(
                "materialized SetPlanStepState child carries no plan-step payload".to_string(),
            ));
        };
        return CoreInvocation::set_plan_step_state(
            plan_step.state.is_checked(),
            document_path,
            &plan_step.step_id,
        )
        .map_err(|err| ApplyError::Internal(format!("invocation build failed: {err}")));
    }
    let (capability, args) = match operation {
        // A `SectionEdit` write is whole-document under the hood (section-
        // scoped-operations ADR): materialize already spliced the new section
        // content into the base body, so the invocation is IDENTICAL to
        // `ReplaceBody` — the same `SetBody` stream of the full preview text.
        ChangesetOperationKind::ReplaceBody | ChangesetOperationKind::SectionEdit => (
            CoreCapability::SetBody,
            WriteArgs {
                expected_blob_hash: Some(core_base_blob_hash),
                body: Some(materialized.target_snapshot.payload_text.clone()),
                ..Default::default()
            },
        ),
        ChangesetOperationKind::EditFrontmatter => {
            let fields = materialized.frontmatter_edit.clone().unwrap_or_default();
            (
                CoreCapability::SetFrontmatter,
                WriteArgs {
                    expected_blob_hash: Some(core_base_blob_hash),
                    date: fields.date,
                    tags: fields.tags.unwrap_or_default(),
                    related: fields.related.unwrap_or_default(),
                    ..Default::default()
                },
            )
        }
        ChangesetOperationKind::Rename => {
            let new_stem = materialized.rename_edit.clone().unwrap_or_default();
            (
                CoreCapability::Rename,
                WriteArgs {
                    expected_blob_hash: Some(core_base_blob_hash),
                    new_stem: Some(new_stem),
                    ..Default::default()
                },
            )
        }
        other => {
            return Err(ApplyError::Internal(format!(
                "apply invocation build has no capability mapping for operation `{other:?}`"
            )));
        }
    };
    CoreInvocation::write(capability, document_path, args)
        .map_err(|err| ApplyError::Internal(format!("invocation build failed: {err}")))
}

/// The SECOND invocation of a `CreateDocument`-with-body materialization: the
/// `vault set-body` that writes the authored body under the scaffold's
/// frontmatter, run after `build_write_invocation`'s `vault add` scaffolds the
/// document. `Ok(None)` for every non-create kind and for a bodiless create
/// (a bare scaffold), so the caller stores a `None` follow-up and stays a
/// single invocation.
///
/// Core's `vault add` scaffolds from a doc-type template ONLY — it has no
/// body-on-stdin path (verified against `vault add --help`) — so a whole-
/// document create that stopped at `vault add` materializes the empty template,
/// never the authored content. The body write is a distinct core call, keyed on
/// the SAME deterministic predicted path the identity-bearing post-verify uses,
/// so both agree on the target across a crash-recovery reclaim.
///
/// `vault set-body` REPLACES only the body prose and preserves the scaffold's
/// frontmatter byte-for-byte (verified against `vault set-body --help`), so the
/// streamed text is the authored body with any leading YAML frontmatter block
/// stripped — streaming the whole document would double the frontmatter. The
/// scaffold's core-generated frontmatter (conformant by construction) is the one
/// that survives.
pub(super) fn build_create_body_follow_up(
    operation: ChangesetOperationKind,
    materialized: &super::operations::MaterializedProposalOperation,
) -> Result<Option<CoreInvocation>> {
    if operation != ChangesetOperationKind::CreateDocument {
        return Ok(None);
    }
    let body = create_body_payload(materialized);
    if body.trim().is_empty() {
        // A bodiless create scaffolds and stops — the template IS the intent.
        return Ok(None);
    }
    let DocumentRef::ProvisionalCreate {
        doc_type, feature, ..
    } = &materialized.target.document
    else {
        return Err(ApplyError::Internal(
            "materialized CreateDocument child target is not a provisional create".to_string(),
        ));
    };
    let Some(date) = materialized.create_document_date.as_deref() else {
        return Err(ApplyError::Internal(
            "materialized CreateDocument child carries no fixed create date".to_string(),
        ));
    };
    // The DETERMINISTIC predicted path `post_verify_expectation` also computes —
    // core's `vault add` derives the filename from its own `{date}-{feature}-
    // {doc_type}.md` convention, so this is the just-scaffolded document's path.
    let document_path = format!(".vault/{doc_type}/{date}-{feature}-{doc_type}.md");
    // No `--expected-blob-hash` fence: the target was just created by THIS apply's
    // own scaffold step, so there is no concurrent writer to fence against within
    // the single in-flight materialization.
    CoreInvocation::write(
        CoreCapability::SetBody,
        &document_path,
        WriteArgs {
            body: Some(body),
            ..Default::default()
        },
    )
    .map(Some)
    .map_err(|err| ApplyError::Internal(format!("invocation build failed: {err}")))
}

/// The body text a `CreateDocument`-with-body streams to `vault set-body`: the
/// materialized whole-document preview with any leading YAML frontmatter block
/// stripped, because `set-body` keeps the scaffold's own frontmatter and
/// replaces only body prose. The blank line that followed the closing `---`
/// fence is preserved, so the composed document keeps its frontmatter/body
/// separation. A preview with no frontmatter fence is returned unchanged.
pub(super) fn create_body_payload(
    materialized: &super::operations::MaterializedProposalOperation,
) -> String {
    strip_leading_frontmatter(&materialized.target_snapshot.payload_text)
}

/// Strip a leading `---`-fenced YAML frontmatter block from a document, keeping
/// everything after the closing fence line (including the blank line that
/// followed it). Text that does not open with a `---` fence line is returned
/// verbatim. Line-ending agnostic: matches a fence line whose trimmed content
/// is exactly `---`.
fn strip_leading_frontmatter(text: &str) -> String {
    let mut lines = text.split_inclusive('\n');
    match lines.next() {
        Some(first) if first.trim_end_matches(['\n', '\r']) == "---" => {}
        // No opening fence: the whole text is body prose.
        _ => return text.to_string(),
    }
    for line in lines.by_ref() {
        if line.trim_end_matches(['\n', '\r']) == "---" {
            // The closing fence — everything after it is body prose.
            return lines.collect();
        }
    }
    // An unterminated frontmatter block (no closing fence): treat the whole
    // input as body rather than silently dropping it.
    text.to_string()
}

/// HOW to verify, post-write, that a materialized child's write actually
/// landed — keyed on the SAME operation kind [`build_write_invocation`]
/// dispatches on, because the two questions are coupled: verification is sound
/// only when it checks what the invocation ACTUALLY asked core to produce.
///
/// `ExactBlobHash` applies when the apply invocation streams the SAME bytes
/// the whole-document preview computed (`ReplaceBody` → `SetBody` stdin): core
/// reproduces the preview byte-for-byte, so a blob-hash match is a sound proof
/// of landing.
///
/// `FrontmatterFields` applies whenever core is AUTHORITATIVE over the written
/// bytes (`EditFrontmatter` → `SetFrontmatter` computes its own serialization
/// from typed flags, never receiving the preview text at all). A
/// preview-derived hash can NEVER soundly verify such a write — core's real
/// bytes need not match the Rust-side preview's quoting/spacing/line-ending
/// choices even when the write landed correctly — so verification instead
/// RE-READS the post-state document and confirms the intended field values are
/// present (`operations::frontmatter_fields_match`), never comparing
/// whole-document bytes. A new core-authoritative operation kind (rename,
/// create) needs its own semantic variant here, mirroring this one, not a
/// forced fit into `ExactBlobHash`.
///
/// `RenamedTo` applies to `Rename` — ALSO core-authoritative (core computes
/// the target path/cascade, not just bytes), and doubly unsound for a
/// blob-hash compare: the recorded `DocumentRef` the hash would be checked
/// against carries the OLD path, which the rename just moved the file away
/// from. Verification instead re-resolves by STEM: the document now exists at
/// the new stem and no longer exists at the old one.
///
/// `CreatedAt` applies to `CreateDocument` — core generates the scaffold from
/// a doc-type template we cannot predict byte-for-byte (no base to preview
/// against, no preimage), so a blob-hash compare is never sound. Nor is a bare
/// "a document now exists at the target stem" check sound in general — that
/// is the stem-identity-aliasing class of bug the Rename rollback lineage
/// guard exists to close. What closes it here is different from Rename's
/// fix (create has no rollback to alias across): the predicted path is a
/// DETERMINISTIC function of the materialized operation alone
/// (`create_document_date` + `feature` + `doc_type`, fixed once at
/// materialize time — see `operations::materialize_create_document`), core
/// itself REFUSES to overwrite an existing document (this invocation never
/// passes `--force`), and duplicate-path conflict detection denies two LIVE
/// changesets from ever targeting the same predicted path. Together those
/// mean at most ONE successful create can ever land at `expected_path`, so
/// resolving there is sound identity proof — the same trust `RenamedTo`
/// places in path resolution. A frontmatter feature-tag re-read adds
/// defense-in-depth ("expected scaffold shape", not bare existence) against a
/// resolved document that happens to occupy the exact predicted path but was
/// never this create's own scaffold. Crucially, none of `expected_path`/
/// `expected_stem`/`expected_feature_tag` depend on wall-clock "now" at
/// verify time — a crash-recovery reclaim recomputes the IDENTICAL values
/// from the SAME durable `materialized_operation`, unlike a freshness flag
/// captured once and never safely recomputable.
pub(super) enum PostVerifyExpectation {
    ExactBlobHash(String),
    FrontmatterFields(FrontmatterEditFields),
    RenamedTo {
        old_stem: String,
        new_stem: String,
    },
    CreatedAt {
        expected_stem: String,
        expected_path: String,
        expected_feature_tag: String,
        /// The authored body a two-step create-with-body wrote via `set-body`,
        /// `Some` only when the materialized draft carried one. Its presence
        /// STRENGTHENS the verify: a create whose scaffold landed but whose body
        /// write did NOT (a crash between the two steps, or an indeterminate
        /// kill of the body write) leaves the pristine template on disk — the
        /// bare "scaffold shape" check would forge that hollow document as
        /// Applied. When set, post-verify additionally requires the on-disk body
        /// to CONTAIN this authored text, so a scaffold-only landing fails
        /// closed. `None` for a bodiless create (the template IS the intent).
        expected_body: Option<String>,
    },
    /// `PlanStepState` applies to `SetPlanStepState` — the plan CLI verb is
    /// core-authoritative over the resulting bytes (it flips the checkbox glyph,
    /// refreshes the `modified` stamp, and may recompute display paths), so a
    /// blob-hash compare against the base-unchanged preview is never sound (the
    /// preview equals the BASE, not the post-write bytes). Verification instead
    /// re-reads the plan document and parses the named Step's checkbox state
    /// with the SAME parser that serves the projection's `done` flag, confirming
    /// it now matches `checked`. This is the authoring-surface ADR D1
    /// core-authoritative post-verify — the plan CLI has no expected-blob-hash
    /// fence, so re-reading the resulting Step state is the resolution path for
    /// an indeterminate kill AND the crash-recovery reclaim, recomputed
    /// identically from the durable materialized operation.
    PlanStepState {
        step_id: String,
        checked: bool,
    },
}

/// Build the [`PostVerifyExpectation`] for one materialized child, keyed on
/// operation kind exactly like [`build_write_invocation`] — the two MUST stay
/// coupled (see the type's docs), so both are chosen from the SAME match here
/// at the call site alongside the invocation, never independently re-derived.
pub(super) fn post_verify_expectation(
    operation: ChangesetOperationKind,
    materialized: &super::operations::MaterializedProposalOperation,
) -> Result<PostVerifyExpectation> {
    match operation {
        // A `SectionEdit` write streams the SAME preview bytes `ReplaceBody`
        // does (see `build_write_invocation`), so the SAME sound blob-hash
        // proof of landing applies.
        ChangesetOperationKind::ReplaceBody | ChangesetOperationKind::SectionEdit => Ok(
            PostVerifyExpectation::ExactBlobHash(materialized.target_snapshot.payload_hash.clone()),
        ),
        ChangesetOperationKind::EditFrontmatter => {
            let fields = materialized.frontmatter_edit.clone().ok_or_else(|| {
                ApplyError::Internal(
                    "materialized EditFrontmatter child carries no field-level payload".to_string(),
                )
            })?;
            Ok(PostVerifyExpectation::FrontmatterFields(fields))
        }
        ChangesetOperationKind::Rename => {
            let new_stem = materialized.rename_edit.clone().ok_or_else(|| {
                ApplyError::Internal("materialized Rename child carries no target stem".to_string())
            })?;
            let DocumentRef::Existing { stem: old_stem, .. } = &materialized.target.document else {
                return Err(ApplyError::Internal(
                    "materialized Rename child target is not an existing document".to_string(),
                ));
            };
            Ok(PostVerifyExpectation::RenamedTo {
                old_stem: old_stem.clone(),
                new_stem,
            })
        }
        ChangesetOperationKind::CreateDocument => {
            let DocumentRef::ProvisionalCreate {
                doc_type, feature, ..
            } = &materialized.target.document
            else {
                return Err(ApplyError::Internal(
                    "materialized CreateDocument child target is not a provisional create"
                        .to_string(),
                ));
            };
            let Some(date) = materialized.create_document_date.as_deref() else {
                return Err(ApplyError::Internal(
                    "materialized CreateDocument child carries no fixed create date".to_string(),
                ));
            };
            let expected_stem = format!("{date}-{feature}-{doc_type}");
            let expected_path = format!(".vault/{doc_type}/{expected_stem}.md");
            // Recomputed identically from the SAME durable materialized operation
            // the follow-up invocation reads, so the reclaim path's post-verify
            // and the happy path agree on the expected body.
            let body = create_body_payload(materialized);
            let expected_body = (!body.trim().is_empty()).then_some(body);
            Ok(PostVerifyExpectation::CreatedAt {
                expected_stem,
                expected_path,
                expected_feature_tag: format!("#{feature}"),
                expected_body,
            })
        }
        ChangesetOperationKind::SetPlanStepState => {
            let plan_step = materialized.plan_step_edit.as_ref().ok_or_else(|| {
                ApplyError::Internal(
                    "materialized SetPlanStepState child carries no plan-step payload".to_string(),
                )
            })?;
            Ok(PostVerifyExpectation::PlanStepState {
                step_id: plan_step.step_id.clone(),
                checked: plan_step.state.is_checked(),
            })
        }
        other => Err(ApplyError::Internal(format!(
            "apply has no post-verify expectation for operation `{other:?}`"
        ))),
    }
}

pub(super) fn existing_path(document: &DocumentRef) -> Option<String> {
    match document {
        DocumentRef::Existing { path, .. } => Some(path.clone()),
        _ => None,
    }
}

pub(super) fn full_file_blob_hash(
    worktree_root: &Path,
    document_path: &str,
    fallback: &str,
) -> String {
    std::fs::read(worktree_root.join(document_path))
        .map(|bytes| blob_oid(&bytes))
        .unwrap_or_else(|_| fallback.to_string())
}

/// The head-independent idempotency scope for applying a changeset (see the note
/// in `preflight_in_uow`). Stable across retries and across the head advancing.
pub(super) fn apply_scope(changeset_id: &ChangesetId) -> IdempotencyScope {
    IdempotencyScope::new(
        "changeset",
        changeset_id.as_str(),
        None,
        blob_oid(format!("request_apply|{changeset_id}").as_bytes()),
    )
}

pub(super) fn apply_request_digest(changeset_id: &ChangesetId, actor: &ActorRef) -> String {
    blob_oid(format!("request_apply|{changeset_id}|{}", actor.id).as_bytes())
}

pub(super) fn receipt_id_for(
    changeset_id: &ChangesetId,
    source_revision: &RevisionToken,
) -> ReceiptId {
    let digest = blob_oid(format!("{changeset_id}|{source_revision}").as_bytes());
    // blob_oid is 40-hex — a valid authoring token; prefix keeps it self-describing.
    ReceiptId::new(format!("apply-receipt:{digest}"))
        .expect("apply-receipt id is a valid authoring token")
}

fn receipt_from_outcome(
    record: &super::store::idempotency::IdempotencyRecord,
) -> Result<ApplyReceipt> {
    let outcome = record.outcome.as_ref().ok_or_else(|| {
        ApplyError::Internal("recorded idempotency row carries no outcome".into())
    })?;
    serde_json::from_value(outcome.payload.clone())
        .map_err(|err| ApplyError::Internal(format!("stored apply receipt is unreadable: {err}")))
}

/// Build the apply-time [`ApprovalFreshness`] from the loaded approval snapshot.
/// `record_present` requires a decided APPROVE that is not stale.
///
/// NOTE ON `proposal_revision_current`: at apply time the ledger head is the
/// APPROVED revision, whose `previous_revision` is exactly the revision the
/// reviewer reviewed (the approve decision appended Approved directly onto it).
/// So freshness means the approved head still derives DIRECTLY from the reviewed
/// revision — never `reviewed == head` (which is never true after approval).
fn approval_freshness(
    approval: Option<&super::approvals::ApprovalRequestRecord>,
    latest: &ChangesetAggregateRecord,
    validation: Option<&super::validation::ValidationStatusRecord>,
) -> ApprovalFreshness {
    let Some(approval) = approval else {
        return ApprovalFreshness::missing();
    };
    let decided_approve = approval
        .decision
        .as_ref()
        .is_some_and(|decision| decision.decision == super::approvals::ApprovalDecision::Approve);
    let current_validation_digest = validation
        .map(|record| record.validation_digest.as_str())
        .unwrap_or_default();
    let approved_head_follows_reviewed =
        latest.previous_revision.as_ref() == Some(&approval.reviewed.proposal_revision);
    ApprovalFreshness {
        record_present: decided_approve && !approval.stale,
        proposal_revision_current: approved_head_follows_reviewed,
        target_revisions_current: !approval.stale,
        validation_digest_current: approval.reviewed.validation_digest == current_validation_digest,
        policy_version_current: approval.reviewed.policy_version == V1_POLICY_VERSION,
        run_cancelled: false,
    }
}

/// Build the apply-time [`ValidationFreshness`] from the loaded validation record.
fn validation_freshness(
    validation: Option<&super::validation::ValidationStatusRecord>,
    approval: Option<&super::approvals::ApprovalRequestRecord>,
) -> ValidationFreshness {
    let Some(validation) = validation else {
        return ValidationFreshness::missing();
    };
    let digest_matches_reviewed = approval
        .map(|approval| approval.reviewed.validation_digest == validation.validation_digest)
        .unwrap_or(false);
    ValidationFreshness {
        record_present: true,
        approval_ready: validation.approval_ready,
        digest_matches_reviewed,
    }
}

#[cfg(test)]
mod tests;
