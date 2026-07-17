use super::*;

fn temp_db() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");
    (dir, db_path(&vault_root))
}

#[test]
fn store_lives_in_the_authoring_data_zone_as_a_dedicated_file() {
    let path = db_path(Path::new(".vault"))
        .to_string_lossy()
        .replace('\\', "/");
    assert_eq!(path, ".vault/data/authoring-state/authoring-state.sqlite3");
}

#[test]
fn clean_open_creates_metadata_and_survives_restart() {
    let (_dir, path) = temp_db();
    {
        let store = Store::open_at(&path).expect("fresh authoring store opens");
        assert_eq!(store.path(), path.as_path());
        let metadata = store.schema_metadata().unwrap();
        assert_eq!(metadata.schema_version, SCHEMA_VERSION);
        assert_eq!(metadata.store_kind, STORE_KIND);
        assert_eq!(
            metadata.applied_migrations,
            vec![
                AppliedMigration {
                    version: 1,
                    name: "bootstrap_authoring_store_metadata".to_string(),
                },
                AppliedMigration {
                    version: 2,
                    name: "create_authoring_idempotency_records".to_string(),
                },
                AppliedMigration {
                    version: 3,
                    name: "create_authoring_retention_records".to_string(),
                },
                AppliedMigration {
                    version: 4,
                    name: "create_authoring_outbox_events".to_string(),
                },
                AppliedMigration {
                    version: 5,
                    name: "create_authoring_document_preimages".to_string(),
                },
                AppliedMigration {
                    version: 6,
                    name: "create_authoring_validation_records".to_string(),
                },
                AppliedMigration {
                    version: 7,
                    name: "create_authoring_changeset_ledger".to_string(),
                },
                AppliedMigration {
                    version: 8,
                    name: "create_authoring_actor_records_and_ledger_provenance".to_string(),
                },
                AppliedMigration {
                    version: 9,
                    name: "create_authoring_approval_requests".to_string(),
                },
                AppliedMigration {
                    version: 10,
                    name: "create_authoring_actor_tokens".to_string(),
                },
                AppliedMigration {
                    version: 11,
                    name: "create_authoring_operation_modes".to_string(),
                },
                AppliedMigration {
                    version: 12,
                    name: "create_authoring_direct_write_records".to_string(),
                },
                AppliedMigration {
                    version: 13,
                    name: "create_authoring_sessions_prompt_turns_and_runs".to_string(),
                },
                AppliedMigration {
                    version: 14,
                    name: "create_authoring_tool_permission_requests".to_string(),
                },
                AppliedMigration {
                    version: 15,
                    name: "widen_changeset_kind_for_direct".to_string(),
                },
                AppliedMigration {
                    version: 16,
                    name: "create_authoring_interrupts_and_tool_call_records".to_string(),
                },
                AppliedMigration {
                    version: 17,
                    name: "create_authoring_leases".to_string(),
                },
                AppliedMigration {
                    version: 18,
                    name: "create_authoring_review_claims".to_string(),
                },
                AppliedMigration {
                    version: 19,
                    name: "drop_authoring_direct_write_legacy_status".to_string(),
                },
                AppliedMigration {
                    version: 20,
                    name: "create_authoring_comments".to_string(),
                },
                AppliedMigration {
                    version: 21,
                    name: "add_queue_state_provenance_and_feedback_batches".to_string(),
                },
            ]
        );
        let table_count: i64 = store
            .conn_for_tests()
            .query_row(
                "SELECT count(*)
                     FROM sqlite_master
                     WHERE type = 'table'
                       AND name IN (
                           'authoring_schema_migrations',
                           'authoring_store_metadata',
                           'authoring_idempotency_records',
                           'authoring_retention_records',
                           'authoring_compaction_runs',
                           'authoring_compaction_markers',
                           'authoring_backup_exports',
                           'authoring_backup_export_items',
                           'authoring_outbox_events',
                           'authoring_document_preimages',
                           'authoring_validation_records',
                           'authoring_actor_records',
                           'authoring_changeset_revisions',
                           'authoring_changeset_child_operations',
                           'authoring_direct_write_records',
                           'authoring_sessions',
                           'authoring_prompt_turns',
                           'authoring_runs',
                           'authoring_tool_permission_requests',
                           'authoring_interrupts',
                           'authoring_tool_call_records',
                           'authoring_leases',
                           'authoring_review_claims',
                           'authoring_comments',
                           'authoring_feedback_batches'
                        )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 25);
    }

    let reopened = Store::open_at(&path).expect("authoring store reopens");
    let metadata = reopened.schema_metadata().unwrap();
    assert_eq!(metadata.schema_version, SCHEMA_VERSION);
    assert_eq!(metadata.applied_migrations.len(), 21);
}

