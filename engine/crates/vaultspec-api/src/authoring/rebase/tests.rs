use std::path::Path;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput, ActorStatus};
use crate::authoring::api::CreateSessionRequest;
use crate::authoring::ledger::ChangesetHistory;
use crate::authoring::model::{ActorId, ActorKind, ActorRef, IdempotencyKey, SessionId};

fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn remove_doc(root: &Path, rel: &str) {
    std::fs::remove_file(root.join(rel)).unwrap();
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    register_actor_and_session(&mut store);
    (dir, store)
}

fn register_actor_and_session(store: &mut Store) {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().put_record(ActorRecordInput {
                actor: actor(),
                display: ActorDisplayMetadata::new("Rebase test actor", None),
                status: ActorStatus::Active,
                created_at_ms: 1,
                updated_at_ms: 1,
            })?;
            uow.sessions().create_session(
                session_id(),
                CreateSessionRequest {
                    scope: "rebase-tests".to_string(),
                    title: "Rebase test session".to_string(),
                },
                actor(),
                1,
            )?;
            Ok(())
        })
        .unwrap();
}

fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:rebase-tests").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn changeset_id(value: &str) -> ChangesetId {
    ChangesetId::new(value).unwrap()
}

fn context(key: &str, now_ms: i64) -> ProposalCommandContext {
    ProposalCommandContext {
        actor: actor(),
        idempotency_key: IdempotencyKey::new(key).unwrap(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + 60_000),
        outcome_expires_at_ms: None,
    }
}

fn valid_body(label: &str) -> String {
    format!("---\ntags:\n  - '#plan'\n---\n\n# Plan\n\n{label}\n")
}

fn resolved_doc(root: &Path, stem: &str) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem(stem.to_string()))
        .unwrap()
}

fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("test document must be existing");
    };
    base_revision.clone()
}

fn create_request(
    root: &Path,
    changeset_id: ChangesetId,
    stem: &str,
    child_key: &str,
    body: impl Into<String>,
) -> CreateProposalRequest {
    let document = resolved_doc(root, stem);
    let revision = base_revision(&document);
    CreateProposalRequest {
        session_id: session_id(),
        changeset_id,
        summary: "create proposal".to_string(),
        operations: vec![ChangesetChildOperationDraft {
            child_key: child_key.to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: body.into(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        }],
    }
}

/// A ReplaceBody child materialized under `changeset_id` against the current base of
/// `stem`. Unlike copying another changeset's child, the embedded materialized
/// `changeset_id` matches, so the ledger accepts it for a fresh lineage (e.g. a
/// hand-built rollback lineage).
fn materialized_child(
    root: &Path,
    changeset_id: &ChangesetId,
    stem: &str,
    child_key: &str,
    body: &str,
) -> ChangesetChildOperationInput {
    let document = resolved_doc(root, stem);
    let revision = base_revision(&document);
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
    let draft = ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
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

/// A materialized `Rename` child (W02.P04 carry-forward coverage), mirroring
/// `materialized_child`'s ReplaceBody pattern.
fn materialized_rename_child(
    root: &Path,
    changeset_id: &ChangesetId,
    stem: &str,
    child_key: &str,
    new_stem: &str,
) -> ChangesetChildOperationInput {
    let document = resolved_doc(root, stem);
    let revision = base_revision(&document);
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
    let draft = ChangesetChildOperationDraft {
        child_key: child_key.to_string(),
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

fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
    match result {
        ProposalCommandResult::Accepted { outcome, .. } => outcome,
        other => panic!("expected accepted result, got {other:?}"),
    }
}

fn denied(result: ProposalCommandResult) -> ActionEligibility {
    match result {
        ProposalCommandResult::Denied { eligibility } => eligibility,
        other => panic!("expected denied result, got {other:?}"),
    }
}

fn latest_record(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetAggregateRecord {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().latest(changeset_id)
        })
        .unwrap()
        .expect("changeset has a latest revision")
}

fn history(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetHistory {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(changeset_id)
        })
        .unwrap()
}

/// Append the source children forward unchanged into a new revision with `status`,
/// through the REAL ledger (which validates the arc). Used to drive a changeset to a
/// `Conflicted` head, which is only reachable through the apply-completion arc.
fn append_status(
    store: &mut Store,
    changeset_id: &ChangesetId,
    status: ChangesetStatus,
    now_ms: i64,
) -> ChangesetAggregateRecord {
    let previous = latest_record(store, changeset_id);
    let children = previous
        .children
        .iter()
        .map(|child| ChangesetChildOperationInput {
            child_key: child.child_key.clone(),
            operation: child.operation,
            target: child.target.clone(),
            materialized_operation: child.materialized_operation.clone(),
            material_digest: child.material_digest.clone(),
            validation_digest: child.validation_digest.clone(),
        })
        .collect();
    let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id.clone(),
        previous_revision: Some(previous.changeset_revision.clone()),
        kind: previous.kind,
        status,
        session_id: previous.session_id.clone(),
        actor: actor(),
        summary: format!("advance to {status:?}"),
        children,
        created_at_ms: now_ms,
    })
    .unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();
    record
}

