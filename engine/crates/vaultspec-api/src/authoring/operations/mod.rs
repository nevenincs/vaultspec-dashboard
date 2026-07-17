//! Proposal operation payload and preview primitives.
//!
//! W03.P13 is intentionally a whole-document subset for the walking skeleton:
//! existing-document `replace_body` drafts become materialized target snapshots
//! plus review diffs. Section-scoped and atomic-hunk operations are deferred.

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, FrontmatterEditFields,
    PlanStepEdit, TargetRevisionFence,
};
use super::model::{ChangesetId, DocumentRef, RevisionToken};
use super::sections::{SectionResolveError, SectionSelector, resolve_section};
use super::snapshots::{
    PreimageRecord, RevisionMetadata, RevisionSnapshot, SnapshotError, TargetSnapshot,
};

mod frontmatter;
pub(crate) use frontmatter::frontmatter_fields_match;
mod diff;
use diff::{bounded_lines_with_endings, build_diff_hunks, truncation};
use frontmatter::rewrite_frontmatter_fields;

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
    #[error("operation `{child_key}` section edit requires a selector payload")]
    MissingSectionSelector { child_key: String },
    #[error(
        "operation `{child_key}` must not carry a section selector (field-level payload only \
         for section_edit)"
    )]
    UnexpectedSectionSelector { child_key: String },
    #[error("operation `{child_key}` section selector: {source}")]
    SectionSelectorUnresolved {
        child_key: String,
        #[source]
        source: SectionResolveError,
    },
    #[error("operation `{child_key}` plan step set-state requires a plan-step payload")]
    MissingPlanStepEdit { child_key: String },
    #[error("operation `{child_key}` plan step id is invalid: {reason}")]
    InvalidPlanStepId {
        child_key: String,
        reason: &'static str,
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
    /// The selector + selected-preimage/new-content payload a `SectionEdit`
    /// apply/rollback carries through (section-scoped-operations ADR): the
    /// selector resolved at materialize time, the resolved section's PRE-edit
    /// bytes (distinct from the whole-document `preimage` capture above), and
    /// the NEW section bytes the draft spliced in. `None` for every other
    /// operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section_edit: Option<SectionEditPayload>,
    /// The step id + desired state a `SetPlanStepState` apply carries through to
    /// the `check` / `uncheck` plan CLI verb (authoring-surface ADR D1) — the
    /// SAME `PlanStepEdit` the draft supplied, threaded through the ledger so
    /// apply-time invocation-building and the core-authoritative post-verify
    /// both read it from the durable materialized operation, never re-derive it.
    /// `None` for every other operation kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_step_edit: Option<PlanStepEdit>,
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
        let (empty_hash, phantom_revision) = create_document_phantom_base();
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

    /// Materialize a `SectionEdit` draft (section-scoped-operations ADR):
    /// resolve the selector's structural anchor against the base body — exact
    /// or a typed conflict, never a fuzzy patch — capture the resolved bytes
    /// as the SELECTED preimage, and splice the draft's `body` (the new
    /// section content) into the resolved range to build the whole-document
    /// preview. Materialization is WHOLE-DOCUMENT under the hood (the write
    /// reuses `SetBody`, exactly like `ReplaceBody`): section granularity
    /// lives in the selector, the selected preimage, and the review diff, not
    /// in a separate core write path.
    pub fn materialize_section_edit(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        let (selector, resolved) =
            validate_section_edit_draft(changeset_id, &draft, base_snapshot, preimage)?;
        let selector = selector.clone();
        let new_content = draft.draft.body.clone();
        let target_text = format!(
            "{}{}{}",
            &base_snapshot.text[..resolved.content_start],
            new_content,
            &base_snapshot.text[resolved.content_end..],
        );
        let section_edit = SectionEditPayload {
            selector,
            selected_preimage: resolved.content,
            new_content,
        };
        finish_materialization(
            changeset_id,
            draft,
            base_snapshot,
            preimage,
            target_text,
            OperationKindExtras {
                section_edit: Some(section_edit),
                ..Default::default()
            },
        )
    }

    /// Materialize a `SetPlanStepState` draft (authoring-surface ADR D1): like
    /// `materialize_rename`, the preview text is the base text UNCHANGED — a
    /// plan tick is CORE-AUTHORITATIVE over the resulting bytes (the `check` /
    /// `uncheck` verb flips the checkbox glyph, refreshes the `modified` stamp,
    /// and may recompute display paths — none of which this engine predicts
    /// byte-for-byte), so there is nothing to diff and the review diff is
    /// trivially empty. The reviewable change is the step id + desired state
    /// carried in `plan_step_edit`. The base snapshot + preimage still exist
    /// (unlike `CreateDocument`) because the plan IS an existing document, and
    /// the shared preimage/base-revision fence and `validate_frontmatter` pass
    /// run over every materialized operation regardless of kind — the plan
    /// document has real frontmatter and a real base.
    ///
    /// The whole-document preimage is captured (as for every kind) but is
    /// DELIBERATELY NEVER CONSUMED: a plan tick has no V1 rollback inverse (a
    /// check/uncheck inverse is a named follow-on). `create_rollback_eligibility`
    /// refuses a `SetPlanStepState` source with `rollback_unavailable: ... no V1
    /// inverse`, so `apply`/`rollback` never route a plan tick through the
    /// whole-document preimage-restore path — the capture is inert bookkeeping,
    /// not a usable restore payload, until the inverse lands.
    pub fn materialize_set_plan_step_state(
        changeset_id: &ChangesetId,
        draft: ChangesetChildOperationDraft,
        base_snapshot: &RevisionSnapshot,
        preimage: &PreimageRecord,
    ) -> Result<Self> {
        let plan_step =
            validate_set_plan_step_state_draft(changeset_id, &draft, base_snapshot, preimage)?
                .clone();
        let target_text = base_snapshot.text.clone();
        finish_materialization(
            changeset_id,
            draft,
            base_snapshot,
            preimage,
            target_text,
            OperationKindExtras {
                plan_step_edit: Some(plan_step),
                ..Default::default()
            },
        )
    }
}

