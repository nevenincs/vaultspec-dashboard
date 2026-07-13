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
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::api::{ChangesetOperationKind, FrontmatterEditFields};
use super::approvals::{V1_POLICY_VERSION, automated_self_approval_blocker};
use super::conflicts::{
    MAX_CONFLICT_SIBLINGS, detect_conflicts, document_lease_scope, existing_node_id,
};
use super::core_adapter::{CoreAdapter, CoreCapability, CoreInvocation, WriteArgs};
use super::events::{apply_recorded_event, apply_started_event};
use super::leases::validate_fencing_token;
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorRef, ApplyState, ChangesetId, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, ProposalId, ReceiptId, RevisionToken,
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

const RECEIPT_SCHEMA: &str = "authoring.apply_receipt.v1";
/// In-flight reservation TTL: a crashed apply between preflight and completion
/// leaves an `Applying` revision + an in-flight reservation. Within this window a
/// retry replays the same in-flight attempt (never a second apply); past it the
/// reservation is reclaimable so a genuinely dead attempt does not wedge forever.
const IN_FLIGHT_TTL_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, thiserror::Error)]
pub enum ApplyError {
    #[error("changeset `{0}` has no ledger revision to apply")]
    NotFound(String),
    #[error(
        "approved changeset `{changeset_id}` child `{child_key}` has no materialized operation"
    )]
    MissingMaterialization {
        changeset_id: String,
        child_key: String,
    },
    #[error("apply idempotency key conflicts with a different recorded request")]
    Conflict,
    #[error("apply invariant violated: {0}")]
    Internal(String),
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

pub type Result<T> = std::result::Result<T, ApplyError>;

/// The applying actor's request. `proposal_id` locates the approval record;
/// `changeset_id` locates the ledger aggregate; both are supplied by the caller
/// (the route/tool), which holds them from the approval snapshot.
#[derive(Debug, Clone)]
pub struct ApplyRequest<'a> {
    pub changeset_id: &'a ChangesetId,
    pub proposal_id: &'a ProposalId,
    pub actor: &'a ActorRef,
    pub idempotency_key: &'a IdempotencyKey,
    /// The ADVISORY fencing token (W13.P26) the applying actor presents. Enforced ONLY
    /// when a live lease holds the target document's scope: a `None` or stale token against
    /// a live lease is refused as a denial value; with no live lease the apply proceeds.
    pub fencing_token: Option<i64>,
    pub now_ms: i64,
}

/// Whether a child materialized (`Applied`) or not (`Failed`). V1 is single-child,
/// so the changeset outcome equals its one child's outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyChildOutcome {
    Applied,
    Failed,
}

/// The durable per-child apply receipt. This is the audit-mandatory record of a
/// materialization attempt: what was written, the observed post-state, and the
/// core envelope forensics (status + schema string). It is persisted as the
/// idempotency [`RecordedOutcome`] payload and replayed verbatim on retry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyReceipt {
    pub schema_version: String,
    pub receipt_id: String,
    pub changeset_id: ChangesetId,
    /// The approved revision that was materialized.
    pub source_revision: RevisionToken,
    /// The `Applied`/`Failed` completion revision appended by this apply.
    pub result_revision: RevisionToken,
    pub state: ApplyState,
    pub child: ApplyChildReceipt,
    pub actor: ActorRef,
    pub idempotency_key: String,
    pub applied_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplyChildReceipt {
    pub child_key: String,
    pub document_path: String,
    pub outcome: ApplyChildOutcome,
    /// The base blob the write was fenced against (`--expected-blob-hash`).
    pub base_blob_hash: String,
    /// The blob the materialized target should produce.
    pub expected_result_blob_hash: String,
    /// The document's blob hash observed after the attempt (post-state), when it
    /// could be read. `None` when the post-state was unreadable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_result_blob_hash: Option<String>,
    /// The core envelope `status`, when the core returned one (`None` on a kill).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_status: Option<String>,
    /// The core envelope `schema` string, retained for drift forensics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_schema: Option<String>,
    /// True when the outcome was resolved by post-state re-verification after an
    /// OUTCOME-INDETERMINATE adapter kill (Timeout / OutputTooLarge).
    pub resolved_via_post_verify: bool,
    /// A REDACTED failure category (never raw stderr/body/paths), when failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
    /// The created document's stable node id (W03.P09a) — `Some` only for a
    /// successfully-applied `CreateDocument` child (`None` for every other
    /// kind/outcome; `document_path` above already names an existing-doc
    /// kind's target, and a not-landed create has no identity to report).
    /// Lets a consumer (the direct-write outcome's frontend auto-open
    /// restore) resolve the new document without re-deriving its predicted
    /// path client-side — the SAME identity `PostVerifyExpectation::
    /// CreatedAt` already confirmed to recognize `Applied`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_node_id: Option<String>,
    /// The created document's stem, alongside `result_node_id`. Same
    /// `None`-for-every-other-case rule.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_stem: Option<String>,
}

/// WHY an apply-preflight denied, when structurally known (W05.P14) — set at
/// the SAME point the `ActionEligibility` reason string is built, from the
/// SAME structured source (a `ConflictKind` finding, or the self-approval
/// blocker), never derived by matching the reason text afterward. `None`
/// (every OTHER preflight denial: multi-child, transition-ineligible,
/// unsupported operation kind, stale fencing token) is an honest
/// "unclassified" — a caller collapses it to its own generic/`other` value,
/// never a guess.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ApplyDenialKind {
    /// `ConflictKind::RenameTargetCollision` / `CreateDocumentPathCollision`.
    PathCollision,
    /// `ConflictKind::StaleBaseRevision` / `StaleWholeDocumentDraft` /
    /// `SectionSelectorUnresolved`.
    StaleBase,
    /// The automated-self-approval blocker (`automated_self_approval_blocker`)
    /// refused an automated actor applying its own (or a delegated) proposal.
    SelfApproval,
}

/// The two `ConflictKind` classes a caller needs to distinguish structurally
/// (W05.P14); every other `ConflictKind` (`OverlappingHunks`, `AnchorDrift`,
/// `PolicyConflict` — none of which the apply preflight's EMPTY-lease
/// `detect_conflicts` call can even produce for `PolicyConflict`) is honestly
/// unclassified here, not force-fit into one of these two.
fn classify_conflict_kind(kind: super::conflicts::ConflictKind) -> Option<ApplyDenialKind> {
    use super::conflicts::ConflictKind;
    match kind {
        ConflictKind::RenameTargetCollision | ConflictKind::CreateDocumentPathCollision => {
            Some(ApplyDenialKind::PathCollision)
        }
        ConflictKind::StaleBaseRevision
        | ConflictKind::StaleWholeDocumentDraft
        | ConflictKind::SectionSelectorUnresolved => Some(ApplyDenialKind::StaleBase),
        ConflictKind::OverlappingHunks
        | ConflictKind::AnchorDrift
        | ConflictKind::PolicyConflict => None,
    }
}

/// The command outcome. A policy denial carries `eligibility.denied` and no
/// receipt; a completed attempt (success OR recorded failure) carries a receipt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyOutcome {
    pub eligibility: ActionEligibility,
    pub receipt: Option<ApplyReceipt>,
    /// True when this call replayed an already-recorded receipt (idempotency).
    pub replayed: bool,
    /// True when a prior attempt for this key is still in flight (continue, do not
    /// re-apply).
    pub in_flight: bool,
    /// The structured reason a `Preflight::Denied` fired, when known (W05.P14).
    /// `None` for every non-denial outcome and for an unclassified denial.
    pub(crate) denial_kind: Option<ApplyDenialKind>,
}

impl ApplyReceipt {
    fn is_applied(&self) -> bool {
        matches!(self.state, ApplyState::Applied)
    }
}

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
    let invoke_result = adapter.invoke(worktree_root, &prep.invocation);
    let resolution = resolve_outcome(invoke_result, &prep, worktree_root);

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
struct ApplyPrep {
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
}

enum Preflight {
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
    if let Some(finding) = conflict_report.findings.first() {
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
    }))))
}

/// The interpreted result of the materialize stage, ready to persist.
struct ChildResolution {
    outcome: ApplyChildOutcome,
    observed_result_blob_hash: Option<String>,
    core_status: Option<String>,
    core_schema: Option<String>,
    resolved_via_post_verify: bool,
    diagnostic: Option<String>,
}

fn resolve_outcome(
    invoke_result: std::result::Result<
        super::core_adapter::CoreEnvelope,
        super::core_adapter::CoreAdapterError,
    >,
    prep: &ApplyPrep,
    worktree_root: &Path,
) -> ChildResolution {
    match invoke_result {
        Ok(envelope) => {
            let core_schema = envelope
                .raw
                .get("schema")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            // Tolerant post-state read (best-effort on the success path).
            let observed = read_blob_hash(worktree_root, &prep.document).ok();
            if envelope.is_success() {
                ChildResolution {
                    outcome: ApplyChildOutcome::Applied,
                    observed_result_blob_hash: observed,
                    core_status: Some(envelope.status),
                    core_schema,
                    resolved_via_post_verify: false,
                    diagnostic: None,
                }
            } else {
                // A business refusal (e.g. a base-revision conflict) — a recorded
                // FAILED receipt, never an adapter fault.
                ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: observed,
                    diagnostic: Some(format!(
                        "vaultspec-core refused the write (status `{}`)",
                        envelope.status
                    )),
                    core_status: Some(envelope.status),
                    core_schema,
                    resolved_via_post_verify: false,
                }
            }
        }
        // OUTCOME-UNKNOWN: the core was killed mid-flight (and on Windows its
        // grandchild may have survived to finish). Re-verify post-state and FAIL
        // CLOSED — the shared reclaim resolution (also used by P36-R1 recovery).
        // `wire_reason` is the REDACTED category — never `{:?}`-Debug the error.
        Err(error) if error.is_outcome_indeterminate() => {
            post_state_resolution(worktree_root, prep, &error.wire_reason())
        }
        // A determinate fault (spawn failure, self-terminated core with no envelope,
        // malformed output): the write did not complete. Redacted category only —
        // never `{:?}`-Debug the error onto a durable/wire surface.
        Err(error) => ChildResolution {
            outcome: ApplyChildOutcome::Failed,
            observed_result_blob_hash: None,
            core_status: None,
            core_schema: None,
            resolved_via_post_verify: false,
            diagnostic: Some(error.wire_reason()),
        },
    }
}

