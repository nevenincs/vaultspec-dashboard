//! Rollback generation and eligibility (W03.P38).
//!
//! Rolling back an applied authoring change is itself a NEW auditable changeset
//! (agentic-rollback-history ADR `rollback-appends-a-new-authoring-changeset`): a
//! `kind=Rollback` aggregate that INVERTS an applied source, opened in
//! `RollbackProposed` and then carried through the CANONICAL lifecycle — review,
//! approval, and the SAME [`super::apply::apply_changeset`] materialization path a
//! forward changeset uses. It never rewrites the source changeset, its approvals,
//! its receipts, or its events; the source at most gains a derived `rolled_back`
//! projection elsewhere.
//!
//! V1 NARROWS THE ADR'S PER-OPERATION MATRIX TO THE EVIDENCED NEED (ASA-003):
//! only kinds with a DETERMINISTIC inverse from already-retained material are
//! invertible. A body or frontmatter edit rolls back by restoring the stored
//! whole-document PREIMAGE against the CURRENT base, materialized as a
//! whole-document `ReplaceBody`. A `Rename` (W02.P04) rolls back by a
//! RENAME-BACK — a genuine `Rename` inverse to the ORIGINAL stem the source was
//! proposed FROM, never a preimage-restore (a `ReplaceBody`-of-preimage rollback
//! of a rename would write the old content to the OLD path while the document
//! still lives at the NEW one, producing a duplicate — the inverse of an
//! identity move is another identity move, never a body write). Every other
//! applied operation kind (create, link, archive/unarchive, section edit) — and
//! any case whose required preimage was never captured or was compacted — is
//! `rollback_available=false` with an honest reason (from
//! [`super::transitions::create_rollback_eligibility`]) plus a
//! [`ManualRepairProposal`] hook: the backend offers a manual repair, never a
//! guessed inverse.
//!
//! GENERATION ONLY. This module GENERATES the rollback proposal (the inverse child
//! materialized from the source preimage) and appends the `RollbackProposed`
//! aggregate. It does NOT apply it — that rides review + approval + the shared
//! apply command, so an agent still cannot self-approve or self-apply its own
//! rollback (the same guardrails apply through the normal path).
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, DraftMutation,
    TargetRevisionFence,
};
use super::documents::{DocumentResolver, ExistingDocumentLookup};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorRef, ChangesetId, ChangesetKind, ChangesetStatus, CommandKind,
    DocumentRef, IdempotencyKey, RevisionToken,
};
use super::operations::MaterializedProposalOperation;
use super::sections::SectionSelector;
use super::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use super::store::unit_of_work::{Repository, UnitOfWork};
use super::store::{Result as StoreResult, Store, StoreError};
use super::transitions::{RollbackChildEligibility, create_rollback_eligibility};

/// A named source child to roll back. V1 names exactly one; the operation kind is
/// resolved from the applied source record, not supplied by the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollbackSourceChild {
    pub child_key: String,
}

/// A request to generate a rollback of an applied source changeset.
#[derive(Debug, Clone)]
pub struct RollbackRequest<'a> {
    pub source_changeset_id: &'a ChangesetId,
    pub source_children: Vec<RollbackSourceChild>,
    pub reason: String,
    pub actor: &'a ActorRef,
    pub idempotency_key: &'a IdempotencyKey,
    pub now_ms: i64,
}

/// The manual-repair hook returned when an automatic inverse is unavailable or
/// unsafe: the backend surfaces this so a human can author a manual repair
/// proposal, rather than the generator guessing an inverse (rollback-history ADR).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManualRepairProposal {
    pub source_changeset_id: ChangesetId,
    pub source_children: Vec<String>,
    pub reason: String,
}

