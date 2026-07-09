//! Proposal operation payload and preview primitives.
//!
//! W03.P13 is intentionally a whole-document subset for the walking skeleton:
//! existing-document `replace_body` drafts become materialized target snapshots
//! plus review diffs. Section-scoped and atomic-hunk operations are deferred.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, FrontmatterEditFields,
    TargetRevisionFence,
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
    #[error(
        "operation `{child_key}` frontmatter edit must carry no body text (field-level payload only)"
    )]
    UnexpectedBodyPayload { child_key: String },
    #[error(
        "operation `{child_key}` frontmatter edit must set at least one field (date, tags, or related)"
    )]
    EmptyFrontmatterPayload { child_key: String },
    #[error("operation `{child_key}` frontmatter field `{field}` value must not contain a newline")]
    InvalidFrontmatterValue {
        child_key: String,
        field: &'static str,
    },
    #[error("operation `{child_key}` target document has no frontmatter block to edit")]
    MissingFrontmatterBlock { child_key: String },
    #[error("operation `{child_key}` rename must carry a target stem (field-level payload only)")]
    MissingRenameStem { child_key: String },
    #[error("operation `{child_key}` rename target stem is invalid: {reason}")]
    InvalidRenameStem {
        child_key: String,
        reason: &'static str,
    },
    #[error(
        "operation `{child_key}` create target must be a provisional (not-yet-existing) document"
    )]
    UnsupportedCreateTarget { child_key: String },
    #[error("operation `{child_key}` create requires a non-empty `{field}`")]
    MissingCreateParam {
        child_key: String,
        field: &'static str,
    },
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
    /// The field-level payload an `EditFrontmatter` apply carries through to the
    /// `SetFrontmatter` core capability (W02.P03) — the SAME operation-kind-typed
    /// value the draft supplied, threaded through the ledger so apply-time
    /// invocation-building never re-derives it from the whole-document preview.
    /// `None` for every other operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontmatter_edit: Option<FrontmatterEditFields>,
    /// The target stem a `Rename` apply carries through to the `Rename` core
    /// capability (W02.P04) — the SAME `new_stem` the draft supplied, threaded
    /// through the ledger for the same reason `frontmatter_edit` is. `None` for
    /// every other operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rename_edit: Option<String>,
    /// The ISO `yyyy-mm-dd` date a `CreateDocument` apply passes to core's
    /// `--date` flag (W02.P05), FIXED at materialize time rather than
    /// recomputed at apply/reclaim time. Core's own scaffold naming convention
    /// (`{date}-{feature}-{doc_type}.md`) makes this the load-bearing input to
    /// BOTH the write invocation and the identity-bearing post-verify's
    /// predicted path — pinning it here is what keeps the two in agreement
    /// across a crash-recovery reclaim, which reconstructs everything from this
    /// SAME durable `materialized_operation` rather than reading wall-clock
    /// "now" a second time. `None` for every other operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create_document_date: Option<String>,
}

impl MaterializedProposalOperation {
    pub fn materialize_replace_body(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        validate_replace_body_draft(changeset_id, &draft, base_snapshot, preimage)?;
        let target_text = draft.draft.body.clone();
        finish_materialization(
            changeset_id,
            draft,
            base_snapshot,
            preimage,
            target_text,
            OperationKindExtras::default(),
        )
    }

    /// Materialize an `EditFrontmatter` draft (W02.P03): validate the field-level
    /// payload, build a whole-document PREVIEW by surgically rewriting only the
    /// named frontmatter fields (every other byte — the body, every untouched
    /// frontmatter line — is carried over unchanged), and produce the SAME
    /// review-diff/preimage-anchored shape `materialize_replace_body` does, so
    /// validation (`validate_frontmatter`), the review diff, and conflict
    /// detection treat a frontmatter edit exactly like a whole-document replace.
    /// The preview is a best-effort projection for review/validation/fail-closed
    /// post-verify ONLY: the actual write always runs through the `SetFrontmatter`
    /// core capability at apply time, which is authoritative over the exact bytes.
    pub fn materialize_edit_frontmatter(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        let fields =
            validate_edit_frontmatter_draft(changeset_id, &draft, base_snapshot, preimage)?.clone();
        let target_text =
            rewrite_frontmatter_fields(&draft.child_key, &base_snapshot.text, &fields)?;
        finish_materialization(
            changeset_id,
            draft,
            base_snapshot,
            preimage,
            target_text,
            OperationKindExtras {
                frontmatter_edit: Some(fields),
                ..Default::default()
            },
        )
    }

