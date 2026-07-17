use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::model::{
    ActorId, ActorKind, ActorRef, CommandKind, DocumentRef, ProvisionalCollisionStatus,
};
use crate::authoring::store::Store;

fn changeset_id() -> ChangesetId {
    ChangesetId::new("changeset_1").unwrap()
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:ledger-tests").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

fn revision(value: &str) -> RevisionToken {
    RevisionToken::new(value).unwrap()
}

fn existing_doc(stem: &str, base_revision: &str) -> DocumentRef {
    DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{stem}"),
        stem: stem.to_string(),
        path: format!(".vault/plan/{stem}.md"),
        doc_type: "plan".to_string(),
        base_revision: revision(base_revision),
    }
}

fn provisional_doc(id: &str, stem: &str) -> DocumentRef {
    DocumentRef::ProvisionalCreate {
        provisional_doc_id: id.to_string(),
        doc_type: "plan".to_string(),
        feature: super::super::FEATURE_TAG.to_string(),
        title: format!("Create {stem}"),
        collision_status: ProvisionalCollisionStatus::Available,
        proposed_stem: Some(stem.to_string()),
        related: Vec::new(),
    }
}

fn fence(document: DocumentRef) -> TargetRevisionFence {
    let base_revision = match &document {
        DocumentRef::Existing { base_revision, .. } => Some(base_revision.clone()),
        _ => None,
    };
    TargetRevisionFence {
        document,
        base_revision: base_revision.clone(),
        current_revision: base_revision,
    }
}

fn child(
    child_key: &str,
    operation: ChangesetOperationKind,
    document: DocumentRef,
) -> ChangesetChildOperationInput {
    ChangesetChildOperationInput {
        child_key: child_key.to_string(),
        operation,
        target: fence(document),
        materialized_operation: None,
        material_digest: None,
        validation_digest: None,
    }
}

fn record(
    previous_revision: Option<RevisionToken>,
    status: ChangesetStatus,
    summary: &str,
    children: Vec<ChangesetChildOperationInput>,
    created_at_ms: i64,
) -> ChangesetAggregateRecord {
    ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id(),
        previous_revision,
        kind: ChangesetKind::Authoring,
        status,
        session_id: Some(session_id()),
        actor: actor(),
        summary: summary.to_string(),
        children,
        created_at_ms,
    })
    .unwrap()
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().put_record(ActorRecordInput::active(
                actor(),
                ActorDisplayMetadata::new("Ledger test agent", None),
                1,
            ))?;
            Ok(())
        })
        .unwrap();
    (dir, store)
}

fn unregistered_temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join(".vault")).unwrap();
    (dir, store)
}

#[test]
fn append_only_revisions_reconstruct_changeset_history() {
    let (_dir, mut store) = temp_store();
    let first = record(
        None,
        ChangesetStatus::Draft,
        "draft proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    let second = record(
        Some(first.changeset_revision.clone()),
        ChangesetStatus::Proposed,
        "proposed revision",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        101,
    );

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&first)?;
            uow.ledger().append_revision(&second)?;
            Ok(())
        })
        .unwrap();

    let history = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id())
        })
        .unwrap();
    let latest = history.latest().expect("history has latest revision");

    assert_eq!(history.revisions.len(), 2);
    assert_eq!(history.revisions[0], first);
    assert_eq!(latest.changeset_revision, second.changeset_revision);
    assert_eq!(latest.previous_revision, Some(first.changeset_revision));
    assert_eq!(latest.status, ChangesetStatus::Proposed);
}

#[test]
fn append_rejects_unregistered_actor_before_insert() {
    let (_dir, mut store) = unregistered_temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "unregistered actor proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap_err();

    assert!(
        matches!(err, StoreError::Actor(ref detail) if detail.contains("not registered")),
        "unexpected actor validation error: {err}"
    );
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM authoring_changeset_revisions",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn child_target_order_preserves_request_order_not_child_key_order() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "ordered children",
        vec![
            child(
                "child_b",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-b", "blob:bbb111"),
            ),
            child(
                "child_a",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-a", "blob:aaa111"),
            ),
        ],
        100,
    );

    assert_eq!(record.children[0].child_key, "child_b");
    assert_eq!(record.children[0].target_order, 0);
    assert_eq!(record.children[1].child_key, "child_a");
    assert_eq!(record.children[1].target_order, 1);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();
    let loaded = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger()
                .revision(&record.changeset_id, &record.changeset_revision)
        })
        .unwrap()
        .expect("record reloads");

    assert_eq!(
        loaded
            .children
            .iter()
            .map(|child| child.child_key.as_str())
            .collect::<Vec<_>>(),
        vec!["child_b", "child_a"]
    );
}

