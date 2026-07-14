//! Apply-stage materialize-outcome resolution: interpreting the core write
//! result into a ChildResolution, incl. post-state re-verification and
//! created-document identity. Split from apply.rs.

use std::path::Path;

use super::super::api::ChangesetOperationKind;
use super::super::ledger::ChangesetAggregateRecord;
use super::super::model::DocumentRef;
use super::super::store::Result as StoreResult;
use super::super::store::idempotency::{IdempotencyKeyScope, InFlightReservation};
use super::types::{ApplyChildOutcome, ApplyError, ApplyRequest};
use super::{
    ApplyPrep, PostVerifyExpectation, Preflight, apply_request_digest, apply_scope,
    build_write_invocation, existing_path, full_file_blob_hash, post_verify_expectation,
    read_blob_hash, read_document_text, receipt_id_for,
};

/// The interpreted result of the materialize stage, ready to persist.
pub(super) struct ChildResolution {
    pub(super) outcome: ApplyChildOutcome,
    pub(super) observed_result_blob_hash: Option<String>,
    pub(super) core_status: Option<String>,
    pub(super) core_schema: Option<String>,
    pub(super) resolved_via_post_verify: bool,
    pub(super) diagnostic: Option<String>,
}

pub(super) fn resolve_outcome(
    invoke_result: std::result::Result<
        super::super::core_adapter::CoreEnvelope,
        super::super::core_adapter::CoreAdapterError,
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
pub(super) fn post_state_resolution(
    worktree_root: &Path,
    prep: &ApplyPrep,
    reason: &str,
) -> ChildResolution {
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
                Ok(text) if super::super::operations::frontmatter_fields_match(&text, fields) => {
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
pub(super) fn plan_step_done(text: &str, step_id: &str) -> Option<bool> {
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
pub(super) fn resolve_by_stem(worktree_root: &Path, stem: &str) -> Option<DocumentRef> {
    super::super::documents::DocumentResolver::for_worktree(worktree_root)
        .resolve_existing(super::super::documents::ExistingDocumentLookup::Stem(
            stem.to_string(),
        ))
        .ok()
}

/// Reconstruct an [`ApplyPrep`] from a changeset WEDGED in `Applying` whose
/// in-flight reservation expired (P36-R1). The Applying revision carries the
/// single materialized child and the recorded receipt id; the completion path
/// then re-verifies post-state and records the terminal receipt against the
/// still-`in_flight` (expired) reservation — no core re-invoke.
pub(super) fn build_reclaim_prep(
    request: &ApplyRequest<'_>,
    worktree_root: &Path,
    applying: &ChangesetAggregateRecord,
    record: &super::super::store::idempotency::IdempotencyRecord,
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
pub(super) struct CreatedDocumentIdentity {
    pub(super) path: String,
    pub(super) node_id: String,
    pub(super) stem: String,
}

/// Resolve a landed `CreateDocument` child's REAL identity — from the SAME
/// predicted stem `PostVerifyExpectation::CreatedAt` already confirmed to
/// recognize `Applied`, re-resolved HERE (never cached from prep time, since
/// `prep.document`/`prep.document_path` carry nothing real for a create —
/// there was nothing to resolve when the attempt was prepared). `None` for
/// every other post-verify kind (self-guarded), or — fail-closed, never
/// forged — if the stem somehow no longer resolves despite the outcome
/// reading `Applied`.
pub(super) fn resolve_created_document(
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
