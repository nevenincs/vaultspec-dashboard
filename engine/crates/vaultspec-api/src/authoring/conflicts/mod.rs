//! Base-revision conflict detection (W13.P27).
//!
//! This module is the pure, backend-served DETECTOR for the conflict states the
//! concurrency-leases-conflicts ADR names as first-class: a proposal whose recorded
//! base is behind the current document, two live proposals whose edits overlap, a
//! target whose identity drifted, and a lease-protected collision. It is ADDITIVE to
//! (never a replacement for) the existing base-revision fence: `operations.rs` and
//! `validation.rs` already reject a stale base at materialization / validation time,
//! and `projections.rs::child_target_conflict` surfaces the FIRST stale child for the
//! review view. This detector GENERALIZES that single-child check across EVERY child
//! and adds the richer cross-proposal / identity / lease reasons — "your base is
//! behind, and here is exactly why" — as a deterministic, reviewable report.
//!
//! DENIALS ARE VALUES (api-contract ADR): a conflict is a served [`ConflictReport`]
//! value, never an `Err`. The detector returns a report even when the corpus is
//! perfectly clean (an empty `findings` set, `has_conflict = false`). Detection is a
//! read-time computation over already-durable inputs, so it holds no state and needs
//! no migration.
//!
//! INPUT DISCIPLINE (leases-never-replace-revision-checks; matches P26's "land the
//! engine, defer the wiring"): the detector reads CURRENT document state directly from
//! the worktree (a filesystem read through [`DocumentResolver`] / [`SnapshotReader`],
//! never SQLite), exactly as `child_target_conflict` does. Everything sourced from the
//! durable store — the live sibling changesets and the held advisory leases — is
//! CALLER-ASSEMBLED and passed in, so this module owns no store handle. Surfacing the
//! report through the projection / route layer is a LATER phase; this phase lands the
//! detector and its tests only.
#![allow(dead_code)]

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::api::ChangesetOperationKind;
use super::documents::{DocumentResolveError, DocumentResolver, ExistingDocumentLookup};
use super::leases::LeaseRecord;
use super::ledger::{ChangesetAggregateRecord, ChangesetChildOperationRecord};
use super::model::{ActorRef, ChangesetId, DocumentRef, RevisionToken};
use super::modes::scope_id_for_worktree;
use super::operations::ReviewDiffHunk;
use super::policy::{RiskClass, operation_risk};
use super::sections::resolve_section;
use super::snapshots::SnapshotReader;

/// The bounded corpus of candidate sibling proposals a conflict scan reads for overlap
/// detection (resource-bounds: a hard cap at the call site). A store past this is scanned
/// only up to the cap; overlap beyond it is deferred, never silently unbounded.
pub const MAX_CONFLICT_SIBLINGS: u32 = 256;

/// The bounded page of held advisory leases a conflict serve reads for policy-collision
/// detection (resource-bounds). The lease table holds one row per scope, so this is
/// inherently bounded by the leased-scope count.
pub const MAX_CONFLICT_HELD_LEASES: u32 = 512;

/// The class of a detected base-revision conflict. Each variant is a DISTINCT reason a
/// proposal's base is no longer safe to apply, surfaced as a served value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictKind {
    /// The recorded base revision of an existing target no longer matches the current
    /// worktree revision (an out-of-band edit landed since the proposal was drafted).
    StaleBaseRevision,
    /// A whole-document `replace_body` draft's recorded base no longer matches the
    /// current worktree document. Materially the same base fence as
    /// [`ConflictKind::StaleBaseRevision`], but reported distinctly because the whole
    /// draft — not a partial hunk — is invalidated and must be regenerated or rebased.
    StaleWholeDocumentDraft,
    /// This proposal and a DIFFERENT live proposal both edit the same target document
    /// over intersecting base line ranges — applying one strands the other's base.
    OverlappingHunks,
    /// The target's document IDENTITY drifted: re-resolving its node id yields a
    /// different path/stem, or no longer resolves at all (renamed / moved / removed
    /// since review). Distinct from content staleness — the anchor itself moved.
    AnchorDrift,
    /// The target is held by a DIFFERENT actor's active advisory lease for
    /// collision-prone (destructive or whole-document) work. The lease never bypasses
    /// the revision floor; this surfaces the coordination collision the ADR's advisory
    /// leases exist to reduce.
    PolicyConflict,
    /// A `Rename` child's PROPOSED target stem already resolves to a different
    /// document (W02.P04) — a rename-specific collision distinct from every base/
    /// identity finding above, since it is about the DESTINATION, not the source.
    RenameTargetCollision,
    /// A `CreateDocument` child's DETERMINISTIC predicted path (`create_document_date`
    /// combined with `feature` and `doc_type`, fixed at materialize time — W02.P05)
    /// already resolves to a document in the current worktree, OR a DIFFERENT live
    /// sibling changeset's `CreateDocument` child predicts the SAME path. Either way,
    /// core's `vault add` (which this apply invocation never passes `--force` to) can
    /// land at most ONE of them — surfaced proactively here rather than left to a bare
    /// apply-time refusal.
    CreateDocumentPathCollision,
    /// A `SectionEdit` child's recorded selector no longer resolves against the
    /// current worktree body — the FINER diagnostic (section-scoped-operations ADR)
    /// for the specific case where the out-of-band edit that staled the base landed
    /// INSIDE the targeted section. Never new leniency: any other base drift still
    /// reports the generic [`Self::StaleWholeDocumentDraft`], and apply refuses
    /// either way.
    SectionSelectorUnresolved,
}

