pub(super) use std::path::Path;
pub(super) use std::process::Command;
pub(super) use std::sync::Mutex;

pub(super) use super::super::*;
pub(super) use crate::authoring::actors::{
    ActorDisplayMetadata, ActorRecordInput, ActorStatus, actor_provenance_key,
};
pub(super) use crate::authoring::api::{
    ChangesetOperationKind, CreateSessionRequest, DraftMode, DraftMutation, FrontmatterEditFields,
    TargetRevisionFence,
};
pub(super) use crate::authoring::apply::{
    ApplyChildOutcome, ApplyOutcome, ApplyRequest, apply_changeset,
};
pub(super) use crate::authoring::approvals::{
    ApprovalDecision, ApprovalRequestInput, ReviewDecisionInput, ReviewedTuple, V1_POLICY_VERSION,
};
pub(super) use crate::authoring::core_adapter::CoreAdapter;
pub(super) use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
pub(super) use crate::authoring::model::{
    ActorId, ActorKind, ApplyState, ApprovalId, DocumentRef, ProposalId,
    ProvisionalCollisionStatus, SessionId,
};
pub(super) use crate::authoring::store::idempotency::IdempotencyState;
pub(super) use crate::authoring::transitions::{
    RollbackChildEligibility, create_rollback_eligibility,
};

pub(super) fn write_doc(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

pub(super) fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    write_doc(
        dir.path(),
        ".vault/plan/proposal-plan.md",
        "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nold body\n",
    );
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    register_actor(&mut store);
    (dir, store)
}

pub(super) fn register_actor(store: &mut Store) {
    register_actor_with_status(store, actor(), ActorStatus::Active);
}

pub(super) fn register_actor_with_status(store: &mut Store, actor: ActorRef, status: ActorStatus) {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().put_record(ActorRecordInput {
                actor: actor.clone(),
                display: ActorDisplayMetadata::new("Proposal test actor", None),
                status,
                created_at_ms: 1,
                updated_at_ms: 1,
            })?;
            uow.sessions().create_session(
                session_id(),
                CreateSessionRequest {
                    scope: "proposal-tests".to_string(),
                    title: "Proposal test session".to_string(),
                },
                actor,
                1,
            )?;
            Ok(())
        })
        .unwrap();
}

pub(super) fn reader(root: &Path) -> SnapshotReader {
    SnapshotReader::for_worktree(root)
}

pub(super) fn resolved_doc(root: &Path) -> DocumentRef {
    DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("proposal-plan".to_string()))
        .unwrap()
}

pub(super) fn base_revision(document: &DocumentRef) -> RevisionToken {
    let DocumentRef::Existing { base_revision, .. } = document else {
        panic!("test document must be existing");
    };
    base_revision.clone()
}

pub(super) fn changeset_id(value: &str) -> ChangesetId {
    ChangesetId::new(value).unwrap()
}

pub(super) fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

pub(super) fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:proposal-tests").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

pub(super) fn human_actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:reviewer").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

pub(super) fn delegated_actor(delegated_by: &ActorRef) -> ActorRef {
    ActorRef {
        id: actor().id,
        kind: ActorKind::Agent,
        delegated_by: Some(delegated_by.id.clone()),
    }
}

pub(super) fn context(key: &str, now_ms: i64) -> ProposalCommandContext {
    context_for_actor(actor(), key, now_ms)
}

pub(super) fn context_for_actor(actor: ActorRef, key: &str, now_ms: i64) -> ProposalCommandContext {
    ProposalCommandContext {
        actor,
        idempotency_key: IdempotencyKey::new(key).unwrap(),
        now_ms,
        in_flight_expires_at_ms: Some(now_ms + 60_000),
        outcome_expires_at_ms: None,
    }
}

pub(super) fn valid_body(label: &str) -> String {
    format!("---\ntags:\n  - '#plan'\n---\n\n# Plan\n\n{label}\n")
}

pub(super) fn invalid_body(label: &str) -> String {
    format!("---\ntags: [unterminated\n---\n\n# Plan\n\n{label}\n")
}

pub(super) fn draft_for(
    root: &Path,
    child_key: &str,
    body: impl Into<String>,
) -> ChangesetChildOperationDraft {
    let document = resolved_doc(root);
    let revision = base_revision(&document);
    ChangesetChildOperationDraft {
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
    }
}

pub(super) fn create_request(
    root: &Path,
    changeset_id: ChangesetId,
    child_key: &str,
    body: impl Into<String>,
) -> CreateProposalRequest {
    CreateProposalRequest {
        session_id: session_id(),
        changeset_id,
        summary: "create proposal".to_string(),
        operations: vec![draft_for(root, child_key, body)],
    }
}

pub(super) fn draft_request(
    root: &Path,
    changeset_id: ChangesetId,
    expected_revision: RevisionToken,
    child_key: &str,
    body: impl Into<String>,
) -> DraftProposalRequest {
    DraftProposalRequest {
        changeset_id,
        expected_revision,
        summary: "mutate draft".to_string(),
        operations: vec![draft_for(root, child_key, body)],
    }
}