/// The `SectionEdit` field-level payload a materialized operation carries
/// through to apply and rollback (section-scoped-operations ADR): the
/// resolved selector, the resolved section's PRE-edit bytes (the "selected
/// preimage" — distinct from the whole-document preimage every kind
/// captures), and the NEW section bytes the draft spliced in. Rollback uses
/// `new_content` to build the FRESH selector its inverse re-resolves against
/// (expecting to find exactly what this edit produced), then splices
/// `selected_preimage` back in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SectionEditPayload {
    pub selector: SectionSelector,
    pub selected_preimage: String,
    pub new_content: String,
}

/// The phantom "diff from nothing" base a `CreateDocument` draft materializes
/// and validates against: the git-style empty-blob hash and its matching
/// revision token. Neither claims a real prior state existed — it is an
/// in-memory-only sentinel, never persisted. `materialize_create_document`
/// (the materialize-time phantom base/preimage) and `proposal::
/// validation_evidence` (the validate-time phantom observation) BOTH call
/// this ONE helper rather than each deriving it inline, so the two stay in
/// agreement BY CONSTRUCTION — a future change to one can never silently
/// desync from the other (the exact propose/apply-mismatch class the P05a/
/// P06 reviews flagged).
pub(crate) fn create_document_phantom_base() -> (String, RevisionToken) {
    let empty_hash = blob_oid(b"");
    let phantom_revision = RevisionToken::new(format!("blob:{empty_hash}"))
        .expect("an empty-blob revision token is always a valid RevisionToken");
    (empty_hash, phantom_revision)
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
    section_edit: Option<SectionEditPayload>,
    plan_step_edit: Option<PlanStepEdit>,
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
        section_edit,
        plan_step_edit,
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
        section_edit,
        plan_step_edit,
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
    if draft.draft.section_selector.is_some() {
        return Err(OperationError::UnexpectedSectionSelector { child_key });
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
    if draft.draft.section_selector.is_some() {
        return Err(OperationError::UnexpectedSectionSelector { child_key });
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
    if draft.draft.section_selector.is_some() {
        return Err(OperationError::UnexpectedSectionSelector { child_key });
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
    if draft.draft.section_selector.is_some() {
        return Err(OperationError::UnexpectedSectionSelector { child_key });
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

/// Validate a `SectionEdit` draft (section-scoped-operations ADR): the
/// operation kind, its selector payload shape, and the SAME target-fence +
/// preimage checks every operation kind shares — then resolve the selector's
/// structural anchor against the base body. Resolution is exact-or-conflict
/// (missing anchor, ambiguous anchor, or a content-hash mismatch all fail
/// closed with typed evidence — see [`super::sections::SectionResolveError`]),
/// so a malformed or stale selector is refused here, at draft-validation
/// time, before a materialized preview is ever built. Returns the validated
/// selector and its resolution so the caller materializes without
/// re-resolving.
fn validate_section_edit_draft<'a>(
    changeset_id: &ChangesetId,
    draft: &'a ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<(&'a SectionSelector, super::sections::ResolvedSection)> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::SectionEdit {
        return Err(OperationError::UnsupportedOperationKind {
            child_key,
            operation: draft.operation,
        });
    }
    if draft.draft.mode != DraftMode::SectionScoped {
        return Err(OperationError::UnsupportedDraftMode {
            child_key,
            mode: draft.draft.mode,
        });
    }
    let Some(selector) = draft.draft.section_selector.as_ref() else {
        return Err(OperationError::MissingSectionSelector { child_key });
    };
    validate_target_and_preimage(
        changeset_id,
        child_key.clone(),
        draft,
        base_snapshot,
        preimage,
    )?;
    let resolved = resolve_section(&base_snapshot.text, selector)
        .map_err(|source| OperationError::SectionSelectorUnresolved { child_key, source })?;
    Ok((selector, resolved))
}

/// Validate a `SetPlanStepState` draft (authoring-surface ADR D1): the
/// operation kind, its plan-step payload shape, and the SAME target-fence +
/// preimage checks every operation kind shares. `body` carries no meaning for a
/// plan tick and must be empty (R1, same discipline as `Rename`); the step id
/// must be canonical (`S##`), rejected here at draft-validation time so a
/// malformed id fails before a materialized preview or a core invocation is
/// ever built (mirroring how `validate_rename_stem` guards the rename stem).
/// Returns the validated payload so the caller materializes without re-deriving
/// it.
fn validate_set_plan_step_state_draft<'a>(
    changeset_id: &ChangesetId,
    draft: &'a ChangesetChildOperationDraft,
    base_snapshot: &RevisionSnapshot,
    preimage: &PreimageRecord,
) -> Result<&'a PlanStepEdit> {
    if draft.child_key.trim().is_empty() {
        return Err(OperationError::EmptyChildKey);
    }
    let child_key = draft.child_key.clone();
    if draft.operation != ChangesetOperationKind::SetPlanStepState {
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
    if draft.draft.section_selector.is_some() {
        return Err(OperationError::UnexpectedSectionSelector { child_key });
    }
    let Some(plan_step) = draft.draft.plan_step.as_ref() else {
        return Err(OperationError::MissingPlanStepEdit { child_key });
    };
    validate_plan_step_id(&child_key, &plan_step.step_id)?;
    validate_target_and_preimage(changeset_id, child_key, draft, base_snapshot, preimage)?;
    Ok(plan_step)
}

/// A canonical plan step id (`S##`): `S` followed by one or more ASCII digits —
/// the SAME grammar the core adapter's own `validate_step_id` enforces at the
/// argv boundary, checked here too so a malformed id fails at draft validation.
fn validate_plan_step_id(child_key: &str, step_id: &str) -> Result<()> {
    let ok = step_id.len() >= 2
        && step_id.starts_with('S')
        && step_id[1..].bytes().all(|b| b.is_ascii_digit());
    if !ok {
        return Err(OperationError::InvalidPlanStepId {
            child_key: child_key.to_string(),
            reason: "must be a canonical step id (`S` followed by digits, e.g. `S01`)",
        });
    }
    Ok(())
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

#[cfg(test)]
mod tests;
