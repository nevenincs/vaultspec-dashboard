use std::path::Path;

use super::*;
use crate::authoring::api::{
    ChangesetChildOperationDraft, DraftMode, DraftMutation, TargetRevisionFence,
};
use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
use crate::authoring::operations::MaterializedProposalOperation;
use crate::authoring::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
use crate::authoring::store::Store;

fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn resolved_doc(root: &Path) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("validation-plan".to_string()))
        .unwrap()
}

fn base_snapshot(root: &Path) -> RevisionSnapshot {
    SnapshotReader::for_worktree(root)
        .require_current_base(&resolved_doc(root))
        .unwrap()
}

fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("test document must be existing");
    };
    base_revision.clone()
}

fn draft_for(document: DocumentRef, body: &str) -> ChangesetChildOperationDraft {
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document,
            base_revision: Some(revision.clone()),
            current_revision: Some(revision),
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

fn materialized(root: &Path, target_body: &str) -> MaterializedProposalOperation {
    let snapshot = base_snapshot(root);
    let draft = draft_for(snapshot.document.clone(), target_body);
    let preimage = preimage_record(root);
    MaterializedProposalOperation::materialize_replace_body(
        &changeset_id(),
        draft,
        &snapshot,
        &preimage,
    )
    .unwrap()
}

fn current_observation(child_key: &str, snapshot: &RevisionSnapshot) -> CurrentRevisionObservation {
    CurrentRevisionObservation::from_snapshot(child_key, snapshot)
}

fn current_chunk(operation: &MaterializedProposalOperation) -> ChunkValidationEvidence {
    ChunkValidationEvidence {
        child_key: operation.child_key.clone(),
        evidence_id: "chunk_evidence_1".to_string(),
        document: operation.target_snapshot.document.clone(),
        base_revision: operation.target_snapshot.base_revision.clone(),
        chunker_version: "whole_document_v1".to_string(),
        range: "bytes:0..all".to_string(),
        content_hash: operation.review_diff.base_blob_hash.clone(),
        observed_revision: Some(operation.target_snapshot.base_revision.clone()),
        observed_content_hash: Some(operation.review_diff.base_blob_hash.clone()),
        status: ChunkEvidenceStatus::Current,
    }
}

fn valid_target_body() -> &'static str {
    "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# Plan\n\nnew body\n"
}

#[test]
fn valid_proposal_records_stable_validation_digest() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "---\ntags:\n  - '#plan'\n---\n\nold body\n",
    );
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);

    let first = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        std::slice::from_ref(&chunk),
        200,
    )
    .unwrap();
    let second = validate_changeset_material(&[operation], &[current], &[chunk], 300).unwrap();

    assert_eq!(first.status, ValidationStatus::Valid);
    assert!(first.approval_ready);
    assert!(first.findings.is_empty());
    assert_eq!(first.validation_digest, second.validation_digest);
    assert_eq!(first.material_digest, second.material_digest);
    assert_eq!(first.operation_count, 1);
    assert_eq!(first.target_revisions[0].child_key, "child_1");
}

#[test]
fn changed_target_payload_changes_material_and_validation_digest() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "---\ntags:\n  - '#plan'\n---\n\nold body\n",
    );
    let snapshot = base_snapshot(root);
    let first_operation = materialized(root, valid_target_body());
    let second_operation = materialized(
        root,
        "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nanother body\n",
    );
    let first_chunk = current_chunk(&first_operation);
    let second_chunk = current_chunk(&second_operation);
    let current = current_observation("child_1", &snapshot);

    let first = validate_changeset_material(
        &[first_operation],
        std::slice::from_ref(&current),
        &[first_chunk],
        200,
    )
    .unwrap();
    let second =
        validate_changeset_material(&[second_operation], &[current], &[second_chunk], 200).unwrap();

    assert_ne!(first.material_digest, second.material_digest);
    assert_ne!(first.validation_digest, second.validation_digest);
}

#[test]
fn reviewed_diff_material_is_bound_to_the_material_digest() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "---\ntags:\n  - '#plan'\n---\n\nold body\n",
    );
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);
    let mut misleading_operation = operation.clone();
    misleading_operation.review_diff.hunks.clear();

    let reviewed = validate_changeset_material(
        &[operation],
        std::slice::from_ref(&current),
        std::slice::from_ref(&chunk),
        200,
    )
    .unwrap();
    let misleading =
        validate_changeset_material(&[misleading_operation], &[current], &[chunk], 200).unwrap();

    assert_ne!(reviewed.material_digest, misleading.material_digest);
    assert_ne!(reviewed.validation_digest, misleading.validation_digest);
}