pub(super) fn terminal_request(
    changeset_id: ChangesetId,
    expected_revision: RevisionToken,
    summary: &str,
) -> TerminalProposalRequest {
    TerminalProposalRequest {
        changeset_id,
        expected_revision,
        summary: summary.to_string(),
    }
}

pub(super) fn accepted(result: ProposalCommandResult) -> ProposalCommandOutcome {
    match result {
        ProposalCommandResult::Accepted { outcome, .. } => outcome,
        other => panic!("expected accepted command result, got {other:?}"),
    }
}

pub(super) fn denied(result: ProposalCommandResult) -> ActionEligibility {
    match result {
        ProposalCommandResult::Denied { eligibility } => eligibility,
        other => panic!("expected denied command result, got {other:?}"),
    }
}

pub(super) fn assert_replayed(result: ProposalCommandResult) {
    match result {
        ProposalCommandResult::Replayed { idempotency } => {
            assert_eq!(idempotency.state, IdempotencyState::Recorded);
            assert!(idempotency.outcome.is_some());
        }
        other => panic!("expected replayed command result, got {other:?}"),
    }
}

pub(super) fn replayed(result: ProposalCommandResult) -> IdempotencyRecord {
    match result {
        ProposalCommandResult::Replayed { idempotency } => {
            assert_eq!(idempotency.state, IdempotencyState::Recorded);
            assert!(idempotency.outcome.is_some());
            idempotency
        }
        other => panic!("expected replayed command result, got {other:?}"),
    }
}

pub(super) fn replayed_outcome(
    result: ProposalCommandResult,
    expected: &ProposalCommandOutcome,
) -> IdempotencyRecord {
    let idempotency = replayed(result);
    let recorded = idempotency
        .outcome
        .as_ref()
        .expect("replay carries recorded outcome");
    assert_eq!(recorded.kind, OutcomeKind::Accepted);
    assert_eq!(recorded.aggregate_kind, "changeset");
    assert_eq!(recorded.aggregate_id, expected.changeset_id.as_str());
    assert_eq!(recorded.schema, OUTCOME_SCHEMA);
    assert_eq!(recorded.http_status, Some(202));
    assert_eq!(recorded.payload, serde_json::to_value(expected).unwrap());
    idempotency
}

pub(super) fn latest_record(
    store: &mut Store,
    changeset_id: &ChangesetId,
) -> ChangesetAggregateRecord {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().latest(changeset_id)
        })
        .unwrap()
        .expect("proposal has latest revision")
}

pub(super) fn history(store: &mut Store, changeset_id: &ChangesetId) -> ChangesetHistory {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(changeset_id)
        })
        .unwrap()
}

pub(super) fn snapshot(store: &mut Store, changeset_id: &ChangesetId) -> ProposalSnapshot {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            proposal_snapshot(uow, changeset_id)
        })
        .unwrap()
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct SideEffectCounts {
    pub(super) idempotency: i64,
    pub(super) preimages: i64,
    pub(super) validations: i64,
    pub(super) ledger: i64,
    pub(super) outbox: i64,
}

pub(super) fn side_effect_counts(store: &Store) -> SideEffectCounts {
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    let count = |table: &str| -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    };
    SideEffectCounts {
        idempotency: count("authoring_idempotency_records"),
        preimages: count("authoring_document_preimages"),
        validations: count("authoring_validation_records"),
        ledger: count("authoring_changeset_revisions"),
        outbox: count("authoring_outbox_events"),
    }
}

/// A thin test wrapper over the REAL [`validation_evidence`] (the same
/// server-side derivation the submit route feeds `validate_proposal`) —
/// kept as a wrapper rather than a duplicated inline reimplementation so
/// this test module automatically inherits its per-kind dispatch (e.g. the
/// `CreateDocument` phantom-observation branch) instead of drifting out of
/// sync with it.
pub(super) fn validation_inputs(
    root: &Path,
    latest: &ChangesetAggregateRecord,
) -> (
    Vec<CurrentRevisionObservation>,
    Vec<ChunkValidationEvidence>,
) {
    validation_evidence(&reader(root), latest).unwrap()
}

pub(super) fn validate_latest(
    store: &mut Store,
    root: &Path,
    changeset_id: &ChangesetId,
    key: &str,
    now_ms: i64,
) -> ProposalCommandOutcome {
    let latest = latest_record(store, changeset_id);
    let (current_revisions, chunk_evidence) = validation_inputs(root, &latest);
    accepted(
        validate_proposal(
            store,
            context(key, now_ms),
            ValidateProposalRequest {
                changeset_id: changeset_id.clone(),
                expected_revision: latest.changeset_revision,
                summary: "validate proposal".to_string(),
                current_revisions,
                chunk_evidence,
            },
        )
        .unwrap(),
    )
}