/// Drive a freshly-created authoring changeset all the way to a `Conflicted` head
/// through the real declared arcs: Draft -> Proposed -> NeedsReview -> Approved ->
/// Applying -> Conflicted (a failed apply attempt).
fn drive_to_conflicted(store: &mut Store, changeset_id: &ChangesetId, now_ms: i64) {
    for (offset, status) in [
        ChangesetStatus::Proposed,
        ChangesetStatus::NeedsReview,
        ChangesetStatus::Approved,
        ChangesetStatus::Applying,
        ChangesetStatus::Conflicted,
    ]
    .into_iter()
    .enumerate()
    {
        append_status(store, changeset_id, status, now_ms + offset as i64 + 1);
    }
}

#[test]
fn successful_rebase_produces_new_reviewable_draft_against_current_base() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);
    write_doc(root, ".vault/plan/rebase-plan.md", &valid_body("base one"));
    let id = changeset_id("changeset_rebase_ok");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:ok", 100),
            create_request(
                root,
                id.clone(),
                "rebase-plan",
                "child_1",
                valid_body("edited"),
            ),
        )
        .unwrap(),
    );
    let conflicted_child_base = base_revision(&resolved_doc(root, "rebase-plan"));
    drive_to_conflicted(&mut store, &id, 100);
    let conflicted = latest_record(&mut store, &id);
    assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

    // An out-of-band edit lands, so the conflicted child's recorded base is now stale
    // against the worktree.
    write_doc(
        root,
        ".vault/plan/rebase-plan.md",
        &valid_body("base two changed"),
    );
    let current_base = base_revision(&resolved_doc(root, "rebase-plan"));
    assert_ne!(current_base, conflicted_child_base);

    let outcome = accepted(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:ok", 200),
            RebaseProposalRequest {
                changeset_id: id.clone(),
                expected_revision: conflicted.changeset_revision.clone(),
                summary: "rebase onto current base".to_string(),
            },
        )
        .unwrap(),
    );

    // The rebase re-enters review as a fresh Draft on the SAME changeset.
    assert_eq!(outcome.command, CommandKind::Rebase);
    assert_eq!(outcome.status, ChangesetStatus::Draft);
    let rebased = latest_record(&mut store, &id);
    assert_eq!(rebased.status, ChangesetStatus::Draft);
    assert_eq!(
        rebased.previous_revision.as_ref(),
        Some(&conflicted.changeset_revision),
        "the rebase revision descends from the conflicted head"
    );

    let child = &rebased.children[0];
    let operation = child
        .materialized_operation
        .as_ref()
        .expect("rebased child is re-materialized");
    // The drafted edit intent is PRESERVED; the base is RE-BASED onto the current rev.
    assert_eq!(operation.target_snapshot.payload_text, valid_body("edited"));
    assert_eq!(
        operation.target_snapshot.base_revision, current_base,
        "the child is re-based onto the current worktree revision"
    );
    assert_ne!(
        operation.target_snapshot.base_revision,
        conflicted_child_base
    );
}