/// The outcome of a rollback generation. A generated or replayed rollback carries
/// the new `Rollback` changeset ids; an unavailable rollback carries the denied
/// eligibility (with its honest reason) and a manual-repair hook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollbackOutcome {
    pub eligibility: ActionEligibility,
    pub changeset_id: Option<ChangesetId>,
    pub changeset_revision: Option<RevisionToken>,
    /// True when this call replayed an already-generated rollback (idempotency).
    pub replayed: bool,
    pub manual_repair: Option<ManualRepairProposal>,
}

impl RollbackOutcome {
    fn generated(record: &ChangesetAggregateRecord) -> Self {
        Self {
            eligibility: ActionEligibility::allowed(CommandKind::CreateRollback),
            changeset_id: Some(record.changeset_id.clone()),
            changeset_revision: Some(record.changeset_revision.clone()),
            replayed: false,
            manual_repair: None,
        }
    }

    fn replayed(record: &ChangesetAggregateRecord) -> Self {
        Self {
            eligibility: ActionEligibility::allowed(CommandKind::CreateRollback),
            changeset_id: Some(record.changeset_id.clone()),
            changeset_revision: Some(record.changeset_revision.clone()),
            replayed: true,
            manual_repair: None,
        }
    }

    fn unavailable(
        eligibility: ActionEligibility,
        manual_repair: Option<ManualRepairProposal>,
    ) -> Self {
        Self {
            eligibility,
            changeset_id: None,
            changeset_revision: None,
            replayed: false,
            manual_repair,
        }
    }
}