#[test]
fn duplicate_child_keys_are_rejected_before_store_insert() {
    let err = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id(),
        previous_revision: None,
        kind: ChangesetKind::Authoring,
        status: ChangesetStatus::Draft,
        session_id: Some(session_id()),
        actor: actor(),
        summary: "duplicate child".to_string(),
        children: vec![
            child(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-a", "blob:aaa111"),
            ),
            child(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-b", "blob:bbb111"),
            ),
        ],
        created_at_ms: 100,
    })
    .unwrap_err();

    assert!(matches!(
        err,
        LedgerError::DuplicateChildKey { child_key } if child_key == "child_1"
    ));
}

#[test]
fn child_keys_follow_authoring_token_policy() {
    let err = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: changeset_id(),
        previous_revision: None,
        kind: ChangesetKind::Authoring,
        status: ChangesetStatus::Draft,
        session_id: Some(session_id()),
        actor: actor(),
        summary: "invalid child".to_string(),
        children: vec![child(
            "child_1 ",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        created_at_ms: 100,
    })
    .unwrap_err();

    assert!(err.to_string().contains("surrounding whitespace"), "{err}");
}

#[test]
fn multi_document_changeset_shape_survives_restart() {
    let (dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "multi document proposal",
        vec![
            child(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-a", "blob:aaa111"),
            ),
            child(
                "child_2",
                ChangesetOperationKind::CreateDocument,
                provisional_doc("provisional_1", "ledger-new"),
            ),
        ],
        100,
    );

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();
    drop(store);

    let mut reopened = Store::open(&dir.path().join(".vault")).unwrap();
    let history = reopened
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id())
        })
        .unwrap();

    assert_eq!(history.revisions.len(), 1);
    let loaded = history.latest().unwrap();
    assert_eq!(loaded.operation_count, 2);
    assert_eq!(
        loaded
            .children
            .iter()
            .map(|child| child.operation)
            .collect::<Vec<_>>(),
        vec![
            ChangesetOperationKind::ReplaceBody,
            ChangesetOperationKind::CreateDocument
        ]
    );
}

#[test]
fn append_rejects_non_latest_previous_revision() {
    let (_dir, mut store) = temp_store();
    let first = record(
        None,
        ChangesetStatus::Draft,
        "draft proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    let stale_previous = record(
        Some(revision("changeset:not-the-latest")),
        ChangesetStatus::Proposed,
        "stale previous",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        101,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&first)?;
            uow.ledger().append_revision(&stale_previous)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("does not match latest")));
}

#[test]
fn append_rejects_illegal_lifecycle_status_skip() {
    let (_dir, mut store) = temp_store();
    let first = record(
        None,
        ChangesetStatus::Draft,
        "draft proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    let skipped_review = record(
        Some(first.changeset_revision.clone()),
        ChangesetStatus::Approved,
        "illegal approval skip",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        101,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&first)?;
            uow.ledger().append_revision(&skipped_review)
        })
        .unwrap_err();

    assert!(
        matches!(&err, StoreError::Ledger(detail) if detail.contains("cannot transition")),
        "illegal lifecycle skip must be rejected: {err}"
    );
}

#[test]
fn append_rejects_multi_child_apply_start() {
    let (_dir, mut store) = temp_store();
    let children = || {
        vec![
            child(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-a", "blob:aaa111"),
            ),
            child(
                "child_2",
                ChangesetOperationKind::CreateDocument,
                provisional_doc("provisional_1", "ledger-new"),
            ),
        ]
    };
    let draft = record(
        None,
        ChangesetStatus::Draft,
        "draft multi proposal",
        children(),
        100,
    );
    let review = record(
        Some(draft.changeset_revision.clone()),
        ChangesetStatus::NeedsReview,
        "review multi proposal",
        children(),
        101,
    );
    let approved = record(
        Some(review.changeset_revision.clone()),
        ChangesetStatus::Approved,
        "approved multi proposal",
        children(),
        102,
    );
    let applying = record(
        Some(approved.changeset_revision.clone()),
        ChangesetStatus::Applying,
        "illegal multi apply start",
        children(),
        103,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&draft)?;
            uow.ledger().append_revision(&review)?;
            uow.ledger().append_revision(&approved)?;
            uow.ledger().append_revision(&applying)
        })
        .unwrap_err();

    assert!(
        matches!(&err, StoreError::Ledger(detail) if detail.contains("exactly one child")),
        "multi-child apply start must be rejected: {err}"
    );
}

