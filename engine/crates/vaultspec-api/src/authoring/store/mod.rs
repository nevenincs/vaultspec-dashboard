//! Durable authoring store binding.
//!
//! W02.P05 establishes the physical store, migration runner, and schema
//! metadata checks. Later W02 phases attach typed repositories for unit-of-work
//! boundaries, idempotency, retention, and the transactional outbox.
#![allow(dead_code)]

pub(crate) mod idempotency;
pub(crate) mod outbox;
pub(crate) mod retention;
pub(crate) mod unit_of_work;

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};

use super::model::CommandKind;

pub const DB_FILENAME: &str = "authoring-state.sqlite3";
const AUTHORING_DATA_DIR: &str = "authoring-state";
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);
const SCHEMA_VERSION: i64 = 7;
const STORE_KIND: &str = "vaultspec_authoring";

const METADATA_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS authoring_schema_migrations (
    version       INTEGER NOT NULL,
    name          TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL,
    PRIMARY KEY (version)
) WITHOUT ROWID;
";

const BOOTSTRAP_SCHEMA: &str = "
CREATE TABLE authoring_store_metadata (
    singleton      INTEGER NOT NULL CHECK (singleton = 1),
    store_kind     TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at_ms  INTEGER NOT NULL,
    PRIMARY KEY (singleton)
) WITHOUT ROWID;

INSERT INTO authoring_store_metadata
    (singleton, store_kind, schema_version, created_at_ms)