/// Generate a rollback proposal for an applied source changeset. On success it
/// appends a `RollbackProposed` `Rollback` changeset whose single child restores
/// the source preimage against the current base; on ineligibility it returns the
/// denied eligibility plus a manual-repair hook. Idempotent: a repeated request
/// with the same idempotency key replays the already-generated rollback.
pub fn generate_rollback(
    store: &mut Store,
    reader: &SnapshotReader,
    request: RollbackRequest<'_>,
) -> StoreResult<RollbackOutcome> {
    store.with_unit_of_work(CommandKind::CreateRollback, |uow| {
        let Some(source) = uow.ledger().latest(request.source_changeset_id)? else {
            return Ok(RollbackOutcome::unavailable(
                ActionEligibility::denied(
                    CommandKind::CreateRollback,
                    "rollback source changeset does not exist",
                ),
                None,
            ));
        };

        // Resolve each named source child + its preimage availability, keeping the
        // operation kind AUTHORITATIVE from the applied record (never the caller).
        let mut eligibility_children = Vec::with_capacity(request.source_children.len());
        let mut resolved = Vec::with_capacity(request.source_children.len());
        for named in &request.source_children {
            let Some(child) = source
                .children
                .iter()
                .find(|child| child.child_key == named.child_key)
            else {
                return Ok(RollbackOutcome::unavailable(
                    ActionEligibility::denied(
                        CommandKind::CreateRollback,
                        format!(
                            "rollback source child `{}` does not exist on the applied changeset",
                            named.child_key
                        ),
                    ),
                    Some(manual_repair(&request)),
                ));
            };
            let preimage = source_preimage(uow, request.source_changeset_id, &child.child_key)?;
            eligibility_children.push(RollbackChildEligibility::new(
                child.child_key.clone(),
                child.operation,
                super::rollback_inverses::preimage_available(child, preimage.is_some()),
            ));
            resolved.push((child.clone(), preimage));
        }

        // The V1 gate: source applied, exactly one child, an invertible op, and a
        // present preimage — the ONE shared eligibility fn (also backs the P18
        // projection), never re-derived here.
        let eligibility = create_rollback_eligibility(&source, &eligibility_children);
        if !eligibility.allowed {
            return Ok(RollbackOutcome::unavailable(
                eligibility,
                Some(manual_repair(&request)),
            ));
        }

        // Idempotency: the rollback id is DETERMINISTIC in (source, idempotency
        // key), so a repeated request finds the already-generated rollback and
        // replays it rather than appending a second one.
        let rollback_id = super::rollback_inverses::rollback_changeset_id(
            request.source_changeset_id,
            request.idempotency_key,
        );
        if let Some(existing) = uow.ledger().latest(&rollback_id)? {
            return Ok(RollbackOutcome::replayed(&existing));
        }

        // Eligibility guaranteed exactly one child with a present preimage.
        let (source_child, source_preimage) = resolved
            .into_iter()
            .next()
            .expect("eligibility guarantees exactly one source child");
        // COUPLING (W04.P09.S33): this unwrap is safe only because
        // `preimage_available` still gates EVERY invertible kind — including
        // `SetPlanStepState` — on a present source preimage. A plan-tick inverse
        // does not actually consume it (it is a state flip, not a restore), so a
        // future edit that EXEMPTS `SetPlanStepState` from `preimage_available`
        // (in `rollback_inverses`) MUST also make this unwrap conditional, or a
        // preimage-less plan-tick rollback panics here.
        let source_preimage =
            source_preimage.expect("eligibility guarantees the source preimage is present");

        let source_document = source_child.target.document.clone();
        let DocumentRef::Existing {
            node_id: source_node_id,
            stem: original_stem,
            ..
        } = &source_document
        else {
            return Ok(RollbackOutcome::unavailable(
                ActionEligibility::denied(
                    CommandKind::CreateRollback,
                    "rollback_unavailable: source target is not an existing document",
                ),
                Some(manual_repair(&request)),
            ));
        };
        let resolver = DocumentResolver::for_worktree(reader.root());
        let child_key = source_child.child_key.clone();

        // Resolve the document's CURRENT identity to fence + preimage-anchor
        // against. NODE ID IS STEM-DERIVED (`doc:<stem>`), so it is stable
        // ONLY for a source that never changed identity (body/frontmatter): a
        // Rename source's OLD node id no longer resolves post-apply (the file
        // moved) — that failure is exactly `AnchorDrift`'s signal elsewhere,
        // never a valid "current identity" here. A Rename source is instead
        // resolved by the NEW STEM its own materialized operation recorded
        // (`rename_edit`) — the forward apply's authoritative record of where
        // it moved the document TO.
        let current_ref = match source_child.operation {
            ChangesetOperationKind::Rename => {
                let Some(new_stem) = source_child
                    .materialized_operation
                    .as_ref()
                    .and_then(|operation| operation.rename_edit.clone())
                else {
                    return Ok(RollbackOutcome::unavailable(
                        ActionEligibility::denied(
                            CommandKind::CreateRollback,
                            "rollback_unavailable: rename source carries no recorded target stem",
                        ),
                        Some(manual_repair(&request)),
                    ));
                };
                // LINEAGE GUARD: node ids are STEM-DERIVED, so resolving the
                // current occupant of `new_stem` alone cannot distinguish
                // "this rename's own target" from "whatever unrelated document
                // now occupies that stem" — a stem can be vacated by a LATER
                // rename and then reoccupied. Refuse, fail-closed, if the
                // ledger shows the stem was renamed AWAY from after this
                // source applied (or if the scan cannot even PROVE it wasn't):
                // that proves the current occupant (if any) is NOT provably
                // the document this rollback should touch.
                match stem_lineage_check(
                    uow,
                    &new_stem,
                    source.created_at_ms,
                    MAX_ROLLBACK_LINEAGE_SCAN,
                )? {
                    StemLineageCheck::Clear => {}
                    StemLineageCheck::Broken(breaking_changeset) => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                format!(
                                    "rollback_unavailable: the stem `{new_stem}` this rename \
                                     targeted has since been renamed away (by changeset \
                                     `{breaking_changeset}`); the current occupant cannot be \
                                     confirmed as this rollback's document"
                                ),
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                    StemLineageCheck::Unconfirmable => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                format!(
                                    "rollback_unavailable: cannot confirm the stem `{new_stem}` \
                                     lineage is unbroken (too many changesets applied since this \
                                     rename to scan); the current occupant cannot be confirmed \
                                     as this rollback's document"
                                ),
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                }
                match resolver.resolve_existing(ExistingDocumentLookup::Stem(new_stem.clone())) {
                    Ok(current_ref) => current_ref,
                    Err(err) => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                format!(
                                    "rollback_unavailable: renamed target `{new_stem}` no \
                                     longer resolves ({err})"
                                ),
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                }
            }
            _ => {
                match resolver
                    .resolve_existing(ExistingDocumentLookup::NodeId(source_node_id.clone()))
                {
                    Ok(current_ref) => current_ref,
                    Err(err) => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                format!(
                                    "rollback_unavailable: source identity no longer resolves \
                                     ({err})"
                                ),
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                }
            }
        };
        let base_snapshot = reader
            .require_current_base(&current_ref)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let target = TargetRevisionFence {
            document: current_ref.clone(),
            base_revision: Some(base_snapshot.revision.clone()),
            current_revision: Some(base_snapshot.revision.clone()),
        };
        let inverse_preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: super::rollback_inverses::rollback_preimage_id(
                    &rollback_id,
                    &child_key,
                ),
                changeset_id: rollback_id.as_str().to_string(),
                operation_id: child_key.clone(),
                document: current_ref.clone(),
                captured_at_ms: request.now_ms,
            })
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;

        let (operation, materialized) = match source_child.operation {
            ChangesetOperationKind::Rename => {
                // RENAME-BACK: the forward rename already moved the document
                // to `current_ref` (the NEW stem), so the inverse is a Rename
                // back to the ORIGINAL stem the source was proposed FROM —
                // never a preimage-restore ReplaceBody, which would write the
                // old content to the OLD path while the document still lives
                // at the NEW one, producing a duplicate.
                let draft = ChangesetChildOperationDraft {
                    child_key: child_key.clone(),
                    operation: ChangesetOperationKind::Rename,
                    target: target.clone(),
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: String::new(),
                        frontmatter: None,
                        new_stem: Some(original_stem.clone()),
                        section_selector: None,
                        plan_step: None,
                    },
                };
                let materialized = MaterializedProposalOperation::materialize_rename(
                    &rollback_id,
                    draft,
                    &base_snapshot,
                    &inverse_preimage,
                )
                .map_err(|err| StoreError::Validation(err.to_string()))?;
                (ChangesetOperationKind::Rename, materialized)
            }
            ChangesetOperationKind::SectionEdit => {
                // SELECTED-preimage restore (section-scoped-operations ADR):
                // re-resolve the SAME heading-path anchor against the CURRENT
                // base, expecting to find exactly the NEW content this
                // source's forward apply spliced in, then splice the
                // captured SELECTED preimage back into the resolved range —
                // never a whole-document preimage restore, which would
                // clobber any unrelated section edited since.
                let Some(section_edit) = source_child
                    .materialized_operation
                    .as_ref()
                    .and_then(|operation| operation.section_edit.clone())
                else {
                    return Ok(RollbackOutcome::unavailable(
                        ActionEligibility::denied(
                            CommandKind::CreateRollback,
                            "rollback_unavailable: section edit source carries no recorded \
                             selector or selected preimage",
                        ),
                        Some(manual_repair(&request)),
                    ));
                };
                let rollback_selector = SectionSelector {
                    heading_path: section_edit.selector.heading_path.clone(),
                    range_hint: section_edit.selector.range_hint,
                    expected_content_hash: blob_oid(section_edit.new_content.as_bytes()),
                };
                let draft = ChangesetChildOperationDraft {
                    child_key: child_key.clone(),
                    operation: ChangesetOperationKind::SectionEdit,
                    target: target.clone(),
                    draft: DraftMutation {
                        mode: DraftMode::SectionScoped,
                        body: section_edit.selected_preimage.clone(),
                        frontmatter: None,
                        new_stem: None,
                        section_selector: Some(rollback_selector),
                        plan_step: None,
                    },
                };
                let materialized = match MaterializedProposalOperation::materialize_section_edit(
                    &rollback_id,
                    draft,
                    &base_snapshot,
                    &inverse_preimage,
                ) {
                    Ok(materialized) => materialized,
                    Err(err) => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                format!(
                                    "rollback_unavailable: the section this rollback targets \
                                     no longer resolves ({err})"
                                ),
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                };
                (ChangesetOperationKind::SectionEdit, materialized)
            }
            ChangesetOperationKind::SetPlanStepState => {
                // OPPOSITE-STATE inverse (authoring-surface ADR D1), built in
                // `rollback_inverses`: the inverse of a plan tick is the opposite
                // set-plan-step-state against the same step, NEVER a
                // whole-document preimage restore (that clobber stays impossible).
                match super::rollback_inverses::plan_step_inverse(
                    &source_child,
                    &child_key,
                    &target,
                    &base_snapshot,
                    &inverse_preimage,
                    &rollback_id,
                )? {
                    Some(built) => built,
                    None => {
                        return Ok(RollbackOutcome::unavailable(
                            ActionEligibility::denied(
                                CommandKind::CreateRollback,
                                super::rollback_inverses::PLAN_STEP_NO_EDIT_REASON,
                            ),
                            Some(manual_repair(&request)),
                        ));
                    }
                }
            }
            _ => {
                // Preimage-restore: body/frontmatter edits invert by restoring
                // the stored whole-document preimage against the current base
                // (the document may have advanced since the source applied;
                // the apply-time fence re-checks it).
                let draft = ChangesetChildOperationDraft {
                    child_key: child_key.clone(),
                    operation: ChangesetOperationKind::ReplaceBody,
                    target: target.clone(),
                    draft: DraftMutation {
                        mode: DraftMode::WholeDocument,
                        body: source_preimage.payload_text.clone(),
                        frontmatter: None,
                        new_stem: None,
                        section_selector: None,
                        plan_step: None,
                    },
                };
                let materialized = MaterializedProposalOperation::materialize_replace_body(
                    &rollback_id,
                    draft,
                    &base_snapshot,
                    &inverse_preimage,
                )
                .map_err(|err| StoreError::Validation(err.to_string()))?;
                (ChangesetOperationKind::ReplaceBody, materialized)
            }
        };
        uow.snapshots().store_preimage(&inverse_preimage)?;

        let child_input = ChangesetChildOperationInput {
            child_key,
            operation,
            target,
            materialized_operation: Some(materialized),
            material_digest: None,
            validation_digest: None,
        };
        let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: rollback_id.clone(),
            previous_revision: None,
            kind: ChangesetKind::Rollback,
            status: ChangesetStatus::RollbackProposed,
            session_id: None,
            actor: request.actor.clone(),
            summary: request.reason.clone(),
            children: vec![child_input],
            created_at_ms: request.now_ms,
        })
        .map_err(|err| StoreError::Ledger(err.to_string()))?;
        uow.ledger().append_revision(&record)?;

        Ok(RollbackOutcome::generated(&record))
    })
}