#[test]
fn preimage_metadata_mismatch_is_a_blocking_material_failure() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let mut operation = materialized(root, valid_target_body());
    operation.preimage.payload_bytes = 1;
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);

    let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::Invalid);
    assert!(!record.approval_ready);
    assert!(record.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::MaterialIntegrity
            && finding.severity == ValidationSeverity::Blocking
            && finding.message.contains("preimage metadata")
    }));
}

#[test]
fn invalid_frontmatter_is_a_blocking_validation_failure() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, "---\ntags: [unterminated\n---\n\nbody\n");
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);

    let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::Invalid);
    assert!(!record.approval_ready);
    assert_eq!(record.blocking_error_count, 1);
    assert!(record.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::InvalidFrontmatter
            && finding.severity == ValidationSeverity::Blocking
    }));
}

#[test]
fn current_chunk_evidence_is_digest_bound_and_identity_checked() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);
    let mut changed_chunk = chunk.clone();
    changed_chunk.range = "bytes:0..4".to_string();
    let mut wrong_document_chunk = chunk.clone();
    wrong_document_chunk.document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:other".to_string(),
        stem: "other".to_string(),
        path: ".vault/plan/other.md".to_string(),
        doc_type: "plan".to_string(),
        base_revision: operation.target_snapshot.base_revision.clone(),
    };

    let first = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        &[chunk],
        200,
    )
    .unwrap();
    let changed = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        &[changed_chunk],
        200,
    )
    .unwrap();
    let wrong = validate_changeset_material(&[operation], &[current], &[wrong_document_chunk], 200)
        .unwrap();

    assert_ne!(first.validation_digest, changed.validation_digest);
    assert_eq!(wrong.status, ValidationStatus::Stale);
    assert!(!wrong.approval_ready);
    assert!(wrong.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::StaleChunkEvidence
            && finding.severity == ValidationSeverity::Blocking
    }));
}

#[test]
fn missing_chunk_evidence_is_warning_only_for_whole_document_skeleton() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);

    let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::ValidWithWarnings);
    assert!(record.approval_ready);
    assert_eq!(record.warning_count, 1);
    assert!(record.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::MissingChunkEvidence
            && finding.severity == ValidationSeverity::Warning
    }));
}

#[test]
fn stale_chunk_evidence_blocks_review_readiness() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let mut chunk = current_chunk(&operation);
    chunk.status = ChunkEvidenceStatus::Stale;
    chunk.observed_content_hash = Some("different".to_string());

    let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::Stale);
    assert!(!record.approval_ready);
    assert!(record.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::StaleChunkEvidence
            && finding.severity == ValidationSeverity::Blocking
    }));
}

#[test]
fn changed_base_revision_blocks_review_readiness_as_stale() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let operation = materialized(root, valid_target_body());
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "changed outside proposal\n",
    );
    let changed_snapshot = SnapshotReader::for_worktree(root)
        .capture_existing(&operation.target_snapshot.document)
        .unwrap();
    let current = current_observation("child_1", &changed_snapshot);
    let chunk = current_chunk(&operation);

    let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::Stale);
    assert!(!record.approval_ready);
    let finding = record
        .findings
        .iter()
        .find(|finding| finding.code == ValidationFindingCode::StaleBaseRevision)
        .expect("stale base revision finding is recorded");
    assert_eq!(
        finding.expected_revision.as_ref(),
        Some(&operation_base_revision(finding))
    );
    assert_ne!(finding.expected_revision, finding.actual_revision);
}

#[test]
fn missing_current_revision_is_a_blocking_failure() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let operation = materialized(root, valid_target_body());
    let chunk = current_chunk(&operation);

    let record = validate_changeset_material(&[operation], &[], &[chunk], 200).unwrap();

    assert_eq!(record.status, ValidationStatus::Invalid);
    assert!(!record.approval_ready);
    assert_eq!(record.blocking_error_count, 1);
    assert!(record.findings.iter().any(|finding| {
        finding.code == ValidationFindingCode::MissingCurrentRevision
            && finding.severity == ValidationSeverity::Blocking
    }));
}

#[test]
fn review_eligibility_requires_matching_fresh_digest() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();

    let allowed = submit_for_review_eligibility(Some(&record), Some(&record.validation_digest));
    assert!(allowed.allowed);

    let stale_digest = submit_for_review_eligibility(Some(&record), Some("validation:old"));
    assert!(!stale_digest.allowed);

    let missing = submit_for_review_eligibility(None, Some("validation:old"));
    assert!(!missing.allowed);
}