#[test]
fn successful_rebase_carries_forward_a_rename_by_re_targeting_the_same_new_stem() {
    // W02.P04 follow-on: carry-forward previously hardcoded ReplaceBody only
    // (rebase.rs:442 pre-fix); a Conflicted Rename source must re-materialize
    // against the fresh base while PRESERVING the proposed target stem —
    // never dropping the rename intent, never silently downgrading to a
    // body write.
    let (dir, mut store) = temp_store();
    let root = dir.path();
    write_doc(
        root,
        ".vault/plan/rebase-rename-plan.md",
        &valid_body("base one"),
    );
    let id = changeset_id("changeset_rebase_rename");

    let rename_child = materialized_rename_child(
        root,
        &id,
        "rebase-rename-plan",
        "child_1",
        "rebase-rename-plan-renamed",
    );
    let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: id.clone(),
        previous_revision: None,
        kind: ChangesetKind::Authoring,
        status: ChangesetStatus::Draft,
        session_id: Some(session_id()),
        actor: actor(),
        summary: "rename proposal".to_string(),
        children: vec![rename_child],
        created_at_ms: 10,
    })
    .unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&draft_rev)
        })
        .unwrap();

    let conflicted_child_base = base_revision(&resolved_doc(root, "rebase-rename-plan"));
    drive_to_conflicted(&mut store, &id, 100);
    let conflicted = latest_record(&mut store, &id);
    assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

    // An out-of-band CONTENT edit lands, staling the recorded base (the
    // rename never physically happened — it was never applied — so this is
    // ordinary content staleness, not anchor drift).
    write_doc(
        root,
        ".vault/plan/rebase-rename-plan.md",
        &valid_body("base two changed"),
    );
    let current_base = base_revision(&resolved_doc(root, "rebase-rename-plan"));
    assert_ne!(current_base, conflicted_child_base);

    let outcome = accepted(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:rename", 200),
            RebaseProposalRequest {
                changeset_id: id.clone(),
                expected_revision: conflicted.changeset_revision.clone(),
                summary: "rebase onto current base".to_string(),
            },
        )
        .unwrap(),
    );

    assert_eq!(outcome.command, CommandKind::Rebase);
    assert_eq!(outcome.status, ChangesetStatus::Draft);
    let rebased = latest_record(&mut store, &id);
    let child = &rebased.children[0];
    assert_eq!(
        child.operation,
        ChangesetOperationKind::Rename,
        "the carried-forward child stays a Rename, never downgraded to a body write"
    );
    let operation = child
        .materialized_operation
        .as_ref()
        .expect("rebased child is re-materialized");
    assert_eq!(
        operation.rename_edit.as_deref(),
        Some("rebase-rename-plan-renamed"),
        "the PROPOSED target stem is preserved across the rebase"
    );
    assert_eq!(
        operation.target_snapshot.base_revision, current_base,
        "the child is re-based onto the current worktree revision"
    );
}

#[test]
fn failed_rebase_denies_non_conflicted_head_and_anchor_drift() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);

    // (a) A non-conflicted head cannot rebase: the arc is Conflicted -> Draft only.
    write_doc(root, ".vault/plan/live-plan.md", &valid_body("live"));
    let live = changeset_id("changeset_rebase_live");
    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:live", 100),
            create_request(
                root,
                live.clone(),
                "live-plan",
                "child_1",
                valid_body("edit"),
            ),
        )
        .unwrap(),
    );
    let eligibility = denied(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:live", 101),
            RebaseProposalRequest {
                changeset_id: live.clone(),
                expected_revision: created.changeset_revision.clone(),
                summary: "rebase a draft".to_string(),
            },
        )
        .unwrap(),
    );
    assert!(
        eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("cannot transition")),
        "{eligibility:?}"
    );
    // The head is untouched by a denial.
    assert_eq!(
        latest_record(&mut store, &live).changeset_revision,
        created.changeset_revision
    );

    // (b) An anchor-drifted conflicted proposal cannot be auto-rebased.
    write_doc(root, ".vault/plan/drift-plan.md", &valid_body("drift"));
    let drift = changeset_id("changeset_rebase_drift");
    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:drift", 200),
            create_request(
                root,
                drift.clone(),
                "drift-plan",
                "child_1",
                valid_body("edit"),
            ),
        )
        .unwrap(),
    );
    drive_to_conflicted(&mut store, &drift, 200);
    let conflicted = latest_record(&mut store, &drift);
    assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

    // The target document is renamed: its recorded identity no longer resolves.
    remove_doc(root, ".vault/plan/drift-plan.md");
    write_doc(
        root,
        ".vault/plan/drift-plan-renamed.md",
        &valid_body("drift"),
    );

    let eligibility = denied(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:drift", 300),
            RebaseProposalRequest {
                changeset_id: drift.clone(),
                expected_revision: conflicted.changeset_revision.clone(),
                summary: "rebase a drifted target".to_string(),
            },
        )
        .unwrap(),
    );
    assert!(
        eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("moved or was removed")),
        "{eligibility:?}"
    );
    // Denial mutated nothing: the source stays conflicted for an explicit decision.
    assert_eq!(
        latest_record(&mut store, &drift).status,
        ChangesetStatus::Conflicted
    );
}