#[test]
fn v8_migration_refuses_populated_unattributed_ledger() {
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(METADATA_SCHEMA).unwrap();
    for migration in &MIGRATIONS[..7] {
        let tx = conn.unchecked_transaction().unwrap();
        tx.execute_batch(migration.sql).unwrap();
        tx.execute(
            "INSERT INTO authoring_schema_migrations
                    (version, name, applied_at_ms)
                 VALUES
                    (?1, ?2, 1)",
            (migration.version, migration.name),
        )
        .unwrap();
        tx.pragma_update(None, "user_version", migration.version)
            .unwrap();
        tx.commit().unwrap();
    }
    conn.execute(
        "INSERT INTO authoring_changeset_revisions
                (changeset_id, changeset_revision, previous_revision, changeset_kind,
                 status, session_id, summary, operation_count, aggregate_digest,
                 created_at_ms, record_json)
             VALUES
                ('changeset_legacy', 'changeset:legacy', NULL, 'authoring',
                 'draft', NULL, 'legacy row', 1, 'ledger:legacy', 1, '{}')",
        [],
    )
    .unwrap();

    let err = run_migrations(&conn, MIGRATIONS).unwrap_err();

    assert!(
        matches!(err, StoreError::Sqlite(_)),
        "populated unattributed v7 ledger must fail loudly, got {err:?}"
    );
    assert_eq!(user_version(&conn).unwrap(), 7);
    let metadata = read_schema_metadata(&conn).unwrap();
    assert_eq!(metadata.schema_version, 7);
    assert_eq!(metadata.applied_migrations.len(), 7);
}

