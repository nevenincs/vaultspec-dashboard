use super::super::*;

pub(super) use serde_json::json;
pub(super) use std::path::Path;

pub(super) use crate::authoring::api::{DraftMutation, TargetRevisionFence};
pub(super) use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
pub(super) use crate::authoring::model::ProvisionalCollisionStatus;
pub(super) use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};

pub(super) fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

pub(super) fn resolved_doc(root: &Path) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
        .unwrap()
}

pub(super) fn base_snapshot(root: &Path) -> RevisionSnapshot {
    let document = resolved_doc(root);
    SnapshotReader::for_worktree(root)
        .require_current_base(&document)
        .unwrap()
}

pub(super) fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("test document must be existing");
    };
    base_revision.clone()
}

pub(super) fn draft_for(
    document: DocumentRef,
    operation: ChangesetOperationKind,
    mode: DraftMode,
    body: &str,
) -> ChangesetChildOperationDraft {
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode,
            body: body.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    }
}

pub(super) fn frontmatter_draft_for(
    document: DocumentRef,
    fields: FrontmatterEditFields,
) -> ChangesetChildOperationDraft {
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::EditFrontmatter,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: Some(fields),
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    }
}

pub(super) fn rename_draft_for(
    document: DocumentRef,
    new_stem: &str,
) -> ChangesetChildOperationDraft {
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::Rename,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: Some(new_stem.to_string()),
            section_selector: None,
            plan_step: None,
        },
    }
}

pub(super) fn section_edit_draft_for(
    document: DocumentRef,
    selector: SectionSelector,
    new_content: &str,
) -> ChangesetChildOperationDraft {
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::SectionEdit,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
        },
        draft: DraftMutation {
            mode: DraftMode::SectionScoped,
            body: new_content.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: Some(selector),
            plan_step: None,
        },
    }
}

pub(super) fn preimage_record(root: &Path) -> PreimageRecord {
    SnapshotReader::for_worktree(root)
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_1".to_string(),
            changeset_id: "changeset_1".to_string(),
            operation_id: "child_1".to_string(),
            document: resolved_doc(root),
            captured_at_ms: 100,
        })
        .unwrap()
}

pub(super) fn changeset_id() -> ChangesetId {
    ChangesetId::new("changeset_1").unwrap()
}
pub(super) const SECTION_DOC: &str = "# Doc

intro

## Alpha

alpha body

## Beta

beta body
";
