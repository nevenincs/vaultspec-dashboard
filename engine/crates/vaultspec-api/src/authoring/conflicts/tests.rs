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
            section_selector: None,
            plan_step: None,
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
            section_selector: None,
            plan_step: None,
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
            section_selector: None,
            plan_step: None,
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

/// A materialized `section_edit` child (section-scoped-operations ADR)
/// targeting `heading_path` in `stem`'s CURRENT worktree body, splicing in
/// `new_content`. Mirrors `materialized_child` so a section edit exercises
/// the SAME whole-document-relevance conflict path, plus the finer
/// selector-resolution check.
fn materialized_section_edit_child(
    root: &Path,
    changeset_id: &ChangesetId,
    stem: &str,
    child_key: &str,
    heading_path: &[&str],
    new_content: &str,
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
    let resolved = crate::authoring::sections::resolve_section(
        &base_snapshot.text,
        &crate::authoring::sections::SectionSelector {
            heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
            range_hint: None,
            expected_content_hash: String::new(),
        },
    );
    // The probe selector above always mismatches its bogus empty-string hash;
    // extract the OBSERVED hash from the typed error to build the real selector,
    // rather than duplicating the resolver's own section-boundary logic here.
    let expected_content_hash = match resolved.unwrap_err() {
        crate::authoring::sections::SectionResolveError::ContentHashMismatch {
            observed, ..
        } => observed,
        other => panic!("expected a content-hash mismatch probe, got {other:?}"),
    };
    let selector = crate::authoring::sections::SectionSelector {
        heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
        range_hint: None,
        expected_content_hash,
    };
    let draft = ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
        operation: ChangesetOperationKind::SectionEdit,
        target: TargetRevisionFence {
            document: document.clone(),
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
fn section_edit_stale_elsewhere_in_the_document_reports_the_generic_whole_document_finding() {
    // The ADR's no-section-local-leniency posture: an out-of-band edit that
    // lands OUTSIDE the targeted section still refuses apply (the base
    // moved), but reports the SAME generic `StaleWholeDocumentDraft` a
    // `replace_body`/`edit_frontmatter` draft would — never new leniency.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/section-edit-plan.md",
        "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n",
    );
    let child = materialized_section_edit_child(
        root,
        &ChangesetId::new("changeset:section-edit-elsewhere").unwrap(),
        "section-edit-plan",
        "child_1",
        &["Beta"],
        "## Beta\n\nBETA REWRITTEN\n",
    );
    let cs = changeset(
        "changeset:section-edit-elsewhere",
        actor("agent:author"),
        ChangesetStatus::Proposed,
        vec![child],
    );

    // The out-of-band edit lands in Alpha — a DIFFERENT section from the
    // one this draft targets (Beta).
    write_doc(
        root,
        ".vault/plan/section-edit-plan.md",
        "# Doc\n\nintro\n\n## Alpha\n\nALPHA EDITED ELSEWHERE\n\n## Beta\n\nbeta body\n",
    );

    let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

    assert!(report.has_conflict());
    assert_eq!(report.findings.len(), 1, "{report:?}");
    let finding = &report.findings[0];
    assert_eq!(
        finding.kind,
        ConflictKind::StaleWholeDocumentDraft,
        "the targeted section (Beta) still resolves fine; the generic finding applies"
    );
    assert_eq!(finding.child_key, "child_1");
}

#[test]
fn section_edit_stale_inside_the_targeted_section_reports_the_finer_selector_finding() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/section-edit-targeted-plan.md",
        "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n",
    );
    let child = materialized_section_edit_child(
        root,
        &ChangesetId::new("changeset:section-edit-targeted").unwrap(),
        "section-edit-targeted-plan",
        "child_1",
        &["Beta"],
        "## Beta\n\nBETA REWRITTEN\n",
    );
    let cs = changeset(
        "changeset:section-edit-targeted",
        actor("agent:author"),
        ChangesetStatus::Proposed,
        vec![child],
    );

    // The out-of-band edit lands INSIDE the targeted Beta section itself.
    write_doc(
        root,
        ".vault/plan/section-edit-targeted-plan.md",
        "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nBETA EDITED OUT OF BAND\n",
    );

    let report = detect_conflicts(root, &cs, &[], &[], NOW_MS);

    assert!(report.has_conflict());
    assert_eq!(report.findings.len(), 1, "{report:?}");
    let finding = &report.findings[0];
    assert_eq!(
        finding.kind,
        ConflictKind::SectionSelectorUnresolved,
        "the targeted section itself changed; the finer diagnostic applies: {report:?}"
    );
    assert_eq!(finding.child_key, "child_1");
    assert!(finding.reason.contains("Beta"), "{}", finding.reason);
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
        !detect_conflicts(root, &cs, &[], std::slice::from_ref(&own_lease), NOW_MS).has_conflict(),
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
        related: Vec::new(),
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
            section_selector: None,
            plan_step: None,
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