#[test]
fn append_rejects_reviewed_multi_child_narrowing_to_single_apply() {
    let (_dir, mut store) = temp_store();
    let reviewed_children = || {
        vec![
            child(
                "child_1",
                ChangesetOperationKind::ReplaceBody,
                existing_doc("ledger-a", "blob:aaa111"),
            ),
            child(
                "child_2",
                ChangesetOperationKind::CreateDocument,
                provisional_doc("provisional_1", "ledger-new"),
            ),
        ]
    };
    let draft = record(
        None,
        ChangesetStatus::Draft,
        "draft multi proposal",
        reviewed_children(),
        100,
    );
    let review = record(
        Some(draft.changeset_revision.clone()),
        ChangesetStatus::NeedsReview,
        "review multi proposal",
        reviewed_children(),
        101,
    );
    let approved = record(
        Some(review.changeset_revision.clone()),
        ChangesetStatus::Approved,
        "approved multi proposal",
        reviewed_children(),
        102,
    );
    let narrowed_apply = record(
        Some(approved.changeset_revision.clone()),
        ChangesetStatus::Applying,
        "illegal narrowed apply start",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        103,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&draft)?;
            uow.ledger().append_revision(&review)?;
            uow.ledger().append_revision(&approved)?;
            uow.ledger().append_revision(&narrowed_apply)
        })
        .unwrap_err();

    assert!(
        matches!(&err, StoreError::Ledger(detail) if detail.contains("exactly one child")),
        "narrowing a reviewed multi-child proposal at apply must be rejected: {err}"
    );
}

#[test]
fn append_rejects_apply_completion_child_swap() {
    let (_dir, mut store) = temp_store();
    let reviewed_child = || {
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )]
    };
    let draft = record(
        None,
        ChangesetStatus::Draft,
        "draft proposal",
        reviewed_child(),
        100,
    );
    let review = record(
        Some(draft.changeset_revision.clone()),
        ChangesetStatus::NeedsReview,
        "review proposal",
        reviewed_child(),
        101,
    );
    let approved = record(
        Some(review.changeset_revision.clone()),
        ChangesetStatus::Approved,
        "approved proposal",
        reviewed_child(),
        102,
    );
    let applying = record(
        Some(approved.changeset_revision.clone()),
        ChangesetStatus::Applying,
        "applying proposal",
        reviewed_child(),
        103,
    );
    let swapped_completion = record(
        Some(applying.changeset_revision.clone()),
        ChangesetStatus::Applied,
        "illegal swapped apply completion",
        vec![child(
            "child_2",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-b", "blob:bbb111"),
        )],
        104,
    );

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&draft)?;
            uow.ledger().append_revision(&review)?;
            uow.ledger().append_revision(&approved)?;
            uow.ledger().append_revision(&applying)?;
            uow.ledger().append_revision(&swapped_completion)
        })
        .unwrap_err();

    assert!(
        matches!(&err, StoreError::Ledger(detail) if detail.contains("preserve the reviewed child operation")),
        "apply completion must preserve the reviewed child operation: {err}"
    );
}

#[test]
fn history_reconstruction_is_independent_of_langgraph_or_frontend_memory() {
    let (dir, mut store) = temp_store();
    let first = record(
        None,
        ChangesetStatus::Draft,
        "restart proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&first)
        })
        .unwrap();
    drop(store);

    let mut reopened = Store::open(&dir.path().join(".vault")).unwrap();
    let history = reopened
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id())
        })
        .unwrap();
    let json = serde_json::to_value(&history).unwrap();

    assert_eq!(history.revisions, vec![first]);
    assert!(json.get("langgraph").is_none());
    assert!(json.get("frontend_state").is_none());
}

#[test]
fn ledger_digest_mismatch_is_rejected_on_reconstruction() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "tamper proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();

    let mut tampered = record.clone();
    tampered.children[0].material_digest = Some("material:tampered".to_string());
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_changeset_revisions
             SET record_json = ?1
             WHERE changeset_id = ?2
               AND changeset_revision = ?3",
        (
            serde_json::to_string(&tampered).unwrap(),
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    conn.execute(
        "UPDATE authoring_changeset_child_operations
             SET material_digest = ?1,
                 record_json = ?2
             WHERE changeset_id = ?3
               AND changeset_revision = ?4
               AND child_key = 'child_1'",
        (
            "material:tampered",
            serde_json::to_string(&tampered.children[0]).unwrap(),
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&record.changeset_id)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("aggregate_digest")));
}

#[test]
fn actor_provenance_tamper_is_rejected_on_reconstruction() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "actor tamper proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();

    let mut tampered = record.clone();
    tampered.actor.delegated_by = Some(ActorId::new("human:alice").unwrap());
    tampered.actor_provenance_key = actor_provenance_key(&tampered.actor);
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_changeset_revisions
             SET delegated_by_actor_id = ?1,
                 actor_provenance_key = ?2,
                 record_json = ?3
             WHERE changeset_id = ?4
               AND changeset_revision = ?5",
        (
            "human:alice",
            tampered.actor_provenance_key.as_str(),
            serde_json::to_string(&tampered).unwrap(),
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&record.changeset_id)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("aggregate_digest")));
}