#[test]
fn v15_migration_preserves_populated_revisions_and_child_fk() {
    // P49-R2 / arch-reviewer v15 bar 1: the changeset_kind CHECK widen recreates
    // the core ledger table AND its FK-referenced child table — so it must be
    // tested against a POPULATED store: every row (incl. the v8 actor-provenance
    // columns) survives, the child FK integrity holds, and the widened CHECK now
    // admits `direct`.
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.pragma_update(None, "foreign_keys", "ON").unwrap();
    conn.execute_batch(METADATA_SCHEMA).unwrap();
    // Migrate up to v14 — the shape a real store carries just before v15.
    for migration in &MIGRATIONS[..14] {
        let tx = conn.unchecked_transaction().unwrap();
        tx.execute_batch(migration.sql).unwrap();
        tx.execute(
            "INSERT INTO authoring_schema_migrations
                    (version, name, applied_at_ms)
                 VALUES
                    (?1, ?2, 1)",
            (migration.version, migration.name),
        )
        .unwrap();
        tx.pragma_update(None, "user_version", migration.version)
            .unwrap();
        tx.commit().unwrap();
    }
    // Populate a real revision (with the v8 actor-provenance columns) + a child op.
    conn.execute(
        "INSERT INTO authoring_changeset_revisions
                (changeset_id, changeset_revision, previous_revision, changeset_kind,
                 status, session_id, summary, operation_count, aggregate_digest,
                 created_at_ms, record_json, actor_id, actor_kind, delegated_by_actor_id,
                 actor_provenance_key)
             VALUES
                ('cs1', 'rev1', NULL, 'authoring', 'draft', NULL, 'populated row', 1,
                 'ledger:1', 10, '{}', 'agent:a', 'agent', '', 'pk:a')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO authoring_changeset_child_operations
                (changeset_id, changeset_revision, child_key, target_order,
                 operation_kind, target_json, record_json)
             VALUES ('cs1', 'rev1', 'child_1', 0, 'replace_body', '{}', '{}')",
        [],
    )
    .unwrap();

    // Run the remaining migrations (v15 widen + the additive v16) over the populated
    // store; the chain settles at the current SCHEMA_VERSION.
    run_migrations(&conn, MIGRATIONS).unwrap();
    assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);

    // Every populated column survived the recreate, including actor-provenance.
    let (kind, summary, actor_id, prov): (String, String, String, String) = conn
        .query_row(
            "SELECT changeset_kind, summary, actor_id, actor_provenance_key
                 FROM authoring_changeset_revisions
                 WHERE changeset_id = 'cs1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    assert_eq!(
        (
            kind.as_str(),
            summary.as_str(),
            actor_id.as_str(),
            prov.as_str()
        ),
        ("authoring", "populated row", "agent:a", "pk:a")
    );
    let child_count: i64 = conn
        .query_row(
            "SELECT count(*)
                 FROM authoring_changeset_child_operations
                 WHERE changeset_id = 'cs1' AND child_key = 'child_1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(child_count, 1, "the child operation survived the recreate");

    // The widened CHECK now admits a `direct` revision.
    conn.execute(
        "INSERT INTO authoring_changeset_revisions
                (changeset_id, changeset_revision, changeset_kind, status, summary,
                 operation_count, aggregate_digest, created_at_ms, record_json)
             VALUES
                ('cs2', 'rev2', 'direct', 'draft', 'a direct save', 1, 'ledger:2', 20, '{}')",
        [],
    )
    .expect("the widened CHECK admits a direct revision");

    // FK integrity holds on the RECREATED child table: a child referencing a
    // missing parent is rejected (the FK points at the new parent, not a stale one).
    let orphan = conn.execute(
        "INSERT INTO authoring_changeset_child_operations
                (changeset_id, changeset_revision, child_key, target_order,
                 operation_kind, target_json, record_json)
             VALUES ('missing', 'nope', 'c', 0, 'replace_body', '{}', '{}')",
        [],
    );
    assert!(
        orphan.is_err(),
        "child FK to a missing parent must still be rejected after the recreate"
    );
}

