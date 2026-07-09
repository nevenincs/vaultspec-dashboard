//! Direct human editor-save composition (W10.P49, retired to sole authority
//! W14.P47).
//!
//! The direct-changeset path is the editor save's ONE materializer: it opens a
//! self-approved `kind=direct` changeset and applies it through the same
//! `apply_changeset` every other changeset uses. The legacy `/ops/core`
//! dual-run comparison this module measured against during the transition
//! (latency + conflict-UX parity, agentic-operation-modes ADR) is retired —
//! there is no second write path to compare against or fall back to.
#![allow(dead_code)]

use std::fs;
use std::path::Path;
use std::time::Instant;

use ingest_struct::reader::blob_oid;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::actors::actor_kind_name;
use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, CreateProposalRequest,
    CreateSessionRequest, DirectWriteCreateParams, DirectWriteRequest, DraftMode, DraftMutation,
    FrontmatterEditFields, TargetRevisionFence,
};
use super::apply::{self, ApplyError, ApplyReceipt, ApplyRequest};
use super::approvals::{
    ApprovalDecision, ApprovalError, ApprovalRequestInput, ApprovalRequestRecord,
    ReviewDecisionInput, ReviewedTuple, V1_POLICY_VERSION,
};
use super::core_adapter::CoreAdapter;
use super::documents::{DocumentResolver, ExistingDocumentLookup};
use super::ledger::ChangesetAggregateRecord;
use super::model::{
    ActionEligibility, ActorKind, ActorRef, ApplyState, ApprovalId, ChangesetId, ChangesetStatus,
    CommandKind, DocumentRef, IdempotencyKey, ProposalId, ProvisionalCollisionStatus, ReceiptId,
    RevisionToken, SessionId,
};
use super::modes::scope_id_for_worktree;
use super::proposal::{
    ProposalCommandContext, ProposalCommandOutcome, ProposalCommandResult, SubmitProposalRequest,
    ValidateProposalRequest, validation_evidence,
};
use super::snapshots::SnapshotReader;
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::ValidationFreshness;
use super::validation::ValidationStatusRecord;

const DIRECT_WRITE_RECORD_SCHEMA: &str = "authoring.direct_write_record.v1";
const DIRECT_WRITE_CAPABILITIES_FILE: &str =
    ".vault/data/authoring-state/direct-write-capabilities.json";
const COMMAND_IN_FLIGHT_TTL_MS: i64 = 60_000;
const COMMAND_OUTCOME_TTL_MS: i64 = 24 * 3_600 * 1_000;

/// The direct-write feature gate. Direct-changeset is the SOLE editor-save
/// path (no legacy alternative remains), so `enabled` is a pure kill switch —
/// ON by default, overridable by hand-editing the capability file to `false`
/// (the same transition-era ops story the P49-R2 review banked as an advisory:
/// an admin route/setting seam should eventually own this).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteCapabilities {
    pub enabled: bool,
}

impl DirectWriteCapabilities {
    pub fn disabled() -> Self {
        Self { enabled: false }
    }

    pub fn enabled() -> Self {
        Self { enabled: true }
    }

    pub fn for_worktree(worktree_root: &Path) -> Self {
        let path = worktree_root.join(DIRECT_WRITE_CAPABILITIES_FILE);
        let Ok(raw) = fs::read_to_string(path) else {
            // No capability file: direct-changeset is authoritative by default.
            return Self::enabled();
        };
        // A present-but-unparseable file is an explicit admin artifact gone
        // stale — fail closed rather than silently reverting to the default.
        serde_json::from_str(&raw).unwrap_or_else(|_| Self::disabled())
    }