impl ConflictKind {
    /// A stable ordinal for deterministic report ordering (S135). The numeric value is
    /// an internal sort key only; the served representation is the snake_case name.
    fn order_key(self) -> u8 {
        match self {
            Self::StaleBaseRevision => 0,
            Self::StaleWholeDocumentDraft => 1,
            Self::OverlappingHunks => 2,
            Self::AnchorDrift => 3,
            Self::PolicyConflict => 4,
            Self::RenameTargetCollision => 5,
            Self::CreateDocumentPathCollision => 6,
            Self::SectionSelectorUnresolved => 7,
        }
    }
}

/// One detected conflict against a single child operation, with the target-specific
/// evidence a reviewer needs. Optional fields carry only the evidence relevant to the
/// [`ConflictKind`] (revisions for a stale base, paths for anchor drift, the
/// conflicting proposal for an overlap, the lease holder for a policy conflict).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConflictFinding {
    pub child_key: String,
    pub kind: ConflictKind,
    pub reason: String,
    pub document: DocumentRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_base_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recorded_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicting_changeset_id: Option<ChangesetId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicting_child_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_holder: Option<ActorRef>,
}

/// The deterministic, backend-served conflict report for one changeset: every detected
/// conflict plus the derived `has_conflict` flag the review view renders directly. An
/// empty report (`has_conflict = false`) is the honest "your base is current" value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConflictReport {
    pub changeset_id: ChangesetId,
    pub has_conflict: bool,
    pub findings: Vec<ConflictFinding>,
}

impl ConflictReport {
    /// Build a report, deriving `has_conflict` from the findings (the flag can never
    /// desync from the set) and sorting the findings into a stable order so the served
    /// value is deterministic regardless of detection order (S135).
    fn new(changeset_id: ChangesetId, mut findings: Vec<ConflictFinding>) -> Self {
        findings.sort_by(|left, right| {
            left.child_key
                .cmp(&right.child_key)
                .then_with(|| left.kind.order_key().cmp(&right.kind.order_key()))
                .then_with(|| conflicting_key(left).cmp(&conflicting_key(right)))
        });
        Self {
            changeset_id,
            has_conflict: !findings.is_empty(),
            findings,
        }
    }

    pub fn has_conflict(&self) -> bool {
        self.has_conflict
    }

    /// The findings of one kind, in stable order.
    pub fn findings_of(&self, kind: ConflictKind) -> impl Iterator<Item = &ConflictFinding> {
        self.findings
            .iter()
            .filter(move |finding| finding.kind == kind)
    }
}

/// The document-scoped advisory-lease scope convention. Worktree-level leases
/// (`scope_id_for_worktree`) are too coarse for a per-document collision, so a
/// document lease keys on the worktree scope plus the document node id. This is the
/// single source of the convention: the acquire-route wiring (a LATER phase) MUST
/// derive the same scope id here so a lease acquired for a document and the conflict
/// detector that reads it agree.
pub fn document_lease_scope(worktree_root: &Path, node_id: &str) -> String {
    format!("{}::{}", scope_id_for_worktree(worktree_root), node_id)
}