#[test]
fn superseded_original_yields_a_fresh_replacement_candidate() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);
    write_doc(root, ".vault/plan/replace-plan.md", &valid_body("base"));
    let source = changeset_id("changeset_replace_source");
    let replacement = changeset_id("changeset_replace_new");

    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:source", 100),
            create_request(
                root,
                source.clone(),
                "replace-plan",
                "child_1",
                valid_body("intent"),
            ),
        )
        .unwrap(),
    );
    // Drive the source to a mid-lifecycle, non-terminal head (NeedsReview) that has
    // no in-place rebase arc, so replacement is the explicit path.
    append_status(&mut store, &source, ChangesetStatus::Proposed, 101);
    let needs_review = append_status(&mut store, &source, ChangesetStatus::NeedsReview, 102);
    assert_eq!(needs_review.status, ChangesetStatus::NeedsReview);

    // An out-of-band edit staled the source base.
    write_doc(
        root,
        ".vault/plan/replace-plan.md",
        &valid_body("changed base"),
    );
    let current_base = base_revision(&resolved_doc(root, "replace-plan"));

    let result = create_replacement_proposal(
        &mut store,
        root,
        context("idem:replace", 200),
        CreateReplacementProposalRequest {
            source_changeset_id: source.clone(),
            source_expected_revision: needs_review.changeset_revision.clone(),
            replacement_changeset_id: replacement.clone(),
            summary: "regenerate against current base".to_string(),
        },
    )
    .unwrap();

    let replacement_outcome = accepted(result.replacement);
    assert_eq!(replacement_outcome.changeset_id, replacement);
    let supersession = accepted(result.supersession.expect("source is superseded"));
    assert_eq!(supersession.status, ChangesetStatus::Superseded);

    // The original is now terminally superseded; the replacement is a fresh Draft.
    let source_head = latest_record(&mut store, &source);
    assert_eq!(source_head.status, ChangesetStatus::Superseded);
    assert!(
        source_head.summary.contains(replacement.as_str()),
        "the superseded revision cross-links its replacement: {}",
        source_head.summary
    );
    let replacement_head = latest_record(&mut store, &replacement);
    assert_eq!(replacement_head.status, ChangesetStatus::Draft);
    assert!(
        replacement_head.summary.contains(source.as_str()),
        "the replacement cross-links its source: {}",
        replacement_head.summary
    );
    // The edit intent is carried forward; the replacement is re-based onto the
    // current worktree revision.
    let child = &replacement_head.children[0];
    let operation = child
        .materialized_operation
        .as_ref()
        .expect("replacement child is materialized");
    assert_eq!(operation.target_snapshot.payload_text, valid_body("intent"));
    assert_eq!(operation.target_snapshot.base_revision, current_base);
}