VALUES
    (1, 'vaultspec_authoring', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
";

const IDEMPOTENCY_SCHEMA: &str = "
CREATE TABLE authoring_idempotency_records (
    actor_id                TEXT NOT NULL,
    actor_kind              TEXT NOT NULL,
    delegated_by_actor_id   TEXT NOT NULL DEFAULT '',
    command_kind            TEXT NOT NULL,
    idempotency_key         TEXT NOT NULL,
    scope_kind              TEXT NOT NULL,
    scope_id                TEXT NOT NULL,
    scope_revision          TEXT,
    scope_digest            TEXT NOT NULL,
    request_digest          TEXT NOT NULL,
    receipt_id              TEXT,
    state                   TEXT NOT NULL CHECK (state IN ('in_flight', 'recorded')),
    outcome_kind            TEXT,
    aggregate_kind          TEXT,
    aggregate_id            TEXT,
    outcome_schema          TEXT,
    outcome_json            TEXT,
    http_status             INTEGER,
    started_at_ms           INTEGER NOT NULL,
    updated_at_ms           INTEGER NOT NULL,
    in_flight_expires_at_ms INTEGER,
    completed_at_ms         INTEGER,
    outcome_expires_at_ms   INTEGER,
    PRIMARY KEY (
        actor_id,
        actor_kind,
        delegated_by_actor_id,
        command_kind,
        idempotency_key
    )
);
CREATE INDEX idx_authoring_idempotency_records_scope
    ON authoring_idempotency_records (scope_kind, scope_id, scope_revision);
CREATE INDEX idx_authoring_idempotency_records_in_flight_expiry
    ON authoring_idempotency_records (in_flight_expires_at_ms)
    WHERE in_flight_expires_at_ms IS NOT NULL;
CREATE INDEX idx_authoring_idempotency_records_outcome_expiry
    ON authoring_idempotency_records (outcome_expires_at_ms)
    WHERE outcome_expires_at_ms IS NOT NULL;

UPDATE authoring_store_metadata
SET schema_version = 2
WHERE singleton = 1;
";

const RETENTION_SCHEMA: &str = "
CREATE TABLE authoring_retention_records (
    record_kind                 TEXT NOT NULL,
    record_id                   TEXT NOT NULL,
    aggregate_kind              TEXT NOT NULL,
    aggregate_id                TEXT NOT NULL,
    retention_class             TEXT NOT NULL CHECK (
        retention_class IN (
            'protected_product_state',
            'rollback_material',
            'audit_receipt',
            'review_material',
            'generation_transcript',
            'expiring_idempotency'
        )
    ),
    lifecycle_status            TEXT NOT NULL CHECK (
        lifecycle_status IN (
            'pending',
            'active',
            'applied',
            'rejected',
            'superseded',
            'expired'
        )
    ),
    payload_state               TEXT NOT NULL CHECK (
        payload_state IN (
            'full',
            'summarized',
            'hash_only'
        )
    ),
    protected                   INTEGER NOT NULL CHECK (protected IN (0, 1)),
    protected_reason            TEXT,
    content_hash                TEXT NOT NULL,
    payload_bytes               INTEGER NOT NULL CHECK (payload_bytes >= 0),
    summary_json                TEXT,
    summary_hash                TEXT,
    compact_after_ms            INTEGER,
    expires_at_ms               INTEGER,
    rollback_available          INTEGER NOT NULL CHECK (rollback_available IN (0, 1)),
    rollback_unavailable_reason TEXT,
    backup_required             INTEGER NOT NULL CHECK (backup_required IN (0, 1)),
    created_at_ms               INTEGER NOT NULL,
    updated_at_ms               INTEGER NOT NULL,
    PRIMARY KEY (record_kind, record_id)
) WITHOUT ROWID;

CREATE TABLE authoring_compaction_runs (
    run_id           TEXT NOT NULL,
    started_at_ms    INTEGER NOT NULL,
    completed_at_ms  INTEGER NOT NULL,
    max_rows         INTEGER NOT NULL CHECK (max_rows >= 0),
    compacted_count  INTEGER NOT NULL CHECK (compacted_count >= 0),
    skipped_count    INTEGER NOT NULL CHECK (skipped_count >= 0),
    limited_count    INTEGER NOT NULL CHECK (limited_count >= 0),
    status           TEXT NOT NULL CHECK (status IN ('completed')),
    PRIMARY KEY (run_id)
) WITHOUT ROWID;

CREATE TABLE authoring_compaction_markers (
    marker_id                     TEXT NOT NULL,
    run_id                        TEXT,
    record_kind                   TEXT NOT NULL,
    record_id                     TEXT NOT NULL,
    disposition                   TEXT NOT NULL CHECK (
        disposition IN (
            'compacted',
            'skipped_protected',
            'marked_limitation'
        )
    ),
    reason                        TEXT NOT NULL,
    before_hash                   TEXT NOT NULL,
    after_hash                    TEXT,
    rollback_limitation_recorded  INTEGER NOT NULL CHECK (
        rollback_limitation_recorded IN (0, 1)
    ),
    created_at_ms                 INTEGER NOT NULL,
    PRIMARY KEY (marker_id),
    FOREIGN KEY (record_kind, record_id)
        REFERENCES authoring_retention_records(record_kind, record_id)
) WITHOUT ROWID;

CREATE TABLE authoring_backup_exports (
    export_id       TEXT NOT NULL,
    reason          TEXT NOT NULL,
    created_at_ms   INTEGER NOT NULL,
    required_count  INTEGER NOT NULL CHECK (required_count >= 0),
    included_count  INTEGER NOT NULL CHECK (included_count >= 0),
    omitted_count   INTEGER NOT NULL CHECK (omitted_count >= 0),
    PRIMARY KEY (export_id)
) WITHOUT ROWID;

CREATE TABLE authoring_backup_export_items (
    export_id          TEXT NOT NULL,
    record_kind        TEXT NOT NULL,
    record_id          TEXT NOT NULL,
    retention_class    TEXT NOT NULL,
    payload_state      TEXT NOT NULL,
    content_hash       TEXT NOT NULL,
    rollback_available INTEGER NOT NULL CHECK (rollback_available IN (0, 1)),
    included           INTEGER NOT NULL CHECK (included IN (0, 1)),
    omission_reason    TEXT,
    PRIMARY KEY (export_id, record_kind, record_id),
    FOREIGN KEY (export_id)
        REFERENCES authoring_backup_exports(export_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_retention_records_due
    ON authoring_retention_records (
        compact_after_ms,
        retention_class,
        lifecycle_status
    )
    WHERE compact_after_ms IS NOT NULL;
CREATE INDEX idx_authoring_retention_records_backup
    ON authoring_retention_records (backup_required, retention_class);
CREATE INDEX idx_authoring_compaction_markers_record
    ON authoring_compaction_markers (record_kind, record_id, created_at_ms);

UPDATE authoring_store_metadata
SET schema_version = 3
WHERE singleton = 1;
";

const OUTBOX_SCHEMA: &str = "
CREATE TABLE authoring_outbox_events (
    seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id              TEXT NOT NULL,
    dedupe_key            TEXT NOT NULL,
    aggregate_kind        TEXT NOT NULL,
    aggregate_id          TEXT NOT NULL,
    event_kind            TEXT NOT NULL,
    schema_version        INTEGER NOT NULL CHECK (schema_version > 0),
    actor_id              TEXT NOT NULL,
    actor_kind            TEXT NOT NULL,
    delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    command_kind          TEXT,
    idempotency_key       TEXT,
    payload_json          TEXT NOT NULL,
    payload_hash          TEXT NOT NULL,
    publication_state     TEXT NOT NULL CHECK (
        publication_state IN ('pending', 'publishing', 'published')
    ),
    created_at_ms         INTEGER NOT NULL,
    updated_at_ms         INTEGER NOT NULL,
    publish_claim_id      TEXT,
    publish_claimed_at_ms INTEGER,
    publish_lease_expires_at_ms INTEGER,
    publish_attempts      INTEGER NOT NULL CHECK (publish_attempts >= 0),
    published_at_ms       INTEGER,
    last_publish_error    TEXT,
    UNIQUE (event_id),
    UNIQUE (dedupe_key)
);

CREATE INDEX idx_authoring_outbox_events_command_idempotency
    ON authoring_outbox_events (command_kind, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_authoring_outbox_events_available
    ON authoring_outbox_events (
        publication_state,
        publish_lease_expires_at_ms,
        seq
    );
CREATE INDEX idx_authoring_outbox_events_lease_expiry
    ON authoring_outbox_events (publish_lease_expires_at_ms, seq)
    WHERE publication_state = 'publishing';
CREATE INDEX idx_authoring_outbox_events_aggregate
    ON authoring_outbox_events (aggregate_kind, aggregate_id, seq);

UPDATE authoring_store_metadata
SET schema_version = 4
WHERE singleton = 1;
";

const SNAPSHOT_SCHEMA: &str = "
CREATE TABLE authoring_document_preimages (
    preimage_id           TEXT NOT NULL,
    changeset_id          TEXT NOT NULL,
    operation_id          TEXT NOT NULL,
    document_ref_json     TEXT NOT NULL,
    document_node_id      TEXT NOT NULL,
    document_path         TEXT NOT NULL,
    base_revision         TEXT NOT NULL,
    blob_hash             TEXT NOT NULL,
    payload_hash          TEXT NOT NULL,
    payload_text          TEXT NOT NULL,
    payload_bytes         INTEGER NOT NULL CHECK (payload_bytes >= 0),
    captured_at_ms        INTEGER NOT NULL,
    retention_record_kind TEXT NOT NULL,
    retention_record_id   TEXT NOT NULL,
    PRIMARY KEY (preimage_id),
    UNIQUE (changeset_id, operation_id, document_path),
    FOREIGN KEY (retention_record_kind, retention_record_id)
        REFERENCES authoring_retention_records(record_kind, record_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_document_preimages_changeset
    ON authoring_document_preimages (changeset_id, operation_id);
CREATE INDEX idx_authoring_document_preimages_document
    ON authoring_document_preimages (document_node_id, document_path, base_revision);
CREATE INDEX idx_authoring_document_preimages_retention
    ON authoring_document_preimages (retention_record_kind, retention_record_id);

UPDATE authoring_store_metadata
SET schema_version = 5
WHERE singleton = 1;
";

const VALIDATION_SCHEMA: &str = "
CREATE TABLE authoring_validation_records (
    seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
    validation_digest     TEXT NOT NULL,
    changeset_id          TEXT NOT NULL,
    status                TEXT NOT NULL CHECK (
        status IN ('valid', 'valid_with_warnings', 'invalid', 'stale')
    ),
    approval_ready        INTEGER NOT NULL CHECK (approval_ready IN (0, 1)),
    material_digest       TEXT NOT NULL,
    operation_count       INTEGER NOT NULL CHECK (operation_count > 0),
    blocking_error_count  INTEGER NOT NULL CHECK (blocking_error_count >= 0),
    warning_count         INTEGER NOT NULL CHECK (warning_count >= 0),
    target_revisions_json TEXT NOT NULL,
    findings_json         TEXT NOT NULL,
    record_json           TEXT NOT NULL,
    captured_at_ms        INTEGER NOT NULL,
    UNIQUE (validation_digest)
);

CREATE INDEX idx_authoring_validation_records_changeset
    ON authoring_validation_records (changeset_id, captured_at_ms);
CREATE INDEX idx_authoring_validation_records_material
    ON authoring_validation_records (changeset_id, material_digest);
CREATE INDEX idx_authoring_validation_records_status
    ON authoring_validation_records (status, approval_ready);

UPDATE authoring_store_metadata
SET schema_version = 6
WHERE singleton = 1;
";

const LEDGER_SCHEMA: &str = "
CREATE TABLE authoring_changeset_revisions (
    seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
    changeset_id        TEXT NOT NULL,
    changeset_revision  TEXT NOT NULL,
    previous_revision   TEXT,
    changeset_kind      TEXT NOT NULL CHECK (
        changeset_kind IN ('authoring', 'rollback')
    ),
    status              TEXT NOT NULL CHECK (
        status IN (
            'draft',
            'generating',
            'proposed',
            'needs_review',
            'approved',
            'applying',
            'applied',
            'partially_applied',
            'compensation_required',
            'rejected',
            'conflicted',
            'superseded',
            'failed',
            'rollback_proposed',
            'cancelled'
        )
    ),
    session_id          TEXT,
    summary             TEXT NOT NULL,
    operation_count     INTEGER NOT NULL CHECK (operation_count > 0),
    aggregate_digest    TEXT NOT NULL,
    created_at_ms       INTEGER NOT NULL,
    record_json         TEXT NOT NULL,
    UNIQUE (changeset_id, changeset_revision)
);

CREATE TABLE authoring_changeset_child_operations (
    seq                         INTEGER PRIMARY KEY AUTOINCREMENT,
    changeset_id                TEXT NOT NULL,
    changeset_revision          TEXT NOT NULL,
    child_key                   TEXT NOT NULL,
    target_order                INTEGER NOT NULL CHECK (target_order >= 0),
    operation_kind              TEXT NOT NULL,
    target_json                 TEXT NOT NULL,
    base_revision               TEXT,
    current_revision            TEXT,
    materialized_operation_json TEXT,
    material_digest             TEXT,
    validation_digest           TEXT,
    record_json                 TEXT NOT NULL,
    UNIQUE (changeset_id, changeset_revision, child_key),
    UNIQUE (changeset_id, changeset_revision, target_order),
    FOREIGN KEY (changeset_id, changeset_revision)
        REFERENCES authoring_changeset_revisions(changeset_id, changeset_revision)
);

CREATE INDEX idx_authoring_changeset_revisions_changeset
    ON authoring_changeset_revisions (changeset_id, seq);
CREATE INDEX idx_authoring_changeset_revisions_revision
    ON authoring_changeset_revisions (changeset_revision);
CREATE INDEX idx_authoring_changeset_children_revision
    ON authoring_changeset_child_operations (
        changeset_id,
        changeset_revision,
        target_order
    );

UPDATE authoring_store_metadata
SET schema_version = 7
WHERE singleton = 1;
";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "bootstrap_authoring_store_metadata",
        sql: BOOTSTRAP_SCHEMA,
    },
    Migration {
        version: 2,
        name: "create_authoring_idempotency_records",
        sql: IDEMPOTENCY_SCHEMA,
    },
    Migration {
        version: 3,
        name: "create_authoring_retention_records",
        sql: RETENTION_SCHEMA,
    },
    Migration {
        version: 4,
        name: "create_authoring_outbox_events",
        sql: OUTBOX_SCHEMA,
    },
    Migration {
        version: 5,
        name: "create_authoring_document_preimages",
        sql: SNAPSHOT_SCHEMA,
    },
    Migration {
        version: 6,
        name: "create_authoring_validation_records",
        sql: VALIDATION_SCHEMA,
    },
    Migration {
        version: 7,
        name: "create_authoring_changeset_ledger",
        sql: LEDGER_SCHEMA,
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedMigration {
    pub version: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaMetadata {
    pub schema_version: i64,
    pub store_kind: String,
    pub applied_migrations: Vec<AppliedMigration>,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("unsupported authoring store schema version {found} (supports {supported})")]
    SchemaVersion { found: i64, supported: i64 },
    #[error("corrupt authoring migration metadata: {0}")]
    MigrationMetadata(String),
    #[error("authoring idempotency record error: {0}")]
    Idempotency(String),
    #[error("authoring retention record error: {0}")]
    Retention(String),
    #[error("authoring outbox event error: {0}")]
    Outbox(String),
    #[error("authoring snapshot error: {0}")]
    Snapshot(String),
    #[error("authoring validation error: {0}")]
    Validation(String),
    #[error("authoring ledger error: {0}")]
    Ledger(String),
    #[error("command {command:?} is read-only and cannot open a mutating unit of work")]
    ReadOnlyCommandUnitOfWork { command: CommandKind },
}

pub type Result<T> = std::result::Result<T, StoreError>;

pub fn db_path(vault_root: &Path) -> PathBuf {
    vault_root
        .join("data")
        .join(AUTHORING_DATA_DIR)
        .join(DB_FILENAME)
}

#[derive(Debug)]
pub struct Store {
    conn: Connection,
    path: PathBuf,
}

impl Store {
    pub fn open(vault_root: &Path) -> Result<Self> {
        let path = db_path(vault_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Self::open_at(&path)
    }

    pub fn open_at(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        configure_connection(&conn)?;
        run_migrations(&conn, MIGRATIONS)?;
        Ok(Self {
            conn,
            path: path.to_path_buf(),
        })
    }

    pub fn schema_metadata(&self) -> Result<SchemaMetadata> {
        read_schema_metadata(&self.conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    #[cfg(test)]
    fn conn_for_tests(&self) -> &Connection {
        &self.conn
    }
}

fn configure_connection(conn: &Connection) -> Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn run_migrations(conn: &Connection, migrations: &[Migration]) -> Result<()> {
    validate_migrations(migrations)?;
    let user_version = user_version(conn)?;
    if user_version > SCHEMA_VERSION {
        return Err(StoreError::SchemaVersion {
            found: user_version,
            supported: SCHEMA_VERSION,
        });
    }

    conn.execute_batch(METADATA_SCHEMA)?;
    validate_applied_migrations(conn, migrations, user_version)?;

    for migration in migrations
        .iter()
        .filter(|migration| migration.version > user_version)
    {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO authoring_schema_migrations
                (version, name, applied_at_ms)
             VALUES
                (?1, ?2, CAST(strftime('%s', 'now') AS INTEGER) * 1000)",
            (migration.version, migration.name),
        )?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }

    validate_applied_migrations(conn, migrations, SCHEMA_VERSION)?;
    let metadata = read_schema_metadata(conn)?;
    if metadata.schema_version != SCHEMA_VERSION {
        return Err(StoreError::MigrationMetadata(format!(
            "metadata schema_version {} does not match supported {}",
            metadata.schema_version, SCHEMA_VERSION
        )));
    }
    if metadata.store_kind != STORE_KIND {
        return Err(StoreError::MigrationMetadata(format!(
            "metadata store_kind `{}` does not match `{STORE_KIND}`",
            metadata.store_kind
        )));
    }
    Ok(())
}

fn validate_migrations(migrations: &[Migration]) -> Result<()> {
    if migrations.is_empty() {
        return Err(StoreError::MigrationMetadata(
            "migration list must not be empty".to_string(),
        ));
    }
    for (idx, migration) in migrations.iter().enumerate() {
        let expected = (idx as i64) + 1;
        if migration.version != expected {
            return Err(StoreError::MigrationMetadata(format!(
                "migration `{}` has version {}, expected {expected}",
                migration.name, migration.version
            )));
        }
        if migration.name.trim().is_empty() {
            return Err(StoreError::MigrationMetadata(format!(
                "migration version {} has an empty name",
                migration.version
            )));
        }
    }
    Ok(())
}

fn user_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

fn validate_applied_migrations(
    conn: &Connection,
    migrations: &[Migration],
    expected_version: i64,
) -> Result<()> {
    let applied = read_applied_migrations(conn)?;
    if applied.len() as i64 != expected_version {
        return Err(StoreError::MigrationMetadata(format!(
            "applied migration count is {}, expected {expected_version}",
            applied.len()
        )));
    }
    for migration in &applied {
        if migration.version > SCHEMA_VERSION {
            return Err(StoreError::MigrationMetadata(format!(
                "applied migration version {} exceeds supported {}",
                migration.version, SCHEMA_VERSION
            )));
        }
        let expected_sequence_version = applied
            .iter()
            .position(|row| row.version == migration.version)
            .map(|idx| idx as i64 + 1)
            .unwrap_or_default();
        if migration.version != expected_sequence_version {
            return Err(StoreError::MigrationMetadata(format!(
                "applied migration sequence contains version {}, expected {}",
                migration.version, expected_sequence_version
            )));
        }
        let expected = migrations
            .iter()
            .find(|known| known.version == migration.version)
            .ok_or_else(|| {
                StoreError::MigrationMetadata(format!(
                    "applied migration version {} is unknown",
                    migration.version
                ))
            })?;
        if migration.name != expected.name {
            return Err(StoreError::MigrationMetadata(format!(
                "applied migration version {} is named `{}`, expected `{}`",
                migration.version, migration.name, expected.name
            )));
        }
    }

    let latest = applied
        .last()
        .map(|migration| migration.version)
        .unwrap_or(0);
    if latest != expected_version {
        return Err(StoreError::MigrationMetadata(format!(
            "latest applied migration is {latest}, expected {expected_version}"
        )));
    }
    Ok(())
}

fn read_applied_migrations(conn: &Connection) -> Result<Vec<AppliedMigration>> {
    let mut stmt = conn.prepare(
        "SELECT version, name
         FROM authoring_schema_migrations
         ORDER BY version ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AppliedMigration {
            version: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    let mut migrations = Vec::new();
    for row in rows {
        migrations.push(row?);
    }
    Ok(migrations)
}

fn read_schema_metadata(conn: &Connection) -> Result<SchemaMetadata> {
    let row = conn
        .query_row(
            "SELECT store_kind, schema_version
             FROM authoring_store_metadata
             WHERE singleton = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            StoreError::MigrationMetadata("missing authoring_store_metadata row".to_string())
        })?;

    Ok(SchemaMetadata {
        store_kind: row.0,
        schema_version: row.1,
        applied_migrations: read_applied_migrations(conn)?,
    })
}

#[cfg(test)]
mod tests {
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
                           'authoring_changeset_revisions',
                           'authoring_changeset_child_operations'
                        )",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(table_count, 13);
        }

        let reopened = Store::open_at(&path).expect("authoring store reopens");
        let metadata = reopened.schema_metadata().unwrap();
        assert_eq!(metadata.schema_version, SCHEMA_VERSION);
        assert_eq!(metadata.applied_migrations.len(), 7);
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
}
