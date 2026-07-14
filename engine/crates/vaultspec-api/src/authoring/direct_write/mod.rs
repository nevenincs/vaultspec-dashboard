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

use std::path::Path;
use std::time::Instant;

use ingest_struct::reader::blob_oid;
use rusqlite::params;

use super::actors::actor_kind_name;
use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DirectWriteCreateParams,
    DirectWriteRequest, DraftMode, DraftMutation, FrontmatterEditFields, PlanStepEdit,
    TargetRevisionFence,
};
use super::apply::{self, ApplyReceipt, ApplyRequest};
use super::approvals::ApprovalRequestRecord;
use super::core_adapter::CoreAdapter;
use super::documents::DocumentResolver;
use super::model::{
    ActionEligibility, ActorKind, ActorRef, ApplyState, ApprovalId, ChangesetId, CommandKind,
    DocumentRef, IdempotencyKey, ProposalId, ProvisionalCollisionStatus,
};
use super::snapshots::SnapshotReader;
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, Store, StoreError};

mod pipeline;
mod types;
use pipeline::*;
use types::DIRECT_WRITE_RECORD_SCHEMA;
pub use types::*;

#[cfg(test)]
mod tests;

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
    SetPlanStepState {
        doc_ref: String,
        expected_blob_hash: String,
        edit: PlanStepEdit,
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
        ChangesetOperationKind::SetPlanStepState => {
            if !payload.body.is_empty() {
                return Err(unexpected("body"));
            }
            if payload.frontmatter.is_some() {
                return Err(unexpected("frontmatter"));
            }
            if payload.new_stem.is_some() {
                return Err(unexpected("new_stem"));
            }
            if payload.create.is_some() {
                return Err(unexpected("create"));
            }
            let edit = payload.plan_step.clone().ok_or_else(|| {
                StoreError::Validation(
                    "direct write `set_plan_step_state` requires `plan_step`".to_string(),
                )
            })?;
            Ok(DirectOperationInput::SetPlanStepState {
                doc_ref: require_doc_ref(payload)?,
                expected_blob_hash: require_expected_blob_hash(payload)?,
                edit,
            })
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
        | DirectOperationInput::Rename { doc_ref, .. }
        | DirectOperationInput::SetPlanStepState { doc_ref, .. } => doc_ref.clone(),
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
        }
        | DirectOperationInput::SetPlanStepState {
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
        | DirectOperationInput::CreateDocument { .. }
        | DirectOperationInput::SetPlanStepState { .. } => blob_oid(b""),
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
///
/// Compares against `engine_model::scope_token`, NOT the mode layer's
/// simpler `modes::scope_id_for_worktree` — the SAME parity `http.rs`'s
/// `active_authorized_scope` doc already warns about: `scope_token` strips
/// the Windows extended-length `\\?\` prefix and is the identity the
/// frontend's `useActiveScope()`/`/map` actually sources its pin from
/// (`DocumentResolver` writes the same token into `DocumentRef::Existing.
/// scope`). The two normalizations coincide on a prefix-free path (every
/// temp-dir test root), which is why this diverging comparison went
/// undetected until a real extended-length workspace root exercised it.
fn scope_pin_mismatch(
    worktree_root: &Path,
    requested_scope: Option<&str>,
) -> Option<DirectWriteOutcome> {
    let requested_scope = requested_scope?;
    let active_scope = engine_model::scope_token(worktree_root);
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
        denial_kind: Some(DirectWriteDenialKind::ScopeMismatch),
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
            denial_kind: Some(DirectWriteDenialKind::ForbiddenActor),
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
        }
        | DirectOperationInput::SetPlanStepState {
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
                    denial_kind: None,
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
    | DirectOperationInput::Rename { doc_ref, .. }
    | DirectOperationInput::SetPlanStepState { doc_ref, .. } = &operation
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
            denial_kind: None,
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
        // `ApprovalOutcome` carries no structured sub-classification for WHY an
        // approval was denied (validation-freshness, policy-version mismatch, a
        // cancelled linked run, ...) — `SelfApproval` cannot apply here either
        // (direct-write's actor is gated to `Human` earlier, and the blocker
        // only fires for an automated approver). Honest `Other`, not a guess.
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
            denial_kind: Some(DirectWriteDenialKind::Other),
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
        | DirectOperationInput::Rename { doc_ref, .. }
        | DirectOperationInput::SetPlanStepState { doc_ref, .. } = &operation
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
                denial_kind: None,
                approval: Some(approval.record),
                apply_receipt: None,
                now_ms,
            });
            return persist_outcome(store, record, false, apply.replayed);
        }
        let denial_kind = map_apply_denial_kind(apply.denial_kind);
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
            denial_kind: Some(denial_kind),
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
            denial_kind: None,
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
        denial_kind: None,
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
                    section_selector: None,
                    plan_step: None,
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
                    section_selector: None,
                    plan_step: None,
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
                    section_selector: None,
                    plan_step: None,
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
                    section_selector: None,
                    plan_step: None,
                },
            }
        }
        DirectOperationInput::SetPlanStepState { edit, .. } => {
            let document =
                existing_document.expect("SetPlanStepState resolves an existing document");
            ChangesetChildOperationDraft {
                child_key: "direct_write".to_string(),
                operation: ChangesetOperationKind::SetPlanStepState,
                target: TargetRevisionFence {
                    base_revision: base_revision(&document),
                    current_revision: base_revision(&document),
                    document,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: String::new(),
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: Some(edit.clone()),
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
    denial_kind: Option<DirectWriteDenialKind>,
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
        denial_kind: input.denial_kind,
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
        denial_kind: record.denial_kind,
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
        denial_kind: None,
        record: None,
    }
}

/// Map the apply-preflight's structured classification (W05.P14) onto the
/// direct-write wire vocabulary. `None` (an apply denial the preflight could
/// not classify — e.g. a stale approval/validation-digest refusal) collapses
/// to `Other` — a `Denied` outcome ALWAYS carries a concrete `denial_kind`,
/// never omits it.
fn map_apply_denial_kind(kind: Option<super::apply::ApplyDenialKind>) -> DirectWriteDenialKind {
    match kind {
        Some(super::apply::ApplyDenialKind::PathCollision) => DirectWriteDenialKind::PathCollision,
        Some(super::apply::ApplyDenialKind::StaleBase) => DirectWriteDenialKind::StaleBase,
        Some(super::apply::ApplyDenialKind::SelfApproval) => DirectWriteDenialKind::SelfApproval,
        None => DirectWriteDenialKind::Other,
    }
}
