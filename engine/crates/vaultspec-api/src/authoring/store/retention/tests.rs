use super::*;
use crate::authoring::model::CommandKind;
use crate::authoring::store::Store;

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");
    let store = Store::open(&vault_root).unwrap();
    (dir, store)
}

fn record_ref(kind: &str, id: &str) -> RetentionRecordRef {
    RetentionRecordRef::new(kind, id).unwrap()
}

fn record(
    kind: &str,
    id: &str,
    retention_class: RetentionClass,
    lifecycle_status: LifecycleStatus,
    content_hash: &str,
) -> RetentionRecord {
    RetentionRecord::new(
        record_ref(kind, id),
        "changeset",
        "changeset_1",
        retention_class,
        lifecycle_status,
        content_hash,
        100,
    )
    .unwrap()
}

fn upsert(store: &mut Store, record: &RetentionRecord) {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().upsert_record(record)
        })
        .unwrap();
}

#[test]
fn pending_approval_is_protected_from_compaction() {
    let (_dir, mut store) = temp_store();
    let mut approval = record(
        "approval",
        "approval_1",
        RetentionClass::ProtectedProductState,
        LifecycleStatus::Pending,
        "hash:approval",
    );
    approval.compact_after_ms = Some(101);
    upsert(&mut store, &approval);

    let decision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().compact_record(CompactionRequest {
                record_ref: approval.record_ref.clone(),
                run_id: "compact:pending".to_string(),
                marker_id: "marker:pending".to_string(),
                now_ms: 102,
                summary_json: Some("{\"summary\":\"blocked\"}".to_string()),
                summary_hash: Some("summary:approval".to_string()),
                allow_rollback_limitation: false,
                rollback_unavailable_reason: None,
            })
        })
        .unwrap();

    match decision {
        CompactionDecision::Blocked(marker) => {
            assert_eq!(marker.disposition, CompactionDisposition::SkippedProtected);
            assert!(marker.reason.contains("pending"));
        }
        other => panic!("expected protected approval block, got {other:?}"),
    }

    let retained = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().record(&approval.record_ref)
        })
        .unwrap()
        .unwrap();
    assert_eq!(retained.payload_state, PayloadState::Full);
    assert!(retained.protected);
}

#[test]
fn apply_receipt_is_protected_and_backup_required() {
    let (_dir, mut store) = temp_store();
    let receipt = record(
        "apply_receipt",
        "receipt_1",
        RetentionClass::AuditReceipt,
        LifecycleStatus::Applied,
        "hash:receipt",
    );
    upsert(&mut store, &receipt);

    let decision = store
        .with_unit_of_work(CommandKind::RequestApply, |uow| {
            uow.retention().compact_record(CompactionRequest {
                record_ref: receipt.record_ref.clone(),
                run_id: "compact:receipt".to_string(),
                marker_id: "marker:receipt".to_string(),
                now_ms: 110,
                summary_json: None,
                summary_hash: Some("summary:receipt".to_string()),
                allow_rollback_limitation: false,
                rollback_unavailable_reason: None,
            })
        })
        .unwrap();

    assert!(matches!(decision, CompactionDecision::Blocked(_)));
    let export = store
        .with_unit_of_work(CommandKind::RequestApply, |uow| {
            uow.retention()
                .create_backup_export("backup:receipt", "receipt coverage", 111)
        })
        .unwrap();
    assert_eq!(export.required_count, 1);
    assert_eq!(export.items[0].record_ref, receipt.record_ref);
    assert_eq!(
        export.items[0].retention_class,
        RetentionClass::AuditReceipt
    );
}

#[test]
fn rollback_preimage_requires_explicit_limitation_before_compaction() {
    let (_dir, mut store) = temp_store();
    let preimage = record(
        "preimage",
        "preimage_1",
        RetentionClass::RollbackMaterial,
        LifecycleStatus::Applied,
        "hash:preimage",
    );
    upsert(&mut store, &preimage);

    let blocked = store
        .with_unit_of_work(CommandKind::CreateRollback, |uow| {
            uow.retention().compact_record(CompactionRequest {
                record_ref: preimage.record_ref.clone(),
                run_id: "compact:preimage:block".to_string(),
                marker_id: "marker:preimage:block".to_string(),
                now_ms: 120,
                summary_json: Some("{\"summary\":\"preimage\"}".to_string()),
                summary_hash: Some("summary:preimage".to_string()),
                allow_rollback_limitation: false,
                rollback_unavailable_reason: None,
            })
        })
        .unwrap();
    assert!(matches!(blocked, CompactionDecision::Blocked(_)));

    let compacted = store
        .with_unit_of_work(CommandKind::CreateRollback, |uow| {
            uow.retention().compact_record(CompactionRequest {
                record_ref: preimage.record_ref.clone(),
                run_id: "compact:preimage:limit".to_string(),
                marker_id: "marker:preimage:limit".to_string(),
                now_ms: 121,
                summary_json: Some("{\"summary\":\"preimage digest retained\"}".to_string()),
                summary_hash: Some("summary:preimage".to_string()),
                allow_rollback_limitation: true,
                rollback_unavailable_reason: Some(
                    "preimage compacted by explicit retention policy".to_string(),
                ),
            })
        })
        .unwrap();

    match compacted {
        CompactionDecision::Compacted(record) => {
            assert_eq!(record.payload_state, PayloadState::Summarized);
            assert!(!record.rollback_available);
            assert_eq!(
                record.rollback_unavailable_reason.as_deref(),
                Some("preimage compacted by explicit retention policy")
            );
        }
        other => panic!("expected explicit rollback limitation, got {other:?}"),
    }
}