    /// Materialize a `Rename` draft (W02.P04): validate the target-stem payload,
    /// and build a whole-document PREVIEW whose text is the base text UNCHANGED
    /// — a rename touches identity (stem/path), never content, so there is
    /// nothing to diff. The preview still exists (rather than being skipped)
    /// because `validate_changeset_material`'s `validate_frontmatter` check runs
    /// unconditionally over every materialized operation's `target_snapshot`,
    /// and because the shared preimage/base-revision fence
    /// (`validate_target_and_preimage`) needs a real base snapshot regardless of
    /// operation kind. The resulting review diff is trivially empty
    /// (`changed == false`) — correct, since a rename has no content delta to
    /// show a reviewer; the target stem itself is the reviewable change,
    /// carried in `rename_edit`.
    pub fn materialize_rename(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        let new_stem =
            validate_rename_draft(changeset_id, &draft, base_snapshot, preimage)?.to_string();
        let target_text = base_snapshot.text.clone();
        finish_materialization(
            changeset_id,
            draft,
            base_snapshot,
            preimage,
            target_text,
            OperationKindExtras {
                rename_edit: Some(new_stem),
                ..Default::default()
            },
        )
    }

    /// Materialize a `CreateDocument` draft (W02.P05): the ODD ONE OUT — there
    /// is NO existing document to read, NO base revision to fence, and NO
    /// real preimage to capture, because the target does not exist yet. This
    /// is why CreateDocument does NOT call `validate_target_and_preimage`
    /// (that shared fence hard-requires an EXISTING document) and takes no
    /// `base_snapshot`/`preimage` arguments unlike every other materializer.
    ///
    /// It STILL converges on the shared `finish_materialization` tail — every
    /// downstream consumer of `MaterializedProposalOperation`
    /// (`validate_changeset_material`, apply, projections, review) treats the
    /// type uniformly regardless of operation kind, and changing that shape
    /// would be a much larger, invasive refactor for no functional gain here.
    /// The `base`/`preimage` it supplies are explicitly PHANTOM: an in-memory-
    /// only, NEVER-PERSISTED "diff from nothing" (empty text, the git-style
    /// empty-blob hash) — never a real captured preimage. Every field is
    /// internally self-consistent (same document ref, same phantom revision,
    /// same empty hash), so the cross-checks `validation.rs` runs between
    /// `base`/`preimage`/`target_snapshot`/`review_diff` pass honestly; they
    /// never claim a real prior state existed. `rollback_available=false`
    /// downstream (`transitions::create_rollback_eligibility` already excludes
    /// `CreateDocument` outright, independent of preimage presence) reflects
    /// the truth: there is nothing to restore.
    ///
    /// `created_at_ms` fixes the ISO date used for BOTH the predicted path
    /// AND (later, at apply time) core's own `--date` flag: core's `vault add`
    /// accepts no caller-chosen stem — it ALWAYS derives the filename from its
    /// own documented `{date}-{feature}-{doc_type}.md` naming convention — so a
    /// caller-supplied `proposed_stem` cannot predict what core will actually
    /// write. Fixing the date here (once, durably, at materialize time) is what
    /// makes the predicted path a pure function of the materialized operation
    /// alone: the SAME value a crash-recovery reclaim reads back from the
    /// ledger, never a value recomputed against wall-clock "now" a second time.
    pub fn materialize_create_document(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        created_at_ms: i64,
    ) -> Result<Self> {
        let (doc_type, feature, _title) = validate_create_document_draft(&draft)?;
        let created_at_date = engine_query::lineage::ms_to_date_key(created_at_ms);
        let predicted_path = format!(".vault/{doc_type}/{created_at_date}-{feature}-{doc_type}.md");
        let empty_hash = blob_oid(b"");
        let phantom_revision = RevisionToken::new(format!("blob:{empty_hash}"))
            .expect("an empty-blob revision token is always a valid RevisionToken");
        let phantom_base = RevisionSnapshot {
            document: draft.target.document.clone(),
            path: predicted_path,
            revision: phantom_revision.clone(),
            blob_hash: empty_hash.clone(),
            text: String::new(),
            byte_len: 0,
            base_revision_matches: true,
        };
        let phantom_preimage_id = format!(
            "phantom-create:{}:{}",
            changeset_id.as_str(),
            draft.child_key
        );
        let phantom_preimage = PreimageRecord {
            preimage_id: phantom_preimage_id.clone(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: draft.child_key.clone(),
            document: draft.target.document.clone(),
            document_node_id: String::new(),
            document_path: phantom_base.path.clone(),
            base_revision: phantom_revision,
            blob_hash: empty_hash.clone(),
            payload_hash: empty_hash,
            payload_text: String::new(),
            payload_bytes: 0,
            captured_at_ms: created_at_ms,
            retention_record_kind: "preimage".to_string(),
            retention_record_id: phantom_preimage_id,
        };
        let target_text = draft.draft.body.clone();
        finish_materialization(
            changeset_id,
            draft,
            &phantom_base,
            &phantom_preimage,
            target_text,
            OperationKindExtras {
                create_document_date: Some(created_at_date),
                ..Default::default()
            },
        )
    }
}

/// The operation-kind-specific payload `finish_materialization` threads through
/// unchanged onto `MaterializedProposalOperation` — bundled into one parameter
/// (rather than three trailing `Option`s) so the shared tail stays under the
/// argument-count lint without losing the "at most one is ever `Some`" shape
/// each kind's own materializer already documents on the struct fields.
#[derive(Default)]
struct OperationKindExtras {
    frontmatter_edit: Option<FrontmatterEditFields>,
    rename_edit: Option<String>,
    create_document_date: Option<String>,
}

/// Shared materialization tail: build the target snapshot + review diff from
/// `target_text` and assemble the `MaterializedProposalOperation`. Every
/// operation-kind-specific materializer validates its own payload shape and
/// derives its own `target_text`, then converges here — the ONE place the
/// preview/preimage/review-diff shape is assembled, so a new operation kind
/// (rename, create) extends by adding a `target_text` derivation, not a
/// duplicated tail.
fn finish_materialization(
    changeset_id: &ChangesetId,
    draft: ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
    target_text: String,
    extras: OperationKindExtras,
) -> Result<MaterializedProposalOperation> {
    let OperationKindExtras {
        frontmatter_edit,
        rename_edit,
        create_document_date,
    } = extras;
    let target_snapshot = TargetSnapshot::from_text(
        base_snapshot.document.clone(),
        base_snapshot.revision.clone(),
        target_text,
    )?;
    let review_diff = ReviewDiffProjection::from_snapshots(base_snapshot, &target_snapshot)?;
    Ok(MaterializedProposalOperation {
        changeset_id: changeset_id.clone(),
        child_key: draft.child_key,
        operation: draft.operation,
        target: draft.target,
        base: base_snapshot.metadata(),
        target_snapshot,
        review_diff,
        preimage: OperationPreimageRef::from(preimage),
        frontmatter_edit,
        rename_edit,
        create_document_date,
    })
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
    validate_target_and_preimage(changeset_id, child_key, draft, base_snapshot, preimage)
}

/// Validate an `EditFrontmatter` draft (W02.P03): the operation kind, its
/// field-level payload shape, and the SAME target-fence + preimage checks every
/// operation kind shares. `body` carries no meaning for a field-level edit and
/// must be empty (R1: no accepted-but-ignored field). Returns the validated
/// fields so the caller materializes without re-deriving them.
fn validate_edit_frontmatter_draft<'a>(
    changeset_id: &ChangesetId,
    draft: &'a ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<&'a FrontmatterEditFields> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::EditFrontmatter {
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
    if !draft.draft.body.is_empty() {
        return Err(OperationError::UnexpectedBodyPayload { child_key });
    }
    let Some(fields) = draft.draft.frontmatter.as_ref() else {
        return Err(OperationError::EmptyFrontmatterPayload { child_key });
    };
    if fields.is_empty() {
        return Err(OperationError::EmptyFrontmatterPayload { child_key });
    }
    validate_frontmatter_values(&child_key, fields)?;
    validate_target_and_preimage(changeset_id, child_key, draft, base_snapshot, preimage)?;
    Ok(fields)
}

/// Validate a `Rename` draft (W02.P04): the operation kind, its target-stem
/// payload shape, and the SAME target-fence + preimage checks every operation
/// kind shares. `body` carries no meaning for a rename and must be empty (R1,
/// same discipline as `EditFrontmatter`). Returns the validated new stem so the
/// caller materializes without re-deriving it.
fn validate_rename_draft<'a>(
    changeset_id: &ChangesetId,
    draft: &'a ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<&'a str> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::Rename {
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
    if !draft.draft.body.is_empty() {
        return Err(OperationError::UnexpectedBodyPayload { child_key });
    }
    let Some(new_stem) = draft.draft.new_stem.as_deref() else {
        return Err(OperationError::MissingRenameStem { child_key });
    };
    validate_rename_stem(&child_key, new_stem)?;
    let DocumentRef::Existing {
        stem: current_stem, ..
    } = &draft.target.document
    else {
        return Err(OperationError::UnsupportedTarget { child_key });
    };
    if new_stem == current_stem {
        return Err(OperationError::InvalidRenameStem {
            child_key,
            reason: "must differ from the document's current stem",
        });
    }
    validate_target_and_preimage(changeset_id, child_key, draft, base_snapshot, preimage)?;
    Ok(new_stem)
}

/// A bare, identity-bearing rename target stem: non-empty, no path separator,
/// no leading `-`, no `..` traversal, no `.md` suffix — the SAME grammar the
/// core adapter's own `validate_stem` enforces at the argv boundary, checked
/// here too so a malformed stem fails at draft validation, before a
/// materialized preview or a core invocation is ever built.
fn validate_rename_stem(child_key: &str, stem: &str) -> Result<()> {
    let bad = stem.is_empty()
        || stem.starts_with('-')
        || stem.contains('/')
        || stem.contains('\\')
        || stem.contains("..")
        || stem.ends_with(".md");
    if bad {
        return Err(OperationError::InvalidRenameStem {
            child_key: child_key.to_string(),
            reason: "must be a bare stem (no path separator, no leading `-`, no `..`, no `.md`)",
        });
    }
    Ok(())
}

/// Validate a `CreateDocument` draft (W02.P05): the operation kind and its
/// typed create-params payload — `doc_type`/`feature`/`title` from the target's
/// `ProvisionalCreate` ref. `proposed_stem` (when present) is advisory-only —
/// core's `vault add` accepts no caller-chosen stem; it always derives the
/// filename from its own `{date}-{feature}-{doc_type}.md` convention, so a
/// caller-supplied stem cannot predict what core will actually write and is
/// never required here (the predicted path instead derives from a
/// materialize-time-fixed date; see `materialize_create_document`). Returns
/// the validated params so the caller materializes without re-deriving them.
fn validate_create_document_draft(
    draft: &ChangesetChildOperationDraft,
) -> Result<(&str, &str, &str)> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::CreateDocument {
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
    let DocumentRef::ProvisionalCreate {
        doc_type,
        feature,
        title,
        ..
    } = &draft.target.document
    else {
        return Err(OperationError::UnsupportedCreateTarget { child_key });
    };
    if doc_type.trim().is_empty() {
        return Err(OperationError::MissingCreateParam {
            child_key,
            field: "doc_type",
        });
    }
    if feature.trim().is_empty() {
        return Err(OperationError::MissingCreateParam {
            child_key,
            field: "feature",
        });
    }
    if title.trim().is_empty() {
        return Err(OperationError::MissingCreateParam {
            child_key,
            field: "title",
        });
    }
    Ok((doc_type.as_str(), feature.as_str(), title.as_str()))
}

/// Reject a field value that would corrupt the frontmatter block it lands in: an
/// embedded newline splices a second line into the rewritten preview. Mirrors the
/// core adapter's own flag-injection discipline at the boundary the preview
/// shares with (`date`/`tags`/`related`).
fn validate_frontmatter_values(child_key: &str, fields: &FrontmatterEditFields) -> Result<()> {
    let check = |field: &'static str, value: &str| -> Result<()> {
        if value.contains('\n') || value.contains('\r') {
            return Err(OperationError::InvalidFrontmatterValue {
                child_key: child_key.to_string(),
                field,
            });
        }
        Ok(())
    };
    if let Some(date) = &fields.date {
        check("date", date)?;
    }
    for value in fields.tags.iter().flatten() {
        check("tags", value)?;
    }
    for value in fields.related.iter().flatten() {
        check("related", value)?;
    }
    Ok(())
}

