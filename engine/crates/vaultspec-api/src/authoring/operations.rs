//! Proposal operation payload and preview primitives.
//!
//! W03.P13 is intentionally a whole-document subset for the walking skeleton:
//! existing-document `replace_body` drafts become materialized target snapshots
//! plus review diffs. Section-scoped and atomic-hunk operations are deferred.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, TargetRevisionFence,
};
use super::model::{ChangesetId, DocumentRef, RevisionToken};
use super::snapshots::{
    PreimageRecord, RevisionMetadata, RevisionSnapshot, SnapshotError, TargetSnapshot,
};

const REVIEW_DIFF_LINE_CAP: usize = 512;
const REVIEW_DIFF_BYTE_CAP: usize = 64 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum OperationError {
    #[error("operation child_key cannot be empty")]
    EmptyChildKey,
    #[error(
        "operation `{child_key}` kind `{operation:?}` is not supported in the W03.P13 whole-document subset"
    )]
    UnsupportedOperationKind {
        child_key: String,
        operation: ChangesetOperationKind,
    },
    #[error(
        "operation `{child_key}` draft mode `{mode:?}` is not supported for whole-document materialization"
    )]
    UnsupportedDraftMode { child_key: String, mode: DraftMode },
    #[error("operation `{child_key}` target must be an existing document")]
    UnsupportedTarget { child_key: String },
    #[error("operation `{child_key}` must carry a base revision fence")]
    MissingBaseRevision { child_key: String },
    #[error("operation `{child_key}` base revision mismatch: expected {expected}, actual {actual}")]
    BaseRevisionMismatch {
        child_key: String,
        expected: RevisionToken,
        actual: RevisionToken,
    },
    #[error(
        "operation `{child_key}` current revision mismatch: expected {expected}, actual {actual}"
    )]
    CurrentRevisionMismatch {
        child_key: String,
        expected: RevisionToken,
        actual: RevisionToken,
    },
    #[error("operation `{child_key}` document target does not match the captured base snapshot")]
    DocumentMismatch { child_key: String },
    #[error("operation `{child_key}` base snapshot is stale against its document reference")]
    StaleBaseSnapshot { child_key: String },
    #[error("operation `{child_key}` preimage does not match the captured base snapshot")]
    PreimageMismatch { child_key: String },
    #[error("snapshot: {0}")]
    Snapshot(#[from] SnapshotError),
}

pub type Result<T> = std::result::Result<T, OperationError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaterializedProposalOperation {
    pub changeset_id: ChangesetId,
    pub child_key: String,
    pub operation: ChangesetOperationKind,
    pub target: TargetRevisionFence,
    pub base: RevisionMetadata,
    pub target_snapshot: TargetSnapshot,
    pub review_diff: ReviewDiffProjection,
    pub preimage: OperationPreimageRef,
}