#[test]
fn rollback_limitation_survives_later_metadata_refresh() {
    let (_dir, mut store) = temp_store();
    let preimage_ref = record_ref("preimage", "preimage_refresh");
    let preimage = RetentionRecord::new(
        preimage_ref.clone(),
        "changeset",
        "changeset_refresh",
        RetentionClass::RollbackMaterial,
        LifecycleStatus::Applied,
        "hash:preimage:old",
        100,
    )
    .unwrap();
    upsert(&mut store, &preimage);

    store
        .with_unit_of_work(CommandKind::CreateRollback, |uow| {
            uow.retention().compact_record(CompactionRequest {
                record_ref: preimage_ref.clone(),
                run_id: "compact:preimage:refresh".to_string(),
                marker_id: "marker:preimage:refresh".to_string(),
                now_ms: 121,
                summary_json: Some("{\"summary\":\"preimage digest retained\"}".to_string()),
                summary_hash: Some("summary:preimage:refresh".to_string()),
                allow_rollback_limitation: true,
                rollback_unavailable_reason: Some(
                    "preimage compacted by explicit retention policy".to_string(),
                ),
            })?;
            Ok(())
        })
        .unwrap();

    let refreshed = RetentionRecord::new(
        preimage_ref.clone(),
        "changeset",
        "changeset_refresh",
        RetentionClass::RollbackMaterial,
        LifecycleStatus::Applied,
        "hash:preimage:new",
        130,
    )
    .unwrap();
    upsert(&mut store, &refreshed);

    let retained = store
        .with_unit_of_work(CommandKind::CreateRollback, |uow| {
            uow.retention().record(&preimage_ref)
        })
        .unwrap()
        .unwrap();
    assert_eq!(retained.payload_state, PayloadState::Summarized);
    assert_eq!(
        retained.summary_hash.as_deref(),
        Some("summary:preimage:refresh")
    );
    assert!(!retained.rollback_available);
    assert_eq!(
        retained.rollback_unavailable_reason.as_deref(),
        Some("preimage compacted by explicit retention policy")
    );
}

#[test]
fn rejected_transcripts_are_compacted_under_policy() {
    let (_dir, mut store) = temp_store();
    let mut transcript = record(
        "generation_transcript",
        "transcript_1",
        RetentionClass::GenerationTranscript,
        LifecycleStatus::Rejected,
        "hash:transcript",
    );
    transcript.compact_after_ms = Some(150);
    transcript.payload_bytes = 4096;
    upsert(&mut store, &transcript);

    let summary = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .compact_due("compact:transcripts", 151, 10, "summary:transcript")
        })
        .unwrap();
    assert_eq!(summary.compacted_count, 1);
    assert_eq!(summary.limited_count, 0);

    let runs = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().compaction_run_count()
        })
        .unwrap();
    assert_eq!(
        runs, 1,
        "a sweep that did work records exactly one audit row"
    );

    let compacted = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().record(&transcript.record_ref)
        })
        .unwrap()
        .unwrap();
    assert_eq!(compacted.payload_state, PayloadState::Summarized);
    assert_eq!(
        compacted.summary_hash.as_deref(),
        Some("summary:transcript")
    );
}

#[test]
fn compaction_is_bounded_and_reports_remaining_due_records() {
    let (_dir, mut store) = temp_store();
    for idx in 1..=3 {
        let mut transcript = record(
            "generation_transcript",
            &format!("transcript_{idx}"),
            RetentionClass::GenerationTranscript,
            LifecycleStatus::Rejected,
            &format!("hash:transcript:{idx}"),
        );
        transcript.compact_after_ms = Some(200);
        upsert(&mut store, &transcript);
    }

    let summary = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .compact_due("compact:bounded", 201, 1, "summary:bounded")
        })
        .unwrap();
    assert_eq!(summary.compacted_count, 1);
    assert_eq!(summary.limited_count, 2);

    let status = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().status(201)
        })
        .unwrap();
    assert_eq!(status.compacted_records, 1);
    assert_eq!(status.compactable_due_records, 2);
}