/// The target-revision fence + preimage checks EVERY operation kind shares
/// (existing target, base/current revision match, document identity, snapshot
/// freshness, preimage recovery-identity). Each operation-kind validator checks
/// its own operation-kind + payload-shape constraints first, then converges here.
fn validate_target_and_preimage(
    changeset_id: &ChangesetId,
    child_key: String,
    draft: &ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<()> {
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

/// Build the `EditFrontmatter` whole-document PREVIEW: surgically rewrite only
/// the named fields (`date`/`tags`/`related`) in `text`'s frontmatter block,
/// carrying every other line — the body, every untouched frontmatter field —
/// over byte-for-byte. Mirrors the `SetFrontmatter` core capability's own
/// contract ("edit selected frontmatter fields, keeping the body byte-for-byte");
/// it is a PREVIEW for review/validation/fail-closed post-verify, never the
/// authoritative write (the core adapter performs the real write at apply time).
fn rewrite_frontmatter_fields(
    child_key: &str,
    text: &str,
    fields: &FrontmatterEditFields,
) -> Result<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some((start, close_index)) = frontmatter_block_range(&lines) else {
        return Err(OperationError::MissingFrontmatterBlock {
            child_key: child_key.to_string(),
        });
    };

    let mut fm_lines: Vec<String> = lines[start..close_index]
        .iter()
        .map(|line| (*line).to_string())
        .collect();
    if let Some(value) = &fields.date {
        set_scalar_frontmatter_field(&mut fm_lines, "date", value);
    }
    if let Some(values) = &fields.tags {
        set_list_frontmatter_field(&mut fm_lines, "tags", values);
    }
    if let Some(values) = &fields.related {
        set_list_frontmatter_field(&mut fm_lines, "related", values);
    }

    // The fence lines themselves are carried over VERBATIM (not a hardcoded
    // `"---"`) so a `\r` on a CRLF document's delimiter survives the rewrite —
    // this preview still feeds the human review diff, so line-ending fidelity
    // matters even though it is no longer the apply-time write-verification
    // authority (see `apply::PostVerifyExpectation`).
    let mut rebuilt = Vec::with_capacity(lines.len());
    rebuilt.push(lines[0].to_string());
    rebuilt.extend(fm_lines);
    rebuilt.push(lines[close_index].to_string());
    rebuilt.extend(
        lines[close_index + 1..]
            .iter()
            .map(|line| (*line).to_string()),
    );
    Ok(rebuilt.join("\n"))
}

/// The frontmatter block CONTENT range `[start, close_index)` — `start` is
/// always `1` (the line after the opening `---` fence), `close_index` is the
/// closing fence's own line index. `None` when `text` opens with no `---`
/// fence, or the fence never closes. Shared by the preview rewrite
/// (`rewrite_frontmatter_fields`) and the post-apply semantic read
/// (`frontmatter_fields_match`) so the two never drift on what counts as "the
/// frontmatter block".
fn frontmatter_block_range(lines: &[&str]) -> Option<(usize, usize)> {
    if lines.first().map(|line| line.trim_end_matches('\r')) != Some("---") {
        return None;
    }
    lines
        .iter()
        .enumerate()
        .skip(1)
        .find(|(_, line)| line.trim_end_matches('\r') == "---")
        .map(|(index, _)| (1, index))
}

/// Read the CURRENT frontmatter of `text` and confirm it carries exactly the
/// field values `fields` requests — ONLY the fields present in `fields` are
/// compared; every other field (and the body) is irrelevant. Tolerant of the
/// exact quoting/spacing a core write chooses (unlike the preview's own fixed
/// style): a value core wrote unquoted, single-quoted, or double-quoted all
/// compare equal once unquoted. `false` for a mismatch OR an unreadable/absent
/// frontmatter block — never an error, since this is a boolean semantic check,
/// not a materialization. Used ONLY to VERIFY a core-authoritative write
/// post-apply (`apply::PostVerifyExpectation::FrontmatterFields`) — never to
/// build a preview (that is `rewrite_frontmatter_fields`'s job).
pub(crate) fn frontmatter_fields_match(text: &str, fields: &FrontmatterEditFields) -> bool {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some((start, end)) = frontmatter_block_range(&lines) else {
        return false;
    };
    let fm_lines: Vec<String> = lines[start..end]
        .iter()
        .map(|line| (*line).to_string())
        .collect();
    if let Some(expected) = &fields.date
        && read_scalar_frontmatter_field(&fm_lines, "date").as_ref() != Some(expected)
    {
        return false;
    }
    if let Some(expected) = &fields.tags
        && read_list_frontmatter_field(&fm_lines, "tags").as_ref() != Some(expected)
    {
        return false;
    }
    if let Some(expected) = &fields.related
        && read_list_frontmatter_field(&fm_lines, "related").as_ref() != Some(expected)
    {
        return false;
    }
    true
}

/// Read a scalar frontmatter field's CURRENT value (`key: value`), tolerantly
/// unquoting a single- or double-quoted value. `None` when the key is absent —
/// never assumed empty.
fn read_scalar_frontmatter_field(lines: &[String], key: &str) -> Option<String> {
    let line = lines
        .iter()
        .find(|line| is_frontmatter_field_key(line, key))?;
    let (_, value) = line.trim_end_matches('\r').split_once(':')?;
    Some(unquote_frontmatter_value(value.trim()))
}

/// Read a list frontmatter field's CURRENT items (`key:` + its indented `-
/// item` continuation lines), tolerantly unquoting each item. `None` when the
/// key is absent.
fn read_list_frontmatter_field(lines: &[String], key: &str) -> Option<Vec<String>> {
    let (start, end) = frontmatter_field_block_range(lines, key)?;
    Some(
        lines[start + 1..end]
            .iter()
            .filter_map(|line| {
                line.trim_end_matches('\r')
                    .trim()
                    .strip_prefix("- ")
                    .map(|item| unquote_frontmatter_value(item.trim()))
            })
            .collect(),
    )
}

/// Strip one layer of matching quotes (`'...'` or `"..."`) from a raw YAML
/// scalar, unescaping a doubled quote of the same kind (the encoding
/// `set_scalar_frontmatter_field`/`set_list_frontmatter_field` use, and a valid
/// core-written encoding too). A bare, unquoted value is returned unchanged.
fn unquote_frontmatter_value(raw: &str) -> String {
    if raw.len() >= 2 && raw.starts_with('\'') && raw.ends_with('\'') {
        raw[1..raw.len() - 1].replace("''", "'")
    } else if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        raw[1..raw.len() - 1].replace("\"\"", "\"")
    } else {
        raw.to_string()
    }
}

