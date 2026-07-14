use super::super::*;
use super::helpers::*;

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
            section_selector: None,
            plan_step: None,
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
fn replace_body_rejects_a_stray_section_selector() {
    // R1: a `section_selector` is `section_edit`'s own field-level payload —
    // an accepted-but-ignored selector on a whole-document `replace_body`
    // draft must be refused, never silently dropped.
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
    draft.draft.section_selector = Some(SectionSelector {
        heading_path: vec!["Stray".to_string()],
        range_hint: None,
        expected_content_hash: "irrelevant".to_string(),
    });

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
        OperationError::UnexpectedSectionSelector { .. }
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
fn edit_frontmatter_rejects_a_stray_section_selector() {
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
    draft.draft.section_selector = Some(SectionSelector {
        heading_path: vec!["Stray".to_string()],
        range_hint: None,
        expected_content_hash: "irrelevant".to_string(),
    });

    let err = MaterializedProposalOperation::materialize_edit_frontmatter(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap_err();
    assert!(matches!(
        err,
        OperationError::UnexpectedSectionSelector { .. }
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
fn rename_rejects_a_stray_section_selector() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/operation-plan.md", "body\n");
    let snapshot = base_snapshot(root);
    let preimage = preimage_record(root);
    let mut draft = rename_draft_for(snapshot.document.clone(), "operation-plan-renamed");
    draft.draft.section_selector = Some(SectionSelector {
        heading_path: vec!["Stray".to_string()],
        range_hint: None,
        expected_content_hash: "irrelevant".to_string(),
    });

    let err = MaterializedProposalOperation::materialize_rename(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap_err();
    assert!(matches!(
        err,
        OperationError::UnexpectedSectionSelector { .. }
    ));
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

// --- section-scoped-operations: SectionEdit validation + materialization