#[test]
fn review_eligibility_denies_invalid_or_stale_records_even_with_matching_digest() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let invalid_operation = materialized(root, "---\ninvalid\n---\n");
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&invalid_operation);
    let invalid =
        validate_changeset_material(&[invalid_operation], &[current], &[chunk], 200).unwrap();

    let denied = submit_for_review_eligibility(Some(&invalid), Some(&invalid.validation_digest));

    assert!(!denied.allowed);
    assert_eq!(denied.command, CommandKind::SubmitForReview);
}

#[test]
fn stale_records_and_old_digests_are_not_approval_ready_after_revalidation() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);
    let valid = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        std::slice::from_ref(&chunk),
        200,
    )
    .unwrap();
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "changed outside proposal\n",
    );
    let changed_snapshot = SnapshotReader::for_worktree(root)
        .capture_existing(&operation.target_snapshot.document)
        .unwrap();
    let stale_current = current_observation("child_1", &changed_snapshot);
    let stale = validate_changeset_material(&[operation], &[stale_current], &[chunk], 201).unwrap();

    assert!(valid.approval_ready);
    assert!(valid.is_fresh_for_review(&valid.validation_digest));
    assert_eq!(stale.status, ValidationStatus::Stale);
    assert!(!stale.approval_ready);
    assert!(!stale.is_fresh_for_review(&stale.validation_digest));

    let stale_with_matching_digest =
        submit_for_review_eligibility(Some(&stale), Some(&stale.validation_digest));
    let old_record_with_new_digest =
        submit_for_review_eligibility(Some(&valid), Some(&stale.validation_digest));

    assert!(!stale_with_matching_digest.allowed);
    assert!(!old_record_with_new_digest.allowed);
}

#[test]
fn validation_records_persist_and_reload_by_digest_and_changeset() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();
    let mut store = Store::open(&root.join(".vault")).unwrap();

    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations().store_record(&record)
        })
        .unwrap();

    let by_digest = store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations()
                .record_by_digest(&record.validation_digest)
        })
        .unwrap()
        .expect("validation record is stored by digest");
    let latest = store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations().latest_for_changeset(&record.changeset_id)
        })
        .unwrap()
        .expect("latest validation record is stored");

    assert_eq!(by_digest, record);
    assert_eq!(latest, record);
}

#[test]
fn latest_validation_record_uses_insert_sequence_when_timestamps_tie() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let chunk = current_chunk(&operation);
    let valid = validate_changeset_material(
        std::slice::from_ref(&operation),
        std::slice::from_ref(&current),
        std::slice::from_ref(&chunk),
        200,
    )
    .unwrap();
    write_doc(
        root,
        ".vault/plan/validation-plan.md",
        "changed outside proposal\n",
    );
    let changed_snapshot = SnapshotReader::for_worktree(root)
        .capture_existing(&operation.target_snapshot.document)
        .unwrap();
    let changed_current = current_observation("child_1", &changed_snapshot);
    let stale =
        validate_changeset_material(&[operation], &[changed_current], &[chunk], 200).unwrap();
    let mut store = Store::open(&root.join(".vault")).unwrap();

    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations().store_record(&valid)?;
            uow.validations().store_record(&stale)?;
            Ok(())
        })
        .unwrap();

    let latest = store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations().latest_for_changeset(&valid.changeset_id)
        })
        .unwrap()
        .expect("latest validation record exists");

    assert_eq!(latest.validation_digest, stale.validation_digest);
    assert_eq!(latest.status, ValidationStatus::Stale);
    assert!(!latest.approval_ready);
}

#[test]
fn validation_record_digest_mismatch_is_rejected_on_reload() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_doc(root, ".vault/plan/validation-plan.md", "base\n");
    let snapshot = base_snapshot(root);
    let operation = materialized(root, valid_target_body());
    let current = current_observation("child_1", &snapshot);
    let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();
    let mut store = Store::open(&root.join(".vault")).unwrap();

    store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations().store_record(&record)
        })
        .unwrap();

    let mut tampered = record.clone();
    tampered.material_digest = "material:tampered".to_string();
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_validation_records
             SET record_json = ?1
             WHERE validation_digest = ?2",
        (
            serde_json::to_string(&tampered).unwrap(),
            record.validation_digest.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
            uow.validations()
                .record_by_digest(&record.validation_digest)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Validation(detail) if detail.contains("validation_digest")));
}

fn operation_base_revision(finding: &ValidationFinding) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = &finding.document else {
        panic!("finding should reference an existing document");
    };
    base_revision.clone()
}