impl MaterializedProposalOperation {
    pub fn materialize_replace_body(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        validate_replace_body_draft(changeset_id, &draft, base_snapshot, preimage)?;
        let target_snapshot = TargetSnapshot::from_text(
            base_snapshot.document.clone(),
            base_snapshot.revision.clone(),
            draft.draft.body.clone(),
        )?;
        let review_diff = ReviewDiffProjection::from_snapshots(base_snapshot, &target_snapshot)?;
        Ok(Self {
            changeset_id: changeset_id.clone(),
            child_key: draft.child_key,
            operation: draft.operation,
            target: draft.target,
            base: base_snapshot.metadata(),
            target_snapshot,
            review_diff,
            preimage: OperationPreimageRef::from(preimage),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationPreimageRef {
    pub preimage_id: String,
    pub changeset_id: String,
    pub base_revision: RevisionToken,
    pub payload_hash: String,
    pub payload_bytes: i64,
}

impl From<&PreimageRecord> for OperationPreimageRef {
    fn from(record: &PreimageRecord) -> Self {
        Self {
            preimage_id: record.preimage_id.clone(),
            changeset_id: record.changeset_id.clone(),
            base_revision: record.base_revision.clone(),
            payload_hash: record.payload_hash.clone(),
            payload_bytes: record.payload_bytes,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDiffProjection {
    pub document: DocumentRef,
    pub base_revision: RevisionToken,
    pub target_payload_hash: String,
    pub base_blob_hash: String,
    pub base_bytes: usize,
    pub target_bytes: i64,
    pub base_line_count: usize,
    pub target_line_count: usize,
    pub changed: bool,
    pub hunks: Vec<ReviewDiffHunk>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<ReviewDiffTruncation>,
}

impl ReviewDiffProjection {
    pub fn from_snapshots(
        base: &RevisionSnapshot,
        target: &TargetSnapshot,
    ) -> Result<ReviewDiffProjection> {
        if base.document != target.document || base.revision != target.base_revision {
            return Err(OperationError::DocumentMismatch {
                child_key: "review_diff".to_string(),
            });
        }
        target.verify()?;
        let base_lines = bounded_lines_with_endings(&base.text);
        let target_lines = bounded_lines_with_endings(&target.payload_text);
        let hunks = build_diff_hunks(&base_lines.lines, &target_lines.lines);
        let truncated = truncation(&base_lines, &target_lines);
        Ok(ReviewDiffProjection {
            document: base.document.clone(),
            base_revision: base.revision.clone(),
            target_payload_hash: target.payload_hash.clone(),
            base_blob_hash: base.blob_hash.clone(),
            base_bytes: base.byte_len,
            target_bytes: target.payload_bytes,
            base_line_count: base_lines.total_lines,
            target_line_count: target_lines.total_lines,
            changed: base.blob_hash != target.payload_hash,
            hunks,
            truncated,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDiffHunk {
    pub base_start_line: usize,
    pub base_line_count: usize,
    pub target_start_line: usize,
    pub target_line_count: usize,
    pub removed: Vec<String>,
    pub added: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDiffTruncation {
    pub line_cap: usize,
    pub byte_cap: usize,
    pub total_base_lines: usize,
    pub total_target_lines: usize,
    pub returned_base_lines: usize,
    pub returned_target_lines: usize,
    pub total_base_bytes: usize,
    pub total_target_bytes: usize,
    pub returned_base_bytes: usize,
    pub returned_target_bytes: usize,
    pub reason: String,
}

fn validate_replace_body_draft(
    changeset_id: &ChangesetId,
    draft: &ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<()> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::ReplaceBody {
        return Err(OperationError::UnsupportedOperationKind {
            child_key,
            operation: draft.operation,
        });
    }
    if draft.draft.mode != DraftMode::WholeDocument {
        return Err(OperationError::UnsupportedDraftMode {
            child_key,
            mode: draft.draft.mode,
        });
    }
    let DocumentRef::Existing { base_revision, .. } = &draft.target.document else {
        return Err(OperationError::UnsupportedTarget { child_key });
    };
    let expected =
        draft
            .target
            .base_revision
            .as_ref()
            .ok_or_else(|| OperationError::MissingBaseRevision {
                child_key: child_key.clone(),
            })?;
    if expected != &base_snapshot.revision {
        return Err(OperationError::BaseRevisionMismatch {
            child_key,
            expected: expected.clone(),
            actual: base_snapshot.revision.clone(),
        });
    }
    if base_revision != &base_snapshot.revision {
        return Err(OperationError::BaseRevisionMismatch {
            child_key,
            expected: base_revision.clone(),
            actual: base_snapshot.revision.clone(),
        });
    }
    if let Some(current) = &draft.target.current_revision
        && current != &base_snapshot.revision
    {
        return Err(OperationError::CurrentRevisionMismatch {
            child_key,
            expected: current.clone(),
            actual: base_snapshot.revision.clone(),
        });
    }
    if draft.target.document != base_snapshot.document {
        return Err(OperationError::DocumentMismatch { child_key });
    }
    if !base_snapshot.base_revision_matches {
        return Err(OperationError::StaleBaseSnapshot { child_key });
    }
    validate_preimage(changeset_id, child_key, base_snapshot, preimage)?;
    Ok(())
}

fn validate_preimage(
    changeset_id: &ChangesetId,
    child_key: String,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<()> {
    if preimage.changeset_id != changeset_id.as_str()
        || preimage.operation_id != child_key
        || preimage.preimage_id.trim().is_empty()
        || preimage.retention_record_kind != "preimage"
        || preimage.retention_record_id != preimage.preimage_id
        || preimage.document != base_snapshot.document
        || preimage.document_path != base_snapshot.path
        || preimage.base_revision != base_snapshot.revision
        || preimage.blob_hash != base_snapshot.blob_hash
        || preimage.payload_hash != base_snapshot.blob_hash
        || preimage.payload_text != base_snapshot.text
        || preimage.payload_bytes != base_snapshot.byte_len as i64
    {
        return Err(OperationError::PreimageMismatch { child_key });
    }
    Ok(())
}

fn build_diff_hunks(base_lines: &[String], target_lines: &[String]) -> Vec<ReviewDiffHunk> {
    let lcs = lcs_lengths(base_lines, target_lines);
    let mut hunks = Vec::new();
    let mut hunk: Option<ReviewDiffHunk> = None;
    let mut base_index = 0;
    let mut target_index = 0;
    let mut base_line = 1;
    let mut target_line = 1;

    while base_index < base_lines.len() || target_index < target_lines.len() {
        if base_index < base_lines.len()
            && target_index < target_lines.len()
            && base_lines[base_index] == target_lines[target_index]
        {
            finish_hunk(&mut hunk, &mut hunks);
            base_index += 1;
            target_index += 1;
            base_line += 1;
            target_line += 1;
            continue;
        }

        if target_index < target_lines.len()
            && (base_index == base_lines.len()
                || lcs[base_index][target_index + 1] > lcs[base_index + 1][target_index])
        {
            current_hunk(&mut hunk, base_line, target_line)
                .added
                .push(target_lines[target_index].clone());
            target_index += 1;
            target_line += 1;
            continue;
        }

        if base_index < base_lines.len() {
            current_hunk(&mut hunk, base_line, target_line)
                .removed
                .push(base_lines[base_index].clone());
            base_index += 1;
            base_line += 1;
            continue;
        }
    }

    finish_hunk(&mut hunk, &mut hunks);
    hunks
}

fn lcs_lengths(base_lines: &[String], target_lines: &[String]) -> Vec<Vec<usize>> {
    let mut table = vec![vec![0; target_lines.len() + 1]; base_lines.len() + 1];
    for base_index in (0..base_lines.len()).rev() {
        for target_index in (0..target_lines.len()).rev() {
            table[base_index][target_index] =
                if base_lines[base_index] == target_lines[target_index] {
                    table[base_index + 1][target_index + 1] + 1
                } else {
                    table[base_index + 1][target_index].max(table[base_index][target_index + 1])
                };
        }
    }
    table
}

fn current_hunk(
    hunk: &mut Option<ReviewDiffHunk>,
    base_line: usize,
    target_line: usize,
) -> &mut ReviewDiffHunk {
    hunk.get_or_insert_with(|| ReviewDiffHunk {
        base_start_line: base_line,
        base_line_count: 0,
        target_start_line: target_line,
        target_line_count: 0,
        removed: Vec::new(),
        added: Vec::new(),
    })
}

fn finish_hunk(hunk: &mut Option<ReviewDiffHunk>, hunks: &mut Vec<ReviewDiffHunk>) {
    if let Some(mut completed) = hunk.take() {
        completed.base_line_count = completed.removed.len();
        completed.target_line_count = completed.added.len();
        hunks.push(completed);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BoundedLines {
    lines: Vec<String>,
    total_lines: usize,
    total_bytes: usize,
    returned_bytes: usize,
}

impl BoundedLines {
    fn truncated(&self) -> bool {
        self.total_lines > self.lines.len() || self.total_bytes > self.returned_bytes
    }
}

fn bounded_lines_with_endings(text: &str) -> BoundedLines {
    let mut lines = Vec::with_capacity(REVIEW_DIFF_LINE_CAP.min(16));
    let mut total_lines = 0;
    let total_bytes = text.len();
    let mut returned_bytes = 0;
    let mut start = 0;
    for (index, ch) in text.char_indices() {
        if ch == '\n' {
            total_lines += 1;
            if lines.len() < REVIEW_DIFF_LINE_CAP {
                push_bounded_line(&mut lines, &mut returned_bytes, &text[start..=index]);
            }
            start = index + 1;
        }
    }
    if start < text.len() {
        total_lines += 1;
        if lines.len() < REVIEW_DIFF_LINE_CAP {
            push_bounded_line(&mut lines, &mut returned_bytes, &text[start..]);
        }
    }
    BoundedLines {
        lines,
        total_lines,
        total_bytes,
        returned_bytes,
    }
}

fn push_bounded_line(lines: &mut Vec<String>, returned_bytes: &mut usize, line: &str) {
    if *returned_bytes >= REVIEW_DIFF_BYTE_CAP {
        return;
    }
    let remaining = REVIEW_DIFF_BYTE_CAP - *returned_bytes;
    let bounded = if line.len() <= remaining {
        line
    } else {
        truncate_at_char_boundary(line, remaining)
    };
    if bounded.is_empty() {
        return;
    }
    *returned_bytes += bounded.len();
    lines.push(bounded.to_string());
}

fn truncate_at_char_boundary(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut boundary = 0;
    for (index, _) in value.char_indices() {
        if index > max_bytes {
            break;
        }
        boundary = index;
    }
    &value[..boundary]
}

fn truncation(
    base_lines: &BoundedLines,
    target_lines: &BoundedLines,
) -> Option<ReviewDiffTruncation> {
    if !base_lines.truncated() && !target_lines.truncated() {
        return None;
    }
    Some(ReviewDiffTruncation {
        line_cap: REVIEW_DIFF_LINE_CAP,
        byte_cap: REVIEW_DIFF_BYTE_CAP,
        total_base_lines: base_lines.total_lines,
        total_target_lines: target_lines.total_lines,
        returned_base_lines: base_lines.lines.len(),
        returned_target_lines: target_lines.lines.len(),
        total_base_bytes: base_lines.total_bytes,
        total_target_bytes: target_lines.total_bytes,
        returned_base_bytes: base_lines.returned_bytes,
        returned_target_bytes: target_lines.returned_bytes,
        reason: format!(
            "review diff cap reached (lines {REVIEW_DIFF_LINE_CAP}, bytes {REVIEW_DIFF_BYTE_CAP}); full target snapshot remains authoritative"
        ),
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::*;
    use crate::authoring::api::{DraftMutation, TargetRevisionFence};
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn resolved_doc(root: &Path) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
            .unwrap()
    }

    fn base_snapshot(root: &Path) -> RevisionSnapshot {
        let document = resolved_doc(root);
        SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("test document must be existing");
        };
        base_revision.clone()
    }

    fn draft_for(
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
            },
        }
    }

    fn preimage_record(root: &Path) -> PreimageRecord {
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

    fn changeset_id() -> ChangesetId {
        ChangesetId::new("changeset_1").unwrap()
    }

    #[test]
    fn full_replacement_builds_target_snapshot_and_review_diff() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "alpha\nbeta\ngamma\n",
        );
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "alpha\nBETA\ngamma\n",
        );
        let preimage = preimage_record(root);

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert_eq!(materialized.changeset_id, changeset_id());
        assert_eq!(materialized.child_key, "child_1");
        assert_eq!(materialized.operation, ChangesetOperationKind::ReplaceBody);
        assert_eq!(materialized.target_snapshot.document, snapshot.document);
        assert_eq!(
            materialized.target_snapshot.base_revision,
            snapshot.revision
        );
        assert_eq!(
            materialized.target_snapshot.payload_text,
            "alpha\nBETA\ngamma\n"
        );
        assert!(materialized.review_diff.changed);
        assert_eq!(materialized.review_diff.base_line_count, 3);
        assert_eq!(materialized.review_diff.target_line_count, 3);
        assert_eq!(materialized.review_diff.hunks.len(), 1);
        let hunk = &materialized.review_diff.hunks[0];
        assert_eq!(hunk.base_start_line, 2);
        assert_eq!(hunk.target_start_line, 2);
        assert_eq!(hunk.removed, vec!["beta\n".to_string()]);
        assert_eq!(hunk.added, vec!["BETA\n".to_string()]);
    }

    #[test]
    fn unchanged_whole_document_preview_has_empty_diff_hunks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "same\nbody\n");
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "same\nbody\n",
        );
        let preimage = preimage_record(root);

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert!(!materialized.review_diff.changed);
        assert!(materialized.review_diff.hunks.is_empty());
        assert_eq!(materialized.target_snapshot.payload_text, snapshot.text);
    }

    #[test]
    fn non_contiguous_changes_build_separate_review_diff_hunks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "one\ntwo\nthree\nfour\n",
        );
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "ONE\ntwo\nthree\nFOUR\n",
        );
        let preimage = preimage_record(root);

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert_eq!(materialized.review_diff.hunks.len(), 2);
        assert_eq!(materialized.review_diff.hunks[0].base_start_line, 1);
        assert_eq!(
            materialized.review_diff.hunks[0].removed,
            vec!["one\n".to_string()]
        );
        assert_eq!(
            materialized.review_diff.hunks[0].added,
            vec!["ONE\n".to_string()]
        );
        assert_eq!(materialized.review_diff.hunks[1].base_start_line, 4);
        assert_eq!(
            materialized.review_diff.hunks[1].removed,
            vec!["four\n".to_string()]
        );
        assert_eq!(
            materialized.review_diff.hunks[1].added,
            vec!["FOUR\n".to_string()]
        );
    }

    #[test]
    fn preimage_link_is_preserved_for_preview_recovery_inputs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "before\n");
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert_eq!(materialized.preimage.preimage_id, "preimage_1");
        assert_eq!(materialized.preimage.changeset_id, "changeset_1");
        assert_eq!(materialized.preimage.base_revision, snapshot.revision);
        assert_eq!(materialized.preimage.payload_hash, snapshot.blob_hash);
        assert_eq!(materialized.preimage.payload_bytes, "before\n".len() as i64);
    }

    #[test]
    fn materialized_preview_round_trips_without_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "old\n");
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "new\n",
        );
        let preimage = preimage_record(root);
        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        let value = serde_json::to_value(&materialized).unwrap();
        let recovered: MaterializedProposalOperation = serde_json::from_value(value).unwrap();
        assert_eq!(recovered, materialized);

        let mut value = serde_json::to_value(&materialized).unwrap();
        value["frontend_derived_status"] = json!("approved");
        let err = serde_json::from_value::<MaterializedProposalOperation>(value).unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown projection fields are rejected: {err}"
        );
    }

    #[test]
    fn review_material_json_exposes_preview_diff_and_preimage_before_apply() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "old\nbody\n");
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "new\nbody\n",
        );
        let preimage = preimage_record(root);
        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        let value = serde_json::to_value(&materialized).unwrap();

        assert_eq!(value["changeset_id"], "changeset_1");
        assert_eq!(value["child_key"], "child_1");
        assert_eq!(value["operation"], "replace_body");
        assert_eq!(value["target_snapshot"]["payload_text"], "new\nbody\n");
        assert_eq!(value["review_diff"]["changed"], true);
        assert_eq!(value["review_diff"]["hunks"][0]["removed"][0], "old\n");
        assert_eq!(value["review_diff"]["hunks"][0]["added"][0], "new\n");
        assert_eq!(value["preimage"]["preimage_id"], "preimage_1");
        assert_eq!(value["preimage"]["payload_hash"], snapshot.blob_hash);
        assert!(
            value.get("apply_state").is_none(),
            "review material must not expose or imply apply state"
        );
    }

    #[test]
    fn provisional_create_is_not_materialized_as_replace_body_preview() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let provisional = DocumentResolver::for_worktree(root)
            .provisional_create(crate::authoring::documents::ProvisionalCreateRequest {
                provisional_doc_id: "provisional_1".to_string(),
                doc_type: "plan".to_string(),
                feature: "agentic-spec-authoring-backend".to_string(),
                title: "New Plan".to_string(),
                proposed_stem: Some("new-plan".to_string()),
            })
            .unwrap();
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::CreateDocument,
            target: TargetRevisionFence {
                document: provisional,
                base_revision: None,
                current_revision: None,
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: "new\n".to_string(),
            },
        };

        let preimage = preimage_record(root);
        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedOperationKind {
                operation: ChangesetOperationKind::CreateDocument,
                ..
            }
        ));
    }

    #[test]
    fn section_and_destructive_kinds_are_deferred_from_w03_p13() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "base\n");
        let snapshot = base_snapshot(root);

        for operation in [
            ChangesetOperationKind::SectionEdit,
            ChangesetOperationKind::Archive,
            ChangesetOperationKind::Unarchive,
            ChangesetOperationKind::Rename,
            ChangesetOperationKind::Link,
        ] {
            let draft = draft_for(
                snapshot.document.clone(),
                operation,
                DraftMode::WholeDocument,
                "after\n",
            );
            let preimage = preimage_record(root);
            let err = MaterializedProposalOperation::materialize_replace_body(
                &changeset_id(),
                draft,
                &snapshot,
                &preimage,
            )
            .unwrap_err();
            assert!(matches!(
                err,
                OperationError::UnsupportedOperationKind {
                    operation: found,
                    ..
                } if found == operation
            ));
        }
    }

    #[test]
    fn append_mode_is_rejected_in_whole_document_subset() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::Append,
            "tail\n",
        );

        let preimage = preimage_record(root);
        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedDraftMode {
                mode: DraftMode::Append,
                ..
            }
        ));
    }

    #[test]
    fn stale_base_snapshot_is_rejected_before_preview_materialization() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "base\n");
        let document = resolved_doc(root);
        let preimage = preimage_record(root);
        write_doc(root, ".vault/plan/operation-plan.md", "changed\n");
        let stale_snapshot = SnapshotReader::for_worktree(root)
            .capture_existing(&document)
            .unwrap();
        let draft = draft_for(
            document,
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &stale_snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::BaseRevisionMismatch { .. }));
    }

    #[test]
    fn current_revision_mismatch_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let mut draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );
        draft.target.current_revision = Some(RevisionToken::new("blob:abc123").unwrap());

        let preimage = preimage_record(root);
        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::CurrentRevisionMismatch { .. }
        ));
    }

    #[test]
    fn mismatched_preimage_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "before\n");
        let snapshot = base_snapshot(root);
        let mut preimage = preimage_record(root);
        preimage.operation_id = "other_child".to_string();
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::PreimageMismatch { .. }));
    }

    #[test]
    fn preimage_from_another_changeset_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "before\n");
        let snapshot = base_snapshot(root);
        let mut preimage = preimage_record(root);
        preimage.changeset_id = "changeset_other".to_string();
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let err = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::PreimageMismatch { .. }));
    }

    #[test]
    fn malformed_preimage_recovery_identity_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "before\n");
        let snapshot = base_snapshot(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        for preimage in [
            {
                let mut record = preimage_record(root);
                record.preimage_id.clear();
                record
            },
            {
                let mut record = preimage_record(root);
                record.retention_record_kind = "review_material".to_string();
                record
            },
            {
                let mut record = preimage_record(root);
                record.retention_record_id = "other_preimage".to_string();
                record
            },
        ] {
            let err = MaterializedProposalOperation::materialize_replace_body(
                &changeset_id(),
                draft.clone(),
                &snapshot,
                &preimage,
            )
            .unwrap_err();
            assert!(matches!(err, OperationError::PreimageMismatch { .. }));
        }
    }

    #[test]
    fn review_diff_reports_truncation_when_line_cap_is_reached() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = (0..REVIEW_DIFF_LINE_CAP + 2)
            .map(|index| format!("line {index}\n"))
            .collect::<String>();
        write_doc(root, ".vault/plan/operation-plan.md", &base);
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let mut target = base;
        target.push_str("extra\n");
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            &target,
        );

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        let truncated = materialized
            .review_diff
            .truncated
            .expect("line cap is reported");
        assert_eq!(truncated.line_cap, REVIEW_DIFF_LINE_CAP);
        assert_eq!(truncated.returned_base_lines, REVIEW_DIFF_LINE_CAP);
        assert_eq!(truncated.returned_target_lines, REVIEW_DIFF_LINE_CAP);
        assert!(materialized.review_diff.changed);
        assert!(materialized.review_diff.hunks.is_empty());
    }

    #[test]
    fn review_diff_reports_truncation_when_byte_cap_is_reached() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let base = format!("{}\n", "a".repeat(REVIEW_DIFF_BYTE_CAP + 1024));
        write_doc(root, ".vault/plan/operation-plan.md", &base);
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let target = format!("{}\n", "b".repeat(REVIEW_DIFF_BYTE_CAP + 2048));
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            &target,
        );

        let materialized = MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        let truncated = materialized
            .review_diff
            .truncated
            .expect("byte cap is reported");
        assert_eq!(truncated.byte_cap, REVIEW_DIFF_BYTE_CAP);
        assert!(truncated.total_base_bytes > REVIEW_DIFF_BYTE_CAP);
        assert!(truncated.total_target_bytes > REVIEW_DIFF_BYTE_CAP);
        assert_eq!(truncated.returned_base_bytes, REVIEW_DIFF_BYTE_CAP);
        assert_eq!(truncated.returned_target_bytes, REVIEW_DIFF_BYTE_CAP);
        assert_eq!(materialized.review_diff.hunks.len(), 1);
        assert!(
            materialized.review_diff.hunks[0]
                .removed
                .iter()
                .map(|line| line.len())
                .sum::<usize>()
                <= REVIEW_DIFF_BYTE_CAP
        );
        assert!(
            materialized.review_diff.hunks[0]
                .added
                .iter()
                .map(|line| line.len())
                .sum::<usize>()
                <= REVIEW_DIFF_BYTE_CAP
        );
    }
}