/// Detect every base-revision conflict for `changeset`, returning a deterministic
/// served report. Additive to the base-revision fence: it never mutates, never fails
/// on a conflict, and reads current worktree state directly while taking the durable
/// `live_siblings` (for overlap) and `held_leases` (for policy collisions) as
/// caller-assembled inputs. `now_ms` gates lease activeness.
pub fn detect_conflicts(
    worktree_root: &Path,
    changeset: &ChangesetAggregateRecord,
    live_siblings: &[ChangesetAggregateRecord],
    held_leases: &[LeaseRecord],
    now_ms: i64,
) -> ConflictReport {
    let resolver = DocumentResolver::for_worktree(worktree_root);
    let mut findings = Vec::new();

    for child in &changeset.children {
        detect_child_base_and_anchor(worktree_root, &resolver, child, &mut findings);
        detect_child_policy_conflict(
            worktree_root,
            changeset,
            child,
            held_leases,
            now_ms,
            &mut findings,
        );
        detect_child_rename_collision(&resolver, child, &mut findings);
        detect_child_create_document_collision(
            &resolver,
            changeset,
            child,
            live_siblings,
            &mut findings,
        );
    }

    detect_overlapping_hunks(changeset, live_siblings, &mut findings);

    ConflictReport::new(changeset.changeset_id.clone(), findings)
}

/// Anchor drift + base/whole-document staleness for one child. Only an EXISTING target
/// with a recorded base is checked; a provisional create has no base to fence. The two
/// axes are decomposed so they never double-count: a pure content edit at the same
/// path yields only a base finding, a pure move yields only an anchor finding, and a
/// vanished identity yields only an anchor finding (there is nothing left to base
/// against).
fn detect_child_base_and_anchor(
    worktree_root: &Path,
    resolver: &DocumentResolver,
    child: &ChangesetChildOperationRecord,
    findings: &mut Vec<ConflictFinding>,
) {
    let DocumentRef::Existing {
        node_id,
        stem,
        path,
        base_revision: recorded_base,
        ..
    } = &child.target.document
    else {
        return;
    };

    let resolved = resolver.resolve_existing(ExistingDocumentLookup::NodeId(node_id.clone()));
    let current_ref = match resolved {
        Ok(current_ref) => current_ref,
        Err(_) => {
            // The identity no longer resolves (renamed / removed since review). There
            // is nothing left to base-check, so this is anchor drift alone.
            findings.push(ConflictFinding {
                child_key: child.child_key.clone(),
                kind: ConflictKind::AnchorDrift,
                reason: "target document identity no longer resolves in the worktree \
                         (renamed, moved, or removed since review)"
                    .to_string(),
                document: child.target.document.clone(),
                reviewed_base_revision: Some(recorded_base.clone()),
                current_revision: None,
                recorded_path: Some(path.clone()),
                current_path: None,
                conflicting_changeset_id: None,
                conflicting_child_key: None,
                lease_holder: None,
            });
            return;
        }
    };

    let DocumentRef::Existing {
        stem: current_stem,
        path: current_path,
        base_revision: current_revision,
        ..
    } = &current_ref
    else {
        return;
    };

    if current_path != path || current_stem != stem {
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind: ConflictKind::AnchorDrift,
            reason: "target document identity moved since review (the node now resolves \
                     to a different path/stem than the recorded anchor)"
                .to_string(),
            document: child.target.document.clone(),
            reviewed_base_revision: Some(recorded_base.clone()),
            current_revision: Some(current_revision.clone()),
            recorded_path: Some(path.clone()),
            current_path: Some(current_path.clone()),
            conflicting_changeset_id: None,
            conflicting_child_key: None,
            lease_holder: None,
        });
    }

    if current_revision != recorded_base {
        let (kind, reason) = staleness_finding(worktree_root, child, &current_ref);
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind,
            reason,
            document: child.target.document.clone(),
            reviewed_base_revision: Some(recorded_base.clone()),
            current_revision: Some(current_revision.clone()),
            recorded_path: None,
            current_path: None,
            conflicting_changeset_id: None,
            conflicting_child_key: None,
            lease_holder: None,
        });
    }
}

