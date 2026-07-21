//! Shared fixtures + helpers for the apply test groups (module-decomposition), part 1.
//! Every group file does `use super::helpers::*` (+ `use super::helpers2::*`).

pub(super) use super::super::*;
pub(super) use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
pub(super) use crate::authoring::api::{
    ChangesetChildOperationDraft, DraftMode, DraftMutation, TargetRevisionFence,
};
pub(super) use crate::authoring::approvals::{
    ApprovalDecision, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple,
};
pub(super) use crate::authoring::leases::{AcquireLeaseInput, LeasePurpose, LeaseRecord};
pub(super) use crate::authoring::model::ProposalId;
pub(super) use crate::authoring::model::{
    ActorId, ActorKind, ApprovalId, ChangesetKind, ProvisionalCollisionStatus, SessionId,
};
pub(super) use crate::authoring::operations::MaterializedProposalOperation;
pub(super) use crate::authoring::snapshots::{PreimageCaptureRequest, SnapshotReader};
pub(super) use crate::authoring::store::Store;
pub(super) use crate::authoring::store::outbox::OutboxEvent;
pub(super) use crate::authoring::validation::{
    CurrentRevisionObservation, validate_changeset_material,
};
pub(super) use std::process::Command;
pub(super) use std::sync::Mutex;
pub(super) use std::time::Duration;

pub(super) const BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nbase content\n";

pub(super) const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nmaterialized content\n";

pub(super) const DOC_PATH: &str = ".vault/plan/apply-demo.md";

pub(super) fn actor(id: &str, kind: ActorKind) -> ActorRef {
    ActorRef {
        id: ActorId::new(id).unwrap(),
        kind,
        delegated_by: None,
    }
}

pub(super) struct Fx {
    pub(super) _dir: tempfile::TempDir,
    pub(super) store: Store,
    pub(super) root: PathBuf,
    pub(super) doc_file: PathBuf,
    pub(super) changeset_id: ChangesetId,
    pub(super) proposal_id: ProposalId,
    pub(super) origin: ActorRef,
    pub(super) applier: ActorRef,
    pub(super) expected_result_blob_hash: String,
}

/// Build a fully approved + materialized + validated single-child changeset in
/// a real temp worktree. When `approve` is false, the changeset stops at
/// `NeedsReview` (an approval request exists but no decision).
pub(super) fn setup(approve: bool) -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let doc_file = root.join(".vault").join("plan").join("apply-demo.md");
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(&doc_file, BASE_BODY).unwrap();

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    // Register every actor that appends a revision (origin, reviewer, applier).
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    // Materialize the single ReplaceBody child against the real base file.
    let reader = SnapshotReader::for_worktree(root.clone());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-demo".to_string(),
        stem: "apply-demo".to_string(),
        path: DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let base_revision = base_probe.revision.clone();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-demo".to_string(),
        stem: "apply-demo".to_string(),
        path: DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_revision.clone()),
            current_revision: Some(base_revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: NEW_BODY.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_replace_body(
        &changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    // The self-consistent validation record; its digest binds the approval.
    let current_observation = CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    // Seed Draft -> NeedsReview under the origin author; store validation.
    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    // Open the approval request.
    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    if approve {
        // The distinct human reviewer approves — appends the Approved revision.
        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();
    }

    Fx {
        _dir: dir,
        store,
        root,
        doc_file,
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}

pub(super) const FRONTMATTER_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply demo\n\nbase content\n";

pub(super) const FRONTMATTER_DOC_PATH: &str = ".vault/plan/apply-frontmatter-demo.md";

/// The `setup` sibling for an `EditFrontmatter` child (W02.P03): the SAME
/// Draft->NeedsReview->Approve scaffolding, materialized through
/// `materialize_edit_frontmatter` instead of `materialize_replace_body`.
pub(super) fn setup_frontmatter(approve: bool) -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let doc_file = root
        .join(".vault")
        .join("plan")
        .join("apply-frontmatter-demo.md");
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(&doc_file, FRONTMATTER_BASE_BODY).unwrap();

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_fm_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_fm_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    let reader = SnapshotReader::for_worktree(root.clone());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-frontmatter-demo".to_string(),
        stem: "apply-frontmatter-demo".to_string(),
        path: FRONTMATTER_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let base_revision = base_probe.revision.clone();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-frontmatter-demo".to_string(),
        stem: "apply-frontmatter-demo".to_string(),
        path: FRONTMATTER_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_fm_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::EditFrontmatter,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_revision.clone()),
            current_revision: Some(base_revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: None,
                related: None,
            }),
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
        &changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    let current_observation = CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply frontmatter demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply frontmatter demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_fm_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:fm:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    if approve {
        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                    proposal_id: &proposal_id,
                    decision: ApprovalDecision::Approve,
                    reviewer: &reviewer,
                    validation: ValidationFreshness::fresh(),
                    current_validation_digest: &validation_digest,
                    current_policy_version: V1_POLICY_VERSION,
                    run_cancelled: false,
                    comment: None,
                    decided_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap();
    }

    Fx {
        _dir: dir,
        store,
        root,
        doc_file,
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}