    pub fn write_for_tests(worktree_root: &Path, capabilities: Self) {
        let path = worktree_root.join(DIRECT_WRITE_CAPABILITIES_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("direct-write capability parent exists");
        }
        fs::write(
            path,
            serde_json::to_string_pretty(&capabilities).expect("capabilities serialize"),
        )
        .expect("direct-write capabilities write");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectWriteStatus {
    Applied,
    Failed,
    InFlight,
    Conflict,
    Denied,
}

impl DirectWriteStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Applied => "applied",
            Self::Failed => "failed",
            Self::InFlight => "in_flight",
            Self::Conflict => "conflict",
            Self::Denied => "denied",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectWriteAuthority {
    DirectChangeset,
}

impl DirectWriteAuthority {
    fn as_str(self) -> &'static str {
        match self {
            Self::DirectChangeset => "direct_changeset",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteConflict {
    pub document_ref: String,
    pub document_path: String,
    pub expected_blob_hash: String,
    pub actual_blob_hash: String,
    pub target_blob_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteRecord {
    pub schema_version: String,
    pub status: DirectWriteStatus,
    pub changeset_id: ChangesetId,
    pub proposal_id: ProposalId,
    pub approval_id: ApprovalId,
    pub document_ref: String,
    pub document_path: String,
    pub expected_blob_hash: String,
    pub target_blob_hash: String,
    pub actor: ActorRef,
    pub idempotency_key: IdempotencyKey,
    pub request_digest: String,
    pub authoritative_path: DirectWriteAuthority,
    pub direct_elapsed_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<DirectWriteConflict>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eligibility: Option<ActionEligibility>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<ApprovalRequestRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apply_receipt: Option<ApplyReceipt>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectWriteOutcome {
    pub status: DirectWriteStatus,
    pub replayed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changeset_id: Option<ChangesetId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<ProposalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<ApprovalId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<ApprovalRequestRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apply_receipt: Option<ApplyReceipt>,
    pub apply_replayed: bool,
    pub apply_in_flight: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<DirectWriteConflict>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eligibility: Option<ActionEligibility>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record: Option<DirectWriteRecord>,
}

pub struct DirectWriteRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn direct_writes<'repo>(&'repo self) -> DirectWriteRepository<'repo, 'conn> {
        DirectWriteRepository {
            repo: self.repository("authoring_direct_write_records"),
        }
    }
}

impl DirectWriteRepository<'_, '_> {
    pub fn record_by_actor_key(
        &self,
        actor: &ActorRef,
        idempotency_key: &IdempotencyKey,
    ) -> StoreResult<Option<DirectWriteRecord>> {
        let actor_kind = actor_kind_name(actor.kind);
        let Some(json) = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_direct_write_records
             WHERE actor_id = ?1
               AND actor_kind = ?2
               AND idempotency_key = ?3",
            params![actor.id.as_str(), actor_kind, idempotency_key.as_str()],
            |row| row.get::<_, String>(0),
        )?
        else {
            return Ok(None);
        };
        decode_record(&json)
    }

    pub fn upsert_record(&self, record: &DirectWriteRecord) -> StoreResult<()> {
        let json =
            serde_json::to_string(record).map_err(|err| StoreError::Ledger(err.to_string()))?;
        let receipt_id = record
            .apply_receipt
            .as_ref()
            .map(|receipt| receipt.receipt_id.as_str());
        self.repo.execute(
            "INSERT INTO authoring_direct_write_records
                (changeset_id, proposal_id, approval_id, document_ref, document_path,
                 expected_blob_hash, target_blob_hash, actor_id, actor_kind,
                 idempotency_key, request_digest, authoritative_path, direct_elapsed_ms,
                 apply_status, apply_receipt_id, record_json, created_at_ms,
                 updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(changeset_id) DO UPDATE SET
                direct_elapsed_ms = excluded.direct_elapsed_ms,
                apply_status = excluded.apply_status,
                apply_receipt_id = excluded.apply_receipt_id,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms",
            params![
                record.changeset_id.as_str(),
                record.proposal_id.as_str(),
                record.approval_id.as_str(),
                record.document_ref.as_str(),
                record.document_path.as_str(),
                record.expected_blob_hash.as_str(),
                record.target_blob_hash.as_str(),
                record.actor.id.as_str(),
                actor_kind_name(record.actor.kind),
                record.idempotency_key.as_str(),
                record.request_digest.as_str(),
                record.authoritative_path.as_str(),
                record.direct_elapsed_ms,
                record.status.as_str(),
                receipt_id,
                json,
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

/// The validated, kind-dispatched direct-write operation — built from the
/// wire `DirectWriteRequest` EARLY (before any store mutation), mirroring the
/// R1 "no accepted-but-ignored field" discipline the propose draft's own
/// per-kind materializers already enforce (`operations.rs`). A malformed
/// field combination (e.g. `frontmatter` set for a `ReplaceBody` request, or
/// `ref` present for `CreateDocument`) fails loud here, never silently.
enum DirectOperationInput {
    ReplaceBody {
        doc_ref: String,
        expected_blob_hash: String,
        body: String,
    },
    EditFrontmatter {
        doc_ref: String,
        expected_blob_hash: String,
        fields: FrontmatterEditFields,
    },
    Rename {
        doc_ref: String,
        expected_blob_hash: String,
        new_stem: String,
    },
    CreateDocument {
        params: DirectWriteCreateParams,
    },
}

fn validate_operation(payload: &DirectWriteRequest) -> StoreResult<DirectOperationInput> {
    let unexpected = |field: &str| {
        StoreError::Validation(format!(
            "direct write operation `{:?}` does not accept `{field}`",
            payload.operation
        ))
    };
    match payload.operation {
        ChangesetOperationKind::ReplaceBody => {
            if payload.frontmatter.is_some() {
                return Err(unexpected("frontmatter"));
            }
            if payload.new_stem.is_some() {
                return Err(unexpected("new_stem"));
            }
            if payload.create.is_some() {
                return Err(unexpected("create"));
            }
            Ok(DirectOperationInput::ReplaceBody {
                doc_ref: require_doc_ref(payload)?,
                expected_blob_hash: require_expected_blob_hash(payload)?,
                body: payload.body.clone(),
            })
        }
        ChangesetOperationKind::EditFrontmatter => {
            if !payload.body.is_empty() {
                return Err(unexpected("body"));
            }
            if payload.new_stem.is_some() {
                return Err(unexpected("new_stem"));
            }
            if payload.create.is_some() {
                return Err(unexpected("create"));
            }
            let fields = payload.frontmatter.clone().ok_or_else(|| {
                StoreError::Validation(
                    "direct write `edit_frontmatter` requires `frontmatter`".to_string(),
                )
            })?;
            Ok(DirectOperationInput::EditFrontmatter {
                doc_ref: require_doc_ref(payload)?,
                expected_blob_hash: require_expected_blob_hash(payload)?,
                fields,
            })
        }
        ChangesetOperationKind::Rename => {
            if !payload.body.is_empty() {
                return Err(unexpected("body"));
            }
            if payload.frontmatter.is_some() {
                return Err(unexpected("frontmatter"));
            }
            if payload.create.is_some() {
                return Err(unexpected("create"));
            }
            let new_stem = payload.new_stem.clone().ok_or_else(|| {
                StoreError::Validation("direct write `rename` requires `new_stem`".to_string())
            })?;
            Ok(DirectOperationInput::Rename {
                doc_ref: require_doc_ref(payload)?,
                expected_blob_hash: require_expected_blob_hash(payload)?,
                new_stem,
            })
        }
        ChangesetOperationKind::CreateDocument => {
            if payload.doc_ref.is_some() {
                return Err(unexpected("ref"));
            }
            if payload.expected_blob_hash.is_some() {
                return Err(unexpected("expected_blob_hash"));
            }
            if !payload.body.is_empty() {
                return Err(unexpected("body"));
            }
            if payload.frontmatter.is_some() {
                return Err(unexpected("frontmatter"));
            }
            if payload.new_stem.is_some() {
                return Err(unexpected("new_stem"));
            }
            let params = payload.create.clone().ok_or_else(|| {
                StoreError::Validation(
                    "direct write `create_document` requires `create`".to_string(),
                )
            })?;
            Ok(DirectOperationInput::CreateDocument { params })
        }
        other => Err(StoreError::Validation(format!(
            "direct write does not support operation kind `{other:?}`"
        ))),
    }
}

fn require_doc_ref(payload: &DirectWriteRequest) -> StoreResult<String> {
    payload
        .doc_ref
        .clone()
        .ok_or_else(|| StoreError::Validation("direct write requires `ref`".to_string()))
}

fn require_expected_blob_hash(payload: &DirectWriteRequest) -> StoreResult<String> {
    let value = payload.expected_blob_hash.as_deref().ok_or_else(|| {
        StoreError::Validation("direct write requires `expected_blob_hash`".to_string())
    })?;
    validate_blob_hash(value)
}

/// A best-effort, unresolved echo of what the request named as its target —
/// used for audit metadata BEFORE (or without ever) resolving a real
/// document, never asserted to be a canonical path.
fn operation_document_ref(operation: &DirectOperationInput) -> String {
    match operation {
        DirectOperationInput::ReplaceBody { doc_ref, .. }
        | DirectOperationInput::EditFrontmatter { doc_ref, .. }
        | DirectOperationInput::Rename { doc_ref, .. } => doc_ref.clone(),
        DirectOperationInput::CreateDocument { params } => {
            format!("create:{}/{}", params.doc_type, params.feature)
        }
    }
}

/// The record's `expected_blob_hash` — the requested base fence for an
/// existing-document kind, or the git-style empty-blob hash for
/// `CreateDocument` (the SAME phantom "diff from nothing" sentinel
/// `operations.rs::materialize_create_document` uses — never a claim that a
/// real prior state existed).
fn operation_expected_blob_hash(operation: &DirectOperationInput) -> String {
    match operation {
        DirectOperationInput::ReplaceBody {
            expected_blob_hash, ..
        }
        | DirectOperationInput::EditFrontmatter {
            expected_blob_hash, ..
        }
        | DirectOperationInput::Rename {
            expected_blob_hash, ..
        } => expected_blob_hash.clone(),
        DirectOperationInput::CreateDocument { .. } => blob_oid(b""),
    }
}

/// The record's `target_blob_hash` — a REAL prediction only for
/// `ReplaceBody` (core reproduces the streamed body byte-for-byte). Every
/// other kind is core-authoritative over the resulting bytes (the SAME
/// reasoning `apply.rs`'s kind-gated post-verify already established), so a
/// client-computed "target" hash would be an unsound claim; this stays the
/// phantom empty-blob sentinel rather than a fabricated prediction.
fn operation_target_blob_hash(operation: &DirectOperationInput) -> String {
    match operation {
        DirectOperationInput::ReplaceBody { body, .. } => blob_oid(body.as_bytes()),
        DirectOperationInput::EditFrontmatter { .. }
        | DirectOperationInput::Rename { .. }
        | DirectOperationInput::CreateDocument { .. } => blob_oid(b""),
    }
}

/// The W02.P06 scope pin: `None` when the request carries no pin (proceed
/// against whatever is active, backward-compatible) or when it matches the
/// server's CURRENT active scope. `Some(outcome)` is an EPHEMERAL denial
/// value — never persisted to this workspace's `direct_writes` table, since
/// a mismatched pin may not even name a scope this server's ledger owns, and
/// a stale persisted denial would wrongly outlive a legitimate later retry
/// once the client catches up to the correct scope. The reason NEVER echoes
/// the foreign scope string back onto the wire.
fn scope_pin_mismatch(
    worktree_root: &Path,
    requested_scope: Option<&str>,
) -> Option<DirectWriteOutcome> {
    let requested_scope = requested_scope?;
    let active_scope = scope_id_for_worktree(worktree_root);
    if requested_scope == active_scope {
        return None;
    }
    Some(DirectWriteOutcome {
        status: DirectWriteStatus::Denied,
        replayed: false,
        changeset_id: None,
        proposal_id: None,
        approval_id: None,
        approval: None,
        apply_receipt: None,
        apply_replayed: false,
        apply_in_flight: false,
        conflict: None,
        eligibility: Some(ActionEligibility::denied(
            CommandKind::DirectWrite,
            "the requested scope does not match the server's active workspace; re-check \
             which workspace is active before retrying",
        )),
        record: None,
    })
}

pub fn execute_direct_write(
    store: &mut Store,
    adapter: &CoreAdapter,
    worktree_root: &Path,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    payload: DirectWriteRequest,
) -> StoreResult<DirectWriteOutcome> {
    let request_digest = request_digest(&payload)?;
    if let Some(record) = existing_record(store, actor, idempotency_key)? {
        if record.request_digest != request_digest {
            return Err(StoreError::Idempotency(
                "direct write idempotency key conflicts with a different save payload".to_string(),
            ));
        }
        return Ok(outcome_from_record(record, true, true));
    }

    if let Some(mismatch) = scope_pin_mismatch(worktree_root, payload.scope.as_deref()) {
        return Ok(mismatch);
    }

    let operation = validate_operation(&payload)?;
    let ids = DirectWriteIds::new(actor, idempotency_key)?;
    let document_ref = operation_document_ref(&operation);
    let expected_blob_hash = operation_expected_blob_hash(&operation);
    let target_blob_hash = operation_target_blob_hash(&operation);

    if actor.kind != ActorKind::Human {
        let eligibility = ActionEligibility::denied(
            CommandKind::DirectWrite,
            "direct editor saves require a human actor; agents must propose changesets",
        );
        let record = direct_record(DirectRecordInput {
            status: DirectWriteStatus::Denied,
            ids,
            payload_doc_ref: document_ref,
            document_path: String::new(),
            expected_blob_hash,
            target_blob_hash,
            actor,
            idempotency_key,
            request_digest,
            started: Instant::now(),
            conflict: None,
            eligibility: Some(eligibility),
            approval: None,
            apply_receipt: None,
            now_ms,
        });
        return persist_outcome(store, record, false, false);
    }

    let reader = SnapshotReader::for_worktree(worktree_root);
    let resolver = DocumentResolver::for_worktree(worktree_root);

    // Resolve + pre-check staleness for the three existing-document kinds
    // (the SAME base-revision fence, regardless of what the write does to the
    // document once it lands) — pre-checked HERE so a stale save reports the
    // clean `Conflict` VALUE the ADR requires, rather than a hard validation
    // FAULT surfacing from deep inside the materializer.
    // `CreateDocument` has nothing to resolve or stale-check: its collision
    // class (the predicted path already occupied) is caught at APPLY-TIME
    // preflight instead — the SAME `detect_conflicts` check the standard
    // propose flow already relies on (W02.P05's `CreateDocumentPathCollision`).
    let existing_target = match &operation {
        DirectOperationInput::ReplaceBody {
            doc_ref,
            expected_blob_hash,
            ..
        }
        | DirectOperationInput::EditFrontmatter {
            doc_ref,
            expected_blob_hash,
            ..
        }
        | DirectOperationInput::Rename {
            doc_ref,
            expected_blob_hash,
            ..
        } => {
            let resolved = resolve_existing_document(&resolver, doc_ref)?;
            let actual_snapshot = reader
                .capture_existing(&resolved)
                .map_err(|err| StoreError::Snapshot(err.to_string()))?;
            if &actual_snapshot.blob_hash != expected_blob_hash {
                let conflict = DirectWriteConflict {
                    document_ref: doc_ref.clone(),
                    document_path: actual_snapshot.path.clone(),
                    expected_blob_hash: expected_blob_hash.clone(),
                    actual_blob_hash: actual_snapshot.blob_hash,
                    target_blob_hash: target_blob_hash.clone(),
                };
                let eligibility = ActionEligibility::denied(
                    CommandKind::DirectWrite,
                    "expected_blob_hash is stale for the current document",
                );
                let record = direct_record(DirectRecordInput {
                    status: DirectWriteStatus::Conflict,
                    ids,
                    payload_doc_ref: document_ref,
                    document_path: conflict.document_path.clone(),
                    expected_blob_hash: expected_blob_hash.clone(),
                    target_blob_hash,
                    actor,
                    idempotency_key,
                    request_digest,
                    started: Instant::now(),
                    conflict: Some(conflict),
                    eligibility: Some(eligibility),
                    approval: None,
                    apply_receipt: None,
                    now_ms,
                });
                return persist_outcome(store, record, false, false);
            }
            Some((
                with_base_revision(resolved, expected_blob_hash)?,
                actual_snapshot.path,
            ))
        }
        DirectOperationInput::CreateDocument { .. } => None,
    };

    let started = Instant::now();
    let summary = direct_summary(payload.summary.as_deref(), &document_ref);
    ensure_direct_session(store, actor, idempotency_key, now_ms, &ids)?;

    let draft = build_draft(
        &operation,
        existing_target.as_ref().map(|(doc, _)| doc.clone()),
    );
    if ensure_proposal_created(
        store,
        &reader,
        actor,
        idempotency_key,
        now_ms,
        &ids,
        DirectProposalInput {
            summary: summary.clone(),
            draft,
        },
    )? {
        return Ok(in_flight_outcome(&ids));
    }

    // The race window between the pre-check above and the propose write —
    // existing-document kinds only, mirroring the pre-check's own scope.
    if let DirectOperationInput::ReplaceBody { doc_ref, .. }
    | DirectOperationInput::EditFrontmatter { doc_ref, .. }
    | DirectOperationInput::Rename { doc_ref, .. } = &operation
        && let Some(conflict) = refreshed_conflict(
            worktree_root,
            &reader,
            doc_ref,
            &expected_blob_hash,
            &target_blob_hash,
        )?
    {
        let eligibility = ActionEligibility::denied(
            CommandKind::DirectWrite,
            "expected_blob_hash is stale for the current document",
        );
        let record = direct_record(DirectRecordInput {
            status: DirectWriteStatus::Conflict,
            ids,
            payload_doc_ref: document_ref,
            document_path: conflict.document_path.clone(),
            expected_blob_hash,
            target_blob_hash,
            actor,
            idempotency_key,
            request_digest,
            started,
            conflict: Some(conflict),
            eligibility: Some(eligibility),
            approval: None,
            apply_receipt: None,
            now_ms,
        });
        return persist_outcome(store, record, false, false);
    }

    let review = match ensure_review_open(
        store,
        &reader,
        actor,
        idempotency_key,
        now_ms,
        &ids,
        &summary,
    )? {
        ReviewOpen::Ready(review) => review,
        ReviewOpen::InFlight => return Ok(in_flight_outcome(&ids)),
    };
    let approval = ensure_human_approval(store, actor, idempotency_key, now_ms, &ids, &review)?;
    if !approval.eligibility.allowed {
        return Ok(DirectWriteOutcome {
            status: DirectWriteStatus::Denied,
            replayed: false,
            changeset_id: Some(ids.changeset_id),
            proposal_id: Some(ids.proposal_id),
            approval_id: Some(ids.approval_id),
            approval: Some(approval.record),
            apply_receipt: None,
            apply_replayed: false,
            apply_in_flight: false,
            conflict: None,
            eligibility: Some(approval.eligibility),
            record: None,
        });
    }

    let apply = apply::apply_changeset(
        store,
        adapter,
        worktree_root,
        ApplyRequest {
            changeset_id: &ids.changeset_id,
            proposal_id: &ids.proposal_id,
            actor,
            idempotency_key: &step_key(idempotency_key, "apply")?,
            // The human editor save presents no lease token; advisory fencing refuses it
            // only if a live lease holds the target document.
            fencing_token: None,
            now_ms,
        },
    )
    .map_err(apply_err_to_store)?;

    if !apply.eligibility.allowed {
        if let DirectOperationInput::ReplaceBody { doc_ref, .. }
        | DirectOperationInput::EditFrontmatter { doc_ref, .. }
        | DirectOperationInput::Rename { doc_ref, .. } = &operation
            && apply
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("base") || reason.contains("stale"))
        {
            let conflict = refreshed_conflict(
                worktree_root,
                &reader,
                doc_ref,
                &expected_blob_hash,
                &target_blob_hash,
            )?
            .unwrap_or(DirectWriteConflict {
                document_ref: doc_ref.clone(),
                document_path: existing_target
                    .as_ref()
                    .map(|(_, path)| path.clone())
                    .unwrap_or_default(),
                expected_blob_hash: expected_blob_hash.clone(),
                actual_blob_hash: expected_blob_hash.clone(),
                target_blob_hash: target_blob_hash.clone(),
            });
            let record = direct_record(DirectRecordInput {
                status: DirectWriteStatus::Conflict,
                ids,
                payload_doc_ref: document_ref,
                document_path: conflict.document_path.clone(),
                expected_blob_hash,
                target_blob_hash,
                actor,
                idempotency_key,
                request_digest,
                started,
                conflict: Some(conflict),
                eligibility: Some(apply.eligibility),
                approval: Some(approval.record),
                apply_receipt: None,
                now_ms,
            });
            return persist_outcome(store, record, false, apply.replayed);
        }
        return Ok(DirectWriteOutcome {
            status: DirectWriteStatus::Denied,
            replayed: false,
            changeset_id: Some(ids.changeset_id),
            proposal_id: Some(ids.proposal_id),
            approval_id: Some(ids.approval_id),
            approval: Some(approval.record),
            apply_receipt: None,
            apply_replayed: apply.replayed,
            apply_in_flight: apply.in_flight,
            conflict: None,
            eligibility: Some(apply.eligibility),
            record: None,
        });
    }

    if apply.in_flight {
        return Ok(DirectWriteOutcome {
            status: DirectWriteStatus::InFlight,
            replayed: false,
            changeset_id: Some(ids.changeset_id),
            proposal_id: Some(ids.proposal_id),
            approval_id: Some(ids.approval_id),
            approval: Some(approval.record),
            apply_receipt: None,
            apply_replayed: apply.replayed,
            apply_in_flight: true,
            conflict: None,
            eligibility: Some(apply.eligibility),
            record: None,
        });
    }

    let status = match apply.receipt.as_ref().map(|receipt| receipt.state) {
        Some(ApplyState::Applied) => DirectWriteStatus::Applied,
        _ => DirectWriteStatus::Failed,
    };
    let apply_replayed = apply.replayed;
    let document_path = existing_target.map(|(_, path)| path).unwrap_or_default();
    let record = direct_record(DirectRecordInput {
        status,
        ids,
        payload_doc_ref: document_ref,
        document_path,
        expected_blob_hash,
        target_blob_hash,
        actor,
        idempotency_key,
        request_digest,
        started,
        conflict: None,
        eligibility: None,
        approval: Some(approval.record),
        apply_receipt: apply.receipt,
        now_ms,
    });
    persist_outcome(store, record, false, apply_replayed)
}

/// Build the `ChangesetChildOperationDraft` for one direct-write operation —
/// reusing the SAME propose-side shape `materialize_drafts` (W02.P05a)
/// dispatches on, so a direct-write save is materialized through the
/// IDENTICAL per-kind materializers the standard propose flow uses, never a
/// re-implementation. `existing_document` is the base-revision-fenced target
/// for the three existing-document kinds (`None` for `CreateDocument`, whose
/// target is a `ProvisionalCreate` ref built here instead).
fn build_draft(
    operation: &DirectOperationInput,
    existing_document: Option<DocumentRef>,
) -> ChangesetChildOperationDraft {
    match operation {
        DirectOperationInput::ReplaceBody { body, .. } => {
            let document = existing_document.expect("ReplaceBody resolves an existing document");
            ChangesetChildOperationDraft {
                child_key: "direct_write".to_string(),
                operation: ChangesetOperationKind::ReplaceBody,
                target: TargetRevisionFence {
                    base_revision: base_revision(&document),
                    current_revision: base_revision(&document),
                    document,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: body.clone(),
                    frontmatter: None,
                    new_stem: None,
                },
            }
        }
        DirectOperationInput::EditFrontmatter { fields, .. } => {
            let document =
                existing_document.expect("EditFrontmatter resolves an existing document");
            ChangesetChildOperationDraft {
                child_key: "direct_write".to_string(),
                operation: ChangesetOperationKind::EditFrontmatter,
                target: TargetRevisionFence {
                    base_revision: base_revision(&document),
                    current_revision: base_revision(&document),
                    document,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: String::new(),
                    frontmatter: Some(fields.clone()),
                    new_stem: None,
                },
            }
        }
        DirectOperationInput::Rename { new_stem, .. } => {
            let document = existing_document.expect("Rename resolves an existing document");
            ChangesetChildOperationDraft {
                child_key: "direct_write".to_string(),
                operation: ChangesetOperationKind::Rename,
                target: TargetRevisionFence {
                    base_revision: base_revision(&document),
                    current_revision: base_revision(&document),
                    document,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: String::new(),
                    frontmatter: None,
                    new_stem: Some(new_stem.clone()),
                },
            }
        }
        DirectOperationInput::CreateDocument { params } => {
            let document = DocumentRef::ProvisionalCreate {
                provisional_doc_id: format!("direct:{}:{}", params.doc_type, params.feature),
                doc_type: params.doc_type.clone(),
                feature: params.feature.clone(),
                title: params.title.clone(),
                collision_status: ProvisionalCollisionStatus::Unknown,
                proposed_stem: None,
            };
            ChangesetChildOperationDraft {
                child_key: "direct_write".to_string(),
                operation: ChangesetOperationKind::CreateDocument,
                target: TargetRevisionFence {
                    document,
                    base_revision: None,
                    current_revision: None,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: String::new(),
                    frontmatter: None,
                    new_stem: None,
                },
            }
        }
    }
}

struct DirectRecordInput<'a> {
    status: DirectWriteStatus,
    ids: DirectWriteIds,
    payload_doc_ref: String,
    document_path: String,
    expected_blob_hash: String,
    target_blob_hash: String,
    actor: &'a ActorRef,
    idempotency_key: &'a IdempotencyKey,
    request_digest: String,
    started: Instant,
    conflict: Option<DirectWriteConflict>,
    eligibility: Option<ActionEligibility>,
    approval: Option<ApprovalRequestRecord>,
    apply_receipt: Option<ApplyReceipt>,
    now_ms: i64,
}

fn direct_record(input: DirectRecordInput<'_>) -> DirectWriteRecord {
    DirectWriteRecord {
        schema_version: DIRECT_WRITE_RECORD_SCHEMA.to_string(),
        status: input.status,
        changeset_id: input.ids.changeset_id,
        proposal_id: input.ids.proposal_id,
        approval_id: input.ids.approval_id,
        document_ref: input.payload_doc_ref,
        document_path: input.document_path,
        expected_blob_hash: input.expected_blob_hash,
        target_blob_hash: input.target_blob_hash,
        actor: input.actor.clone(),
        idempotency_key: input.idempotency_key.clone(),
        request_digest: input.request_digest,
        authoritative_path: DirectWriteAuthority::DirectChangeset,
        direct_elapsed_ms: elapsed_ms(input.started),
        conflict: input.conflict,
        eligibility: input.eligibility,
        approval: input.approval,
        apply_receipt: input.apply_receipt,
        created_at_ms: input.now_ms,
        updated_at_ms: input.now_ms,
    }
}

fn persist_outcome(
    store: &mut Store,
    record: DirectWriteRecord,
    replayed: bool,
    apply_replayed: bool,
) -> StoreResult<DirectWriteOutcome> {
    store.with_unit_of_work(CommandKind::DirectWrite, |uow| {
        uow.direct_writes().upsert_record(&record)
    })?;
    Ok(outcome_from_record(record, replayed, apply_replayed))
}

fn refreshed_conflict(
    worktree_root: &Path,
    reader: &SnapshotReader,
    doc_ref: &str,
    expected_blob_hash: &str,
    target_blob_hash: &str,
) -> StoreResult<Option<DirectWriteConflict>> {
    let resolver = DocumentResolver::for_worktree(worktree_root);
    let resolved = resolve_existing_document(&resolver, doc_ref)?;
    let snapshot = reader
        .capture_existing(&resolved)
        .map_err(|err| StoreError::Snapshot(err.to_string()))?;
    if snapshot.blob_hash == expected_blob_hash {
        return Ok(None);
    }
    Ok(Some(DirectWriteConflict {
        document_ref: doc_ref.to_string(),
        document_path: snapshot.path,
        expected_blob_hash: expected_blob_hash.to_string(),
        actual_blob_hash: snapshot.blob_hash,
        target_blob_hash: target_blob_hash.to_string(),
    }))
}

fn existing_record(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
) -> StoreResult<Option<DirectWriteRecord>> {
    store.with_unit_of_work(CommandKind::DirectWrite, |uow| {
        uow.direct_writes()
            .record_by_actor_key(actor, idempotency_key)
    })
}

fn decode_record(json: &str) -> StoreResult<Option<DirectWriteRecord>> {
    serde_json::from_str(json)
        .map(Some)
        .map_err(|err| StoreError::Ledger(format!("direct write record json: {err}")))
}

fn outcome_from_record(
    record: DirectWriteRecord,
    replayed: bool,
    apply_replayed: bool,
) -> DirectWriteOutcome {
    DirectWriteOutcome {
        status: record.status,
        replayed,
        changeset_id: terminal_changeset_id(&record),
        proposal_id: terminal_proposal_id(&record),
        approval_id: terminal_approval_id(&record),
        approval: record.approval.clone(),
        apply_receipt: record.apply_receipt.clone(),
        apply_replayed,
        apply_in_flight: false,
        conflict: record.conflict.clone(),
        eligibility: record
            .eligibility
            .clone()
            .or_else(|| Some(ActionEligibility::allowed(CommandKind::DirectWrite))),
        record: Some(record),
    }
}

fn terminal_changeset_id(record: &DirectWriteRecord) -> Option<ChangesetId> {
    match record.status {
        DirectWriteStatus::Conflict | DirectWriteStatus::Denied => None,
        _ => Some(record.changeset_id.clone()),
    }
}

fn terminal_proposal_id(record: &DirectWriteRecord) -> Option<ProposalId> {
    match record.status {
        DirectWriteStatus::Conflict | DirectWriteStatus::Denied => None,
        _ => Some(record.proposal_id.clone()),
    }
}

fn terminal_approval_id(record: &DirectWriteRecord) -> Option<ApprovalId> {
    match record.status {
        DirectWriteStatus::Conflict | DirectWriteStatus::Denied => None,
        _ => Some(record.approval_id.clone()),
    }
}

fn in_flight_outcome(ids: &DirectWriteIds) -> DirectWriteOutcome {
    DirectWriteOutcome {
        status: DirectWriteStatus::InFlight,
        replayed: false,
        changeset_id: Some(ids.changeset_id.clone()),
        proposal_id: Some(ids.proposal_id.clone()),
        approval_id: Some(ids.approval_id.clone()),
        approval: None,
        apply_receipt: None,
        apply_replayed: false,
        apply_in_flight: true,
        conflict: None,
        eligibility: Some(ActionEligibility::allowed(CommandKind::DirectWrite)),
        record: None,
    }
}

fn ensure_direct_session(
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
            super::session::append_session_created_event(
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

fn direct_session_receipt_id(ids: &DirectWriteIds) -> StoreResult<ReceiptId> {
    ReceiptId::new(format!(
        "receipt:direct-session:{}",
        ids.session_id.as_str()
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

struct DirectProposalInput {
    summary: String,
    draft: ChangesetChildOperationDraft,
}

/// Open the direct-changeset draft through `create_direct_proposal`, which
/// routes into the SAME `materialize_drafts` per-kind dispatch (W02.P05a)
/// the standard propose surface uses — a direct-write save is materialized
/// through the IDENTICAL per-kind materializers, never a re-implementation.
fn ensure_proposal_created(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
    input: DirectProposalInput,
) -> StoreResult<bool> {
    let result = super::proposal::create_direct_proposal(
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

enum ReviewOpen {
    Ready(ReviewReady),
    InFlight,
}

fn ensure_review_open(
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

fn validate_latest(
    store: &mut Store,
    reader: &SnapshotReader,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    latest: &ChangesetAggregateRecord,
    summary: &str,
) -> StoreResult<bool> {
    let (current_revisions, chunk_evidence) = validation_evidence(reader, latest)?;
    let result = super::proposal::validate_proposal(
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

fn submit_latest(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    latest: &ChangesetAggregateRecord,
    summary: &str,
) -> StoreResult<bool> {
    let validation_digest = validation_digest_for(store, &latest.changeset_id, latest)?;
    let result = super::proposal::submit_for_review(
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

fn ensure_human_approval(
    store: &mut Store,
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    now_ms: i64,
    ids: &DirectWriteIds,
    review: &ReviewReady,
) -> StoreResult<super::approvals::ApprovalOutcome> {
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
struct ReviewReady {
    needs_review_revision: RevisionToken,
    validation_digest: String,
}

#[derive(Debug, Clone)]
struct DirectWriteIds {
    session_id: SessionId,
    changeset_id: ChangesetId,
    proposal_id: ProposalId,
    approval_id: ApprovalId,
}

impl DirectWriteIds {
    fn new(actor: &ActorRef, idempotency_key: &IdempotencyKey) -> StoreResult<Self> {
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
enum StepOutcome {
    Outcome,
    Denied(ActionEligibility),
    InFlight,
}

fn reduce_step(result: ProposalCommandResult) -> StoreResult<StepOutcome> {
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

fn context(
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

fn latest_record(
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

fn validation_digest_for(
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

fn resolve_existing_document(
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

fn with_base_revision(document: DocumentRef, blob_hash: &str) -> StoreResult<DocumentRef> {
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

fn base_revision(document: &DocumentRef) -> Option<RevisionToken> {
    match document {
        DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
        _ => None,
    }
}

fn validate_blob_hash(value: &str) -> StoreResult<String> {
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

fn request_digest(payload: &DirectWriteRequest) -> StoreResult<String> {
    let json = serde_json::to_vec(payload)
        .map_err(|err| StoreError::Idempotency(format!("direct write digest: {err}")))?;
    Ok(blob_oid(&json))
}

fn direct_summary(summary: Option<&str>, doc_ref: &str) -> String {
    summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Editor save {doc_ref}"))
}

fn derive_proposal_id(changeset_id: &ChangesetId) -> StoreResult<ProposalId> {
    ProposalId::new(format!(
        "proposal:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived proposal id is invalid: {err}")))
}

fn derive_approval_id(changeset_id: &ChangesetId) -> StoreResult<ApprovalId> {
    ApprovalId::new(format!(
        "approval:{}",
        blob_oid(changeset_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Approval(format!("derived approval id is invalid: {err}")))
}

fn step_key(base: &IdempotencyKey, step: &str) -> StoreResult<IdempotencyKey> {
    IdempotencyKey::new(format!("{}:{step}", base.as_str())).map_err(|err| {
        StoreError::Idempotency(format!("composed idempotency key is invalid: {err}"))
    })
}

fn approval_err_to_store(err: ApprovalError) -> StoreError {
    match err {
        ApprovalError::Store(store) => store,
        other => StoreError::Approval(other.to_string()),
    }
}

fn apply_err_to_store(err: ApplyError) -> StoreError {
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

fn elapsed_ms(started: Instant) -> i64 {
    started.elapsed().as_millis().min(i64::MAX as u128) as i64
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::Mutex;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::ActorId;

    const DOC_PATH: &str = ".vault/plan/direct-save-plan.md";
    const BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#direct-save'\ndate: '2026-07-06'\n---\n\n# direct save\n\nbase body\n";
    const NEW_BODY: &str = "# direct save\n\nmaterialized body\n";
    const CONCURRENT_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#direct-save'\ndate: '2026-07-06'\n---\n\n# direct save\n\nconcurrent body\n";
    static REAL_CORE_TEST_LOCK: Mutex<()> = Mutex::new(());

    struct Fx {
        _dir: tempfile::TempDir,
        root: PathBuf,
        store: Store,
        human: ActorRef,
        agent: ActorRef,
        base_hash: String,
    }

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .env("GIT_AUTHOR_NAME", "direct")
            .env("GIT_AUTHOR_EMAIL", "direct@example.invalid")
            .env("GIT_COMMITTER_NAME", "direct")
            .env("GIT_COMMITTER_EMAIL", "direct@example.invalid")
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
            "real vaultspec-core install must succeed for direct-write tests: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn setup() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        let doc = root.join(DOC_PATH);
        std::fs::create_dir_all(doc.parent().unwrap()).unwrap();
        std::fs::write(&doc, BASE_BODY).unwrap();
        scaffold_vaultspec_workspace(&root);
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "direct fixture"]);

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let human = actor("human:author", ActorKind::Human);
        let agent = actor("agent:author", ActorKind::Agent);
        register_actor(&mut store, &human, 1);
        register_actor(&mut store, &agent, 1);
        Fx {
            _dir: dir,
            root,
            store,
            human,
            agent,
            base_hash: blob_oid(BASE_BODY.as_bytes()),
        }
    }

    fn register_actor(store: &mut Store, actor: &ActorRef, now: i64) {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput::active(
                    actor.clone(),
                    ActorDisplayMetadata::new(actor.id.as_str(), None),
                    now,
                ))
            })
            .unwrap();
    }

    fn request(expected_blob_hash: &str, body: &str) -> DirectWriteRequest {
        DirectWriteRequest {
            doc_ref: Some(DOC_PATH.to_string()),
            operation: ChangesetOperationKind::ReplaceBody,
            body: body.to_string(),
            frontmatter: None,
            new_stem: None,
            create: None,
            expected_blob_hash: Some(expected_blob_hash.to_string()),
            summary: Some("editor save".to_string()),
            scope: None,
        }
    }

    fn direct_save(
        fx: &mut Fx,
        actor: &ActorRef,
        key: &str,
        expected_blob_hash: &str,
        body: &str,
        now: i64,
    ) -> DirectWriteOutcome {
        let adapter = CoreAdapter::detect();
        execute_direct_write(
            &mut fx.store,
            &adapter,
            &fx.root,
            actor,
            &IdempotencyKey::new(key).unwrap(),
            now,
            request(expected_blob_hash, body),
        )
        .unwrap()
    }

    #[test]
    fn human_direct_save_self_approves_captures_preimage_and_ledgers_kind_direct() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup();
        // No capability file: direct-changeset is authoritative by default (W14.P47).
        let human = fx.human.clone();
        let base_hash = fx.base_hash.clone();
        let outcome = direct_save(
            &mut fx,
            &human,
            "idem:direct:human:1",
            &base_hash,
            NEW_BODY,
            100,
        );

        assert_eq!(outcome.status, DirectWriteStatus::Applied);
        assert!(!outcome.replayed, "first direct save is not a replay");
        assert!(!outcome.apply_replayed);
        assert!(!outcome.apply_in_flight);
        let record = outcome.record.as_ref().expect("direct record is served");
        assert_eq!(record.status, DirectWriteStatus::Applied);
        assert_eq!(
            record.authoritative_path,
            DirectWriteAuthority::DirectChangeset
        );
        assert_eq!(record.actor, human);
        assert_eq!(record.expected_blob_hash, base_hash);
        assert_eq!(record.target_blob_hash, blob_oid(NEW_BODY.as_bytes()));
        assert!(record.direct_elapsed_ms >= 0);

        let approval = outcome.approval.as_ref().expect("approval is served");
        let decision = approval.decision.as_ref().expect("approval was decided");
        assert_eq!(decision.decision, ApprovalDecision::Approve);
        assert_eq!(decision.reviewer, human);
        assert_eq!(decision.resulting_status, ChangesetStatus::Approved);

        let receipt = outcome
            .apply_receipt
            .as_ref()
            .expect("apply receipt is recorded");
        assert_eq!(receipt.state, ApplyState::Applied);
        assert_eq!(receipt.actor, human);
        assert_eq!(receipt.child.base_blob_hash, base_hash);
        assert_eq!(
            receipt.child.expected_result_blob_hash,
            record.target_blob_hash
        );
        let saved = std::fs::read_to_string(fx.root.join(DOC_PATH)).unwrap();
        assert!(saved.contains("materialized body"), "{saved}");
        assert!(!saved.contains("base body"), "{saved}");
        assert!(
            !saved.contains("# direct save\n---\n"),
            "body-only direct save must not nest frontmatter in the markdown body: {saved}"
        );

        let changeset_id = outcome.changeset_id.as_ref().unwrap().clone();
        let preimage_id = format!("preimage:{}:direct_write", changeset_id.as_str());
        let (preimage, projection, ledger_kind) = fx
            .store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let preimage = uow.snapshots().preimage(&preimage_id)?.unwrap();
                let projection = uow
                    .projections()
                    .project_proposal(&changeset_id, &fx.root)
                    .map_err(|err| StoreError::Ledger(err.to_string()))?
                    .unwrap();
                let ledger_kind = uow.ledger().latest(&changeset_id)?.unwrap().kind;
                Ok((preimage, projection, ledger_kind))
            })
            .unwrap();
        assert_eq!(preimage.payload_text, BASE_BODY);
        assert_eq!(preimage.blob_hash, base_hash);
        assert_eq!(preimage.document_path, DOC_PATH);
        // P49-R2: the direct save is a self-describing `kind=direct` changeset in the
        // ledger (no side-table join needed to know it was a human direct save).
        assert_eq!(
            ledger_kind,
            crate::authoring::model::ChangesetKind::Direct,
            "a direct save is recorded as kind=Direct in the ledger"
        );
        // Direct behaves authoring-like: it applied through the normal lifecycle and an
        // applied direct save is a legal rollback SOURCE (arch-reviewer site a).
        assert!(
            projection.rollback.available,
            "applied direct save remains rollback-available: {:?}",
            projection.rollback
        );
        let session_created_events = fx
            .store
            .with_unit_of_work(CommandKind::DirectWrite, |uow| {
                let events = uow.outbox().events_after(0, 25)?;
                Ok(events
                    .into_iter()
                    .filter(|event| {
                        event.event_kind == "session.created"
                            && event.aggregate_id == record.changeset_id.as_str()
                    })
                    .count())
            })
            .unwrap();
        assert_eq!(
            session_created_events, 0,
            "session.created must not be keyed to the changeset aggregate"
        );
        let session_created_events = fx
            .store
            .with_unit_of_work(CommandKind::DirectWrite, |uow| {
                let events = uow.outbox().events_after(0, 25)?;
                Ok(events
                    .into_iter()
                    .filter(|event| {
                        event.event_kind == "session.created"
                            && event.aggregate_id == record.proposal_id.as_str()
                    })
                    .count())
            })
            .unwrap();
        assert_eq!(
            session_created_events, 0,
            "session.created must not be keyed to the proposal aggregate"
        );
        let session_created_events = fx
            .store
            .with_unit_of_work(CommandKind::DirectWrite, |uow| {
                let events = uow.outbox().events_after(0, 25)?;
                Ok(events
                    .into_iter()
                    .filter(|event| {
                        event.event_kind == "session.created" && event.aggregate_kind == "session"
                    })
                    .count())
            })
            .unwrap();
        assert_eq!(
            session_created_events, 1,
            "direct write must publish the session.created lifecycle transition"
        );

        let stored = existing_record(
            &mut fx.store,
            &human,
            &IdempotencyKey::new("idem:direct:human:1").unwrap(),
        )
        .unwrap()
        .expect("direct record is replayable by actor/idempotency key");
        assert_eq!(stored.changeset_id, changeset_id);

        let replay = direct_save(
            &mut fx,
            &human,
            "idem:direct:human:1",
            &base_hash,
            NEW_BODY,
            101,
        );
        assert!(replay.replayed);
        assert_eq!(replay.changeset_id, outcome.changeset_id);

        let replay_conflict = execute_direct_write(
            &mut fx.store,
            &CoreAdapter::detect(),
            &fx.root,
            &human,
            &IdempotencyKey::new("idem:direct:human:1").unwrap(),
            101,
            request(&base_hash, "# different body\n"),
        )
        .unwrap_err();
        assert!(
            replay_conflict
                .to_string()
                .contains("different save payload"),
            "same idempotency key with a different payload must not replay: {replay_conflict}"
        );

        let serialized = serde_json::to_string(&outcome).unwrap();
        let temp_dir_name = fx.root.file_name().unwrap().to_string_lossy();
        assert!(
            !serialized.contains("materialized body"),
            "direct-write evidence must not leak raw document body: {serialized}"
        );
        assert!(
            !serialized.contains(temp_dir_name.as_ref()),
            "direct-write evidence must not leak absolute host paths: {serialized}"
        );

        let agent = fx.agent.clone();
        let agent_denial = direct_save(
            &mut fx,
            &agent,
            "idem:direct:agent:1",
            &blob_oid(NEW_BODY.as_bytes()),
            NEW_BODY,
            102,
        );
        assert_eq!(agent_denial.status, DirectWriteStatus::Denied);
        assert!(agent_denial.record.is_some());
        assert!(
            agent_denial
                .eligibility
                .as_ref()
                .and_then(|eligibility| eligibility.reason.as_deref())
                .is_some_and(|reason| reason.contains("agents must propose changesets")),
            "agent denial carries the direct-save provenance reason: {agent_denial:?}"
        );
        assert!(
            existing_record(
                &mut fx.store,
                &agent,
                &IdempotencyKey::new("idem:direct:agent:1").unwrap()
            )
            .unwrap()
            .is_some(),
            "agent denial must create a replayable direct-write value record"
        );
    }

    // W14.P47 (S253): the dual-run/legacy-comparison surface is fully retired, not
    // just unused — a capability payload naming the retired fields must fail closed
    // (deny_unknown_fields), and a served record/outcome must carry no legacy key.
    // Regression guards against silently reintroducing the dual-write bridge.
    #[test]
    fn direct_write_capabilities_reject_the_retired_dual_run_and_authority_fields() {
        let legacy_shaped = serde_json::json!({
            "enabled": true,
            "dual_run": true,
            "authority": "direct_changeset",
        });
        let decoded: Result<DirectWriteCapabilities, _> = serde_json::from_value(legacy_shaped);
        assert!(
            decoded.is_err(),
            "a capability payload naming retired dual_run/authority fields must not decode"
        );

        let canonical: DirectWriteCapabilities =
            serde_json::from_value(serde_json::json!({ "enabled": true })).unwrap();
        assert_eq!(canonical, DirectWriteCapabilities::enabled());
    }

    #[test]
    fn direct_write_outcome_carries_no_legacy_key_on_the_wire() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup();
        let human = fx.human.clone();
        let base_hash = fx.base_hash.clone();
        let outcome = direct_save(
            &mut fx,
            &human,
            "idem:direct:no-legacy-wire:1",
            &base_hash,
            NEW_BODY,
            100,
        );
        assert_eq!(outcome.status, DirectWriteStatus::Applied);
        let serialized = serde_json::to_value(&outcome).unwrap();
        assert!(
            serialized.get("legacy").is_none(),
            "the retired legacy comparison must not appear on the outcome wire shape: {serialized}"
        );
        let record = serialized.get("record").expect("record is served");
        assert!(
            record.get("legacy").is_none(),
            "the retired legacy comparison must not appear on the record wire shape: {record}"
        );
    }

    #[test]
    fn stale_expected_blob_hash_conflicts_and_does_not_apply() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup();
        let human = fx.human.clone();
        let base_hash = fx.base_hash.clone();
        std::fs::write(fx.root.join(DOC_PATH), CONCURRENT_BODY).unwrap();
        let concurrent_hash = blob_oid(CONCURRENT_BODY.as_bytes());

        let outcome = direct_save(
            &mut fx,
            &human,
            "idem:direct:conflict:1",
            &base_hash,
            NEW_BODY,
            200,
        );

        assert_eq!(outcome.status, DirectWriteStatus::Conflict);
        assert!(outcome.changeset_id.is_none());
        assert!(outcome.record.is_some());
        let conflict = outcome.conflict.as_ref().expect("conflict is served");
        assert_eq!(conflict.expected_blob_hash, base_hash);
        assert_eq!(conflict.actual_blob_hash, concurrent_hash);
        assert_eq!(conflict.target_blob_hash, blob_oid(NEW_BODY.as_bytes()));
        assert_eq!(
            std::fs::read_to_string(fx.root.join(DOC_PATH)).unwrap(),
            CONCURRENT_BODY,
            "stale direct save must not modify the live checkout"
        );
        assert!(
            existing_record(
                &mut fx.store,
                &human,
                &IdempotencyKey::new("idem:direct:conflict:1").unwrap()
            )
            .unwrap()
            .is_some(),
            "conflicted direct save must create a replayable direct-write value record"
        );

        std::fs::write(fx.root.join(DOC_PATH), BASE_BODY).unwrap();
        let replay = direct_save(
            &mut fx,
            &human,
            "idem:direct:conflict:1",
            &base_hash,
            NEW_BODY,
            201,
        );
        assert!(replay.replayed);
        assert_eq!(replay.status, DirectWriteStatus::Conflict);
        assert!(
            std::fs::read_to_string(fx.root.join(DOC_PATH))
                .unwrap()
                .contains("base body"),
            "conflict replay must not re-evaluate and apply after the document changes"
        );

        let serialized = serde_json::to_string(&outcome).unwrap();
        let temp_dir_name = fx.root.file_name().unwrap().to_string_lossy();
        assert!(!serialized.contains("materialized body"));
        assert!(!serialized.contains(temp_dir_name.as_ref()));
    }
}