/// Replace (or append) a scalar frontmatter field's line, quoting the value the
/// same way the vault's own scaffolded frontmatter quotes dates (`date: 'value'`).
/// A single-quote in `value` is YAML-escaped (doubled) so the rewritten line
/// stays valid YAML.
fn set_scalar_frontmatter_field(lines: &mut Vec<String>, key: &str, value: &str) {
    let escaped = value.replace('\'', "''");
    let line = format!("{key}: '{escaped}'");
    match lines
        .iter()
        .position(|line| is_frontmatter_field_key(line, key))
    {
        Some(index) => lines[index] = line,
        None => lines.push(line),
    }
}

/// Replace (or append) a list frontmatter field's block (`key:` + its indented
/// `- 'item'` continuation lines), quoting each item the same way the vault's
/// own scaffolded frontmatter quotes list entries.
fn set_list_frontmatter_field(lines: &mut Vec<String>, key: &str, values: &[String]) {
    let mut block = vec![format!("{key}:")];
    block.extend(
        values
            .iter()
            .map(|value| format!("  - '{}'", value.replace('\'', "''"))),
    );
    match frontmatter_field_block_range(lines, key) {
        Some((start, end)) => {
            lines.splice(start..end, block);
        }
        None => lines.extend(block),
    }
}

/// True when `line` is the top-level `key:` field header — a bare key at column
/// zero, never an indented continuation line (which belongs to a DIFFERENT key's
/// block, never this one's).
fn is_frontmatter_field_key(line: &str, key: &str) -> bool {
    let trimmed = line.trim_end_matches('\r');
    if trimmed.starts_with([' ', '\t']) {
        return false;
    }
    matches!(trimmed.split_once(':'), Some((found, _)) if found == key)
}

