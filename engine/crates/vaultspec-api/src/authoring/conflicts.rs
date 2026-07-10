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
        detect_child_base_and_anchor(&resolver, child, &mut findings);
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
        let (kind, reason) = if is_whole_document_replace(child) {
            (
                ConflictKind::StaleWholeDocumentDraft,
                "whole-document draft base is behind the current worktree revision; the \
                 draft must be regenerated or rebased against the current document",
            )
        } else {
            (
                ConflictKind::StaleBaseRevision,
                "target base revision is behind the current worktree revision (an \
                 out-of-band edit landed since the proposal was drafted)",
            )
        };
        findings.push(ConflictFinding {
            child_key: child.child_key.clone(),
            kind,
            reason: reason.to_string(),
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

/// Whether a child is a whole-document-shaped draft: `replace_body` or (W02.P03)
/// `edit_frontmatter` — both materialize a whole-document preview (`operations.rs`
/// `finish_materialization`), so a present materialization is the signal either
/// way. A stale base therefore reports `StaleWholeDocumentDraft` for a frontmatter
/// edit exactly as it does for a body replace, never the generic partial-base
/// finding, and the pair participates in cross-proposal hunk-overlap detection.
fn is_whole_document_replace(child: &ChangesetChildOperationRecord) -> bool {
    matches!(
        child.operation,
        ChangesetOperationKind::ReplaceBody | ChangesetOperationKind::EditFrontmatter
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
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::*;
    use crate::authoring::api::{
        ChangesetChildOperationDraft, DraftMode, DraftMutation, TargetRevisionFence,
    };
    use crate::authoring::documents::DocumentResolver as TestResolver;
    use crate::authoring::leases::{LeasePurpose, LeaseRecord, LeaseState};
    use crate::authoring::ledger::{
        ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
    };
    use crate::authoring::model::{
        ActorId, ActorKind, ActorRef, ChangesetKind, ChangesetStatus, LeaseId, SessionId,
    };
    use crate::authoring::operations::MaterializedProposalOperation;
    use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};

    const NOW_MS: i64 = 1_000;

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn remove_doc(root: &Path, rel: &str) {
        std::fs::remove_file(root.join(rel)).unwrap();
    }

    fn actor(id: &str) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn resolve(root: &Path, stem: &str) -> DocumentRef {
        TestResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
            .unwrap()
    }

    fn existing_base(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("expected existing document ref");
        };
        base_revision.clone()
    }

    /// A materialized whole-document `replace_body` child against the CURRENT worktree
    /// body of `stem`, replacing it with `new_body`. The recorded base is the body at
    /// materialization time, so a later worktree edit staleness the recorded base.
    fn materialized_child(
        root: &Path,
        changeset_id: &ChangesetId,
        stem: &str,
        child_key: &str,
        new_body: &str,
    ) -> ChangesetChildOperationInput {
        let document = resolve(root, stem);
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap();
        let preimage = SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: format!("preimage:{}:{child_key}", changeset_id.as_str()),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: child_key.to_string(),
                document: document.clone(),
                captured_at_ms: 100,
            })
            .unwrap();
        let revision = existing_base(&document);
        let draft = ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: new_body.to_string(),
                frontmatter: None,
                new_stem: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_replace_body(
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

    /// A materialized `edit_frontmatter` child (W02.P03) against the CURRENT worktree
    /// frontmatter of `stem`, setting `date`. Mirrors `materialized_child` so a
    /// frontmatter edit exercises the SAME whole-document-relevance conflict path.
    fn materialized_frontmatter_child(
        root: &Path,
        changeset_id: &ChangesetId,
        stem: &str,
        child_key: &str,
        date: &str,
    ) -> ChangesetChildOperationInput {
        let document = resolve(root, stem);
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap();
        let preimage = SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: format!("preimage:{}:{child_key}", changeset_id.as_str()),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: child_key.to_string(),
                document: document.clone(),
                captured_at_ms: 100,
            })
            .unwrap();
        let revision = existing_base(&document);
        let draft = ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::EditFrontmatter,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                    date: Some(date.to_string()),
                    tags: None,
                    related: None,
                }),
                new_stem: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
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

    /// A materialized `rename` child (W02.P04) proposing to rename `stem` to
    /// `new_stem`. Mirrors `materialized_frontmatter_child` so a rename
    /// exercises the SAME conflict-record shape.
    fn materialized_rename_child(
        root: &Path,
        changeset_id: &ChangesetId,
        stem: &str,
        child_key: &str,
        new_stem: &str,
    ) -> ChangesetChildOperationInput {
        let document = resolve(root, stem);
        let base_snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap();
        let preimage = SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: format!("preimage:{}:{child_key}", changeset_id.as_str()),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: child_key.to_string(),
                document: document.clone(),
                captured_at_ms: 100,
            })
            .unwrap();
        let revision = existing_base(&document);
        let draft = ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::Rename,
            target: TargetRevisionFence {
                document: document.clone(),
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: String::new(),
                frontmatter: None,
                new_stem: Some(new_stem.to_string()),
            },
        };
        let materialized = MaterializedProposalOperation::materialize_rename(
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

    /// A non-materialized child (a draft-stage operation) carrying only the recorded
    /// base revision — the generic stale-base path, distinct from a whole-document draft.
    fn draft_child(document: DocumentRef, child_key: &str) -> ChangesetChildOperationInput {
        let revision = existing_base(&document);
        ChangesetChildOperationInput {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::EditFrontmatter,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    fn changeset(
        id: &str,
        actor: ActorRef,
        status: ChangesetStatus,
        children: Vec<ChangesetChildOperationInput>,
    ) -> ChangesetAggregateRecord {
        ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: ChangesetId::new(id).unwrap(),
            previous_revision: None,
            kind: ChangesetKind::Authoring,
            status,
            session_id: Some(SessionId::new("session:conflicts").unwrap()),
            actor,
            summary: "conflict detection test changeset".to_string(),
            children,
            created_at_ms: 100,
        })
        .unwrap()
    }

    fn lease(
        root: &Path,
        node_id: &str,
        holder: ActorRef,
        state: LeaseState,
        expires_at_ms: i64,
    ) -> LeaseRecord {
        LeaseRecord {
            schema_version: "authoring.lease.v1".to_string(),
            lease_id: LeaseId::new(format!("lease:{node_id}:1")).unwrap(),
            scope_id: document_lease_scope(root, node_id),
            purpose: LeasePurpose::WholeDocument,
            holder,
            fencing_token: 1,
            state,
            idempotency_key: "idem:lease:conflicts".to_string(),
            acquired_at_ms: 0,
            expires_at_ms,
            updated_at_ms: 0,
        }
    }

    #[test]
    fn stale_base_revision_is_detected_after_an_out_of_band_edit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/stale-base-plan.md", "base body\n");
        let document = resolve(root, "stale-base-plan");
        let cs = changeset(
            "changeset:stale-base",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![draft_child(document, "child_1")],
        );

        // An out-of-band edit lands after the base was recorded.
        write_doc(root, ".vault/plan/stale-base-plan.md", "edited elsewhere\n");

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::StaleBaseRevision);
        assert_eq!(finding.child_key, "child_1");
        assert!(finding.reviewed_base_revision.is_some());
        assert_ne!(finding.reviewed_base_revision, finding.current_revision);
    }

    #[test]
    fn stale_whole_document_draft_is_detected_distinctly_from_a_partial_base() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/whole-doc-plan.md", "one\ntwo\nthree\n");
        let child = materialized_child(
            root,
            &ChangesetId::new("changeset:whole-doc").unwrap(),
            "whole-doc-plan",
            "child_1",
            "one\nTWO\nthree\n",
        );
        let cs = changeset(
            "changeset:whole-doc",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        // The whole document is rewritten out of band, invalidating the whole draft.
        write_doc(
            root,
            ".vault/plan/whole-doc-plan.md",
            "rewritten whole body\n",
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(
            finding.kind,
            ConflictKind::StaleWholeDocumentDraft,
            "a whole-document draft reports distinctly from a partial stale base"
        );
        assert_eq!(finding.child_key, "child_1");
        assert_ne!(finding.reviewed_base_revision, finding.current_revision);
    }

    #[test]
    fn stale_frontmatter_draft_is_detected_as_whole_document_stale_like_a_body_replace() {
        // W02.P03: `is_whole_document_replace` broadened to `edit_frontmatter`, so a
        // stale frontmatter draft reports `StaleWholeDocumentDraft` — the SAME
        // relevance a stale `replace_body` draft gets — never the generic partial
        // `StaleBaseRevision` finding.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/whole-doc-fm-plan.md",
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbody\n",
        );
        let child = materialized_frontmatter_child(
            root,
            &ChangesetId::new("changeset:whole-doc-fm").unwrap(),
            "whole-doc-fm-plan",
            "child_1",
            "2026-02-06",
        );
        let cs = changeset(
            "changeset:whole-doc-fm",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        // An out-of-band edit lands after the frontmatter draft was materialized.
        write_doc(
            root,
            ".vault/plan/whole-doc-fm-plan.md",
            "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nrewritten body\n",
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(
            finding.kind,
            ConflictKind::StaleWholeDocumentDraft,
            "a stale frontmatter draft reports distinctly from a partial stale base"
        );
        assert_eq!(finding.child_key, "child_1");
    }

    #[test]
    fn overlapping_hunks_between_two_live_proposals_are_detected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/overlap-plan.md", "line1\nline2\nline3\n");

        let subject = changeset(
            "changeset:subject",
            actor("agent:author-a"),
            ChangesetStatus::Proposed,
            vec![materialized_child(
                root,
                &ChangesetId::new("changeset:subject").unwrap(),
                "overlap-plan",
                "child_a",
                "line1\nA-EDIT\nline3\n",
            )],
        );
        let sibling = changeset(
            "changeset:sibling",
            actor("agent:author-b"),
            ChangesetStatus::NeedsReview,
            vec![materialized_child(
                root,
                &ChangesetId::new("changeset:sibling").unwrap(),
                "overlap-plan",
                "child_b",
                "line1\nB-EDIT\nline3\n",
            )],
        );

        // The worktree is unchanged, so neither proposal has a stale base — the ONLY
        // conflict is the cross-proposal overlap on line 2.
        let report = detect_conflicts(root, &subject, std::slice::from_ref(&sibling), &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::OverlappingHunks);
        assert_eq!(finding.child_key, "child_a");
        assert_eq!(
            finding
                .conflicting_changeset_id
                .as_ref()
                .map(|id| id.as_str()),
            Some("changeset:sibling")
        );
        assert_eq!(finding.conflicting_child_key.as_deref(), Some("child_b"));

        // A TERMINAL sibling no longer contends for the base — no overlap surfaces.
        let applied_sibling = changeset(
            "changeset:sibling",
            actor("agent:author-b"),
            ChangesetStatus::Applied,
            vec![materialized_child(
                root,
                &ChangesetId::new("changeset:sibling").unwrap(),
                "overlap-plan",
                "child_b",
                "line1\nB-EDIT\nline3\n",
            )],
        );
        let clean = detect_conflicts(
            root,
            &subject,
            std::slice::from_ref(&applied_sibling),
            &[],
            NOW_MS,
        );
        assert!(
            !clean.has_conflict(),
            "terminal sibling does not overlap: {clean:?}"
        );
    }

    #[test]
    fn anchor_drift_is_detected_when_the_identity_no_longer_resolves() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/anchor-plan.md", "anchored body\n");
        let document = resolve(root, "anchor-plan");
        let cs = changeset(
            "changeset:anchor",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![draft_child(document, "child_1")],
        );

        // The document is renamed after the proposal is drafted: its recorded identity
        // (node id) no longer resolves in the worktree.
        remove_doc(root, ".vault/plan/anchor-plan.md");
        write_doc(
            root,
            ".vault/plan/anchor-plan-renamed.md",
            "anchored body\n",
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(
            finding.kind,
            ConflictKind::AnchorDrift,
            "a vanished identity is anchor drift, not content staleness"
        );
        assert_eq!(finding.child_key, "child_1");
        assert_eq!(
            finding.recorded_path.as_deref(),
            Some(".vault/plan/anchor-plan.md")
        );
        assert!(finding.current_revision.is_none());
    }

    #[test]
    fn policy_conflict_is_detected_when_another_actor_holds_an_active_lease() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/leased-plan.md", "leased body\n");
        let cs = changeset(
            "changeset:leased",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![materialized_child(
                root,
                &ChangesetId::new("changeset:leased").unwrap(),
                "leased-plan",
                "child_1",
                "leased body edited\n",
            )],
        );

        // A DIFFERENT actor holds an active advisory lease on the target document.
        let other_lease = lease(
            root,
            "doc:leased-plan",
            actor("agent:other"),
            LeaseState::Held,
            NOW_MS + 1_000_000,
        );
        let report = detect_conflicts(root, &cs, &[], std::slice::from_ref(&other_lease), NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::PolicyConflict);
        assert_eq!(finding.child_key, "child_1");
        assert_eq!(
            finding
                .lease_holder
                .as_ref()
                .map(|holder| holder.id.as_str()),
            Some("agent:other")
        );

        // The SAME actor holding the lease is not a collision (you may edit under your
        // own lease), and an EXPIRED other-actor lease has lapsed and permits progress.
        let own_lease = lease(
            root,
            "doc:leased-plan",
            actor("agent:author"),
            LeaseState::Held,
            NOW_MS + 1_000_000,
        );
        let expired_lease = lease(
            root,
            "doc:leased-plan",
            actor("agent:other"),
            LeaseState::Held,
            NOW_MS - 1,
        );
        assert!(
            !detect_conflicts(root, &cs, &[], std::slice::from_ref(&own_lease), NOW_MS)
                .has_conflict(),
            "a lease held by the changeset's own actor is not a collision"
        );
        assert!(
            !detect_conflicts(root, &cs, &[], std::slice::from_ref(&expired_lease), NOW_MS)
                .has_conflict(),
            "an expired lease has lapsed and permits progress"
        );
    }

    #[test]
    fn a_current_proposal_with_no_contention_reports_no_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/clean-plan.md", "clean body\n");
        let cs = changeset(
            "changeset:clean",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![materialized_child(
                root,
                &ChangesetId::new("changeset:clean").unwrap(),
                "clean-plan",
                "child_1",
                "clean body edited\n",
            )],
        );

        // Worktree unchanged, no siblings, no leases: the honest value is "no conflict".
        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(!report.has_conflict());
        assert!(report.findings.is_empty(), "{report:?}");
        assert_eq!(report.changeset_id.as_str(), "changeset:clean");
    }

    #[test]
    fn report_ordering_is_deterministic_across_input_order() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/multi-a.md", "a body\n");
        write_doc(root, ".vault/plan/multi-b.md", "b body\n");
        let doc_a = resolve(root, "multi-a");
        let doc_b = resolve(root, "multi-b");
        let cs = changeset(
            "changeset:multi",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![draft_child(doc_b, "child_b"), draft_child(doc_a, "child_a")],
        );

        // Both bases go stale, producing two findings whose order must not depend on
        // child declaration order.
        write_doc(root, ".vault/plan/multi-a.md", "a changed\n");
        write_doc(root, ".vault/plan/multi-b.md", "b changed\n");

        let first = detect_conflicts(root, &cs, &[], &[], NOW_MS);
        let second = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert_eq!(first, second, "detection is deterministic");
        assert_eq!(first.findings.len(), 2, "{first:?}");
        let keys: Vec<_> = first
            .findings
            .iter()
            .map(|finding| finding.child_key.as_str())
            .collect();
        assert_eq!(
            keys,
            vec!["child_a", "child_b"],
            "findings are sorted by child key"
        );
    }

    #[test]
    fn conflict_report_round_trips_and_rejects_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/serde-plan.md", "serde body\n");
        let document = resolve(root, "serde-plan");
        let cs = changeset(
            "changeset:serde",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![draft_child(document, "child_1")],
        );
        write_doc(root, ".vault/plan/serde-plan.md", "serde changed\n");

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);
        assert!(report.has_conflict());

        let value = serde_json::to_value(&report).unwrap();
        assert_eq!(value["has_conflict"], true);
        assert_eq!(value["findings"][0]["kind"], "stale_base_revision");
        let recovered: ConflictReport = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(recovered, report);

        let mut tampered = value;
        tampered["findings"][0]["frontend_inferred"] = json!(true);
        assert!(
            serde_json::from_value::<ConflictReport>(tampered).is_err(),
            "unknown finding fields are rejected on the wire"
        );
    }

    #[test]
    fn rename_target_stem_collision_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/rename-source.md", "source body\n");
        // A DIFFERENT document already occupies the proposed target stem.
        write_doc(root, ".vault/plan/rename-target.md", "occupied\n");

        let child = materialized_rename_child(
            root,
            &ChangesetId::new("changeset:rename-collision").unwrap(),
            "rename-source",
            "child_1",
            "rename-target",
        );
        let cs = changeset(
            "changeset:rename-collision",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::RenameTargetCollision);
        assert_eq!(finding.child_key, "child_1");
        assert_eq!(
            finding.recorded_path.as_deref(),
            Some(".vault/plan/rename-source.md")
        );
    }

    #[test]
    fn rename_to_a_free_stem_reports_no_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/rename-source-clean.md", "source body\n");

        let child = materialized_rename_child(
            root,
            &ChangesetId::new("changeset:rename-clean").unwrap(),
            "rename-source-clean",
            "child_1",
            "rename-target-clean",
        );
        let cs = changeset(
            "changeset:rename-clean",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(
            !report.has_conflict(),
            "a free target stem is not a collision: {report:?}"
        );
    }

    // --- W02.P05: CreateDocument predicted-path collision -------------------

    /// A materialized `create_document` child (W02.P05) whose deterministic
    /// predicted path derives from `created_at_ms`/`feature`/`doc_type` — no
    /// worktree read needed to build it, unlike every other materializer here.
    fn materialized_create_child(
        changeset_id: &ChangesetId,
        doc_type: &str,
        feature: &str,
        title: &str,
        child_key: &str,
        created_at_ms: i64,
    ) -> ChangesetChildOperationInput {
        let document = DocumentRef::ProvisionalCreate {
            provisional_doc_id: format!("provisional:{child_key}"),
            doc_type: doc_type.to_string(),
            feature: feature.to_string(),
            title: title.to_string(),
            collision_status: crate::authoring::model::ProvisionalCollisionStatus::Unknown,
            proposed_stem: None,
        };
        let draft = ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::CreateDocument,
            target: TargetRevisionFence {
                document,
                base_revision: None,
                current_revision: None,
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: "preview\n".to_string(),
                frontmatter: None,
                new_stem: None,
            },
        };
        let materialized = MaterializedProposalOperation::materialize_create_document(
            changeset_id,
            draft,
            created_at_ms,
        )
        .unwrap();
        ChangesetChildOperationInput::from_materialized(
            materialized,
            format!("material:{child_key}"),
            format!("validation:{child_key}"),
        )
    }

    const CREATE_COLLISION_CREATED_AT_MS: i64 = 1_768_435_200_000; // 2026-01-15T00:00:00Z

    #[test]
    fn create_document_path_collision_with_the_current_worktree_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // A document already occupies the create's DETERMINISTIC predicted path.
        write_doc(
            root,
            ".vault/plan/2026-01-15-create-collision-feature-plan.md",
            "occupied\n",
        );

        let child = materialized_create_child(
            &ChangesetId::new("changeset:create-collision").unwrap(),
            "plan",
            "create-collision-feature",
            "A New Plan",
            "child_1",
            CREATE_COLLISION_CREATED_AT_MS,
        );
        let cs = changeset(
            "changeset:create-collision",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::CreateDocumentPathCollision);
        assert_eq!(
            finding.current_path.as_deref(),
            Some(".vault/plan/2026-01-15-create-collision-feature-plan.md")
        );
    }

    #[test]
    fn create_document_path_collision_with_a_live_sibling_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let sibling_child = materialized_create_child(
            &ChangesetId::new("changeset:create-sibling").unwrap(),
            "plan",
            "create-sibling-feature",
            "Sibling's Plan",
            "child_1",
            CREATE_COLLISION_CREATED_AT_MS,
        );
        let sibling = changeset(
            "changeset:create-sibling",
            actor("agent:other"),
            ChangesetStatus::Proposed,
            vec![sibling_child],
        );

        let child = materialized_create_child(
            &ChangesetId::new("changeset:create-mine").unwrap(),
            "plan",
            "create-sibling-feature",
            "My Plan",
            "child_1",
            CREATE_COLLISION_CREATED_AT_MS,
        );
        let cs = changeset(
            "changeset:create-mine",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        let report = detect_conflicts(root, &cs, &[sibling], &[], NOW_MS);

        assert!(report.has_conflict());
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.kind, ConflictKind::CreateDocumentPathCollision);
        assert_eq!(
            finding.conflicting_changeset_id,
            Some(ChangesetId::new("changeset:create-sibling").unwrap())
        );
    }

    #[test]
    fn create_document_to_a_free_path_reports_no_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        let child = materialized_create_child(
            &ChangesetId::new("changeset:create-clean").unwrap(),
            "plan",
            "create-clean-feature",
            "A New Plan",
            "child_1",
            CREATE_COLLISION_CREATED_AT_MS,
        );
        let cs = changeset(
            "changeset:create-clean",
            actor("agent:author"),
            ChangesetStatus::Proposed,
            vec![child],
        );

        let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

        assert!(
            !report.has_conflict(),
            "a free predicted path is not a collision: {report:?}"
        );
    }
}
