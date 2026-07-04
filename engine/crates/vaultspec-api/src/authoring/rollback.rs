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
//! V1 IS PREIMAGE-RESTORE ONLY (ASA-003, narrowing the ADR's per-operation matrix
//! to the evidenced need): a body or frontmatter edit rolls back by restoring the
//! stored whole-document PREIMAGE against the CURRENT base — the one inverse
//! deterministic from already-retained material, materialized as a whole-document
//! `ReplaceBody`. Every other applied operation kind (create, rename, link,
//! archive/unarchive, section edit) — and any case whose required preimage was
//! never captured or was compacted — is `rollback_available=false` with an honest
//! reason (from [`super::transitions::create_rollback_eligibility`]) plus a
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

        // Materialize the inverse as a whole-document ReplaceBody: restore the
        // source preimage's payload against the CURRENT base (the document may have
        // advanced since the source applied; the apply-time fence re-checks it).
        let source_document = source_child.target.document.clone();
        let current = reader
            .capture_existing(&source_document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        let rollback_document = document_at_revision(&source_document, current.revision.clone());
        let base_snapshot = reader
            .require_current_base(&rollback_document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;

        let child_key = source_child.child_key.clone();
        let inverse_preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: rollback_preimage_id(&rollback_id, &child_key),
                changeset_id: rollback_id.as_str().to_string(),
                operation_id: child_key.clone(),
                document: rollback_document.clone(),
                captured_at_ms: request.now_ms,
            })
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;

        let draft = ChangesetChildOperationDraft {
            child_key: child_key.clone(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: rollback_document.clone(),
                base_revision: Some(current.revision.clone()),
                current_revision: Some(current.revision.clone()),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: source_preimage.payload_text.clone(),
            },
        };
        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &rollback_id,
            draft.clone(),
            &base_snapshot,
            &inverse_preimage,
        )
        .map_err(|err| StoreError::Validation(err.to_string()))?;
        uow.snapshots().store_preimage(&inverse_preimage)?;

        let child_input = ChangesetChildOperationInput {
            child_key,
            operation: ChangesetOperationKind::ReplaceBody,
            target: draft.target.clone(),
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

/// Rebuild an existing document reference at a different base revision (the current
/// worktree revision), leaving a provisional/other ref unchanged.
fn document_at_revision(document: &DocumentRef, revision: RevisionToken) -> DocumentRef {
    match document {
        DocumentRef::Existing {
            scope,
            node_id,
            stem,
            path,
            doc_type,
            ..
        } => DocumentRef::Existing {
            scope: scope.clone(),
            node_id: node_id.clone(),
            stem: stem.clone(),
            path: path.clone(),
            doc_type: doc_type.clone(),
            base_revision: revision,
        },
        other => other.clone(),
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
    fn rename_source_has_no_v1_inverse_and_offers_manual_repair() {
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
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(
                    |reason| reason.contains("rollback_unavailable") && reason.contains("inverse")
                ),
            "the reason names the unimplemented rename inverse: {:?}",
            outcome.eligibility.reason
        );
        assert!(outcome.manual_repair.is_some());
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
}