/// The `[start, end)` line range of `key`'s block: its header line plus every
/// following indented continuation line, or `None` when the key is absent.
fn frontmatter_field_block_range(lines: &[String], key: &str) -> Option<(usize, usize)> {
    let start = lines
        .iter()
        .position(|line| is_frontmatter_field_key(line, key))?;
    let mut end = start + 1;
    while end < lines.len() && lines[end].starts_with([' ', '\t']) && !lines[end].trim().is_empty()
    {
        end += 1;
    }
    Some((start, end))
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
    use crate::authoring::model::ProvisionalCollisionStatus;
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
                frontmatter: None,
                new_stem: None,
            },
        }
    }

    fn frontmatter_draft_for(
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
            },
        }
    }

    fn rename_draft_for(document: DocumentRef, new_stem: &str) -> ChangesetChildOperationDraft {
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
                frontmatter: None,
                new_stem: None,
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

    // --- W02.P03: EditFrontmatter validation + materialization -------------

    #[test]
    fn edit_frontmatter_materializes_a_whole_document_preview_with_only_named_fields_changed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n  - '#operation-plan'\ndate: '2026-01-01'\nrelated:\n  - '[[old-link]]'\n---\n\n# body\n\nunchanged prose\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = frontmatter_draft_for(
            snapshot.document.clone(),
            FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: Some(vec!["[[new-link]]".to_string()]),
            },
        );

        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert_eq!(
            materialized.operation,
            ChangesetOperationKind::EditFrontmatter
        );
        let preview = &materialized.target_snapshot.payload_text;
        assert!(
            preview.contains("date: '2026-02-06'"),
            "the named date field is rewritten: {preview}"
        );
        assert!(
            preview.contains("related:\n  - '[[new-link]]'"),
            "the named related field is rewritten: {preview}"
        );
        assert!(
            preview.contains("tags:\n  - '#plan'\n  - '#operation-plan'"),
            "an untouched field is carried over byte-for-byte: {preview}"
        );
        assert!(
            preview.ends_with("# body\n\nunchanged prose\n"),
            "the body is carried over byte-for-byte: {preview}"
        );
        assert!(
            materialized.review_diff.changed,
            "a frontmatter edit produces a non-empty review diff"
        );
        assert_eq!(
            materialized.frontmatter_edit,
            Some(FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: Some(vec!["[[new-link]]".to_string()]),
            }),
            "the field-level payload threads through for apply-time invocation-building"
        );
    }

    #[test]
    fn edit_frontmatter_inserts_a_field_absent_from_the_base_document() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = frontmatter_draft_for(
            snapshot.document.clone(),
            FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: None,
            },
        );

        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert!(
            materialized
                .target_snapshot
                .payload_text
                .contains("date: '2026-02-06'"),
            "an absent field is appended to the frontmatter block: {}",
            materialized.target_snapshot.payload_text
        );
    }

    #[test]
    fn edit_frontmatter_rejects_a_replace_body_draft_shape() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedOperationKind {
                operation: ChangesetOperationKind::ReplaceBody,
                ..
            }
        ));
    }

    #[test]
    fn edit_frontmatter_rejects_a_non_empty_body_payload() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let mut draft = frontmatter_draft_for(
            snapshot.document.clone(),
            FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: None,
            },
        );
        draft.draft.body = "unexpected body text".to_string();

        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::UnexpectedBodyPayload { .. }));
    }

    #[test]
    fn edit_frontmatter_rejects_an_absent_or_empty_field_payload() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);

        let mut no_payload =
            frontmatter_draft_for(snapshot.document.clone(), FrontmatterEditFields::default());
        no_payload.draft.frontmatter = None;
        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            no_payload,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::EmptyFrontmatterPayload { .. }
        ));

        let empty_payload =
            frontmatter_draft_for(snapshot.document.clone(), FrontmatterEditFields::default());
        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            empty_payload,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::EmptyFrontmatterPayload { .. }
        ));
    }

    #[test]
    fn edit_frontmatter_rejects_a_newline_embedded_in_a_field_value() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = frontmatter_draft_for(
            snapshot.document.clone(),
            FrontmatterEditFields {
                date: Some("2026-02-06\ninjected: true".to_string()),
                tags: None,
                related: None,
            },
        );

        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::InvalidFrontmatterValue { field: "date", .. }
        ));
    }

    #[test]
    fn edit_frontmatter_rejects_a_document_with_no_frontmatter_block() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "# no frontmatter here\n",
        );
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = frontmatter_draft_for(
            snapshot.document.clone(),
            FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: None,
            },
        );

        let err = MaterializedProposalOperation::materialize_edit_frontmatter(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::MissingFrontmatterBlock { .. }
        ));
    }

    #[test]
    fn section_and_destructive_kinds_are_deferred_from_edit_frontmatter_materialization() {
        // EditFrontmatter's own materializer accepts only its own kind, exactly as
        // materialize_replace_body accepts only ReplaceBody (`W03.P13` subset).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/operation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nbody\n",
        );
        let snapshot = base_snapshot(root);

        for operation in [
            ChangesetOperationKind::SectionEdit,
            ChangesetOperationKind::Archive,
            ChangesetOperationKind::Unarchive,
            ChangesetOperationKind::Rename,
            ChangesetOperationKind::Link,
            ChangesetOperationKind::CreateDocument,
        ] {
            let draft = draft_for(
                snapshot.document.clone(),
                operation,
                DraftMode::WholeDocument,
                "after\n",
            );
            let preimage = preimage_record(root);
            let err = MaterializedProposalOperation::materialize_edit_frontmatter(
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

    // --- W02.P04: Rename validation + materialization ----------------------

    #[test]
    fn rename_materializes_an_unchanged_content_preview_carrying_the_new_stem() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "unchanged body\n");
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = rename_draft_for(snapshot.document.clone(), "operation-plan-renamed");

        let materialized = MaterializedProposalOperation::materialize_rename(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();

        assert_eq!(materialized.operation, ChangesetOperationKind::Rename);
        assert_eq!(
            materialized.target_snapshot.payload_text, "unchanged body\n",
            "a rename touches identity, never content"
        );
        assert!(
            !materialized.review_diff.changed,
            "a rename's review diff is trivially empty (no content delta)"
        );
        assert_eq!(
            materialized.rename_edit.as_deref(),
            Some("operation-plan-renamed"),
            "the target stem threads through for apply-time invocation-building"
        );
    }

    #[test]
    fn rename_rejects_a_replace_body_draft_shape() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let draft = draft_for(
            snapshot.document.clone(),
            ChangesetOperationKind::ReplaceBody,
            DraftMode::WholeDocument,
            "after\n",
        );

        let err = MaterializedProposalOperation::materialize_rename(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedOperationKind {
                operation: ChangesetOperationKind::ReplaceBody,
                ..
            }
        ));
    }

    #[test]
    fn rename_rejects_a_non_empty_body_payload() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let mut draft = rename_draft_for(snapshot.document.clone(), "operation-plan-renamed");
        draft.draft.body = "unexpected body text".to_string();

        let err = MaterializedProposalOperation::materialize_rename(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::UnexpectedBodyPayload { .. }));
    }

    #[test]
    fn rename_rejects_a_missing_target_stem() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let snapshot = base_snapshot(root);
        let preimage = preimage_record(root);
        let mut draft = rename_draft_for(snapshot.document.clone(), "operation-plan-renamed");
        draft.draft.new_stem = None;

        let err = MaterializedProposalOperation::materialize_rename(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap_err();
        assert!(matches!(err, OperationError::MissingRenameStem { .. }));
    }

    #[test]
    fn rename_rejects_a_malformed_or_self_target_stem() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let snapshot = base_snapshot(root);

        for bad_stem in [
            "",
            "-leading-dash",
            "has/slash",
            "has\\backslash",
            "has..dots",
            "trailing.md",
            "operation-plan", // same as the current stem: a no-op, not a rename
        ] {
            let preimage = preimage_record(root);
            let draft = rename_draft_for(snapshot.document.clone(), bad_stem);
            let err = MaterializedProposalOperation::materialize_rename(
                &changeset_id(),
                draft,
                &snapshot,
                &preimage,
            )
            .unwrap_err();
            assert!(
                matches!(err, OperationError::InvalidRenameStem { .. }),
                "stem `{bad_stem}` should be rejected, got {err:?}"
            );
        }
    }

    #[test]
    fn section_and_destructive_kinds_are_deferred_from_rename_materialization() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let snapshot = base_snapshot(root);

        for operation in [
            ChangesetOperationKind::SectionEdit,
            ChangesetOperationKind::Archive,
            ChangesetOperationKind::Unarchive,
            ChangesetOperationKind::ReplaceBody,
            ChangesetOperationKind::Link,
            ChangesetOperationKind::EditFrontmatter,
            ChangesetOperationKind::CreateDocument,
        ] {
            let draft = draft_for(
                snapshot.document.clone(),
                operation,
                DraftMode::WholeDocument,
                "after\n",
            );
            let preimage = preimage_record(root);
            let err = MaterializedProposalOperation::materialize_rename(
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

    // --- W02.P05: CreateDocument validation + materialization --------------

    const CREATE_FIXED_CREATED_AT_MS: i64 = 1_768_435_200_000; // 2026-01-15T00:00:00Z
    const CREATE_FIXED_DATE: &str = "2026-01-15";

    fn provisional_document(doc_type: &str, feature: &str, title: &str) -> DocumentRef {
        DocumentRef::ProvisionalCreate {
            provisional_doc_id: "provisional_1".to_string(),
            doc_type: doc_type.to_string(),
            feature: feature.to_string(),
            title: title.to_string(),
            collision_status: ProvisionalCollisionStatus::Unknown,
            proposed_stem: None,
        }
    }

    fn create_draft_for(document: DocumentRef, body: &str) -> ChangesetChildOperationDraft {
        ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::CreateDocument,
            target: TargetRevisionFence {
                document,
                base_revision: None,
                current_revision: None,
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: body.to_string(),
                frontmatter: None,
                new_stem: None,
            },
        }
    }

    #[test]
    fn create_document_materializes_a_deterministic_predicted_path_from_a_phantom_base() {
        let draft = create_draft_for(
            provisional_document("plan", "operation-plan-feature", "A New Plan"),
            "preview body\n",
        );
        let materialized = MaterializedProposalOperation::materialize_create_document(
            &changeset_id(),
            draft,
            CREATE_FIXED_CREATED_AT_MS,
        )
        .unwrap();

        assert_eq!(
            materialized.operation,
            ChangesetOperationKind::CreateDocument
        );
        assert_eq!(
            materialized.create_document_date.as_deref(),
            Some(CREATE_FIXED_DATE),
            "the date is fixed at materialize time, not recomputed at apply/reclaim time"
        );
        let empty_hash = blob_oid(b"");
        assert_eq!(
            materialized.base.blob_hash, empty_hash,
            "the phantom base is an explicit 'diff from nothing', never a real prior state"
        );
        assert_eq!(materialized.preimage.payload_hash, empty_hash);
        assert_eq!(materialized.preimage.payload_bytes, 0);
        assert_eq!(
            materialized.target_snapshot.payload_text, "preview body\n",
            "the preview text is the draft body, carried for review only — never sent to core"
        );
        assert!(
            materialized.review_diff.changed,
            "a non-empty preview against the phantom empty base is a real (preview-only) diff"
        );
        assert!(materialized.frontmatter_edit.is_none());
        assert!(materialized.rename_edit.is_none());
    }

    #[test]
    fn create_document_rejects_a_non_provisional_target() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/operation-plan.md", "body\n");
        let existing = resolved_doc(root);
        let draft = create_draft_for(existing, "preview\n");

        let err = MaterializedProposalOperation::materialize_create_document(
            &changeset_id(),
            draft,
            CREATE_FIXED_CREATED_AT_MS,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedCreateTarget { .. }
        ));
    }

    #[test]
    fn create_document_rejects_a_rename_draft_shape() {
        let draft = ChangesetChildOperationDraft {
            operation: ChangesetOperationKind::Rename,
            ..create_draft_for(
                provisional_document("plan", "operation-plan-feature", "A New Plan"),
                "preview\n",
            )
        };

        let err = MaterializedProposalOperation::materialize_create_document(
            &changeset_id(),
            draft,
            CREATE_FIXED_CREATED_AT_MS,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            OperationError::UnsupportedOperationKind {
                operation: ChangesetOperationKind::Rename,
                ..
            }
        ));
    }

    #[test]
    fn create_document_rejects_missing_create_params() {
        for (doc_type, feature, title, expected_field) in [
            ("", "operation-plan-feature", "A New Plan", "doc_type"),
            ("plan", "", "A New Plan", "feature"),
            ("plan", "operation-plan-feature", "", "title"),
        ] {
            let draft =
                create_draft_for(provisional_document(doc_type, feature, title), "preview\n");
            let err = MaterializedProposalOperation::materialize_create_document(
                &changeset_id(),
                draft,
                CREATE_FIXED_CREATED_AT_MS,
            )
            .unwrap_err();
            assert!(
                matches!(
                    &err,
                    OperationError::MissingCreateParam { field, .. } if *field == expected_field
                ),
                "expected a MissingCreateParam(`{expected_field}`), got {err:?}"
            );
        }
    }

    #[test]
    fn create_document_materialization_passes_the_shared_validation_cross_checks() {
        // The phantom base/preimage are internally self-consistent enough that
        // `validate_changeset_material`'s cross-checks (base/preimage/target
        // agreement) pass honestly — they never claim a real prior state
        // existed, but every field they DO assert against each other lines up.
        use crate::authoring::validation::{
            CurrentRevisionObservation, validate_changeset_material,
        };

        let document = provisional_document("plan", "operation-plan-feature", "A New Plan");
        let draft = create_draft_for(document.clone(), "preview\n");
        let materialized = MaterializedProposalOperation::materialize_create_document(
            &changeset_id(),
            draft,
            CREATE_FIXED_CREATED_AT_MS,
        )
        .unwrap();

        let empty_hash = blob_oid(b"");
        let phantom_revision = RevisionToken::new(format!("blob:{empty_hash}")).unwrap();
        let observation = CurrentRevisionObservation {
            child_key: "child_1".to_string(),
            document,
            revision: phantom_revision,
            blob_hash: empty_hash,
        };
        let record = validate_changeset_material(
            std::slice::from_ref(&materialized),
            &[observation],
            &[],
            6,
        )
        .unwrap();
        assert!(
            record.approval_ready,
            "a well-formed CreateDocument draft must be approval-ready: {:?}",
            record.status
        );
    }
}