// --- W02.P03-R1: EditFrontmatter against the REAL core (kind-gated post-verify) ---

/// Serializes the tests that spawn the REAL `vaultspec-core` subprocess
/// (mirrors `direct_write::tests::REAL_CORE_TEST_LOCK`).
pub(super) static REAL_CORE_TEST_LOCK: Mutex<()> = Mutex::new(());

pub(super) const LIVE_FRONTMATTER_DOC_PATH: &str = ".vault/plan/apply-frontmatter-live-demo.md";

pub(super) const LIVE_FRONTMATTER_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply live frontmatter demo\n\nbase content\n";

pub(super) const LIVE_FRONTMATTER_NEW_DATE: &str = "2026-02-06";

pub(super) fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .env("GIT_AUTHOR_NAME", "apply-live")
        .env("GIT_AUTHOR_EMAIL", "apply-live@example.invalid")
        .env("GIT_COMMITTER_NAME", "apply-live")
        .env("GIT_COMMITTER_EMAIL", "apply-live@example.invalid")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

pub(super) fn scaffold_vaultspec_workspace(root: &Path) {
    crate::authoring::core_workspace::scaffold_vaultspec_workspace(root, "live-core apply tests");
}

/// The `setup_frontmatter` sibling that scaffolds a REAL git + vaultspec
/// workspace (rather than a bare tempdir) so the apply invocation can be
/// driven against the genuine `vaultspec-core` binary — the only way to
/// prove the kind-gated post-verify (R1) against core's ACTUAL
/// `set-frontmatter` write, not a mocked envelope.
pub(super) fn setup_live_frontmatter() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    let doc_file = root.join(LIVE_FRONTMATTER_DOC_PATH);
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(&doc_file, LIVE_FRONTMATTER_BASE_BODY).unwrap();
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "apply live frontmatter fixture"]);

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_fm_live_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_fm_live_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    let reader = SnapshotReader::for_worktree(root.clone());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-frontmatter-live-demo".to_string(),
        stem: "apply-frontmatter-live-demo".to_string(),
        path: LIVE_FRONTMATTER_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:apply-frontmatter-live-demo".to_string(),
        stem: "apply-frontmatter-live-demo".to_string(),
        path: LIVE_FRONTMATTER_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_probe.revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_fm_live_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::EditFrontmatter,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_probe.revision.clone()),
            current_revision: Some(base_probe.revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                date: Some(LIVE_FRONTMATTER_NEW_DATE.to_string()),
                tags: None,
                related: None,
            }),
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
        &changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    let current_observation = CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live frontmatter demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live frontmatter demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_fm_live_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:fm:live:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id: &proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: &validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms: 40,
            }))
        })
        .unwrap()
        .unwrap();

    Fx {
        _dir: dir,
        store,
        root,
        doc_file,
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}

// --- W02.P04: Rename against the REAL core -----------------------------

pub(super) const LIVE_RENAME_OLD_STEM: &str = "apply-rename-live-demo";

pub(super) const LIVE_RENAME_NEW_STEM: &str = "apply-rename-live-demo-renamed";

pub(super) const LIVE_RENAME_DOC_PATH: &str = ".vault/plan/apply-rename-live-demo.md";

pub(super) const LIVE_RENAME_RENAMED_DOC_PATH: &str =
    ".vault/plan/apply-rename-live-demo-renamed.md";

pub(super) const LIVE_RENAME_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply live rename demo\n\nbase content\n";

/// The `setup_live_frontmatter` sibling for `Rename`: a REAL git +
/// vaultspec workspace, an APPROVED single-child `Rename` changeset ready
/// to apply against the genuine `vaultspec-core` binary.
pub(super) fn setup_live_rename() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    let doc_file = root.join(LIVE_RENAME_DOC_PATH);
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(&doc_file, LIVE_RENAME_BASE_BODY).unwrap();
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "apply live rename fixture"]);

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_rn_live_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_rn_live_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    let reader = SnapshotReader::for_worktree(root.clone());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{LIVE_RENAME_OLD_STEM}"),
        stem: LIVE_RENAME_OLD_STEM.to_string(),
        path: LIVE_RENAME_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{LIVE_RENAME_OLD_STEM}"),
        stem: LIVE_RENAME_OLD_STEM.to_string(),
        path: LIVE_RENAME_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_probe.revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_rn_live_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::Rename,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_probe.revision.clone()),
            current_revision: Some(base_probe.revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: Some(LIVE_RENAME_NEW_STEM.to_string()),
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_rename(
        &changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    let current_observation = CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live rename demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live rename demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_rn_live_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:rn:live:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id: &proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: &validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms: 40,
            }))
        })
        .unwrap()
        .unwrap();

    Fx {
        _dir: dir,
        store,
        root,
        doc_file,
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}