#[test]
fn cancelled_original_blocks_rebase_and_replacement() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);
    write_doc(root, ".vault/plan/cancelled-plan.md", &valid_body("base"));
    let source = changeset_id("changeset_cancelled_source");

    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:cancelled", 100),
            create_request(
                root,
                source.clone(),
                "cancelled-plan",
                "child_1",
                valid_body("intent"),
            ),
        )
        .unwrap(),
    );
    let cancelled = append_status(&mut store, &source, ChangesetStatus::Cancelled, 101);
    assert_eq!(cancelled.status, ChangesetStatus::Cancelled);

    // A terminal (cancelled) head cannot rebase.
    let rebase_denial = denied(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:cancelled", 102),
            RebaseProposalRequest {
                changeset_id: source.clone(),
                expected_revision: cancelled.changeset_revision.clone(),
                summary: "rebase a cancelled proposal".to_string(),
            },
        )
        .unwrap(),
    );
    assert!(
        rebase_denial
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("terminal")),
        "{rebase_denial:?}"
    );

    // A terminal source cannot be superseded, so no replacement is created and the
    // original is never orphaned.
    let replacement = changeset_id("changeset_cancelled_new");
    let result = create_replacement_proposal(
        &mut store,
        root,
        context("idem:replace:cancelled", 103),
        CreateReplacementProposalRequest {
            source_changeset_id: source.clone(),
            source_expected_revision: cancelled.changeset_revision.clone(),
            replacement_changeset_id: replacement.clone(),
            summary: "replace a cancelled proposal".to_string(),
        },
    )
    .unwrap();
    let denial = denied(result.replacement);
    assert!(
        denial
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("terminal")),
        "{denial:?}"
    );
    assert!(result.supersession.is_none(), "no supersede leg runs");
    // No replacement changeset was created; the source is untouched.
    assert!(
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow
                .ledger()
                .latest(&replacement))
            .unwrap()
            .is_none(),
        "a denied replacement creates nothing"
    );
    assert_eq!(
        latest_record(&mut store, &source).changeset_revision,
        cancelled.changeset_revision
    );
    assert_eq!(created.status, ChangesetStatus::Draft);
}

#[test]
fn replayed_rebase_and_replacement_requests_are_idempotent() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);

    // --- In-place rebase replay ---
    write_doc(root, ".vault/plan/replay-plan.md", &valid_body("base"));
    let id = changeset_id("changeset_replay_rebase");
    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:replay", 100),
            create_request(
                root,
                id.clone(),
                "replay-plan",
                "child_1",
                valid_body("edit"),
            ),
        )
        .unwrap(),
    );
    drive_to_conflicted(&mut store, &id, 100);
    let conflicted = latest_record(&mut store, &id);
    write_doc(root, ".vault/plan/replay-plan.md", &valid_body("changed"));

    let request = RebaseProposalRequest {
        changeset_id: id.clone(),
        expected_revision: conflicted.changeset_revision.clone(),
        summary: "rebase once".to_string(),
    };
    let first = accepted(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:replay", 200),
            request.clone(),
        )
        .unwrap(),
    );
    // A retry under the same key replays the recorded outcome without a second append.
    match rebase_proposal(
        &mut store,
        root,
        context("idem:rebase:replay", 201),
        request,
    )
    .unwrap()
    {
        ProposalCommandResult::Replayed { idempotency } => {
            assert_eq!(idempotency.receipt_id.as_ref(), Some(&first.receipt_id));
        }
        other => panic!("expected replay, got {other:?}"),
    }
    assert_eq!(
        history(&mut store, &id).revisions.len(),
        7,
        "create + 5 drive arcs + one rebase; the replay adds nothing"
    );

    // --- Two-legged replacement replay, including crash-between-legs recovery ---
    write_doc(root, ".vault/plan/replace-replay.md", &valid_body("base"));
    let source = changeset_id("changeset_replay_source");
    let replacement = changeset_id("changeset_replay_new");
    let created = accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:replay-source", 300),
            create_request(
                root,
                source.clone(),
                "replace-replay",
                "child_1",
                valid_body("intent"),
            ),
        )
        .unwrap(),
    );
    let request = CreateReplacementProposalRequest {
        source_changeset_id: source.clone(),
        source_expected_revision: created.changeset_revision.clone(),
        replacement_changeset_id: replacement.clone(),
        summary: "replace once".to_string(),
    };

    // Simulate a crash AFTER the create leg landed but BEFORE the supersede leg: land
    // the create leg directly under the same key the flow will use, so the flow's
    // create replays and only the supersede runs fresh.
    let ReplacementPlan::Ready { create_request, .. } =
        plan_replacement(&mut store, root, &request, 400).unwrap()
    else {
        panic!("replacement is plannable");
    };
    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:replace-replay", 400),
            create_request,
        )
        .unwrap(),
    );
    // The source is not yet superseded — the crash struck between the legs.
    assert_eq!(
        latest_record(&mut store, &source).status,
        ChangesetStatus::Draft
    );

    let recovered = create_replacement_proposal(
        &mut store,
        root,
        context("idem:replace-replay", 401),
        request.clone(),
    )
    .unwrap();
    // The create leg replays (no double create); the supersede leg completes.
    assert!(
        matches!(
            recovered.replacement,
            ProposalCommandResult::Replayed { .. }
        ),
        "the already-landed create replays: {:?}",
        recovered.replacement
    );
    let supersession = accepted(
        recovered
            .supersession
            .expect("supersede completes on replay"),
    );
    assert_eq!(supersession.status, ChangesetStatus::Superseded);
    assert_eq!(
        history(&mut store, &replacement).revisions.len(),
        1,
        "the replacement is created exactly once across the crash + replay"
    );
    assert_eq!(
        latest_record(&mut store, &source).status,
        ChangesetStatus::Superseded
    );

    // After both legs completed, the source head advanced to Superseded, so a
    // further replay of the ORIGINAL request — fenced on the source's old draft
    // revision — is a stale-fence fault, and neither changeset grows.
    let err = create_replacement_proposal(
        &mut store,
        root,
        context("idem:replace-replay", 402),
        request,
    )
    .unwrap_err();
    assert!(
        matches!(err, StoreError::StaleRevision(_)),
        "a completed replacement's source head has moved: {err}"
    );
    assert_eq!(history(&mut store, &replacement).revisions.len(), 1);
    assert_eq!(history(&mut store, &source).revisions.len(), 2);
}