/// Resolve a child outcome by RE-VERIFYING the document post-state — no core
/// invoke. Shared by the indeterminate-kill path and the P36-R1 crash-recovery
/// reclaim. Dispatches on [`ApplyPrep::post_verify`] so a core-authoritative
/// write (e.g. `EditFrontmatter`) is verified SEMANTICALLY rather than against
/// a preview-derived hash core never received (see the type's docs — a
/// preview-hash comparison there would spuriously report a landed write as
/// not-landed, since core computes its own bytes). FAILS CLOSED either way:
/// records `Applied` only when the post-state provably matches; an unreadable
/// post-state is `Failed`, never a forged success. `reason` is a redacted,
/// leak-free prefix.
fn post_state_resolution(worktree_root: &Path, prep: &ApplyPrep, reason: &str) -> ChildResolution {
    match &prep.post_verify {
        PostVerifyExpectation::ExactBlobHash(expected) => {
            match read_blob_hash(worktree_root, &prep.document) {
                Ok(observed) if &observed == expected => ChildResolution {
                    outcome: ApplyChildOutcome::Applied,
                    observed_result_blob_hash: Some(observed),
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!("{reason}; post-state re-verified the write landed")),
                },
                Ok(observed) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: Some(observed),
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state re-verified the write did NOT land"
                    )),
                },
                Err(_) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state could not be re-verified (recorded not-applied, \
                         fail-closed)"
                    )),
                },
            }
        }
        PostVerifyExpectation::FrontmatterFields(fields) => {
            match read_document_text(worktree_root, &prep.document) {
                Ok(text) if super::operations::frontmatter_fields_match(&text, fields) => {
                    ChildResolution {
                        outcome: ApplyChildOutcome::Applied,
                        observed_result_blob_hash: read_blob_hash(worktree_root, &prep.document)
                            .ok(),
                        core_status: None,
                        core_schema: None,
                        resolved_via_post_verify: true,
                        diagnostic: Some(format!(
                            "{reason}; post-state re-verified the intended frontmatter fields \
                             landed"
                        )),
                    }
                }
                Ok(_) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: read_blob_hash(worktree_root, &prep.document).ok(),
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state re-verified the intended frontmatter fields did \
                         NOT land"
                    )),
                },
                Err(_) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state could not be re-verified (recorded not-applied, \
                         fail-closed)"
                    )),
                },
            }
        }
        PostVerifyExpectation::RenamedTo { old_stem, new_stem } => {
            // A rename is core-authoritative over the exact bytes AND the path —
            // there is no blob to compare against `prep.document`, whose PATH is
            // now STALE (the file moved). The only sound post-state proof is
            // re-resolving by STEM: the document now exists at `new_stem` and no
            // longer exists at `old_stem`.
            let landed = resolve_by_stem(worktree_root, new_stem);
            let old_still_resolves = resolve_by_stem(worktree_root, old_stem).is_some();
            match landed {
                Some(renamed) if !old_still_resolves => ChildResolution {
                    outcome: ApplyChildOutcome::Applied,
                    observed_result_blob_hash: read_blob_hash(worktree_root, &renamed).ok(),
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state re-verified the rename to `{new_stem}` landed"
                    )),
                },
                Some(_) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; a document resolves at `{new_stem}` but the original stem \
                         `{old_stem}` still resolves too (ambiguous, fail-closed)"
                    )),
                },
                None => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state re-verified the rename to `{new_stem}` did NOT land"
                    )),
                },
            }
        }
        PostVerifyExpectation::CreatedAt {
            expected_stem,
            expected_path,
            expected_feature_tag,
        } => {
            // See the `CreatedAt` type doc for why resolving at the
            // DETERMINISTIC predicted path is sound identity proof here (core
            // refuses to overwrite + duplicate-path conflict detection), with
            // the feature-tag re-read as defense-in-depth "expected scaffold
            // shape" beyond bare existence.
            let created = resolve_by_stem(worktree_root, expected_stem);
            let created_path = created.as_ref().and_then(|document| match document {
                DocumentRef::Existing { path, .. } => Some(path.clone()),
                _ => None,
            });
            match (&created, created_path) {
                (Some(created_ref), Some(path)) if &path == expected_path => {
                    match read_document_text(worktree_root, created_ref) {
                        Ok(text) if text.contains(expected_feature_tag.as_str()) => {
                            ChildResolution {
                                outcome: ApplyChildOutcome::Applied,
                                observed_result_blob_hash: read_blob_hash(
                                    worktree_root,
                                    created_ref,
                                )
                                .ok(),
                                core_status: None,
                                core_schema: None,
                                resolved_via_post_verify: true,
                                diagnostic: Some(format!(
                                    "{reason}; post-state re-verified the create of \
                                     `{expected_stem}` landed at the expected path with the \
                                     expected scaffold shape"
                                )),
                            }
                        }
                        Ok(_) => ChildResolution {
                            outcome: ApplyChildOutcome::Failed,
                            observed_result_blob_hash: None,
                            core_status: None,
                            core_schema: None,
                            resolved_via_post_verify: true,
                            diagnostic: Some(format!(
                                "{reason}; a document resolves at the expected path but its \
                                 frontmatter does not carry the expected feature tag \
                                 (fail-closed)"
                            )),
                        },
                        Err(_) => ChildResolution {
                            outcome: ApplyChildOutcome::Failed,
                            observed_result_blob_hash: None,
                            core_status: None,
                            core_schema: None,
                            resolved_via_post_verify: true,
                            diagnostic: Some(format!(
                                "{reason}; post-state could not be re-verified (recorded \
                                 not-applied, fail-closed)"
                            )),
                        },
                    }
                }
                (Some(_), _) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; a document resolves at `{expected_stem}` but not at the \
                         expected path `{expected_path}` (fail-closed)"
                    )),
                },
                (None, _) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state re-verified the create of `{expected_stem}` did \
                         NOT land"
                    )),
                },
            }
        }
        PostVerifyExpectation::PlanStepState { step_id, checked } => {
            // Re-read the plan document and parse the named Step's checkbox with
            // the SAME parser that serves the projection's `done` flag, so the
            // post-verify agrees BY CONSTRUCTION with what a subsequent read
            // shows. FAILS CLOSED: a Step that does not resolve, or an
            // unreadable document, records not-applied — never a forged success.
            match read_document_text(worktree_root, &prep.document) {
                Ok(text) => match plan_step_done(&text, step_id) {
                    Some(done) if done == *checked => ChildResolution {
                        outcome: ApplyChildOutcome::Applied,
                        observed_result_blob_hash: read_blob_hash(worktree_root, &prep.document)
                            .ok(),
                        core_status: None,
                        core_schema: None,
                        resolved_via_post_verify: true,
                        diagnostic: Some(format!(
                            "{reason}; post-state re-verified plan step `{step_id}` is now \
                             {}",
                            if *checked { "closed" } else { "open" }
                        )),
                    },
                    Some(_) => ChildResolution {
                        outcome: ApplyChildOutcome::Failed,
                        observed_result_blob_hash: read_blob_hash(worktree_root, &prep.document)
                            .ok(),
                        core_status: None,
                        core_schema: None,
                        resolved_via_post_verify: true,
                        diagnostic: Some(format!(
                            "{reason}; post-state re-verified plan step `{step_id}` did NOT \
                             reach the intended state"
                        )),
                    },
                    None => ChildResolution {
                        outcome: ApplyChildOutcome::Failed,
                        observed_result_blob_hash: None,
                        core_status: None,
                        core_schema: None,
                        resolved_via_post_verify: true,
                        diagnostic: Some(format!(
                            "{reason}; plan step `{step_id}` no longer resolves in the document \
                             (fail-closed)"
                        )),
                    },
                },
                Err(_) => ChildResolution {
                    outcome: ApplyChildOutcome::Failed,
                    observed_result_blob_hash: None,
                    core_status: None,
                    core_schema: None,
                    resolved_via_post_verify: true,
                    diagnostic: Some(format!(
                        "{reason}; post-state could not be re-verified (recorded not-applied, \
                         fail-closed)"
                    )),
                },
            }
        }
    }
}

/// The `done` state of the plan Step with canonical id `step_id`, parsed with
/// the SAME `ingest_struct` parser that serves the plan-interior projection's
/// `done` flag — so a post-verify read and a subsequent projection read can
/// never disagree. Walks the tier-conditional tree (L3/L4 waves, L2 phases, L1
/// flat steps). `None` when no Step with that canonical id exists.
fn plan_step_done(text: &str, step_id: &str) -> Option<bool> {
    let structure = ingest_struct::plan_structure::parse_plan_structure(text);
    let matches = |step: &ingest_struct::plan_structure::PlanStep| step.id == step_id;
    for wave in &structure.waves {
        for phase in &wave.phases {
            if let Some(step) = phase.steps.iter().find(|s| matches(s)) {
                return Some(step.done);
            }
        }
    }
    for phase in &structure.phases {
        if let Some(step) = phase.steps.iter().find(|s| matches(s)) {
            return Some(step.done);
        }
    }
    structure
        .steps
        .iter()
        .find(|s| matches(s))
        .map(|step| step.done)
}

/// Re-resolve a document by STEM in the current worktree — the path-independent
/// primitive `PostVerifyExpectation::RenamedTo` verifies against, since a
/// rename's recorded `DocumentRef` carries a now-stale path. `None` when no
/// document currently resolves at `stem`.
fn resolve_by_stem(worktree_root: &Path, stem: &str) -> Option<DocumentRef> {
    super::documents::DocumentResolver::for_worktree(worktree_root)
        .resolve_existing(super::documents::ExistingDocumentLookup::Stem(
            stem.to_string(),
        ))
        .ok()
}