#[test]
fn v19_migration_sanitizes_a_populated_dual_run_era_record_and_drops_legacy_status() {
    // W14.P47 review finding (CONFIRMED MEDIUM): a dual-run-era direct-write row's
    // `record_json` blob can still carry a `"legacy": {...}` key (the field WAS
    // serialized whenever dual-run recorded a comparison). `DirectWriteRecord`
    // keeps `deny_unknown_fields` deliberately, so v19 must sanitize the blob IN
    // PLACE, not just drop the now-writerless column — a populated store is the
    // only fixture that catches this (an empty `clean_open` migration does not).
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(METADATA_SCHEMA).unwrap();
    // Migrate up to v18 — the shape a real dual-run-era store carries just before v19.
    for migration in &MIGRATIONS[..18] {
        let tx = conn.unchecked_transaction().unwrap();
        tx.execute_batch(migration.sql).unwrap();
        tx.execute(
            "INSERT INTO authoring_schema_migrations
                    (version, name, applied_at_ms)
                 VALUES
                    (?1, ?2, 1)",
            (migration.version, migration.name),
        )
        .unwrap();
        tx.pragma_update(None, "user_version", migration.version)
            .unwrap();
        tx.commit().unwrap();
    }

    // A dual-run-era row: every field a CURRENT `DirectWriteRecord` requires, PLUS
    // the retired `"legacy"` key a v18-and-earlier dual-run save would have written.
    let mut record_value = serde_json::json!({
        "schema_version": "authoring.direct_write_record.v1",
        "status": "applied",
        "changeset_id": "direct:legacy1",
        "proposal_id": "proposal:legacy1",
        "approval_id": "approval:legacy1",
        "document_ref": "doc:legacy-plan",
        "document_path": ".vault/plan/legacy-plan.md",
        "expected_blob_hash": "0000000000000000000000000000000000000a",
        "target_blob_hash": "0000000000000000000000000000000000000b",
        "actor": { "id": "human:legacy", "kind": "human" },
        "idempotency_key": "idem:legacy:1",
        "request_digest": "digest-legacy-1",
        "authoritative_path": "direct_changeset",
        "direct_elapsed_ms": 5,
        "created_at_ms": 10,
        "updated_at_ms": 10,
    });
    record_value["legacy"] = serde_json::json!({
        "schema_version": "authoring.direct_write_legacy_comparison.v1",
        "status": "measured",
        "elapsed_ms": 12,
        "conflict": false,
    });
    let record_json = record_value.to_string();
    assert!(
        record_json.contains("\"legacy\""),
        "the seeded dual-run-era row must carry the retired legacy key: {record_json}"
    );

    conn.execute(
        "INSERT INTO authoring_direct_write_records
                (changeset_id, proposal_id, approval_id, document_ref, document_path,
                 expected_blob_hash, target_blob_hash, actor_id, actor_kind,
                 idempotency_key, request_digest, authoritative_path, direct_elapsed_ms,
                 legacy_status, apply_status, apply_receipt_id, record_json, created_at_ms,
                 updated_at_ms)
             VALUES
                ('direct:legacy1', 'proposal:legacy1', 'approval:legacy1', 'doc:legacy-plan',
                 '.vault/plan/legacy-plan.md', '0000000000000000000000000000000000000a',
                 '0000000000000000000000000000000000000b', 'human:legacy', 'human',
                 'idem:legacy:1', 'digest-legacy-1', 'direct_changeset', 5,
                 'measured', 'applied', NULL, ?1, 10, 10)",
        rusqlite::params![record_json],
    )
    .unwrap();

    // Run the remaining migrations (the v19 sanitize + column drop) over the
    // populated store; the chain settles at the current SCHEMA_VERSION.
    run_migrations(&conn, MIGRATIONS).unwrap();
    assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);

    // The now-writerless column is gone.
    assert!(
        conn.prepare("SELECT legacy_status FROM authoring_direct_write_records")
            .is_err(),
        "the retired legacy_status column must be dropped"
    );

    // The row survived, and the blob is sanitized: the `legacy` key is gone AND
    // the blob decodes cleanly through the CURRENT `deny_unknown_fields` shape —
    // the discipline gate an empty-store migration test cannot exercise.
    let sanitized_json: String = conn
            .query_row(
                "SELECT record_json FROM authoring_direct_write_records WHERE changeset_id = 'direct:legacy1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
    assert!(
        !sanitized_json.contains("\"legacy\""),
        "the sanitized blob must not carry the retired legacy key: {sanitized_json}"
    );
    let decoded: super::super::direct_write::DirectWriteRecord =
        serde_json::from_str(&sanitized_json).expect(
            "a sanitized dual-run-era record must decode through the current \
                 deny_unknown_fields shape",
        );
    assert_eq!(decoded.changeset_id.as_str(), "direct:legacy1");
}

#[test]
fn migration_ordering_is_validated_before_any_schema_write() {
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(&path).unwrap();
    let bad = [Migration {
        version: 2,
        name: "skipped_one",
        sql: "",
    }];
    match run_migrations(&conn, &bad) {
        Err(StoreError::MigrationMetadata(detail)) => {
            assert!(detail.contains("expected 1"), "{detail}");
        }
        other => panic!("expected migration ordering error, got {other:?}"),
    }

    let authoring_table_count: i64 = conn
        .query_row(
            "SELECT count(*)
                 FROM sqlite_master
                 WHERE type = 'table'
                   AND name LIKE 'authoring_%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        authoring_table_count, 0,
        "invalid migration order must fail before authoring DDL runs"
    );
}