/// Classify a whole-document-scale staleness finding for `child` (whose base
/// revision no longer matches the current worktree). A `SectionEdit` child
/// gets the FINER `SectionSelectorUnresolved` diagnostic when its OWN targeted
/// section is what changed — re-resolving its recorded selector against the
/// CURRENT worktree body fails. Any other drift (the section still resolves
/// fine; the base moved elsewhere in the document) still reports the generic
/// `StaleWholeDocumentDraft` — the ADR's no-section-local-leniency posture:
/// any base drift still blocks apply, this only sharpens WHY. A current body
/// that cannot even be read falls back to the generic finding too (honest:
/// there is nothing here to confirm resolution failed specifically).
fn staleness_finding(
    worktree_root: &Path,
    child: &ChangesetChildOperationRecord,
    current_ref: &DocumentRef,
) -> (ConflictKind, String) {
    if !is_whole_document_replace(child) {
        return (
            ConflictKind::StaleBaseRevision,
            "target base revision is behind the current worktree revision (an out-of-band \
             edit landed since the proposal was drafted)"
                .to_string(),
        );
    }
    if child.operation == ChangesetOperationKind::SectionEdit
        && let Some(selector) = child
            .materialized_operation
            .as_ref()
            .and_then(|operation| operation.section_edit.as_ref())
            .map(|section_edit| &section_edit.selector)
    {
        let resolution = SnapshotReader::for_worktree(worktree_root)
            .capture_existing(current_ref)
            .ok()
            .map(|snapshot| resolve_section(&snapshot.text, selector));
        if let Some(Err(resolve_err)) = resolution {
            return (
                ConflictKind::SectionSelectorUnresolved,
                format!(
                    "the section this draft targets (`{}`) no longer resolves against the \
                     current document: {resolve_err}",
                    selector.heading_path.join(" > ")
                ),
            );
        }
    }
    (
        ConflictKind::StaleWholeDocumentDraft,
        "whole-document draft base is behind the current worktree revision; the draft must \
         be regenerated or rebased against the current document"
            .to_string(),
    )
}

/// A lease-protected collision: the child does collision-prone (destructive or
/// whole-document) work on a document whose per-document advisory lease is actively
/// held by a DIFFERENT actor. The lease is advisory and never bypasses the revision
/// floor; this only reports the coordination collision.
fn detect_child_policy_conflict(
    worktree_root: &Path,
    changeset: &ChangesetAggregateRecord,
    child: &ChangesetChildOperationRecord,
    held_leases: &[LeaseRecord],
    now_ms: i64,
    findings: &mut Vec<ConflictFinding>,
) {
    if !child_is_lease_relevant(child) {
        return;
    }
    let Some(node_id) = existing_node_id(&child.target.document) else {
        return;
    };
    let scope = document_lease_scope(worktree_root, &node_id);
    let collision = held_leases.iter().find(|lease| {
        lease.scope_id == scope && lease.is_active(now_ms) && lease.holder.id != changeset.actor.id
    });
    if let Some(lease) = collision {
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind: ConflictKind::PolicyConflict,
            reason: "target document is held by another actor's active advisory lease \
                     for collision-prone work; coordinate or wait for release before apply"
                .to_string(),
            document: child.target.document.clone(),
            reviewed_base_revision: None,
            current_revision: None,
            recorded_path: None,
            current_path: None,
            conflicting_changeset_id: None,
            conflicting_child_key: None,
            lease_holder: Some(lease.holder.clone()),
        });
    }
}

/// A `Rename` target-stem collision: a document already exists at the PROPOSED
/// new stem (W02.P04). Reuses `DocumentResolver::rename_target`'s OWN
/// collision check — the SAME check the eventual core `--to` write would hit —
/// rather than re-deriving resolve-and-compare logic here.
fn detect_child_rename_collision(
    resolver: &DocumentResolver,
    child: &ChangesetChildOperationRecord,
    findings: &mut Vec<ConflictFinding>,
) {
    if child.operation != ChangesetOperationKind::Rename {
        return;
    }
    let Some(new_stem) = child
        .materialized_operation
        .as_ref()
        .and_then(|operation| operation.rename_edit.clone())
    else {
        return;
    };
    let DocumentRef::Existing { path, .. } = &child.target.document else {
        return;
    };
    if let Err(DocumentResolveError::DuplicateStem { stem, .. }) =
        resolver.rename_target(child.target.document.clone(), new_stem)
    {
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind: ConflictKind::RenameTargetCollision,
            reason: format!(
                "a document already exists at the proposed stem `{stem}`; rename would collide"
            ),
            document: child.target.document.clone(),
            reviewed_base_revision: None,
            current_revision: None,
            recorded_path: Some(path.clone()),
            current_path: None,
            conflicting_changeset_id: None,
            conflicting_child_key: None,
            lease_holder: None,
        });
    }
}