#[test]
fn stale_expected_revision_is_a_fault_not_a_denial() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    let reader = SnapshotReader::for_worktree(root);
    write_doc(root, ".vault/plan/stale-plan.md", &valid_body("base"));
    let id = changeset_id("changeset_stale_fence");
    accepted(
        create_proposal(
            &mut store,
            &reader,
            context("idem:create:stale", 100),
            create_request(
                root,
                id.clone(),
                "stale-plan",
                "child_1",
                valid_body("edit"),
            ),
        )
        .unwrap(),
    );
    drive_to_conflicted(&mut store, &id, 100);

    // A stale expected_revision is an optimistic-concurrency fault, mapped to 409.
    let err = rebase_proposal(
        &mut store,
        root,
        context("idem:rebase:stale", 200),
        RebaseProposalRequest {
            changeset_id: id.clone(),
            expected_revision: RevisionToken::new("changeset:staleaaaaaaaa").unwrap(),
            summary: "rebase with a stale fence".to_string(),
        },
    )
    .unwrap_err();
    assert!(
        matches!(err, StoreError::StaleRevision(_)),
        "stale fence is a fault: {err}"
    );
}

#[test]
fn rebase_of_a_rollback_changeset_preserves_kind_into_rollback_proposed() {
    let (dir, mut store) = temp_store();
    let root = dir.path();
    write_doc(root, ".vault/plan/rollback-plan.md", &valid_body("base"));

    // Build a ReplaceBody child materialized under the rollback changeset id, then
    // hand-append a ROLLBACK-kind lineage to a Conflicted head so the kind-preserving
    // rebase arc (Conflicted -> RollbackProposed) is exercised.
    let rollback_id = changeset_id("changeset_rollback_lineage");
    let child = materialized_child(
        root,
        &rollback_id,
        "rollback-plan",
        "child_1",
        &valid_body("intent"),
    );
    let mut previous: Option<ChangesetAggregateRecord> = None;
    for (offset, status) in [
        ChangesetStatus::RollbackProposed,
        ChangesetStatus::NeedsReview,
        ChangesetStatus::Approved,
        ChangesetStatus::Applying,
        ChangesetStatus::Conflicted,
    ]
    .into_iter()
    .enumerate()
    {
        let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: rollback_id.clone(),
            previous_revision: previous.as_ref().map(|r| r.changeset_revision.clone()),
            kind: ChangesetKind::Rollback,
            status,
            session_id: Some(session_id()),
            actor: actor(),
            summary: format!("rollback to {status:?}"),
            children: vec![child.clone()],
            created_at_ms: 100 + offset as i64,
        })
        .unwrap();
        store
            .with_unit_of_work(CommandKind::CreateRollback, |uow| {
                uow.ledger().append_revision(&record)
            })
            .unwrap();
        previous = Some(record);
    }
    let conflicted = previous.expect("rollback lineage reached conflicted");
    assert_eq!(conflicted.kind, ChangesetKind::Rollback);
    assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

    write_doc(root, ".vault/plan/rollback-plan.md", &valid_body("changed"));
    let outcome = accepted(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:rollback", 300),
            RebaseProposalRequest {
                changeset_id: rollback_id.clone(),
                expected_revision: conflicted.changeset_revision.clone(),
                summary: "rebase a conflicted rollback".to_string(),
            },
        )
        .unwrap(),
    );
    // A rollback rebase preserves its kind and re-enters review as RollbackProposed.
    assert_eq!(outcome.status, ChangesetStatus::RollbackProposed);
    let rebased = latest_record(&mut store, &rollback_id);
    assert_eq!(rebased.kind, ChangesetKind::Rollback);
    assert_eq!(rebased.status, ChangesetStatus::RollbackProposed);
}