#[test]
fn revision_column_mismatch_is_rejected_on_reconstruction() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "column tamper proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();

    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_changeset_revisions
             SET operation_count = operation_count + 1
             WHERE changeset_id = ?1
               AND changeset_revision = ?2",
        (
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&record.changeset_id)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("operation_count")));
}

#[test]
fn child_column_mismatch_is_rejected_on_reconstruction() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "child column tamper proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();

    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_changeset_child_operations
             SET child_key = 'child_1_shadow'
             WHERE changeset_id = ?1
               AND changeset_revision = ?2
               AND child_key = 'child_1'",
        (
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&record.changeset_id)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("child_key")));
}

#[test]
fn child_revision_fence_mismatch_is_rejected_on_reconstruction() {
    let (_dir, mut store) = temp_store();
    let record = record(
        None,
        ChangesetStatus::Draft,
        "revision fence tamper proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-a", "blob:aaa111"),
        )],
        100,
    );
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&record)
        })
        .unwrap();

    let mut tampered = record.clone();
    let tampered_revision = revision("blob:tampered");
    tampered.children[0].base_revision = Some(tampered_revision.clone());
    tampered.children[0].current_revision = Some(tampered_revision);
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    conn.execute(
        "UPDATE authoring_changeset_revisions
             SET record_json = ?1
             WHERE changeset_id = ?2
               AND changeset_revision = ?3",
        (
            serde_json::to_string(&tampered).unwrap(),
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    conn.execute(
        "UPDATE authoring_changeset_child_operations
             SET base_revision = ?1,
                 current_revision = ?1,
                 record_json = ?2
             WHERE changeset_id = ?3
               AND changeset_revision = ?4
               AND child_key = 'child_1'",
        (
            "blob:tampered",
            serde_json::to_string(&tampered.children[0]).unwrap(),
            record.changeset_id.as_str(),
            record.changeset_revision.as_str(),
        ),
    )
    .unwrap();
    drop(conn);

    let err = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&record.changeset_id)
        })
        .unwrap_err();

    assert!(matches!(err, StoreError::Ledger(detail) if detail.contains("base_revision")));
}

// ---- D4: run/turn provenance on the ledger record --------------------------------

#[test]
fn run_provenance_round_trips_and_preserves_revision_identity() {
    let (_dir, mut store) = temp_store();
    let base = record(
        None,
        ChangesetStatus::Draft,
        "agent proposal",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-prov", "blob:aaa111"),
        )],
        100,
    );
    // Attaching provenance must NOT change the changeset_revision: provenance names the
    // producing fact, it is not identity (excluded from the aggregate digest).
    let stamped = base.clone().with_run_provenance(
        Some(RunId::new("run:prov").unwrap()),
        Some("turn:prov".to_string()),
    );
    assert_eq!(
        stamped.changeset_revision, base.changeset_revision,
        "run/turn provenance is metadata, not identity — the revision is unchanged"
    );

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&stamped)?;
            Ok(())
        })
        .unwrap();

    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id())
        })
        .unwrap()
        .latest()
        .cloned()
        .expect("history has latest revision");
    assert_eq!(latest.run_id.as_ref().map(RunId::as_str), Some("run:prov"));
    assert_eq!(latest.turn_id.as_deref(), Some("turn:prov"));

    // The v21 provenance columns are populated to match the record, not left NULL.
    let conn = rusqlite::Connection::open(store.path()).unwrap();
    let (col_run, col_turn): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT run_id, turn_id
             FROM authoring_changeset_revisions
             WHERE changeset_revision = ?1",
            [stamped.changeset_revision.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(col_run.as_deref(), Some("run:prov"));
    assert_eq!(col_turn.as_deref(), Some("turn:prov"));
}

#[test]
fn a_human_changeset_carries_no_run_provenance() {
    let (_dir, mut store) = temp_store();
    let human = record(
        None,
        ChangesetStatus::Draft,
        "human direct save",
        vec![child(
            "child_1",
            ChangesetOperationKind::ReplaceBody,
            existing_doc("ledger-human", "blob:bbb222"),
        )],
        100,
    );
    assert!(
        human.run_id.is_none() && human.turn_id.is_none(),
        "a changeset built without provenance carries none"
    );

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().append_revision(&human)?;
            Ok(())
        })
        .unwrap();

    let latest = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.ledger().history(&changeset_id())
        })
        .unwrap()
        .latest()
        .cloned()
        .expect("history has latest revision");
    assert!(latest.run_id.is_none());
    assert!(latest.turn_id.is_none());
}