/// The deterministic `(stem, path)` a `CreateDocument` child's apply invocation is
/// predicted to land at, derived the SAME way `apply.rs`'s `CreatedAt` post-verify
/// derives it — from the materialized operation's own fixed `create_document_date`
/// plus its target's `feature`/`doc_type`. `None` when the child is not a
/// `CreateDocument`, or carries no materialized operation / fixed date yet (an
/// unmaterialized draft has nothing to collide against).
fn create_document_predicted_path(
    child: &ChangesetChildOperationRecord,
) -> Option<(String, String)> {
    if child.operation != ChangesetOperationKind::CreateDocument {
        return None;
    }
    let materialized = child.materialized_operation.as_ref()?;
    let date = materialized.create_document_date.as_deref()?;
    let DocumentRef::ProvisionalCreate {
        doc_type, feature, ..
    } = &child.target.document
    else {
        return None;
    };
    let stem = format!("{date}-{feature}-{doc_type}");
    let path = format!(".vault/{doc_type}/{stem}.md");
    Some((stem, path))
}

/// A `CreateDocument` predicted-path collision (W02.P05): the DETERMINISTIC path this
/// child's apply invocation would target already resolves to a document in the current
/// worktree, OR a DIFFERENT live sibling changeset's `CreateDocument` child predicts the
/// SAME path. Either finding means at most one of the colliding creates can ever land —
/// core refuses to overwrite an existing document, and this apply invocation never
/// passes `--force`.
fn detect_child_create_document_collision(
    resolver: &DocumentResolver,
    changeset: &ChangesetAggregateRecord,
    child: &ChangesetChildOperationRecord,
    live_siblings: &[ChangesetAggregateRecord],
    findings: &mut Vec<ConflictFinding>,
) {
    let Some((stem, path)) = create_document_predicted_path(child) else {
        return;
    };
    if resolver
        .resolve_existing(ExistingDocumentLookup::Stem(stem.clone()))
        .is_ok()
    {
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind: ConflictKind::CreateDocumentPathCollision,
            reason: format!(
                "a document already exists at the predicted create path `{path}`; core \
                 refuses to overwrite it"
            ),
            document: child.target.document.clone(),
            reviewed_base_revision: None,
            current_revision: None,
            recorded_path: None,
            current_path: Some(path),
            conflicting_changeset_id: None,
            conflicting_child_key: None,
            lease_holder: None,
        });
        return;
    }
    for sibling in live_siblings {
        if sibling.changeset_id == changeset.changeset_id || sibling.status.is_terminal() {
            continue;
        }
        for sibling_child in &sibling.children {
            let Some((sibling_stem, _)) = create_document_predicted_path(sibling_child) else {
                continue;
            };
            if sibling_stem != stem {
                continue;
            }
            findings.push(ConflictFinding {
                child_key: child.child_key.clone(),
                kind: ConflictKind::CreateDocumentPathCollision,
                reason: format!(
                    "a different live proposal's create predicts the SAME path `{path}`; only \
                     one can land"
                ),
                document: child.target.document.clone(),
                reviewed_base_revision: None,
                current_revision: None,
                recorded_path: None,
                current_path: Some(path.clone()),
                conflicting_changeset_id: Some(sibling.changeset_id.clone()),
                conflicting_child_key: Some(sibling_child.child_key.clone()),
                lease_holder: None,
            });
        }
    }
}

/// Cross-proposal overlap: for each of this changeset's children with recorded review
/// hunks, any LIVE sibling changeset (non-terminal, distinct id) whose child targets
/// the SAME document identity over an intersecting base line range is a conflict. The
/// hunks are read from the durably-stored `review_diff`, never recomputed.
fn detect_overlapping_hunks(
    changeset: &ChangesetAggregateRecord,
    live_siblings: &[ChangesetAggregateRecord],
    findings: &mut Vec<ConflictFinding>,
) {
    for child in &changeset.children {
        let Some(node_id) = existing_node_id(&child.target.document) else {
            continue;
        };
        let Some(hunks) = child_hunks(child) else {
            continue;
        };
        for sibling in live_siblings {
            if sibling.changeset_id == changeset.changeset_id || sibling.status.is_terminal() {
                continue;
            }
            for sibling_child in &sibling.children {
                if existing_node_id(&sibling_child.target.document).as_deref() != Some(&node_id) {
                    continue;
                }
                let Some(sibling_hunks) = child_hunks(sibling_child) else {
                    continue;
                };
                if hunk_sets_intersect(hunks, sibling_hunks) {
                    findings.push(ConflictFinding {
                        child_key: child.child_key.clone(),
                        kind: ConflictKind::OverlappingHunks,
                        reason: "a different live proposal edits the same document over an \
                                 intersecting base line range; only one can apply against \
                                 the shared base"
                            .to_string(),
                        document: child.target.document.clone(),
                        reviewed_base_revision: None,
                        current_revision: None,
                        recorded_path: None,
                        current_path: None,
                        conflicting_changeset_id: Some(sibling.changeset_id.clone()),
                        conflicting_child_key: Some(sibling_child.child_key.clone()),
                        lease_holder: None,
                    });
                }
            }
        }
    }
}