/// Reconstruct an [`ApplyPrep`] from a changeset WEDGED in `Applying` whose
/// in-flight reservation expired (P36-R1). The Applying revision carries the
/// single materialized child and the recorded receipt id; the completion path
/// then re-verifies post-state and records the terminal receipt against the
/// still-`in_flight` (expired) reservation — no core re-invoke.
fn build_reclaim_prep(
    request: &ApplyRequest<'_>,
    worktree_root: &Path,
    applying: &ChangesetAggregateRecord,
    record: &super::store::idempotency::IdempotencyRecord,
    key_scope: &IdempotencyKeyScope,
) -> StoreResult<std::result::Result<Preflight, ApplyError>> {
    let child = &applying.children[0];
    let Some(materialized) = child.materialized_operation.as_ref() else {
        return Ok(Err(ApplyError::MissingMaterialization {
            changeset_id: request.changeset_id.to_string(),
            child_key: child.child_key.clone(),
        }));
    };
    let document = materialized.target.document.clone();
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
                    "wedged child `{}` target is not an existing document",
                    child.child_key
                ))));
            };
            let base_blob_hash = materialized.base.blob_hash.clone();
            let core_base_blob_hash =
                full_file_blob_hash(worktree_root, &document_path, &base_blob_hash);
            (document_path, base_blob_hash, core_base_blob_hash)
        };
    // The materialized (approved) revision the wedged Applying followed.
    let source_revision = applying
        .previous_revision
        .clone()
        .unwrap_or_else(|| applying.changeset_revision.clone());
    let receipt_id = record
        .receipt_id
        .clone()
        .unwrap_or_else(|| receipt_id_for(request.changeset_id, &source_revision));
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();
    let reservation = InFlightReservation {
        key_scope: key_scope.clone(),
        scope: apply_scope(request.changeset_id),
        request_digest: apply_request_digest(request.changeset_id, request.actor),
        receipt_id: receipt_id.clone(),
    };
    // Built for prep uniformity; the reclaim path never invokes it (no re-write).
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
    Ok(Ok(Preflight::Reclaim(Box::new(ApplyPrep {
        reservation,
        receipt_id,
        actor: request.actor.clone(),
        idempotency_key: request.idempotency_key.clone(),
        changeset_id: request.changeset_id.clone(),
        source_revision,
        applying_record: applying.clone(),
        child_key: child.child_key.clone(),
        document,
        document_path,
        base_blob_hash,
        expected_result_blob_hash,
        post_verify,
        invocation,
    }))))
}

/// A landed `CreateDocument` child's REAL identity (W03.P09a).
struct CreatedDocumentIdentity {
    path: String,
    node_id: String,
    stem: String,
}