// --- W02.P05: CreateDocument is denied carry-forward, not dropped -------

fn materialized_create_document_child(
    changeset_id: &ChangesetId,
    child_key: &str,
) -> ChangesetChildOperationInput {
    let document = DocumentRef::ProvisionalCreate {
        provisional_doc_id: format!("provisional:{child_key}"),
        doc_type: "plan".to_string(),
        feature: "create-rebase-probe".to_string(),
        title: "A New Plan".to_string(),
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
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_create_document(
        changeset_id,
        draft,
        1_768_435_200_000, // 2026-01-15T00:00:00Z, fixed
    )
    .unwrap();
    ChangesetChildOperationInput::from_materialized(
        materialized,
        format!("material:{child_key}"),
        format!("validation:{child_key}"),
    )
}

#[test]
fn create_document_child_is_denied_carry_forward_not_dropped() {
    // A create has no prior REVISION to rebase against (nothing existed to
    // drift from), so it is denied at rebase's VERY FIRST carry-forward
    // check — never silently dropped from the carried set, and never a
    // crash. Drive a changeset carrying a `CreateDocument` child to a
    // `Conflicted` head (the only status `rebase_proposal` acts on) via
    // hand-appended revisions, mirroring the rollback-lineage test above.
    let (dir, mut store) = temp_store();
    let root = dir.path();

    let create_id = changeset_id("changeset_create_rebase_probe");
    let child = materialized_create_document_child(&create_id, "child_1");
    let mut previous: Option<ChangesetAggregateRecord> = None;
    for (offset, status) in [
        ChangesetStatus::Draft,
        ChangesetStatus::NeedsReview,
        ChangesetStatus::Approved,
        ChangesetStatus::Applying,
        ChangesetStatus::Conflicted,
    ]
    .into_iter()
    .enumerate()
    {
        let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: create_id.clone(),
            previous_revision: previous.as_ref().map(|r| r.changeset_revision.clone()),
            kind: ChangesetKind::Authoring,
            status,
            session_id: Some(session_id()),
            actor: actor(),
            summary: format!("create rebase probe to {status:?}"),
            children: vec![child.clone()],
            created_at_ms: 100 + offset as i64,
        })
        .unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().append_revision(&record)
            })
            .unwrap();
        previous = Some(record);
    }
    let conflicted = previous.expect("create rebase probe reached conflicted");
    assert_eq!(conflicted.status, ChangesetStatus::Conflicted);

    let eligibility = denied(
        rebase_proposal(
            &mut store,
            root,
            context("idem:rebase:create-probe", 300),
            RebaseProposalRequest {
                changeset_id: create_id.clone(),
                expected_revision: conflicted.changeset_revision.clone(),
                summary: "rebase a conflicted create".to_string(),
            },
        )
        .unwrap(),
    );
    assert!(!eligibility.allowed);
    let reason = eligibility.reason.unwrap_or_default();
    assert!(
        reason.contains("only existing-document operations are rebaseable"),
        "a CreateDocument child must be denied with an honest reason, not silently \
             dropped or crashed: {reason}"
    );

    // The head is UNCHANGED — no new revision was appended, and the child's
    // materialized operation (the drafted create) is still there.
    let head = latest_record(&mut store, &create_id);
    assert_eq!(head.changeset_revision, conflicted.changeset_revision);
    assert_eq!(head.status, ChangesetStatus::Conflicted);
    assert_eq!(head.children.len(), 1);
}