/// The stable node id of an existing target, or `None` for a target with no fixed
/// document identity to fence against (a provisional create). Shared with the apply-side
/// advisory fencing check so the acquire and apply lease scopes derive from one convention.
pub(crate) fn existing_node_id(document: &DocumentRef) -> Option<String> {
    match document {
        DocumentRef::Existing { node_id, .. } => Some(node_id.clone()),
        DocumentRef::MaterializedResult { reviewed, .. } => existing_node_id(reviewed),
        DocumentRef::RenameTarget { source, .. } => existing_node_id(source),
        DocumentRef::ProvisionalCreate { .. } => None,
    }
}

/// The non-empty review hunks recorded on a materialized child, or `None` when the
/// child carries no materialized preview or an unchanged (empty-hunk) preview.
fn child_hunks(child: &ChangesetChildOperationRecord) -> Option<&[ReviewDiffHunk]> {
    let hunks = child
        .materialized_operation
        .as_ref()
        .map(|operation| operation.review_diff.hunks.as_slice())?;
    (!hunks.is_empty()).then_some(hunks)
}

/// Whether a child is a whole-document-shaped draft: `replace_body`, (W02.P03)
/// `edit_frontmatter`, or (section-scoped-operations ADR) `section_edit` — all
/// three materialize a whole-document preview (`operations.rs`
/// `finish_materialization`), so a present materialization is the signal either
/// way. A stale base therefore reports `StaleWholeDocumentDraft` for these
/// exactly as it does for a body replace, never the generic partial-base
/// finding, and the set participates in cross-proposal hunk-overlap detection.
fn is_whole_document_replace(child: &ChangesetChildOperationRecord) -> bool {
    matches!(
        child.operation,
        ChangesetOperationKind::ReplaceBody
            | ChangesetOperationKind::EditFrontmatter
            | ChangesetOperationKind::SectionEdit
    ) && child.materialized_operation.is_some()
}

/// Whether a child does collision-prone work the ADR's advisory leases coordinate:
/// destructive (rename / archive / unarchive) or whole-document rewrite work.
fn child_is_lease_relevant(child: &ChangesetChildOperationRecord) -> bool {
    operation_risk(child.operation) == RiskClass::Destructive || is_whole_document_replace(child)
}

/// Whether any hunk in `left` intersects any hunk in `right` on their BASE line
/// ranges. A hunk covers the half-open base range `[start, start + count)`, widened to
/// at least one line so a pure insertion (zero removed lines) is a point that still
/// collides with an edit at the same line.
fn hunk_sets_intersect(left: &[ReviewDiffHunk], right: &[ReviewDiffHunk]) -> bool {
    left.iter().any(|left_hunk| {
        right
            .iter()
            .any(|right_hunk| base_ranges_intersect(left_hunk, right_hunk))
    })
}

fn base_ranges_intersect(left: &ReviewDiffHunk, right: &ReviewDiffHunk) -> bool {
    let (left_start, left_end) = base_range(left);
    let (right_start, right_end) = base_range(right);
    left_start < right_end && right_start < left_end
}

fn base_range(hunk: &ReviewDiffHunk) -> (usize, usize) {
    let start = hunk.base_start_line;
    let end = start + hunk.base_line_count.max(1);
    (start, end)
}

/// A stable secondary sort key over the conflicting-proposal evidence, so two findings
/// on the same child of the same kind still order deterministically.
fn conflicting_key(finding: &ConflictFinding) -> (String, String) {
    (
        finding
            .conflicting_changeset_id
            .as_ref()
            .map(|id| id.as_str().to_string())
            .unwrap_or_default(),
        finding.conflicting_child_key.clone().unwrap_or_default(),
    )
}

#[cfg(test)]
mod tests;
