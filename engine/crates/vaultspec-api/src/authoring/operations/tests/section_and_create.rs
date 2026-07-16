use super::super::*;
use super::helpers::*;

fn section_selector_for(heading_path: &[&str], expected_content_hash: &str) -> SectionSelector {
    SectionSelector {
        heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
        range_hint: None,
        expected_content_hash: expected_content_hash.to_string(),
    }
}

#[test]
fn section_edit_splices_the_resolved_range_and_captures_the_selected_preimage() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", SECTION_DOC);
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let beta_section = "## Beta\n\nbeta body\n";
    let selector = section_selector_for(&["Beta"], &blob_oid(beta_section.as_bytes()));
    let draft = section_edit_draft_for(
        snapshot.document.clone(),
        selector.clone(),
        "## Beta\n\nBETA REWRITTEN\n",
    );

    let materialized = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap();

    assert_eq!(materialized.operation, ChangesetOperationKind::SectionEdit);
    assert_eq!(
        materialized.target_snapshot.payload_text,
        "# Doc\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nBETA REWRITTEN\n"
    );
    assert!(materialized.review_diff.changed);

    let section_edit = materialized.section_edit.as_ref().unwrap();
    assert_eq!(section_edit.selector, selector);
    assert_eq!(section_edit.selected_preimage, beta_section);
    assert_eq!(section_edit.new_content, "## Beta\n\nBETA REWRITTEN\n");
}

#[test]
fn section_edit_rejects_a_missing_selector_payload() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", SECTION_DOC);
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let mut draft = section_edit_draft_for(
        snapshot.document.clone(),
        section_selector_for(&["Beta"], "irrelevant"),
        "new\n",
    );
    draft.draft.section_selector = None;

    let err = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap_err();
    assert!(matches!(err, OperationError::MissingSectionSelector { .. }));
}

#[test]
fn section_edit_rejects_a_selector_that_does_not_resolve() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", SECTION_DOC);
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let draft = section_edit_draft_for(
        snapshot.document.clone(),
        section_selector_for(&["Gamma"], "irrelevant"),
        "new\n",
    );

    let err = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap_err();
    assert!(matches!(
        err,
        OperationError::SectionSelectorUnresolved {
            source: SectionResolveError::MissingAnchor { .. },
            ..
        }
    ));
}

#[test]
fn section_edit_rejects_a_content_hash_mismatch() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", SECTION_DOC);
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let draft = section_edit_draft_for(
        snapshot.document.clone(),
        section_selector_for(&["Beta"], "not-the-real-hash"),
        "new\n",
    );

    let err = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap_err();
    assert!(matches!(
        err,
        OperationError::SectionSelectorUnresolved {
            source: SectionResolveError::ContentHashMismatch { .. },
            ..
        }
    ));
}

#[test]
fn section_edit_materialized_operation_round_trips_including_the_section_edit_payload() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", SECTION_DOC);
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let selector = section_selector_for(&["Alpha"], &blob_oid(b"## Alpha\n\nalpha body\n\n"));
    let draft = section_edit_draft_for(
        snapshot.document.clone(),
        selector,
        "## Alpha\n\nALPHA REWRITTEN\n\n",
    );

    let materialized = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap();

    let value = serde_json::to_value(&materialized).unwrap();
    let recovered: MaterializedProposalOperation = serde_json::from_value(value).unwrap();
    assert_eq!(recovered, materialized);
    assert!(recovered.section_edit.is_some());
    assert!(recovered.frontmatter_edit.is_none());
    assert!(recovered.rename_edit.is_none());
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
        related: Vec::new(),
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
            section_selector: None,
            plan_step: None,
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
fn create_document_rejects_a_stray_section_selector() {
    let mut draft = create_draft_for(
        provisional_document("plan", "operation-plan-feature", "A New Plan"),
        "preview body\n",
    );
    draft.draft.section_selector = Some(SectionSelector {
        heading_path: vec!["Stray".to_string()],
        range_hint: None,
        expected_content_hash: "irrelevant".to_string(),
    });

    let err = MaterializedProposalOperation::materialize_create_document(
        &changeset_id(),
        draft,
        CREATE_FIXED_CREATED_AT_MS,
    )
    .unwrap_err();
    assert!(matches!(
        err,
        OperationError::UnexpectedSectionSelector { .. }
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
        let draft = create_draft_for(provisional_document(doc_type, feature, title), "preview\n");
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
    use crate::authoring::validation::{CurrentRevisionObservation, validate_changeset_material};

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
    let record =
        validate_changeset_material(std::slice::from_ref(&materialized), &[observation], &[], 6)
            .unwrap();
    assert!(
        record.approval_ready,
        "a well-formed CreateDocument draft must be approval-ready: {:?}",
        record.status
    );
}
