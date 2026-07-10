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
                preimage.is_some(),
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
        let rollback_id =
            rollback_changeset_id(request.source_changeset_id, request.idempotency_key);
        if let Some(existing) = uow.ledger().latest(&rollback_id)? {
            return Ok(RollbackOutcome::replayed(&existing));
        }

        // Eligibility guaranteed exactly one child with a present preimage.
        let (source_child, source_preimage) = resolved
            .into_iter()
            .next()
            .expect("eligibility guarantees exactly one source child");
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
                preimage_id: rollback_preimage_id(&rollback_id, &child_key),
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

/// The deterministic rollback changeset id for a (source, idempotency key) pair —
/// the idempotency identity, so a repeated request replays instead of duplicating.
///
/// The inputs are HASHED (not embedded) — mirroring `apply::receipt_id_for`: a
/// long-but-legal idempotency key would overflow the `ChangesetId` byte cap and
/// fail a legitimate request on SHAPE alone, and a client-chosen opaque key would
/// otherwise leak into every projection / event / audit surface as a public entity
/// id. `blob_oid` is 40-hex — always a valid, bounded authoring token — so the id
/// is infallible; determinism and replay are unchanged (same inputs → same id).
fn rollback_changeset_id(source: &ChangesetId, idempotency_key: &IdempotencyKey) -> ChangesetId {
    let digest = blob_oid(format!("{source}|{idempotency_key}").as_bytes());
    ChangesetId::new(format!("rollback:{digest}"))
        .expect("rollback changeset id is a valid authoring token")
}