/// The bounded corpus of candidate changesets a rollback stem-lineage check
/// scans (resource-bounds: mirrors `conflicts::MAX_CONFLICT_SIBLINGS`).
const MAX_ROLLBACK_LINEAGE_SCAN: u32 = 256;

/// The result of a [`stem_lineage_check`] scan.
#[derive(Debug, Clone, PartialEq, Eq)]
enum StemLineageCheck {
    /// No later rename moved a document away from the stem, AND the scan
    /// window reached back far enough (past `since_ms`) to be CERTAIN of
    /// that — a bounded scan alone cannot claim "clear" honestly otherwise.
    Clear,
    /// A specific later-applied Rename moved a document away from the stem.
    Broken(ChangesetId),
    /// The scan window was exhausted (hit its cap) before reaching back to
    /// `since_ms` — there may be MORE changesets, also newer than `since_ms`,
    /// that fell outside the cap and were never inspected. Absence of a break
    /// cannot be proven, so this refuses exactly like `Broken`: it is NEVER
    /// treated as `Clear`.
    Unconfirmable,
}

/// Whether `stem` has been renamed AWAY from by a Rename that applied AFTER
/// `since_ms` — a stem-lineage break. Node ids are stem-derived (`doc:<stem>`),
/// so a stem can be VACATED by one rename and later REOCCUPIED by an entirely
/// unrelated document; resolving "the current occupant of `stem`" alone can
/// never distinguish the two. A later-applied Rename whose OWN target (the
/// stem it moved FROM) equals `stem` proves the document this rollback's
/// forward rename placed there has since moved on, so the current occupant
/// (if any) cannot be confirmed as this rollback's document.
///
/// Bounded (`cap`, mirroring every other bounded conflict scan in this
/// codebase) but FAIL-CLOSED about its own boundedness: `latest_changesets`
/// returns each changeset's LATEST revision ordered by insertion sequence,
/// most-recent-first, so if the window fills up (`cap` candidates returned)
/// and even the OLDEST of them is still newer than `since_ms`, there may be
/// MORE later-applied changesets beyond the cap that were never inspected —
/// absence of a break cannot be claimed. That case returns `Unconfirmable`,
/// never a silent `Clear` (a missed break masquerading as safety would defeat
/// the whole guard).
fn stem_lineage_check(
    uow: &UnitOfWork<'_>,
    stem: &str,
    since_ms: i64,
    cap: u32,
) -> StoreResult<StemLineageCheck> {
    let candidates = uow.ledger().latest_changesets(cap)?;
    for candidate in &candidates {
        if candidate.status != ChangesetStatus::Applied || candidate.created_at_ms <= since_ms {
            continue;
        }
        for child in &candidate.children {
            if child.operation != ChangesetOperationKind::Rename {
                continue;
            }
            let DocumentRef::Existing {
                stem: from_stem, ..
            } = &child.target.document
            else {
                continue;
            };
            if from_stem == stem {
                return Ok(StemLineageCheck::Broken(candidate.changeset_id.clone()));
            }
        }
    }
    if candidates.len() as u32 == cap
        && candidates
            .last()
            .is_some_and(|oldest| oldest.created_at_ms > since_ms)
    {
        return Ok(StemLineageCheck::Unconfirmable);
    }
    Ok(StemLineageCheck::Clear)
}

fn manual_repair(request: &RollbackRequest<'_>) -> ManualRepairProposal {
    ManualRepairProposal {
        source_changeset_id: request.source_changeset_id.clone(),
        source_children: request
            .source_children
            .iter()
            .map(|child| child.child_key.clone())
            .collect(),
        reason: request.reason.clone(),
    }
}

/// The source changeset's stored preimage for a child (operation id == child key),
/// loaded through the owning snapshot repository (which validates it). `None` when
/// no preimage was retained (never captured, or compacted).
fn source_preimage(
    uow: &UnitOfWork<'_>,
    source_changeset_id: &ChangesetId,
    child_key: &str,
) -> StoreResult<Option<PreimageRecord>> {
    let preimage_id = uow
        .repository("authoring_document_preimages")
        .query_optional(
            "SELECT preimage_id
         FROM authoring_document_preimages
         WHERE changeset_id = ?1
           AND operation_id = ?2
         LIMIT 1",
            rusqlite::params![source_changeset_id.as_str(), child_key],
            |row| row.get::<_, String>(0),
        )?;
    match preimage_id {
        Some(preimage_id) => uow.snapshots().preimage(&preimage_id),
        None => Ok(None),
    }
}

#[cfg(test)]
pub(crate) mod tests;
