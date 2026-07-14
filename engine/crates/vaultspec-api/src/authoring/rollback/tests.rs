use std::path::Path;

use ingest_struct::reader::read_from_worktree;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::model::{ActorId, ActorKind, ProvisionalCollisionStatus, SessionId};
use crate::authoring::snapshots::PreimageCaptureRequest;
use crate::authoring::store::Store;

pub(crate) fn actor(id: &str, kind: ActorKind) -> ActorRef {
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
pub(crate) fn write_doc(root: &Path, stem: &str, body: &str) -> RevisionToken {
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

pub(crate) fn temp_store(root: &Path) -> Store {
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
pub(crate) fn seed_applied_source(
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
                let revision = record(changeset_id, previous.clone(), status, actor, child(), at);
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
pub(crate) fn source_preimage_record(
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

pub(crate) fn generate(
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

const SECTION_EDIT_DOC: &str = "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";
const SECTION_EDIT_BETA_SECTION: &str = "## Beta\n\nbeta body\n";
const SECTION_EDIT_BETA_NEW: &str = "## Beta\n\nBETA REWRITTEN\n";

/// A materialized `section_edit` child (section-scoped-operations ADR)
/// targeting `heading_path` in `document`'s CURRENT worktree body,
/// resolving with `expected_content_hash` and splicing in `new_content`.
fn section_edit_child_input(
    root: &Path,
    changeset_id: &ChangesetId,
    child_key: &str,
    document: DocumentRef,
    heading_path: &[&str],
    expected_content_hash: &str,
    new_content: &str,
) -> ChangesetChildOperationInput {
    let base_snapshot = SnapshotReader::for_worktree(root)
        .require_current_base(&document)
        .unwrap();
    let preimage = SnapshotReader::for_worktree(root)
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: format!("preimage:{}:{child_key}", changeset_id.as_str()),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: child_key.to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let DocumentRef::Existing {
        base_revision: revision,
        ..
    } = &document
    else {
        panic!("section edit target must be an existing document");
    };
    let selector = SectionSelector {
        heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
        range_hint: None,
        expected_content_hash: expected_content_hash.to_string(),
    };
    let draft = ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::SectionEdit,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(revision.clone()),
            current_revision: Some(revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::SectionScoped,
            body: new_content.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: Some(selector),
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_section_edit(
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

#[test]
fn section_edit_rolls_back_by_restoring_the_selected_preimage_into_its_resolved_range() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base_rev = write_doc(root, "rollback-section", SECTION_EDIT_DOC);
    let mut store = temp_store(root);
    let source = ChangesetId::new("changeset_se_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let doc = existing_doc("rollback-section", &base_rev);
    let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
    let beta_hash = blob_oid(SECTION_EDIT_BETA_SECTION.as_bytes());
    let child = {
        let root = root.to_path_buf();
        let doc = doc.clone();
        let source = source.clone();
        move || {
            section_edit_child_input(
                &root,
                &source,
                "child_1",
                doc.clone(),
                &["Beta"],
                &beta_hash,
                SECTION_EDIT_BETA_NEW,
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

    // The forward edit landed (Beta rewritten), AND an unrelated concurrent
    // edit landed in Alpha since — the rollback must restore ONLY Beta.
    write_doc(
        root,
        "rollback-section",
        "# Doc\n\nintro\n\n## Alpha\n\nALPHA CONCURRENT EDIT\n\n## Beta\n\nBETA REWRITTEN\n",
    );

    let outcome = generate(
        &mut store,
        root,
        &source,
        &["child_1"],
        "idem:rollback:se:1",
    );

    assert!(
        outcome.eligibility.allowed,
        "reason: {:?}",
        outcome.eligibility.reason
    );
    assert!(outcome.manual_repair.is_none());
    let rollback_id = outcome.changeset_id.expect("rollback changeset generated");

    let rollback = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.ledger().latest(&rollback_id)?.unwrap())
        })
        .unwrap();
    let materialized = rollback.children[0]
        .materialized_operation
        .as_ref()
        .expect("rollback child is materialized");
    assert_eq!(
        materialized.operation,
        ChangesetOperationKind::SectionEdit,
        "the selected-preimage restore is itself a section edit"
    );
    assert_eq!(
        materialized.target_snapshot.payload_text,
        "# Doc\n\nintro\n\n## Alpha\n\nALPHA CONCURRENT EDIT\n\n## Beta\n\nbeta body\n",
        "Beta is restored to its selected preimage; the unrelated concurrent Alpha edit \
             survives untouched"
    );
}

#[test]
fn section_edit_rollback_is_unavailable_when_the_targeted_section_no_longer_resolves() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base_rev = write_doc(root, "rollback-section-drift", SECTION_EDIT_DOC);
    let mut store = temp_store(root);
    let source = ChangesetId::new("changeset_se_drift_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let doc = existing_doc("rollback-section-drift", &base_rev);
    let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
    let beta_hash = blob_oid(SECTION_EDIT_BETA_SECTION.as_bytes());
    let child = {
        let root = root.to_path_buf();
        let doc = doc.clone();
        let source = source.clone();
        move || {
            section_edit_child_input(
                &root,
                &source,
                "child_1",
                doc.clone(),
                &["Beta"],
                &beta_hash,
                SECTION_EDIT_BETA_NEW,
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

    // Beta was edited FURTHER since the forward apply — the rollback's
    // re-resolve (expecting exactly the forward-apply's own new content)
    // no longer finds a match.
    write_doc(
        root,
        "rollback-section-drift",
        "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nBETA EDITED AGAIN\n",
    );

    let outcome = generate(
        &mut store,
        root,
        &source,
        &["child_1"],
        "idem:rollback:se:drift:1",
    );

    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("rollback_unavailable")
                && reason.contains("no longer resolves")),
        "{:?}",
        outcome.eligibility.reason
    );
    assert!(outcome.manual_repair.is_some());
}

#[test]
fn section_edit_rollback_is_unavailable_without_a_captured_selected_preimage() {
    // A source whose materialized operation carries no `section_edit`
    // payload (e.g. an applied record from before this feature existed):
    // the WHOLE-document preimage alone is not enough for a section-edit
    // inverse, which restores the SELECTED preimage, never the whole one.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let base_rev = write_doc(root, "rollback-section-np", SECTION_EDIT_DOC);
    let mut store = temp_store(root);
    let source = ChangesetId::new("changeset_se_np_1").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let doc = existing_doc("rollback-section-np", &base_rev);
    let preimage = source_preimage_record(root, &source, "child_1", doc.clone());
    let child = {
        let doc = doc.clone();
        move || child_input("child_1", ChangesetOperationKind::SectionEdit, doc.clone())
    };
    seed_applied_source(
        &mut store,
        &source,
        &author,
        &reviewer,
        child,
        Some(preimage),
    );

    let outcome = generate(
        &mut store,
        root,
        &source,
        &["child_1"],
        "idem:rollback:se:np:1",
    );

    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome.eligibility.reason.as_deref().is_some_and(|reason| {
            reason.contains("rollback_unavailable") && reason.contains("preimage")
        }),
        "the reason names the missing preimage: {:?}",
        outcome.eligibility.reason
    );
    assert!(outcome.manual_repair.is_some());
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
            section_selector: None,
            plan_step: None,
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
            section_selector: None,
            plan_step: None,
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
            section_selector: None,
            plan_step: None,
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
            section_selector: None,
            plan_step: None,
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
            .is_some_and(
                |reason| reason.contains("rollback_unavailable") && reason.contains("renamed away")
            ),
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