fn rollback_preimage_id(rollback_id: &ChangesetId, child_key: &str) -> String {
    format!("preimage:{}:{}", rollback_id.as_str(), child_key)
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
mod tests {
    use std::path::Path;

    use ingest_struct::reader::read_from_worktree;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::{ActorId, ActorKind, ProvisionalCollisionStatus, SessionId};
    use crate::authoring::snapshots::PreimageCaptureRequest;
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn idem(value: &str) -> IdempotencyKey {
        IdempotencyKey::new(value).unwrap()
    }

    /// Write `.vault/plan/<stem>.md` and return its current worktree revision.
    fn write_doc(root: &Path, stem: &str, body: &str) -> RevisionToken {
        let rel = format!(".vault/plan/{stem}.md");
        let path = root.join(&rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        let body = read_from_worktree(root, &rel).unwrap();
        RevisionToken::new(format!("blob:{}", body.blob_hash)).unwrap()
    }

    fn existing_doc(stem: &str, base: &RevisionToken) -> DocumentRef {
        DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: format!("doc:{stem}"),
            stem: stem.to_string(),
            path: format!(".vault/plan/{stem}.md"),
            doc_type: "plan".to_string(),
            base_revision: base.clone(),
        }
    }

    fn provisional_doc(stem: &str) -> DocumentRef {
        DocumentRef::ProvisionalCreate {
            provisional_doc_id: format!("provisional:{stem}"),
            doc_type: "plan".to_string(),
            feature: super::super::FEATURE_TAG.to_string(),
            title: format!("Create {stem}"),
            collision_status: ProvisionalCollisionStatus::Available,
            proposed_stem: Some(stem.to_string()),
        }
    }

    fn child_input(
        child_key: &str,
        operation: ChangesetOperationKind,
        document: DocumentRef,
    ) -> ChangesetChildOperationInput {
        let base = match &document {
            DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
            _ => None,
        };
        ChangesetChildOperationInput {
            child_key: child_key.to_string(),
            operation,
            target: TargetRevisionFence {
                document,
                base_revision: base.clone(),
                current_revision: base,
            },
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    fn record(
        changeset_id: &ChangesetId,
        previous: Option<RevisionToken>,
        status: ChangesetStatus,
        actor: &ActorRef,
        child: ChangesetChildOperationInput,
        created_at_ms: i64,
    ) -> ChangesetAggregateRecord {
        ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: changeset_id.clone(),
            previous_revision: previous,
            kind: ChangesetKind::Authoring,
            status,
            session_id: Some(SessionId::new("session_1").unwrap()),
            actor: actor.clone(),
            summary: "source proposal".to_string(),
            children: vec![child],
            created_at_ms,
        })
        .unwrap()
    }

    fn temp_store(root: &Path) -> Store {
        let mut store = Store::open(&root.join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:reviewer", ActorKind::Human),
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
        store
    }

    /// Walk a single-child changeset from Draft to Applied under the canonical
    /// lifecycle (author proposes; reviewer approves + applies), optionally storing
    /// a source preimage for the child so rollback can restore it.
    fn seed_applied_source(
        store: &mut Store,
        changeset_id: &ChangesetId,
        author: &ActorRef,
        reviewer: &ActorRef,
        child: impl Fn() -> ChangesetChildOperationInput,
        source_preimage: Option<PreimageRecord>,
    ) {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                if let Some(preimage) = &source_preimage {
                    uow.snapshots().store_preimage(preimage)?;
                }
                let mut previous: Option<RevisionToken> = None;
                for (status, at) in [
                    (ChangesetStatus::Draft, 10),
                    (ChangesetStatus::NeedsReview, 20),
                    (ChangesetStatus::Approved, 30),
                    (ChangesetStatus::Applying, 40),
                    (ChangesetStatus::Applied, 50),
                ] {
                    let actor = if matches!(
                        status,
                        ChangesetStatus::Approved
                            | ChangesetStatus::Applying
                            | ChangesetStatus::Applied
                    ) {
                        reviewer
                    } else {
                        author
                    };
                    let revision =
                        record(changeset_id, previous.clone(), status, actor, child(), at);
                    uow.ledger().append_revision(&revision)?;
                    previous = Some(revision.changeset_revision.clone());
                }
                Ok(())
            })
            .unwrap();
    }

    /// The `seed_applied_source` sibling with a caller-chosen time BASE
    /// (W02.P04-R1): needed to seed MULTIPLE sequential changesets with
    /// strictly increasing `created_at_ms` (the stem-lineage guard orders on
    /// it), which the hardcoded-timestamp `seed_applied_source` cannot do.
    fn seed_applied_source_at(
        store: &mut Store,
        changeset_id: &ChangesetId,
        author: &ActorRef,
        reviewer: &ActorRef,
        child: impl Fn() -> ChangesetChildOperationInput,
        source_preimage: Option<PreimageRecord>,
        base_ms: i64,
    ) {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                if let Some(preimage) = &source_preimage {
                    uow.snapshots().store_preimage(preimage)?;
                }
                let mut previous: Option<RevisionToken> = None;
                for (status, offset) in [
                    (ChangesetStatus::Draft, 0),
                    (ChangesetStatus::NeedsReview, 1),
                    (ChangesetStatus::Approved, 2),
                    (ChangesetStatus::Applying, 3),
                    (ChangesetStatus::Applied, 4),
                ] {
                    let actor = if matches!(
                        status,
                        ChangesetStatus::Approved
                            | ChangesetStatus::Applying
                            | ChangesetStatus::Applied
                    ) {
                        reviewer
                    } else {
                        author
                    };
                    let revision = record(
                        changeset_id,
                        previous.clone(),
                        status,
                        actor,
                        child(),
                        base_ms + offset,
                    );
                    uow.ledger().append_revision(&revision)?;
                    previous = Some(revision.changeset_revision.clone());
                }
                Ok(())
            })
            .unwrap();
    }

    /// Capture (but do not store) a source preimage for `stem` at its current
    /// worktree content — the pre-forward-edit state the rollback restores TO.
    fn source_preimage_record(
        root: &Path,
        changeset_id: &ChangesetId,
        child_key: &str,
        document: DocumentRef,
    ) -> PreimageRecord {
        SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: format!("preimage:source:{}:{}", changeset_id.as_str(), child_key),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: child_key.to_string(),
                document,
                captured_at_ms: 5,
            })
            .unwrap()
    }

    fn generate(
        store: &mut Store,
        root: &Path,
        source: &ChangesetId,
        children: &[&str],
        key: &str,
    ) -> RollbackOutcome {
        let reader = SnapshotReader::for_worktree(root);
        generate_rollback(
            store,
            &reader,
            RollbackRequest {
                source_changeset_id: source,
                source_children: children
                    .iter()
                    .map(|child_key| RollbackSourceChild {
                        child_key: child_key.to_string(),
                    })
                    .collect(),
                reason: "restore reviewed preimage".to_string(),
                actor: &actor("human:reviewer", ActorKind::Human),
                idempotency_key: &idem(key),
                now_ms: 100,
            },
        )
        .unwrap()
    }

    #[test]
    fn body_edit_rolls_back_by_restoring_the_source_preimage() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // The document existed as "before" when proposed (the source preimage), was
        // applied to "after", and now the rollback must restore "before".
        let before_rev = write_doc(root, "rollback-a", "before\n");
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("rollback-a", &before_rev);
        let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
        let child = {
            let doc = doc.clone();
            move || child_input("child_1", ChangesetOperationKind::ReplaceBody, doc.clone())
        };
        seed_applied_source(
            &mut store,
            &source,
            &author,
            &reviewer,
            child,
            Some(preimage),
        );
        // The forward edit landed: the worktree now reads "after".
        write_doc(root, "rollback-a", "after\n");

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(
            outcome.eligibility.allowed,
            "reason: {:?}",
            outcome.eligibility.reason
        );
        assert!(!outcome.replayed);
        assert!(outcome.manual_repair.is_none());
        let rollback_id = outcome.changeset_id.expect("rollback changeset generated");

        // The generated rollback is a new Rollback changeset in RollbackProposed,
        // whose child restores the "before" preimage against the current base.
        let rollback = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&rollback_id)?.unwrap())
            })
            .unwrap();
        assert_eq!(rollback.kind, ChangesetKind::Rollback);
        assert_eq!(rollback.status, ChangesetStatus::RollbackProposed);
        assert_eq!(rollback.operation_count, 1);
        let materialized = rollback.children[0]
            .materialized_operation
            .as_ref()
            .expect("rollback child is materialized");
        assert_eq!(materialized.target_snapshot.payload_text, "before\n");
        assert_eq!(
            materialized.operation,
            ChangesetOperationKind::ReplaceBody,
            "the whole-document preimage restore is a body replace"
        );
    }

    #[test]
    fn generated_rollback_is_reviewable_not_auto_applied() {
        // The approval gate: generation produces a RollbackProposed changeset that
        // must go through review + approval + the shared apply path — it is NEVER
        // applied by the generator (agents cannot self-approve/apply their rollback).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let before_rev = write_doc(root, "rollback-a", "before\n");
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("rollback-a", &before_rev);
        let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
        let child = {
            let doc = doc.clone();
            move || child_input("child_1", ChangesetOperationKind::ReplaceBody, doc.clone())
        };
        seed_applied_source(
            &mut store,
            &source,
            &author,
            &reviewer,
            child,
            Some(preimage),
        );
        write_doc(root, "rollback-a", "after\n");

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");
        let rollback_id = outcome.changeset_id.unwrap();

        let rollback = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&rollback_id)?.unwrap())
            })
            .unwrap();
        assert_eq!(
            rollback.status,
            ChangesetStatus::RollbackProposed,
            "a generated rollback is proposed for review, not applied"
        );
        assert_ne!(rollback.status, ChangesetStatus::Applied);

        // The SOURCE is untouched — rollback never rewrites it.
        let source_after = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&source)?.unwrap())
            })
            .unwrap();
        assert_eq!(source_after.status, ChangesetStatus::Applied);
    }

    #[test]
    fn repeated_request_replays_the_same_rollback() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let before_rev = write_doc(root, "rollback-a", "before\n");
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("rollback-a", &before_rev);
        let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
        let child = {
            let doc = doc.clone();
            move || child_input("child_1", ChangesetOperationKind::ReplaceBody, doc.clone())
        };
        seed_applied_source(
            &mut store,
            &source,
            &author,
            &reviewer,
            child,
            Some(preimage),
        );
        write_doc(root, "rollback-a", "after\n");

        let first = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");
        let second = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(!first.replayed);
        assert!(second.replayed, "the same idempotency key replays");
        assert_eq!(first.changeset_id, second.changeset_id);
        assert_eq!(first.changeset_revision, second.changeset_revision);

        // Exactly ONE rollback changeset exists.
        let rollback_id = first.changeset_id.unwrap();
        let count = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.repository("authoring_changeset_revisions").query_row(
                    "SELECT COUNT(DISTINCT changeset_id)
                     FROM authoring_changeset_revisions
                     WHERE changeset_id = ?1",
                    [rollback_id.as_str()],
                    |row| row.get::<_, i64>(0),
                )
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn missing_preimage_is_unavailable_with_manual_repair() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let before_rev = write_doc(root, "rollback-a", "before\n");
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("rollback-a", &before_rev);
        let child = {
            let doc = doc.clone();
            move || child_input("child_1", ChangesetOperationKind::ReplaceBody, doc.clone())
        };
        // NO source preimage stored → rollback is unavailable.
        seed_applied_source(&mut store, &source, &author, &reviewer, child, None);
        write_doc(root, "rollback-a", "after\n");

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(!outcome.eligibility.allowed);
        assert!(outcome.changeset_id.is_none());
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("preimage")),
            "the reason names the missing preimage: {:?}",
            outcome.eligibility.reason
        );
        let repair = outcome.manual_repair.expect("manual-repair hook offered");
        assert_eq!(repair.source_changeset_id, source);
        assert_eq!(repair.source_children, vec!["child_1".to_string()]);
    }

    #[test]
    fn create_document_source_has_no_v1_inverse_and_offers_manual_repair() {
        // A create (delete inverse) has no V1 preimage-restore inverse — unavailable
        // with an honest reason + manual-repair hook (the deferred extension path).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let child = move || {
            child_input(
                "child_1",
                ChangesetOperationKind::CreateDocument,
                provisional_doc("rollback-new"),
            )
        };
        seed_applied_source(&mut store, &source, &author, &reviewer, child, None);

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(!outcome.eligibility.allowed);
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(
                    |reason| reason.contains("rollback_unavailable") && reason.contains("inverse")
                ),
            "the reason names the unimplemented create inverse: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.manual_repair.is_some());
    }

    #[test]
    fn rename_source_without_a_preimage_is_unavailable_with_manual_repair() {
        // W02.P04: Rename now HAS a V1 inverse (rename-back), so eligibility no
        // longer denies it as unsupported — but a preimage is still required
        // uniformly (the SAME gate every invertible kind shares), and this
        // source never captured one.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let base = RevisionToken::new("blob:aaa111").unwrap();
        let child = {
            let doc = existing_doc("rollback-a", &base);
            move || child_input("child_1", ChangesetOperationKind::Rename, doc.clone())
        };
        seed_applied_source(&mut store, &source, &author, &reviewer, child, None);

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(!outcome.eligibility.allowed);
        assert!(
            outcome.eligibility.reason.as_deref().is_some_and(|reason| {
                reason.contains("rollback_unavailable") && reason.contains("preimage")
            }),
            "the reason names the missing preimage, not an unsupported inverse: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.manual_repair.is_some());
    }

    #[test]
    fn rename_rolls_back_by_renaming_back_to_the_original_stem() {
        // W02.P04.S25: a Rename source is invertible by a genuine RENAME-BACK,
        // never a preimage-restore ReplaceBody (which would duplicate content
        // at the stale old path while the document still lives at the new one).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let source = ChangesetId::new("changeset_rename_1").unwrap();

        // Materialize the FORWARD rename's own record while the document still
        // lives at the OLD stem (mirroring what the real apply path records:
        // `target.document` is the pre-rename identity, `rename_edit` is the
        // proposed new stem).
        write_doc(root, "rollback-old-name", "before rename\n");
        let old_doc = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(
                "rollback-old-name".to_string(),
            ))
            .unwrap();
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&old_doc)
            .unwrap();
        let preimage = source_preimage_record(root, &source, "child_1", old_doc.clone());
        let forward_draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: old_doc.clone(),
                base_revision: Some(base_snapshot.revision.clone()),
                current_revision: Some(base_snapshot.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some("rollback-new-name".to_string()),
            },
        };
        let forward_materialized = MaterializedProposalOperation::materialize_rename(
            &source,
            forward_draft,
            &base_snapshot,
            &preimage,
        )
        .unwrap();
        let forward_child = ChangesetChildOperationInput::from_materialized(
            forward_materialized,
            "material:child_1".to_string(),
            "validation:child_1".to_string(),
        );

        // NOW simulate the forward rename having landed: the file moves from
        // the OLD path to the NEW one.
        std::fs::rename(
            root.join(".vault/plan/rollback-old-name.md"),
            root.join(".vault/plan/rollback-new-name.md"),
        )
        .unwrap();

        let mut store = temp_store(root);
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        seed_applied_source(
            &mut store,
            &source,
            &author,
            &reviewer,
            || forward_child.clone(),
            Some(preimage.clone()),
        );

        let outcome = generate(
            &mut store,
            root,
            &source,
            &["child_1"],
            "idem:rollback:rename:1",
        );

        assert!(
            outcome.eligibility.allowed,
            "reason: {:?}",
            outcome.eligibility.reason
        );
        assert!(!outcome.replayed);
        assert!(outcome.manual_repair.is_none());
        let rollback_id = outcome.changeset_id.expect("rollback changeset generated");

        let rollback = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&rollback_id)?.unwrap())
            })
            .unwrap();
        assert_eq!(rollback.kind, ChangesetKind::Rollback);
        assert_eq!(rollback.status, ChangesetStatus::RollbackProposed);
        assert_eq!(rollback.operation_count, 1);
        assert_eq!(
            rollback.children[0].operation,
            ChangesetOperationKind::Rename
        );
        let materialized = rollback.children[0]
            .materialized_operation
            .as_ref()
            .expect("rollback child is materialized");
        assert_eq!(
            materialized.operation,
            ChangesetOperationKind::Rename,
            "a rename's inverse is a rename-back, never a body write"
        );
        assert_eq!(
            materialized.rename_edit.as_deref(),
            Some("rollback-old-name"),
            "the inverse targets the ORIGINAL stem the source was proposed from"
        );
        let DocumentRef::Existing { stem, .. } = &materialized.target.document else {
            panic!("rollback target must be an existing document");
        };
        assert_eq!(
            stem, "rollback-new-name",
            "the inverse's SOURCE is the document's CURRENT (post-forward-rename) identity"
        );
    }

    #[test]
    fn rename_rollback_refuses_when_the_stem_was_renamed_away_and_reused() {
        // W02.P04-R1 falsifier: node ids are STEM-DERIVED, so resolving "the
        // current occupant of a stem" cannot confirm it is THIS rollback's
        // document — the stem may have been vacated by a LATER rename and then
        // reoccupied by an UNRELATED document. Sequence: C1 renames A->B
        // (applied); C2 renames B->D (applied — the doc C1 placed at B moves
        // away); C3 renames a DIFFERENT document E->B (applied — B is legally
        // vacant, so this succeeds). Rolling back C1 must REFUSE, fail-closed,
        // never silently rename E's document (now at B) back to A.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let mut store = temp_store(root);

        // --- C1: rename A -> B ---
        write_doc(root, "rollback-lineage-a", "content of A\n");
        let doc_a = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(
                "rollback-lineage-a".to_string(),
            ))
            .unwrap();
        let c1 = ChangesetId::new("changeset_lineage_c1").unwrap();
        let base_a = SnapshotReader::for_worktree(root)
            .require_current_base(&doc_a)
            .unwrap();
        let preimage_a = source_preimage_record(root, &c1, "child_1", doc_a.clone());
        let draft_c1 = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: doc_a.clone(),
                base_revision: Some(base_a.revision.clone()),
                current_revision: Some(base_a.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some("rollback-lineage-b".to_string()),
            },
        };
        let materialized_c1 =
            MaterializedProposalOperation::materialize_rename(&c1, draft_c1, &base_a, &preimage_a)
                .unwrap();
        let child_c1 = ChangesetChildOperationInput::from_materialized(
            materialized_c1,
            "material:child_1".to_string(),
            "validation:child_1".to_string(),
        );
        std::fs::rename(
            root.join(".vault/plan/rollback-lineage-a.md"),
            root.join(".vault/plan/rollback-lineage-b.md"),
        )
        .unwrap();
        seed_applied_source_at(
            &mut store,
            &c1,
            &author,
            &reviewer,
            || child_c1.clone(),
            Some(preimage_a.clone()),
            100,
        );

        // --- C2: rename B -> D (the doc C1 placed at B moves AWAY) ---
        let doc_b = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(
                "rollback-lineage-b".to_string(),
            ))
            .unwrap();
        let c2 = ChangesetId::new("changeset_lineage_c2").unwrap();
        let base_b = SnapshotReader::for_worktree(root)
            .require_current_base(&doc_b)
            .unwrap();
        let preimage_b = source_preimage_record(root, &c2, "child_1", doc_b.clone());
        let draft_c2 = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: doc_b.clone(),
                base_revision: Some(base_b.revision.clone()),
                current_revision: Some(base_b.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some("rollback-lineage-d".to_string()),
            },
        };
        let materialized_c2 =
            MaterializedProposalOperation::materialize_rename(&c2, draft_c2, &base_b, &preimage_b)
                .unwrap();
        let child_c2 = ChangesetChildOperationInput::from_materialized(
            materialized_c2,
            "material:child_1".to_string(),
            "validation:child_1".to_string(),
        );
        std::fs::rename(
            root.join(".vault/plan/rollback-lineage-b.md"),
            root.join(".vault/plan/rollback-lineage-d.md"),
        )
        .unwrap();
        seed_applied_source_at(
            &mut store,
            &c2,
            &author,
            &reviewer,
            || child_c2.clone(),
            None,
            200,
        );

        // --- C3: rename a DIFFERENT document E -> B (B is legally vacant now) ---
        write_doc(root, "rollback-lineage-e", "content of E\n");
        let doc_e = DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(
                "rollback-lineage-e".to_string(),
            ))
            .unwrap();
        let c3 = ChangesetId::new("changeset_lineage_c3").unwrap();
        let base_e = SnapshotReader::for_worktree(root)
            .require_current_base(&doc_e)
            .unwrap();
        let preimage_e = source_preimage_record(root, &c3, "child_1", doc_e.clone());
        let draft_c3 = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: doc_e.clone(),
                base_revision: Some(base_e.revision.clone()),
                current_revision: Some(base_e.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some("rollback-lineage-b".to_string()),
            },
        };
        let materialized_c3 =
            MaterializedProposalOperation::materialize_rename(&c3, draft_c3, &base_e, &preimage_e)
                .unwrap();
        let child_c3 = ChangesetChildOperationInput::from_materialized(
            materialized_c3,
            "material:child_1".to_string(),
            "validation:child_1".to_string(),
        );
        std::fs::rename(
            root.join(".vault/plan/rollback-lineage-e.md"),
            root.join(".vault/plan/rollback-lineage-b.md"),
        )
        .unwrap();
        seed_applied_source_at(
            &mut store,
            &c3,
            &author,
            &reviewer,
            || child_c3.clone(),
            None,
            300,
        );

        // Stem B now holds E's document; stem A is vacant; stem D holds the
        // document C1 originally placed at A.
        let outcome = generate(
            &mut store,
            root,
            &c1,
            &["child_1"],
            "idem:rollback:lineage:1",
        );

        assert!(
            !outcome.eligibility.allowed,
            "a reused stem must refuse rollback, fail-closed"
        );
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("rollback_unavailable")
                    && reason.contains("renamed away")),
            "{:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.manual_repair.is_some());

        // E's document must be UNTOUCHED: still at stem B, never moved to A.
        assert!(
            !root.join(".vault/plan/rollback-lineage-a.md").exists(),
            "the refused rollback must not have created anything at the vacated stem"
        );
        let still_at_b =
            std::fs::read_to_string(root.join(".vault/plan/rollback-lineage-b.md")).unwrap();
        assert_eq!(
            still_at_b, "content of E\n",
            "E's document must not have been renamed by the refused rollback"
        );
    }

    #[test]
    fn stem_lineage_scan_refuses_when_the_window_is_exhausted_before_reaching_the_source() {
        // W02.P05 fold-in (the P04 review LOW): a truncated scan must never
        // silently report `Clear` — with a TINY cap, seeding more
        // later-applied, unrelated candidates than the cap fills the window
        // before it can reach back to `since_ms`, so absence of an away-move
        // cannot be proven.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut store = temp_store(root);
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let since_ms = 50;
        let cap = 2;

        // 3 unrelated Applied changesets, ALL newer than `since_ms`, none of
        // which touch the probed stem — with `cap = 2` the window fills
        // before reaching all 3.
        for i in 0..3 {
            let changeset_id = ChangesetId::new(format!("changeset_filler_{i}")).unwrap();
            let doc = existing_doc(
                &format!("filler-{i}"),
                &RevisionToken::new(format!("blob:filler{i}")).unwrap(),
            );
            let child = {
                let doc = doc.clone();
                move || {
                    child_input(
                        &format!("child_{i}"),
                        ChangesetOperationKind::ReplaceBody,
                        doc.clone(),
                    )
                }
            };
            seed_applied_source_at(
                &mut store,
                &changeset_id,
                &author,
                &reviewer,
                child,
                None,
                100 + i * 100,
            );
        }

        let result = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                stem_lineage_check(uow, "probe-stem", since_ms, cap)
            })
            .unwrap();
        assert_eq!(
            result,
            StemLineageCheck::Unconfirmable,
            "a truncated scan must refuse, never silently claim Clear"
        );

        // A cap generous enough to reach back past `since_ms` (here, more than
        // the 3 filler changesets) correctly reports Clear — the truncation
        // guard does not over-refuse once the window is genuinely sufficient.
        let clear_result = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                stem_lineage_check(uow, "probe-stem", since_ms, 256)
            })
            .unwrap();
        assert_eq!(clear_result, StemLineageCheck::Clear);
    }

    #[test]
    fn unapplied_source_cannot_be_rolled_back() {
        // A source that never applied has nothing to roll back.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let before_rev = write_doc(root, "rollback-a", "before\n");
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let doc = existing_doc("rollback-a", &before_rev);
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft = record(
                    &source,
                    None,
                    ChangesetStatus::Draft,
                    &author,
                    child_input("child_1", ChangesetOperationKind::ReplaceBody, doc.clone()),
                    10,
                );
                uow.ledger().append_revision(&draft)
            })
            .unwrap();

        let outcome = generate(&mut store, root, &source, &["child_1"], "idem:rollback:1");

        assert!(!outcome.eligibility.allowed);
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("not applied")),
            "the reason names the unapplied source: {:?}",
            outcome.eligibility.reason
        );
    }

    #[test]
    fn frontmatter_edit_rolls_back_by_restoring_the_source_preimage() {
        // W02.P03.S18: an EditFrontmatter source is invertible exactly like a body
        // edit — the eligibility matrix (transitions.rs) already admits it, and
        // generation restores the SAME preimage-payload-as-ReplaceBody inverse
        // regardless of the source operation kind.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let before_rev = write_doc(
            root,
            "rollback-fm",
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbefore\n",
        );
        let mut store = temp_store(root);
        let source = ChangesetId::new("changeset_fm_1").unwrap();
        let author = actor("agent:author", ActorKind::Agent);
        let reviewer = actor("human:reviewer", ActorKind::Human);
        let doc = existing_doc("rollback-fm", &before_rev);
        let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
        let child = {
            let doc = doc.clone();
            move || {
                child_input(
                    "child_1",
                    ChangesetOperationKind::EditFrontmatter,
                    doc.clone(),
                )
            }
        };
        seed_applied_source(
            &mut store,
            &source,
            &author,
            &reviewer,
            child,
            Some(preimage),
        );
        // The forward edit landed: the worktree now reads the rewritten frontmatter.
        write_doc(
            root,
            "rollback-fm",
            "---\ntags:\n  - '#plan'\ndate: '2026-02-06'\n---\n\nafter\n",
        );

        let outcome = generate(
            &mut store,
            root,
            &source,
            &["child_1"],
            "idem:rollback:fm:1",
        );

        assert!(
            outcome.eligibility.allowed,
            "reason: {:?}",
            outcome.eligibility.reason
        );
        assert!(!outcome.replayed);
        assert!(outcome.manual_repair.is_none());
        let rollback_id = outcome.changeset_id.expect("rollback changeset generated");

        let rollback = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow.ledger().latest(&rollback_id)?.unwrap())
            })
            .unwrap();
        assert_eq!(rollback.kind, ChangesetKind::Rollback);
        assert_eq!(rollback.status, ChangesetStatus::RollbackProposed);
        assert_eq!(rollback.operation_count, 1);
        let materialized = rollback.children[0]
            .materialized_operation
            .as_ref()
            .expect("rollback child is materialized");
        assert_eq!(
            materialized.target_snapshot.payload_text,
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbefore\n",
            "rollback restores the EXACT preimage, not a re-derived frontmatter merge"
        );
        assert_eq!(
            materialized.operation,
            ChangesetOperationKind::ReplaceBody,
            "the preimage-restore inverse is always a whole-document replace, \
             regardless of the source operation kind"
        );
    }
}