#[test]
fn no_op_sweep_records_no_compaction_run_audit_row() {
    let (_dir, mut store) = temp_store();
    // Nothing is due: a pure no-op sweep must write NO audit row. S262 drives this hook
    // once per prompt turn and most turns are no-ops, so an unconditional insert would
    // grow the run table ~one row per turn forever (resource-bounds).
    let summary = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .compact_due("compact:noop", 100, 10, "summary:noop")
        })
        .unwrap();
    assert_eq!(summary.compacted_count, 0);
    assert_eq!(summary.skipped_count, 0);
    assert_eq!(summary.limited_count, 0);

    let runs = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().compaction_run_count()
        })
        .unwrap();
    assert_eq!(runs, 0, "a no-op sweep records no compaction-run audit row");
}

#[test]
fn compaction_run_audit_table_is_bounded_by_prune() {
    let (_dir, mut store) = temp_store();
    // Five REAL sweeps (each compacts one terminal transcript) accumulate five rows; the
    // inline prune keeps up to MAX_COMPACTION_RUN_AUDIT_ROWS, so all five survive here.
    for idx in 1..=5_i64 {
        let mut transcript = record(
            "generation_transcript",
            &format!("prune_transcript_{idx}"),
            RetentionClass::GenerationTranscript,
            LifecycleStatus::Rejected,
            &format!("hash:prune:{idx}"),
        );
        transcript.compact_after_ms = Some(100);
        upsert(&mut store, &transcript);
        let summary = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.retention().compact_due(
                    format!("compact:prune:{idx}"),
                    200 + idx,
                    10,
                    "summary:prune",
                )
            })
            .unwrap();
        assert_eq!(summary.compacted_count, 1);
    }
    let before = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention().compaction_run_count()
        })
        .unwrap();
    assert_eq!(before, 5, "five real sweeps accumulate five audit rows");

    // The bounded DELETE keeps only the most-recent rows — the same prune `compact_due`
    // applies with the production cap, exercised here at a small bound.
    let (pruned, after) = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let pruned = uow.retention().prune_compaction_runs(3)?;
            let after = uow.retention().compaction_run_count()?;
            Ok((pruned, after))
        })
        .unwrap();
    assert_eq!(pruned, 2, "the two oldest audit rows are pruned");
    assert_eq!(
        after, 3,
        "the audit table is bounded to the most-recent rows"
    );
}

#[test]
fn backup_export_covers_required_records_and_explicitly_omits_optional_transcripts() {
    let (_dir, mut store) = temp_store();
    let approval = record(
        "approval",
        "approval_backup",
        RetentionClass::ProtectedProductState,
        LifecycleStatus::Pending,
        "hash:approval",
    );
    let receipt = record(
        "apply_receipt",
        "receipt_backup",
        RetentionClass::AuditReceipt,
        LifecycleStatus::Applied,
        "hash:receipt",
    );
    let preimage = record(
        "preimage",
        "preimage_backup",
        RetentionClass::RollbackMaterial,
        LifecycleStatus::Applied,
        "hash:preimage",
    );
    let transcript = record(
        "generation_transcript",
        "transcript_optional",
        RetentionClass::GenerationTranscript,
        LifecycleStatus::Rejected,
        "hash:transcript",
    );
    upsert(&mut store, &approval);
    upsert(&mut store, &receipt);
    upsert(&mut store, &preimage);
    upsert(&mut store, &transcript);

    let export = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.retention()
                .create_backup_export("backup:required", "coverage", 220)
        })
        .unwrap();

    assert_eq!(export.required_count, 3);
    assert_eq!(export.included_count, 3);
    assert_eq!(export.omitted_count, 1);
    assert!(
        export
            .items
            .iter()
            .any(|item| item.record_ref == approval.record_ref)
    );
    assert!(
        export
            .items
            .iter()
            .any(|item| item.record_ref == receipt.record_ref)
    );
    assert!(
        export
            .items
            .iter()
            .any(|item| item.record_ref == preimage.record_ref)
    );
    let transcript_item = export
        .items
        .iter()
        .find(|item| item.record_ref == transcript.record_ref)
        .expect("optional transcript should be explicitly represented");
    assert!(!transcript_item.included);
    assert_eq!(
        transcript_item.omission_reason.as_deref(),
        Some("optional generation artifact follows transient retention policy")
    );
}