#[test]
fn schema_version_mismatch_fails_loud() {
    let (_dir, path) = temp_db();
    {
        let store = Store::open_at(&path).unwrap();
        store
            .conn_for_tests()
            .pragma_update(None, "user_version", 99)
            .unwrap();
    }

    match Store::open_at(&path) {
        Err(StoreError::SchemaVersion {
            found: 99,
            supported,
        }) => assert_eq!(supported, SCHEMA_VERSION),
        other => panic!("expected schema version error, got {other:?}"),
    }
}

#[test]
fn future_version_does_not_create_authoring_migration_tables() {
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    {
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", 99).unwrap();
    }

    match Store::open_at(&path) {
        Err(StoreError::SchemaVersion { found: 99, .. }) => {}
        other => panic!("expected schema version error, got {other:?}"),
    }

    let conn = Connection::open(&path).unwrap();
    let authoring_table_count: i64 = conn
        .query_row(
            "SELECT count(*)
                 FROM sqlite_master
                 WHERE type = 'table'
                   AND name LIKE 'authoring_%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        authoring_table_count, 0,
        "future-version product DB must fail before authoring DDL runs"
    );
}

#[test]
fn corrupted_migration_metadata_fails_loud() {
    let (_dir, path) = temp_db();
    {
        let store = Store::open_at(&path).unwrap();
        store
            .conn_for_tests()
            .execute(
                "UPDATE authoring_schema_migrations
                     SET name = 'tampered'
                     WHERE version = 1",
                [],
            )
            .unwrap();
    }

    match Store::open_at(&path) {
        Err(StoreError::MigrationMetadata(detail)) => {
            assert!(detail.contains("tampered"), "{detail}");
        }
        other => panic!("expected metadata corruption error, got {other:?}"),
    }
}

#[test]
fn duplicate_migration_metadata_fails_loud_even_if_table_shape_is_corrupt() {
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "
                CREATE TABLE authoring_schema_migrations (
                    version       INTEGER NOT NULL,
                    name          TEXT NOT NULL,
                    applied_at_ms INTEGER NOT NULL
                );
                CREATE TABLE authoring_store_metadata (
                    singleton      INTEGER NOT NULL,
                    store_kind     TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    created_at_ms  INTEGER NOT NULL,
                    PRIMARY KEY (singleton)
                ) WITHOUT ROWID;
                INSERT INTO authoring_schema_migrations
                    (version, name, applied_at_ms)
                VALUES
                    (1, 'bootstrap_authoring_store_metadata', 1),
                    (1, 'bootstrap_authoring_store_metadata', 2);
                INSERT INTO authoring_store_metadata
                    (singleton, store_kind, schema_version, created_at_ms)
                VALUES
                    (1, 'vaultspec_authoring', 1, 1);
                PRAGMA user_version = 1;
                ",
        )
        .unwrap();
    }

    match Store::open_at(&path) {
        Err(StoreError::MigrationMetadata(detail)) => {
            assert!(detail.contains("count"), "{detail}");
        }
        other => panic!("expected duplicate metadata error, got {other:?}"),
    }
}

#[test]
fn missing_store_metadata_fails_loud() {
    let (_dir, path) = temp_db();
    {
        let store = Store::open_at(&path).unwrap();
        store
            .conn_for_tests()
            .execute("DELETE FROM authoring_store_metadata", [])
            .unwrap();
    }

    match Store::open_at(&path) {
        Err(StoreError::MigrationMetadata(detail)) => {
            assert!(
                detail.contains("missing authoring_store_metadata"),
                "{detail}"
            );
        }
        other => panic!("expected missing metadata error, got {other:?}"),
    }
}

#[test]
fn corrupt_database_header_is_not_healed() {
    let (_dir, path) = temp_db();
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, b"not a sqlite database\n").unwrap();

    assert!(
        Store::open_at(&path).is_err(),
        "authoring product state must fail loud instead of self-healing"
    );
    let bytes = std::fs::read(&path).unwrap();
    assert_eq!(
        bytes, b"not a sqlite database\n",
        "failed open must not delete or rewrite the product-state file"
    );
}