/// Resolve a landed `CreateDocument` child's REAL identity — from the SAME
/// predicted stem `PostVerifyExpectation::CreatedAt` already confirmed to
/// recognize `Applied`, re-resolved HERE (never cached from prep time, since
/// `prep.document`/`prep.document_path` carry nothing real for a create —
/// there was nothing to resolve when the attempt was prepared). `None` for
/// every other post-verify kind (self-guarded), or — fail-closed, never
/// forged — if the stem somehow no longer resolves despite the outcome
/// reading `Applied`.
fn resolve_created_document(
    worktree_root: &Path,
    prep: &ApplyPrep,
) -> Option<CreatedDocumentIdentity> {
    let PostVerifyExpectation::CreatedAt { expected_stem, .. } = &prep.post_verify else {
        return None;
    };
    let DocumentRef::Existing {
        node_id,
        stem,
        path,
        ..
    } = resolve_by_stem(worktree_root, expected_stem)?
    else {
        return None;
    };
    Some(CreatedDocumentIdentity {
        path,
        node_id,
        stem,
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
fn read_blob_hash(worktree_root: &Path, document: &DocumentRef) -> StoreResult<String> {
    SnapshotReader::for_worktree(PathBuf::from(worktree_root))
        .capture_existing(document)
        .map(|snapshot| snapshot.blob_hash)
        .map_err(|err| StoreError::Snapshot(err.to_string()))
}

/// Read a document's CURRENT text from the worktree — the semantic-post-verify
/// sibling of [`read_blob_hash`], used when the write is core-authoritative and
/// verification must inspect content rather than compare a preview-derived hash.
fn read_document_text(worktree_root: &Path, document: &DocumentRef) -> StoreResult<String> {
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
fn build_write_invocation(
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
enum PostVerifyExpectation {
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
fn post_verify_expectation(
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
            Ok(PostVerifyExpectation::CreatedAt {
                expected_stem,
                expected_path,
                expected_feature_tag: format!("#{feature}"),
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

fn existing_path(document: &DocumentRef) -> Option<String> {
    match document {
        DocumentRef::Existing { path, .. } => Some(path.clone()),
        _ => None,
    }
}

fn full_file_blob_hash(worktree_root: &Path, document_path: &str, fallback: &str) -> String {
    std::fs::read(worktree_root.join(document_path))
        .map(|bytes| blob_oid(&bytes))
        .unwrap_or_else(|_| fallback.to_string())
}

/// The head-independent idempotency scope for applying a changeset (see the note
/// in `preflight_in_uow`). Stable across retries and across the head advancing.
fn apply_scope(changeset_id: &ChangesetId) -> IdempotencyScope {
    IdempotencyScope::new(
        "changeset",
        changeset_id.as_str(),
        None,
        blob_oid(format!("request_apply|{changeset_id}").as_bytes()),
    )
}

fn apply_request_digest(changeset_id: &ChangesetId, actor: &ActorRef) -> String {
    blob_oid(format!("request_apply|{changeset_id}|{}", actor.id).as_bytes())
}

fn receipt_id_for(changeset_id: &ChangesetId, source_revision: &RevisionToken) -> ReceiptId {
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
mod tests {
    use super::*;
    use std::process::Command;
    use std::sync::Mutex;
    use std::time::Duration;

    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::api::{
        ChangesetChildOperationDraft, DraftMode, DraftMutation, TargetRevisionFence,
    };
    use crate::authoring::approvals::{
        ApprovalDecision, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple,
    };
    use crate::authoring::leases::{AcquireLeaseInput, LeasePurpose, LeaseRecord};
    use crate::authoring::model::{
        ActorId, ActorKind, ApprovalId, ChangesetKind, ProvisionalCollisionStatus, SessionId,
    };
    use crate::authoring::operations::MaterializedProposalOperation;
    use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};
    use crate::authoring::store::Store;
    use crate::authoring::store::outbox::OutboxEvent;
    use crate::authoring::validation::{CurrentRevisionObservation, validate_changeset_material};

    const BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nbase content\n";
    const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nmaterialized content\n";
    const DOC_PATH: &str = ".vault/plan/apply-demo.md";

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    struct Fx {
        _dir: tempfile::TempDir,
        store: Store,
        root: PathBuf,
        doc_file: PathBuf,
        changeset_id: ChangesetId,
        proposal_id: ProposalId,
        origin: ActorRef,
        applier: ActorRef,
        expected_result_blob_hash: String,
    }

    /// Build a fully approved + materialized + validated single-child changeset in
    /// a real temp worktree. When `approve` is false, the changeset stops at
    /// `NeedsReview` (an approval request exists but no decision).
    fn setup(approve: bool) -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let doc_file = root.join(".vault").join("plan").join("apply-demo.md");
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(&doc_file, BASE_BODY).unwrap();

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        // Register every actor that appends a revision (origin, reviewer, applier).
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        // Materialize the single ReplaceBody child against the real base file.
        let reader = SnapshotReader::for_worktree(root.clone());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-demo".to_string(),
            stem: "apply-demo".to_string(),
            path: DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let base_revision = base_probe.revision.clone();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-demo".to_string(),
            stem: "apply-demo".to_string(),
            path: DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 5,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_revision.clone()),
                current_revision: Some(base_revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: NEW_BODY.to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        // The self-consistent validation record; its digest binds the approval.
        let current_observation =
            CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        // Seed Draft -> NeedsReview under the origin author; store validation.
        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        // Open the approval request.
        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        if approve {
            // The distinct human reviewer approves — appends the Approved revision.
            store
                .with_unit_of_work(CommandKind::Approve, |uow| {
                    Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                        proposal_id: &proposal_id,
                        decision: ApprovalDecision::Approve,
                        reviewer: &reviewer,
                        validation: ValidationFreshness::fresh(),
                        current_validation_digest: &validation_digest,
                        current_policy_version: V1_POLICY_VERSION,
                        run_cancelled: false,
                        comment: None,
                        decided_at_ms: 40,
                    }))
                })
                .unwrap()
                .unwrap();
        }

        Fx {
            _dir: dir,
            store,
            root,
            doc_file,
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    const FRONTMATTER_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply demo\n\nbase content\n";
    const FRONTMATTER_DOC_PATH: &str = ".vault/plan/apply-frontmatter-demo.md";

    /// The `setup` sibling for an `EditFrontmatter` child (W02.P03): the SAME
    /// Draft->NeedsReview->Approve scaffolding, materialized through
    /// `materialize_edit_frontmatter` instead of `materialize_replace_body`.
    fn setup_frontmatter(approve: bool) -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let doc_file = root
            .join(".vault")
            .join("plan")
            .join("apply-frontmatter-demo.md");
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(&doc_file, FRONTMATTER_BASE_BODY).unwrap();

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_fm_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_fm_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        let reader = SnapshotReader::for_worktree(root.clone());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-frontmatter-demo".to_string(),
            stem: "apply-frontmatter-demo".to_string(),
            path: FRONTMATTER_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let base_revision = base_probe.revision.clone();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-frontmatter-demo".to_string(),
            stem: "apply-frontmatter-demo".to_string(),
            path: FRONTMATTER_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_fm_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 5,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::EditFrontmatter,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_revision.clone()),
                current_revision: Some(base_revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                    date: Some("2026-02-06".to_string()),
                    tags: None,
                    related: None,
                }),
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        let current_observation =
            CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply frontmatter demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply frontmatter demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_fm_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:fm:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        if approve {
            store
                .with_unit_of_work(CommandKind::Approve, |uow| {
                    Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                        proposal_id: &proposal_id,
                        decision: ApprovalDecision::Approve,
                        reviewer: &reviewer,
                        validation: ValidationFreshness::fresh(),
                        current_validation_digest: &validation_digest,
                        current_policy_version: V1_POLICY_VERSION,
                        run_cancelled: false,
                        comment: None,
                        decided_at_ms: 40,
                    }))
                })
                .unwrap()
                .unwrap();
        }

        Fx {
            _dir: dir,
            store,
            root,
            doc_file,
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    // --- W02.P03-R1: EditFrontmatter against the REAL core (kind-gated post-verify) ---

    /// Serializes the tests that spawn the REAL `vaultspec-core` subprocess
    /// (mirrors `direct_write::tests::REAL_CORE_TEST_LOCK`).
    static REAL_CORE_TEST_LOCK: Mutex<()> = Mutex::new(());

    const LIVE_FRONTMATTER_DOC_PATH: &str = ".vault/plan/apply-frontmatter-live-demo.md";
    const LIVE_FRONTMATTER_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply live frontmatter demo\n\nbase content\n";
    const LIVE_FRONTMATTER_NEW_DATE: &str = "2026-02-06";

    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .env("GIT_AUTHOR_NAME", "apply-live")
            .env("GIT_AUTHOR_EMAIL", "apply-live@example.invalid")
            .env("GIT_COMMITTER_NAME", "apply-live")
            .env("GIT_COMMITTER_EMAIL", "apply-live@example.invalid")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn scaffold_vaultspec_workspace(root: &Path) {
        let output = Command::new("uv")
            .current_dir(root)
            .args([
                "run",
                "--no-sync",
                "vaultspec-core",
                "install",
                "--target",
                ".",
            ])
            .output()
            .expect("vaultspec-core install command runs");
        assert!(
            output.status.success() && root.join(".vaultspec").is_dir(),
            "real vaultspec-core install must succeed for live-core apply tests: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// The `setup_frontmatter` sibling that scaffolds a REAL git + vaultspec
    /// workspace (rather than a bare tempdir) so the apply invocation can be
    /// driven against the genuine `vaultspec-core` binary — the only way to
    /// prove the kind-gated post-verify (R1) against core's ACTUAL
    /// `set-frontmatter` write, not a mocked envelope.
    fn setup_live_frontmatter() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        let doc_file = root.join(LIVE_FRONTMATTER_DOC_PATH);
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(&doc_file, LIVE_FRONTMATTER_BASE_BODY).unwrap();
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "apply live frontmatter fixture"]);

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_fm_live_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_fm_live_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        let reader = SnapshotReader::for_worktree(root.clone());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-frontmatter-live-demo".to_string(),
            stem: "apply-frontmatter-live-demo".to_string(),
            path: LIVE_FRONTMATTER_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:apply-frontmatter-live-demo".to_string(),
            stem: "apply-frontmatter-live-demo".to_string(),
            path: LIVE_FRONTMATTER_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_probe.revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_fm_live_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 5,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::EditFrontmatter,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_probe.revision.clone()),
                current_revision: Some(base_probe.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                    date: Some(LIVE_FRONTMATTER_NEW_DATE.to_string()),
                    tags: None,
                    related: None,
                }),
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        let current_observation =
            CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live frontmatter demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live frontmatter demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_fm_live_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:fm:live:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();

        Fx {
            _dir: dir,
            store,
            root,
            doc_file,
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    #[test]
    fn edit_frontmatter_tags_order_is_preserved_by_the_real_core_write() {
        // P03-review follow-on: `frontmatter_fields_match` compares list fields
        // as ORDERED `Vec` equality. Source inspection of vaultspec-core's
        // `_serialise_block_list`/`resolve_related_inputs` confirmed order is
        // preserved (never sorted/deduped-out-of-order), but that was never
        // exercised against the REAL binary — this falsifier closes the gap.
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        let doc_path = ".vault/plan/apply-tags-order-live-demo.md";
        let doc_file = root.join(doc_path);
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        // A conformant vault frontmatter (one directory tag, one feature tag, a
        // date) — core refuses a non-conformant write outright, so the fixture
        // must already satisfy its own hygiene checks. `date` is untouched by
        // this `--tags`-only edit, so it must already be valid.
        std::fs::write(
            &doc_file,
            "---\ntags:\n  - '#plan'\n  - '#zz-test-feature'\ndate: '2026-01-01'\n---\n\nbody\n",
        )
        .unwrap();
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "tags order fixture"]);

        // Reversed from the directory-then-feature convention above, so a real
        // reorder (e.g. a canonicalizing sort) would be caught.
        let ordered_tags = vec!["#zz-test-feature".to_string(), "#plan".to_string()];
        let invocation = CoreInvocation::write(
            CoreCapability::SetFrontmatter,
            doc_path,
            WriteArgs {
                tags: ordered_tags.clone(),
                ..Default::default()
            },
        )
        .unwrap();
        let adapter = CoreAdapter::detect();
        let envelope = adapter.invoke(&root, &invocation).unwrap();
        assert!(envelope.is_success(), "{:?}", envelope.raw);

        let saved = std::fs::read_to_string(&doc_file).unwrap();
        // The real core write must preserve the REQUESTED order, never sort or
        // otherwise reorder it.
        let positions: Vec<usize> = ordered_tags
            .iter()
            .map(|tag| {
                saved
                    .find(tag.as_str())
                    .unwrap_or_else(|| panic!("tag `{tag}` missing from: {saved}"))
            })
            .collect();
        assert!(
            positions.windows(2).all(|pair| pair[0] < pair[1]),
            "tags must appear in the REQUESTED order in the real written file: {saved}"
        );

        // The kind-gated post-verify's ordered-Vec-equality comparison must
        // recognize the exact ordering the real core wrote.
        let fields = crate::authoring::api::FrontmatterEditFields {
            date: None,
            tags: Some(ordered_tags),
            related: None,
        };
        assert!(
            crate::authoring::operations::frontmatter_fields_match(&saved, &fields),
            "post-verify must recognize the real core's tags ordering: {saved}"
        );
    }

    #[test]
    fn edit_frontmatter_a_mismatched_or_not_landed_write_fails_closed() {
        // P03-review follow-on: the `false → Failed` direction of the semantic
        // post-verify was structurally guaranteed but never directly exercised
        // for frontmatter. Pin it at the `frontmatter_fields_match` unit level
        // (mismatch → false) alongside the tolerant-quoting positive case
        // (→ true), so the fail-closed property is locked independent of any
        // subprocess timing.
        let matching = "---\ntags:\n  - '#plan'\ndate: \"2026-02-06\"\n---\n\nbody\n";
        let mismatched = "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbody\n";
        let not_landed_at_all = "---\ntags:\n  - '#plan'\n---\n\nbody\n";
        let fields = crate::authoring::api::FrontmatterEditFields {
            date: Some("2026-02-06".to_string()),
            tags: None,
            related: None,
        };

        assert!(
            crate::authoring::operations::frontmatter_fields_match(matching, &fields),
            "a double-quoted value core might write must still compare equal (tolerant quoting)"
        );
        assert!(
            !crate::authoring::operations::frontmatter_fields_match(mismatched, &fields),
            "a stale/unrelated value must NOT be recognized as landed (fail-closed)"
        );
        assert!(
            !crate::authoring::operations::frontmatter_fields_match(not_landed_at_all, &fields),
            "an absent field must NOT be recognized as landed (fail-closed)"
        );
    }

    // --- W02.P04: Rename against the REAL core -----------------------------

    const LIVE_RENAME_OLD_STEM: &str = "apply-rename-live-demo";
    const LIVE_RENAME_NEW_STEM: &str = "apply-rename-live-demo-renamed";
    const LIVE_RENAME_DOC_PATH: &str = ".vault/plan/apply-rename-live-demo.md";
    const LIVE_RENAME_RENAMED_DOC_PATH: &str = ".vault/plan/apply-rename-live-demo-renamed.md";
    const LIVE_RENAME_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply live rename demo\n\nbase content\n";

    /// The `setup_live_frontmatter` sibling for `Rename`: a REAL git +
    /// vaultspec workspace, an APPROVED single-child `Rename` changeset ready
    /// to apply against the genuine `vaultspec-core` binary.
    fn setup_live_rename() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        let doc_file = root.join(LIVE_RENAME_DOC_PATH);
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(&doc_file, LIVE_RENAME_BASE_BODY).unwrap();
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "apply live rename fixture"]);

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_rn_live_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_rn_live_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        let reader = SnapshotReader::for_worktree(root.clone());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{LIVE_RENAME_OLD_STEM}"),
            stem: LIVE_RENAME_OLD_STEM.to_string(),
            path: LIVE_RENAME_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{LIVE_RENAME_OLD_STEM}"),
            stem: LIVE_RENAME_OLD_STEM.to_string(),
            path: LIVE_RENAME_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_probe.revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_rn_live_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 5,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_probe.revision.clone()),
                current_revision: Some(base_probe.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some(LIVE_RENAME_NEW_STEM.to_string()),
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_rename(
            &changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        let current_observation =
            CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live rename demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live rename demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_rn_live_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:rn:live:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();

        Fx {
            _dir: dir,
            store,
            root,
            doc_file,
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    /// A REAL `vaultspec-core` `rename` invocation, wrapped to LAND the write and
    /// THEN hang past the deadline — mirrors `landing_frontmatter_timeout_adapter`
    /// for `Rename`'s own core-authoritative post-verify.
    fn landing_rename_timeout_adapter(doc_ref: &str, new_stem: &str) -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ uv run --no-sync vaultspec-core vault rename '{doc_ref}' --to \
                     '{new_stem}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!(
                    "uv run --no-sync vaultspec-core vault rename '{doc_ref}' --to '{new_stem}' \
                     --json >/dev/null 2>&1; sleep 30"
                ),
            ]
        };
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
    }

    #[test]
    fn rename_apply_against_the_real_core_is_recognized_applied() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_rename();
        let applier = fx.applier.clone();
        let adapter = CoreAdapter::detect();
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:rn:live:1", 100);
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied rename changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert!(
            !receipt.child.resolved_via_post_verify,
            "a clean success completes via the envelope, never the recovery path"
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        assert!(
            !fx.doc_file.exists(),
            "the REAL vaultspec-core rename moved the document away from the old path"
        );
        assert!(
            fx.root.join(LIVE_RENAME_RENAMED_DOC_PATH).exists(),
            "the REAL vaultspec-core rename landed the document at the new path"
        );
    }

    #[test]
    fn rename_indeterminate_kill_after_a_real_landed_rename_is_recognized_applied() {
        // THE R1 pattern applied to Rename: core is core-authoritative over BOTH
        // the write and the path move — the recorded `DocumentRef` the OLD
        // preview-hash-shaped verify would check carries the OLD (now-stale)
        // path. Semantic post-verify (re-resolve by stem) must recognize a REAL,
        // landed rename regardless.
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_rename();
        let applier = fx.applier.clone();
        let adapter = landing_rename_timeout_adapter(LIVE_RENAME_DOC_PATH, LIVE_RENAME_NEW_STEM);
        let outcome = apply(
            &mut fx,
            &adapter,
            &applier,
            "idem:apply:rn:live:kill:1",
            100,
        );
        let receipt = outcome
            .receipt
            .expect("an indeterminate kill still resolves to a terminal receipt");
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "the REAL landed rename must be recognized Applied via semantic post-verify: \
             {receipt:?}"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        assert!(!fx.doc_file.exists());
        assert!(fx.root.join(LIVE_RENAME_RENAMED_DOC_PATH).exists());
    }

    // --- section-scoped-operations: SectionEdit against the REAL core -------

    const LIVE_SECTION_EDIT_OLD_STEM: &str = "apply-section-edit-live-demo";
    const LIVE_SECTION_EDIT_DOC_PATH: &str = ".vault/plan/apply-section-edit-live-demo.md";
    const LIVE_SECTION_EDIT_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply live section edit demo\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";
    const LIVE_SECTION_EDIT_BETA_SECTION: &str = "## Beta\n\nbeta body\n";
    const LIVE_SECTION_EDIT_NEW_BETA: &str = "## Beta\n\nBETA REWRITTEN LIVE\n";

    /// The `setup_live_rename` sibling for `SectionEdit`: a REAL git +
    /// vaultspec workspace, an APPROVED single-child `SectionEdit` changeset
    /// (targeting the `Beta` heading) ready to apply against the genuine
    /// `vaultspec-core` binary. `SectionEdit`'s write is whole-document under
    /// the hood — the SAME `SetBody` capability and `ExactBlobHash`
    /// post-verify `ReplaceBody` uses — so this proves the splice
    /// materialization survives a REAL core round trip.
    fn setup_live_section_edit() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        let doc_file = root.join(LIVE_SECTION_EDIT_DOC_PATH);
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(&doc_file, LIVE_SECTION_EDIT_BASE_BODY).unwrap();
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "apply live section edit fixture"]);

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_se_live_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_se_live_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        let reader = SnapshotReader::for_worktree(root.clone());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{LIVE_SECTION_EDIT_OLD_STEM}"),
            stem: LIVE_SECTION_EDIT_OLD_STEM.to_string(),
            path: LIVE_SECTION_EDIT_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{LIVE_SECTION_EDIT_OLD_STEM}"),
            stem: LIVE_SECTION_EDIT_OLD_STEM.to_string(),
            path: LIVE_SECTION_EDIT_DOC_PATH.to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_probe.revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_se_live_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 5,
            })
            .unwrap();
        let selector = crate::authoring::sections::SectionSelector {
            heading_path: vec!["Beta".to_string()],
            range_hint: None,
            expected_content_hash: blob_oid(LIVE_SECTION_EDIT_BETA_SECTION.as_bytes()),
        };
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::SectionEdit,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_probe.revision.clone()),
                current_revision: Some(base_probe.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::SectionScoped,
                body: LIVE_SECTION_EDIT_NEW_BETA.to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: Some(selector),
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_section_edit(
            &changeset_id,
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        let current_observation =
            CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live section edit demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live section edit demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_se_live_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:se:live:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();

        Fx {
            _dir: dir,
            store,
            root,
            doc_file,
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    /// A core that lands the SAME spliced whole-document body a `SectionEdit`
    /// apply invocation would (staged in Rust, no shell escaping — mirrors
    /// `landing_timeout_adapter`'s synthetic-mutation pattern) and THEN hangs
    /// past the deadline — the outcome-indeterminate-kill falsifier for
    /// `SectionEdit`'s `ExactBlobHash` post-verify, exactly like `ReplaceBody`.
    fn landing_section_edit_timeout_adapter(
        worktree_root: &Path,
        spliced_body: &str,
    ) -> CoreAdapter {
        std::fs::write(worktree_root.join(".landing-source-se"), spliced_body).unwrap();
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ Copy-Item '.landing-source-se' '{LIVE_SECTION_EDIT_DOC_PATH}' -Force; \
                     Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!("cp .landing-source-se '{LIVE_SECTION_EDIT_DOC_PATH}'; sleep 30"),
            ]
        };
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
    }

    #[test]
    fn section_edit_apply_against_the_real_core_is_recognized_applied() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_section_edit();
        let applier = fx.applier.clone();
        let adapter = CoreAdapter::detect();
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:se:live:1", 100);
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied section-edit changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert!(
            !receipt.child.resolved_via_post_verify,
            "a clean success completes via the envelope, never the recovery path"
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
        assert!(
            saved.contains("BETA REWRITTEN LIVE"),
            "the REAL vaultspec-core set-body write landed the spliced section: {saved}"
        );
        assert!(
            saved.contains("## Alpha") && saved.contains("alpha body"),
            "the untouched Alpha section survives the splice unchanged: {saved}"
        );
        assert!(
            !saved.contains("beta body"),
            "the OLD Beta content is gone: {saved}"
        );
    }

    #[test]
    fn section_edit_indeterminate_kill_after_a_real_landed_write_is_recognized_applied() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_section_edit();
        let applier = fx.applier.clone();
        let spliced_body = LIVE_SECTION_EDIT_BASE_BODY
            .replace(LIVE_SECTION_EDIT_BETA_SECTION, LIVE_SECTION_EDIT_NEW_BETA);
        let adapter = landing_section_edit_timeout_adapter(&fx.root, &spliced_body);
        let outcome = apply(
            &mut fx,
            &adapter,
            &applier,
            "idem:apply:se:live:kill:1",
            100,
        );
        let receipt = outcome
            .receipt
            .expect("an indeterminate kill still resolves to a terminal receipt");
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "the REAL landed section-edit write must be recognized Applied via \
             ExactBlobHash post-verify, exactly like ReplaceBody: {receipt:?}"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
        assert!(saved.contains("BETA REWRITTEN LIVE"));
    }

    // --- W02.P05: CreateDocument against the REAL core ----------------------

    const LIVE_CREATE_DOC_TYPE: &str = "plan";
    const LIVE_CREATE_FEATURE: &str = "apply-create-live-demo";
    // A FIXED historical timestamp, never "now" — core's `vault add` accepts
    // an explicit `--date` override (confirmed against the real binary), so
    // pinning a stable date keeps this test's predicted path independent of
    // the day it happens to run on, exactly like `materialize_create_document`
    // fixes the date once at materialize time rather than reading a clock at
    // verify time.
    const LIVE_CREATE_CREATED_AT_MS: i64 = 1_768_435_200_000; // 2026-01-15T00:00:00Z
    const LIVE_CREATE_DATE: &str = "2026-01-15";
    const LIVE_CREATE_STEM: &str = "2026-01-15-apply-create-live-demo-plan";
    const LIVE_CREATE_DOC_PATH: &str = ".vault/plan/2026-01-15-apply-create-live-demo-plan.md";

    /// The `setup_live_rename` sibling for `CreateDocument`: a REAL git +
    /// vaultspec workspace, an APPROVED single-child `CreateDocument`
    /// changeset ready to apply against the genuine `vaultspec-core` binary.
    /// Unlike every other kind, there is NO base document to write first —
    /// nothing exists yet.
    fn setup_live_create() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "apply live create fixture"]);

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_apply_cr_live_1").unwrap();
        let proposal_id = ProposalId::new("proposal_apply_cr_live_1").unwrap();
        let origin = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let applier = actor("human:applier", ActorKind::Human);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();

        let provisional_document = DocumentRef::ProvisionalCreate {
            provisional_doc_id: "provisional_apply_cr_live_1".to_string(),
            doc_type: LIVE_CREATE_DOC_TYPE.to_string(),
            feature: LIVE_CREATE_FEATURE.to_string(),
            title: "Apply Live Create Demo".to_string(),
            collision_status: ProvisionalCollisionStatus::Unknown,
            proposed_stem: None,
        };
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::CreateDocument,
            target: TargetRevisionFence {
                document: provisional_document.clone(),
                base_revision: None,
                current_revision: None,
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: "preview body (never sent to core; a real create's scaffold comes \
                       from core's own doc-type template)"
                    .to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_create_document(
            &changeset_id,
            draft,
            LIVE_CREATE_CREATED_AT_MS,
        )
        .unwrap();
        assert_eq!(
            materialized.create_document_date.as_deref(),
            Some(LIVE_CREATE_DATE),
            "the fixed timestamp must format to the fixed date the test's expected path uses"
        );
        let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

        // A CurrentRevisionObservation matching the SAME phantom "diff from
        // nothing" values `materialize_create_document` used internally (empty
        // text, the git-style empty-blob hash) — required because
        // `validate_current_revision` BLOCKS approval-readiness on a missing
        // observation for ANY operation kind, create included.
        let empty_hash = blob_oid(b"");
        let phantom_revision = RevisionToken::new(format!("blob:{empty_hash}")).unwrap();
        let current_observation = CurrentRevisionObservation {
            child_key: "child_1".to_string(),
            document: provisional_document,
            revision: phantom_revision,
            blob_hash: empty_hash,
        };
        let validation_record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[current_observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            validation_record.approval_ready,
            "fixture validation must be approval-ready: {:?}",
            validation_record.status
        );
        let validation_digest = validation_record.validation_digest.clone();

        let child_input = ChangesetChildOperationInput::from_materialized(
            materialized,
            validation_record.material_digest.clone(),
            validation_digest.clone(),
        );

        let reviewed_revision = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live create demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&draft_rev)?;
                let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(draft_rev.changeset_revision.clone()),
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::NeedsReview,
                    session_id: Some(SessionId::new("session_1").unwrap()),
                    actor: origin.clone(),
                    summary: "apply live create demo".to_string(),
                    children: vec![child_input.clone()],
                    created_at_ms: 20,
                })
                .unwrap();
                uow.ledger().append_revision(&needs_review)?;
                uow.validations().store_record(&validation_record)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_apply_cr_live_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:request:cr:live:1".to_string(),
                    created_at_ms: 30,
                }))
            })
            .unwrap()
            .unwrap();

        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();

        Fx {
            _dir: dir,
            store,
            root: root.clone(),
            doc_file: root.join(LIVE_CREATE_DOC_PATH),
            changeset_id,
            proposal_id,
            origin,
            applier,
            expected_result_blob_hash,
        }
    }

    /// A REAL `vaultspec-core` `vault add` invocation, wrapped to LAND the
    /// scaffold and THEN hang past the deadline — mirrors
    /// `landing_rename_timeout_adapter` for `CreateDocument`'s own
    /// core-authoritative post-verify. Carries the SAME `--date` override
    /// `build_write_invocation` would send, so the real scaffold lands at the
    /// exact predicted path the test asserts against.
    fn landing_create_timeout_adapter(
        doc_type: &str,
        feature: &str,
        title: &str,
        date: &str,
    ) -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ uv run --no-sync vaultspec-core vault add '{doc_type}' --feature \
                     '{feature}' --title '{title}' --date '{date}' --json | Out-Null; \
                     Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!(
                    "uv run --no-sync vaultspec-core vault add '{doc_type}' --feature \
                     '{feature}' --title '{title}' --date '{date}' --json >/dev/null 2>&1; \
                     sleep 30"
                ),
            ]
        };
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
    }

    #[test]
    fn create_document_apply_against_the_real_core_is_recognized_applied() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_create();
        let applier = fx.applier.clone();
        let adapter = CoreAdapter::detect();
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:cr:live:1", 100);
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied create changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert!(
            !receipt.child.resolved_via_post_verify,
            "a clean success completes via the envelope, never the recovery path"
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        assert!(
            fx.doc_file.exists(),
            "the REAL vaultspec-core `vault add` scaffolded the document"
        );
        // W03.P09a: the receipt echoes the created document's REAL identity
        // (previously always empty/None for a create) — never re-derived
        // client-side, no client-predictable filename guess needed.
        assert_eq!(receipt.child.document_path, LIVE_CREATE_DOC_PATH);
        assert_eq!(receipt.child.result_stem.as_deref(), Some(LIVE_CREATE_STEM));
        assert_eq!(
            receipt.child.result_node_id.as_deref(),
            Some(format!("doc:{LIVE_CREATE_STEM}").as_str())
        );
    }

    #[test]
    fn create_document_indeterminate_kill_after_a_real_landed_create_is_recognized_applied() {
        // THE R1 pattern applied to CreateDocument: core is core-authoritative
        // over the ENTIRE scaffold (a doc-type template this engine cannot
        // predict) — there is no preview hash to compare, and a bare
        // "something now exists at the target stem" check would be exactly
        // the stem-identity-aliasing bug class the Rename rollback lineage
        // guard closes. The identity-bearing `CreatedAt` verify (a
        // DETERMINISTIC predicted path fixed at materialize time, plus a
        // frontmatter feature-tag re-read) must recognize a REAL, landed
        // `vault add` regardless of the reclaim recomputing everything from
        // the SAME durable `materialized_operation`.
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_create();
        let applier = fx.applier.clone();
        let adapter = landing_create_timeout_adapter(
            LIVE_CREATE_DOC_TYPE,
            LIVE_CREATE_FEATURE,
            "Apply Live Create Demo",
            LIVE_CREATE_DATE,
        );
        let outcome = apply(
            &mut fx,
            &adapter,
            &applier,
            "idem:apply:cr:live:kill:1",
            100,
        );
        let receipt = outcome
            .receipt
            .expect("an indeterminate kill still resolves to a terminal receipt");
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "the REAL landed create must be recognized Applied via the identity-bearing \
             post-verify: {receipt:?}"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        assert!(fx.doc_file.exists());
        // W03.P09a: the crash-recovery/reclaim path resolves the SAME real
        // identity `resolve_outcome`'s happy path does (via the SAME
        // `resolve_created_document` helper) — not just "recognized
        // Applied" but the receipt actually echoes it.
        assert_eq!(receipt.child.document_path, LIVE_CREATE_DOC_PATH);
        assert_eq!(receipt.child.result_stem.as_deref(), Some(LIVE_CREATE_STEM));
        assert_eq!(
            receipt.child.result_node_id.as_deref(),
            Some(format!("doc:{LIVE_CREATE_STEM}").as_str())
        );
    }

    /// A REAL `vaultspec-core` `set-frontmatter` invocation, wrapped to LAND the
    /// write and THEN hang past the deadline — the realistic "core is
    /// core-authoritative AND was killed after actually finishing" sequence R1
    /// fixes. Runs the genuine core subprocess to completion (a REAL frontmatter
    /// write lands on disk, in `worktree_root`), then sleeps well past the
    /// timeout so the apply-level `CoreAdapter` still observes a Timeout
    /// (OUTCOME-INDETERMINATE). The trailing forwarded argv (the `CoreInvocation`
    /// this test's `apply_changeset` call built) is intentionally unused here —
    /// this wrapper hardcodes the SAME real command directly, mirroring
    /// `landing_timeout_adapter`'s synthetic-mutation pattern but with a genuine
    /// core subprocess instead of a file copy.
    fn landing_frontmatter_timeout_adapter(doc_ref: &str, date: &str) -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ uv run --no-sync vaultspec-core vault set-frontmatter '{doc_ref}' \
                     --date '{date}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!(
                    "uv run --no-sync vaultspec-core vault set-frontmatter '{doc_ref}' \
                     --date '{date}' --json >/dev/null 2>&1; sleep 30"
                ),
            ]
        };
        // A generous deadline: the wrapped command is a REAL `uv run` subprocess
        // (venv resolution + Python startup), not a synthetic file mutation, so it
        // needs materially more slack than `landing_timeout_adapter`'s 2.5s.
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
    }

    #[test]
    fn edit_frontmatter_apply_against_the_real_core_is_recognized_applied() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_frontmatter();
        let applier = fx.applier.clone();
        let adapter = CoreAdapter::detect();
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:fm:live:1", 100);
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied frontmatter changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert!(
            !receipt.child.resolved_via_post_verify,
            "a clean success completes via the envelope, never the recovery path"
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
        assert!(
            saved.contains(LIVE_FRONTMATTER_NEW_DATE),
            "the REAL vaultspec-core set-frontmatter write landed the requested date: {saved}"
        );
    }

    #[test]
    fn edit_frontmatter_indeterminate_kill_after_a_real_landed_write_is_recognized_applied() {
        // THE R1 falsifier: core is AUTHORITATIVE over an EditFrontmatter write's
        // exact bytes (it computes its own serialization from typed flags, never
        // receiving the Rust-side preview text). A preview-hash post-verify would
        // spuriously report this REAL, landed write as "did NOT land" because
        // core's real bytes need not match the preview's byte-for-byte guess.
        // The semantic post-verify (`operations::frontmatter_fields_match`) must
        // recognize it Applied regardless.
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_live_frontmatter();
        let applier = fx.applier.clone();
        let adapter = landing_frontmatter_timeout_adapter(
            LIVE_FRONTMATTER_DOC_PATH,
            LIVE_FRONTMATTER_NEW_DATE,
        );
        let outcome = apply(
            &mut fx,
            &adapter,
            &applier,
            "idem:apply:fm:live:kill:1",
            100,
        );
        let receipt = outcome
            .receipt
            .expect("an indeterminate kill still resolves to a terminal receipt");
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "the REAL landed frontmatter write must be recognized Applied via semantic \
             post-verify, not a preview-hash mismatch: {receipt:?}"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
        assert!(
            saved.contains(LIVE_FRONTMATTER_NEW_DATE),
            "the real core write is actually on disk: {saved}"
        );
    }

    fn envelope_adapter(status: &str) -> CoreAdapter {
        let json = format!(
            "{{\"schema\":\"vaultspec.vault.write.v1\",\"status\":\"{status}\",\"data\":{{}}}}"
        );
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!("& {{ [Console]::Out.Write('{json}') }}"),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!("printf '%s' '{json}'"),
            ]
        };
        CoreAdapter::from_invocation(invocation)
    }

    /// A core that hangs past a short deadline — invoke returns an
    /// OUTCOME-INDETERMINATE Timeout. The file effect (if any) is simulated by the
    /// test itself, exactly the "killed but maybe-completed" case R1 codified.
    fn timeout_adapter() -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                "& { Start-Sleep -Seconds 30 }".into(),
            ]
        } else {
            vec!["sh".to_string(), "-c".into(), "sleep 30".into()]
        };
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(300))
    }

    /// A core that LANDS the materialized write (copies `NEW_BODY` into the target during
    /// the invoke) and THEN hangs past the deadline — the realistic "killed but the write
    /// already landed" sequence. The mutation happens DURING invoke (after the preflight
    /// conflict gate, which sees the base), so it never masquerades as a pre-apply stale
    /// base. The body is staged in Rust (no shell escaping); the core copies it in place.
    fn landing_timeout_adapter(worktree_root: &Path) -> CoreAdapter {
        std::fs::write(worktree_root.join(".landing-source"), NEW_BODY).unwrap();
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ Copy-Item '.landing-source' '{DOC_PATH}' -Force; Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!("cp .landing-source '{DOC_PATH}'; sleep 30"),
            ]
        };
        // A longer deadline than the bare hang: the mutation must COMPLETE (past a cold
        // shell/PowerShell start) before the kill; the process is still sleeping at the
        // deadline, so the invoke is still an OUTCOME-INDETERMINATE Timeout.
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
    }

    /// A core that REMOVES the target during the invoke and then hangs — the "killed, and
    /// the post-state is now unreadable" sequence. The removal happens DURING invoke (after
    /// the preflight, which sees the intact base), so the fail-closed post-verify path is
    /// exercised without an artificial pre-apply anchor drift.
    fn removing_timeout_adapter() -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!("& {{ Remove-Item '{DOC_PATH}' -Force; Start-Sleep -Seconds 30 }}"),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!("rm '{DOC_PATH}'; sleep 30"),
            ]
        };
        // A longer deadline than the bare hang so the removal COMPLETES before the kill.
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
    }

    fn apply(
        fx: &mut Fx,
        adapter: &CoreAdapter,
        actor: &ActorRef,
        key: &str,
        now: i64,
    ) -> ApplyOutcome {
        let key = IdempotencyKey::new(key).unwrap();
        let root = fx.root.clone();
        let changeset_id = fx.changeset_id.clone();
        let proposal_id = fx.proposal_id.clone();
        apply_changeset(
            &mut fx.store,
            adapter,
            &root,
            ApplyRequest {
                changeset_id: &changeset_id,
                proposal_id: &proposal_id,
                actor,
                idempotency_key: &key,
                fencing_token: None,
                now_ms: now,
            },
        )
        .unwrap()
    }

    fn ledger_status(fx: &mut Fx) -> ChangesetStatus {
        let changeset_id = fx.changeset_id.clone();
        fx.store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&changeset_id)?.unwrap().status)
            })
            .unwrap()
    }

    /// Apply presenting a specific advisory fencing token (or `None`), so the apply-side
    /// fence (W14.P42a) can be exercised against a seeded lease.
    fn apply_with_token(
        fx: &mut Fx,
        adapter: &CoreAdapter,
        actor: &ActorRef,
        key: &str,
        now: i64,
        fencing_token: Option<i64>,
    ) -> ApplyOutcome {
        let key = IdempotencyKey::new(key).unwrap();
        let root = fx.root.clone();
        let changeset_id = fx.changeset_id.clone();
        let proposal_id = fx.proposal_id.clone();
        apply_changeset(
            &mut fx.store,
            adapter,
            &root,
            ApplyRequest {
                changeset_id: &changeset_id,
                proposal_id: &proposal_id,
                actor,
                idempotency_key: &key,
                fencing_token,
                now_ms: now,
            },
        )
        .unwrap()
    }

    /// Seed a live advisory lease on the apply target's per-document scope, held by
    /// `holder`, returning the issued lease record (its `fencing_token` is the current one).
    fn seed_lease(fx: &mut Fx, holder: &ActorRef, now: i64) -> LeaseRecord {
        let scope = document_lease_scope(&fx.root, "doc:apply-demo");
        fx.store
            .with_unit_of_work(CommandKind::AcquireLease, |uow| {
                uow.leases().acquire_lease(AcquireLeaseInput {
                    scope_id: scope,
                    purpose: LeasePurpose::WholeDocument,
                    holder: holder.clone(),
                    idempotency_key: format!("idem:lease:{}", holder.id.as_str()),
                    created_at_ms: now,
                    ttl_ms: None,
                })
            })
            .unwrap()
            .record
            .expect("a fresh acquisition records a lease")
    }

    #[test]
    fn a_live_lease_fences_a_stale_presented_token_but_admits_the_current_one() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        // A DIFFERENT active actor holds a live lease on the target document's scope.
        let holder = actor("human:reviewer", ActorKind::Human);
        let token = seed_lease(&mut fx, &holder, 90).fencing_token;
        assert!(token >= 1, "a fresh lease issues a monotonic token");

        // A PRESENTED token that is not the scope's current one is fenced out (P26
        // monotonicity), and the ledger does not advance.
        let stale = apply_with_token(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:stale",
            100,
            Some(token + 5),
        );
        assert!(
            !stale.eligibility.allowed,
            "a stale presented token is fenced out"
        );
        assert!(stale.receipt.is_none());
        assert!(
            stale
                .eligibility
                .reason
                .as_ref()
                .is_some_and(|reason| reason.contains("fencing token")),
            "the denial names the fencing token: {:?}",
            stale.eligibility.reason
        );
        assert_eq!(
            ledger_status(&mut fx),
            ChangesetStatus::Approved,
            "the fenced apply left the ledger untouched"
        );

        // Presenting the CURRENT token proceeds — a holder's current token finalizes.
        let ok = apply_with_token(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:token",
            101,
            Some(token),
        );
        assert!(ok.eligibility.allowed, "{:?}", ok.eligibility.reason);
        assert_eq!(
            ok.receipt
                .expect("the fenced-through apply records a receipt")
                .state,
            ApplyState::Applied
        );
    }

    #[test]
    fn an_absent_token_under_a_live_lease_proceeds() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        // A different active actor holds a live lease, but the applier presents NO token.
        let holder = actor("human:reviewer", ActorKind::Human);
        let _token = seed_lease(&mut fx, &holder, 90).fencing_token;

        // ADVISORY: an absent token is a non-participant — the apply PROCEEDS. Leases never
        // gate correctness; the revision check is the anti-stale-write floor. Denying it
        // would strand every approved apply (system / direct-write / execute present none).
        let outcome = apply_with_token(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:absent",
            100,
            None,
        );
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        assert_eq!(
            outcome
                .receipt
                .expect("the unfenced apply records a receipt")
                .state,
            ApplyState::Applied
        );
    }

    #[test]
    fn an_apply_with_no_live_lease_proceeds_unfenced() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        // No lease on the scope: advisory fencing requires none, so a tokenless apply lands.
        let outcome = apply_with_token(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:nolease",
            100,
            None,
        );
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        assert_eq!(
            outcome
                .receipt
                .expect("an unfenced apply records a receipt")
                .state,
            ApplyState::Applied
        );
    }

    #[test]
    fn an_out_of_band_edit_conflicts_and_refuses_the_apply_as_a_value() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        // An out-of-band edit changes the target document since the proposal was drafted:
        // its base is now stale (and the new content is NOT the proposal's result). The
        // apply preflight consults the conflict detector and REFUSES as a denial VALUE (no
        // receipt), never clobbering the out-of-band change. No lease bypasses this — the
        // revision check is the correctness floor.
        std::fs::write(
            &fx.doc_file,
            "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nsomeone else edited this\n",
        )
        .unwrap();

        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:conflict",
            100,
        );
        assert!(
            !outcome.eligibility.allowed,
            "a stale base refuses the apply as a value"
        );
        assert!(
            outcome.receipt.is_none(),
            "a preflight conflict denial carries no receipt (the core never ran)"
        );
        assert!(
            outcome.eligibility.reason.is_some(),
            "the denial carries the conflict reason"
        );
        assert_eq!(
            ledger_status(&mut fx),
            ChangesetStatus::Approved,
            "the refused apply left the ledger untouched"
        );
    }

    fn outbox_events(fx: &mut Fx) -> Vec<OutboxEvent> {
        fx.store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.outbox().events_after(0, 10)
            })
            .unwrap()
    }

    fn plain_child(key: &str, path: &str) -> ChangesetChildOperationInput {
        let doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{key}"),
            stem: key.to_string(),
            path: path.to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:base").unwrap(),
        };
        ChangesetChildOperationInput {
            child_key: key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: doc,
                base_revision: Some(RevisionToken::new("blob:base").unwrap()),
                current_revision: Some(RevisionToken::new("blob:base").unwrap()),
            },
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    // --- S177 matrix -------------------------------------------------------

    #[test]
    fn approved_changeset_materializes_once_and_records_an_applied_receipt() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied);
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert_eq!(receipt.child.core_status.as_deref(), Some("updated"));
        assert_eq!(
            receipt.child.core_schema.as_deref(),
            Some("vaultspec.vault.write.v1"),
            "the envelope schema string is recorded for drift forensics"
        );
        assert_eq!(receipt.child.base_blob_hash.len(), 40, "git blob oid");
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
        let events = outbox_events(&mut fx);
        assert_eq!(
            events
                .iter()
                .map(|event| event.event_kind.as_str())
                .collect::<Vec<_>>(),
            vec!["apply.started".to_string(), "apply.recorded".to_string()]
        );
        for event in events {
            let payload = serde_json::to_string(&event.payload).unwrap();
            assert!(
                !payload.contains("token")
                    && !payload.contains("debug")
                    && !payload.contains("chunk")
                    && !payload.contains("generation"),
                "durable lifecycle payload must not carry transient stream data: {payload}"
            );
        }
    }

    #[test]
    fn unapproved_changeset_is_denied_with_no_receipt() {
        let mut fx = setup(false); // stops at NeedsReview
        let applier = fx.applier.clone();
        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(!outcome.eligibility.allowed);
        assert!(
            outcome.receipt.is_none(),
            "a denied apply records no receipt"
        );
        assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
    }

    #[test]
    fn an_agent_cannot_apply_the_proposal_it_originated() {
        let mut fx = setup(true);
        let origin = fx.origin.clone(); // the proposing agent
        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &origin,
            "idem:apply:1",
            100,
        );
        assert!(!outcome.eligibility.allowed, "self-apply must be denied");
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("its own proposal")),
            "reason: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.receipt.is_none());
        assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
    }

    #[test]
    fn a_multi_child_changeset_is_refused_with_a_capability_limit() {
        // A 2-child changeset (schema stays multi-doc) is refused before any
        // materialization — V1 apply is single-child.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(&root.join(".vault")).unwrap();
        let changeset_id = ChangesetId::new("changeset_multi").unwrap();
        let proposal_id = ProposalId::new("proposal_multi").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let applier = actor("human:applier", ActorKind::Human);
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:applier", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: None,
                    kind: ChangesetKind::Authoring,
                    status: ChangesetStatus::Draft,
                    session_id: None,
                    actor: author.clone(),
                    summary: "multi".to_string(),
                    children: vec![
                        plain_child("child_a", ".vault/plan/a.md"),
                        plain_child("child_b", ".vault/plan/b.md"),
                    ],
                    created_at_ms: 10,
                })
                .unwrap();
                uow.ledger().append_revision(&record)?;
                Ok(())
            })
            .unwrap();

        let key = IdempotencyKey::new("idem:apply:multi").unwrap();
        let outcome = apply_changeset(
            &mut store,
            &envelope_adapter("updated"),
            &root,
            ApplyRequest {
                changeset_id: &changeset_id,
                proposal_id: &proposal_id,
                actor: &applier,
                idempotency_key: &key,
                fencing_token: None,
                now_ms: 100,
            },
        )
        .unwrap();
        assert!(!outcome.eligibility.allowed);
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("exactly one child")),
            "reason: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.receipt.is_none());
    }

    #[test]
    fn a_stale_approval_is_denied() {
        let mut fx = setup(true);
        // Mark the closed approval stale (a later edit invalidated it). Apply must
        // refuse a stale approval even while the head is still Approved.
        let proposal_id = fx.proposal_id.clone();
        fx.store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let mut approval = uow.approvals().latest_for_proposal(&proposal_id)?.unwrap();
                approval.stale = true;
                uow.approvals().store_record(&approval)?;
                Ok(())
            })
            .unwrap();
        let applier = fx.applier.clone();
        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(
            !outcome.eligibility.allowed,
            "stale approval must be denied"
        );
        assert!(outcome.receipt.is_none());
        assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
    }

    #[test]
    fn a_business_refusal_records_a_failed_receipt() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        // The core returns a status:"failed" refusal (e.g. a base-revision conflict).
        let outcome = apply(
            &mut fx,
            &envelope_adapter("failed"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(
            outcome.eligibility.allowed,
            "the command ran; the core refused"
        );
        let receipt = outcome.receipt.unwrap();
        assert_eq!(receipt.state, ApplyState::Failed);
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Failed);
        assert_eq!(receipt.child.core_status.as_deref(), Some("failed"));
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Failed);
    }

    #[test]
    fn an_indeterminate_kill_whose_write_landed_is_recorded_applied() {
        let mut fx = setup(true);
        // Simulate "the killed core (or its surviving grandchild) DID finish the write":
        // the adapter lands the materialized content DURING the invoke, then is killed —
        // so the preflight (which runs first) sees the intact base, not a stale one.
        let applier = fx.applier.clone();
        let adapter = landing_timeout_adapter(&fx.root);
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:1", 100);
        let receipt = outcome.receipt.unwrap();
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "post-state re-verify must confirm the landed write"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(
            receipt.child.observed_result_blob_hash.as_deref(),
            Some(fx.expected_result_blob_hash.as_str())
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
    }

    #[test]
    fn an_indeterminate_kill_whose_write_did_not_land_is_recorded_failed() {
        let mut fx = setup(true);
        // The file still holds the BASE content — the write did not land.
        let applier = fx.applier.clone();
        let outcome = apply(&mut fx, &timeout_adapter(), &applier, "idem:apply:1", 100);
        let receipt = outcome.receipt.unwrap();
        assert_eq!(receipt.state, ApplyState::Failed);
        assert!(receipt.child.resolved_via_post_verify);
        assert_ne!(
            receipt.child.observed_result_blob_hash.as_deref(),
            Some(fx.expected_result_blob_hash.as_str())
        );
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Failed);
    }

    #[test]
    fn an_indeterminate_kill_with_unreadable_post_state_fails_closed() {
        let mut fx = setup(true);
        // The document is removed DURING the invoke (then the core is killed), so the
        // post-state cannot be read: never forge Applied. The preflight ran first against
        // the intact base, so this is a genuine fail-closed, not a pre-apply anchor drift.
        let applier = fx.applier.clone();
        let adapter = removing_timeout_adapter();
        let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:1", 100);
        let receipt = outcome.receipt.unwrap();
        assert_eq!(
            receipt.state,
            ApplyState::Failed,
            "unverifiable post-state must fail closed, never Applied"
        );
        assert!(receipt.child.observed_result_blob_hash.is_none());
    }

    #[test]
    fn a_retry_of_the_same_apply_replays_the_recorded_receipt() {
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        let first = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(!first.replayed);
        let first_receipt = first.receipt.unwrap();

        // A second call with the SAME key replays the recorded receipt verbatim —
        // never a second materialization (status is already Applied).
        let replay = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            101,
        );
        assert!(replay.replayed, "the retry replays");
        let replay_receipt = replay.receipt.unwrap();
        assert_eq!(
            replay_receipt.result_revision,
            first_receipt.result_revision
        );
        assert_eq!(replay_receipt.applied_at_ms, first_receipt.applied_at_ms);
    }

    #[test]
    fn a_crashed_in_flight_attempt_is_reported_in_flight_on_retry() {
        // Restart recovery: an attempt reserved + appended Applying but never
        // recorded an outcome (process died mid-materialize). A retry with the same
        // key continues the SAME in-flight attempt — it does not re-apply.
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        let changeset_id = fx.changeset_id.clone();
        let key = IdempotencyKey::new("idem:apply:1").unwrap();

        fx.store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                let latest = uow.ledger().latest(&changeset_id)?.unwrap();
                let source_revision = latest.changeset_revision.clone();
                let key_scope = IdempotencyKeyScope::new(
                    applier.clone(),
                    CommandKind::RequestApply,
                    key.clone(),
                );
                let scope = apply_scope(&changeset_id);
                let request_digest = apply_request_digest(&changeset_id, &applier);
                let receipt_id = receipt_id_for(&changeset_id, &source_revision);
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    scope,
                    request_digest,
                    receipt_id,
                    50,
                    Some(50 + IN_FLIGHT_TTL_MS),
                )?;
                Ok(())
            })
            .unwrap();

        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100,
        );
        assert!(
            outcome.in_flight,
            "a live prior attempt continues, not re-applies"
        );
        assert!(outcome.receipt.is_none());
        assert!(!outcome.replayed);
    }

    #[test]
    fn an_expired_wedged_applying_reservation_is_reclaimed_to_a_terminal_receipt() {
        // P36-R1 falsifier: a crash between stage A (reservation + Applying) and
        // stage C wedges the changeset in Applying. Within the TTL a retry reports
        // in_flight; PAST the TTL the reclaim path must RESUME COMPLETION to an
        // honest terminal receipt (Applied here — the write had landed), never a
        // permanent wedge or a forever-ghost poll.
        let mut fx = setup(true);
        let applier = fx.applier.clone();
        let key = IdempotencyKey::new("idem:apply:1").unwrap();
        let changeset_id = fx.changeset_id.clone();
        let proposal_id = fx.proposal_id.clone();

        // Stage A ONLY (simulate a crash before completion): reserve + append
        // Applying, then drop the prep without running stage C.
        let pf = fx
            .store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                preflight_in_uow(
                    uow,
                    &fx.root,
                    &ApplyRequest {
                        changeset_id: &changeset_id,
                        proposal_id: &proposal_id,
                        actor: &applier,
                        idempotency_key: &key,
                        fencing_token: None,
                        now_ms: 100,
                    },
                )
            })
            .unwrap()
            .unwrap();
        assert!(
            matches!(pf, Preflight::Proceed(_)),
            "stage A reserves + appends Applying"
        );
        drop(pf); // the process dies here — no stage C.
        assert_eq!(
            ledger_status(&mut fx),
            ChangesetStatus::Applying,
            "the changeset is wedged in Applying"
        );

        // Within the TTL a retry is a ghost poll (in_flight), not yet a heal.
        let within = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100 + 1_000,
        );
        assert!(
            within.in_flight,
            "within the TTL the attempt is presumed live"
        );
        assert!(within.receipt.is_none());
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applying);

        // The killed core HAD landed the write (post-state = materialized content).
        std::fs::write(&fx.doc_file, NEW_BODY).unwrap();

        // Past the TTL: reclaim RESUMES COMPLETION to a terminal receipt — the core
        // is NOT re-invoked (the passed adapter would fail; it must never be called).
        let reclaimed = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100 + IN_FLIGHT_TTL_MS + 1,
        );
        assert!(
            !reclaimed.in_flight,
            "past the TTL the wedge is healed, never a permanent ghost"
        );
        let receipt = reclaimed
            .receipt
            .expect("reclaim records a terminal receipt, not a wedge");
        assert_eq!(
            receipt.state,
            ApplyState::Applied,
            "the landed write is confirmed by post-state re-verify"
        );
        assert!(receipt.child.resolved_via_post_verify);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

        // A further retry now replays the recorded terminal receipt (idempotent).
        let replay = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:1",
            100 + IN_FLIGHT_TTL_MS + 2,
        );
        assert!(replay.replayed);
        assert_eq!(
            replay.receipt.unwrap().result_revision,
            receipt.result_revision
        );
    }

    // --- W02.P03: EditFrontmatter apply wiring ------------------------------

    #[test]
    fn build_write_invocation_selects_set_frontmatter_capability_and_field_level_flags() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let doc_file = root.join(".vault").join("plan").join("fm-invocation.md");
        std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        std::fs::write(
            &doc_file,
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbody\n",
        )
        .unwrap();

        let reader = SnapshotReader::for_worktree(root.to_path_buf());
        let seed_doc = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:fm-invocation".to_string(),
            stem: "fm-invocation".to_string(),
            path: ".vault/plan/fm-invocation.md".to_string(),
            doc_type: "plan".to_string(),
            base_revision: RevisionToken::new("blob:seed").unwrap(),
        };
        let base_probe = reader.capture_existing(&seed_doc).unwrap();
        let document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:fm-invocation".to_string(),
            stem: "fm-invocation".to_string(),
            path: ".vault/plan/fm-invocation.md".to_string(),
            doc_type: "plan".to_string(),
            base_revision: base_probe.revision.clone(),
        };
        let base_snapshot = reader.capture_existing(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_fm_inv".to_string(),
                changeset_id: "changeset_fm_inv".to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 1,
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::EditFrontmatter,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(base_snapshot.revision.clone()),
                current_revision: Some(base_snapshot.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                    date: Some("2026-02-06".to_string()),
                    tags: Some(vec!["#plan".to_string(), "#new-tag".to_string()]),
                    related: None,
                }),
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
            &ChangesetId::new("changeset_fm_inv").unwrap(),
            draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();

        let invocation = build_write_invocation(
            ChangesetOperationKind::EditFrontmatter,
            &materialized,
            &existing_path(&document).unwrap(),
            "a".repeat(40),
        )
        .unwrap();

        assert_eq!(invocation.capability(), CoreCapability::SetFrontmatter);
        assert!(
            !invocation.has_body(),
            "a frontmatter edit never streams a body to core"
        );
        assert!(invocation.argv().contains(&"--date".to_string()));
        assert!(invocation.argv().contains(&"2026-02-06".to_string()));
        assert!(invocation.argv().contains(&"--tags".to_string()));
        assert!(invocation.argv().contains(&"#new-tag".to_string()));
    }

    #[test]
    fn edit_frontmatter_apply_materializes_once_and_records_an_applied_receipt() {
        let mut fx = setup_frontmatter(true);
        let applier = fx.applier.clone();
        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:fm:1",
            100,
        );
        assert!(
            outcome.eligibility.allowed,
            "{:?}",
            outcome.eligibility.reason
        );
        let receipt = outcome
            .receipt
            .expect("an applied frontmatter changeset yields a receipt");
        assert_eq!(receipt.state, ApplyState::Applied);
        assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
        assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
    }

    #[test]
    fn edit_frontmatter_out_of_band_edit_conflicts_and_refuses_the_apply_as_a_value() {
        let mut fx = setup_frontmatter(true);
        let applier = fx.applier.clone();
        // An out-of-band edit lands on the target after the frontmatter draft was
        // materialized: the base is now stale, so the base-revision conflict gate
        // (generalized to `EditFrontmatter` by the `is_whole_document_replace`
        // broadening in conflicts.rs) refuses the apply as a denial VALUE.
        std::fs::write(
            &fx.doc_file,
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\n# apply demo\n\nsomeone else edited this\n",
        )
        .unwrap();

        let outcome = apply(
            &mut fx,
            &envelope_adapter("updated"),
            &applier,
            "idem:apply:fm:conflict",
            100,
        );
        assert!(
            !outcome.eligibility.allowed,
            "a stale base refuses the frontmatter apply as a value"
        );
        assert!(
            outcome.receipt.is_none(),
            "a preflight conflict denial carries no receipt (the core never ran)"
        );
        assert_eq!(
            ledger_status(&mut fx),
            ChangesetStatus::Approved,
            "the refused apply left the ledger untouched"
        );
    }
}
