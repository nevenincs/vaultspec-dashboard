//! Authoring store schema: DDL, the migration ledger, and the migration runner.
//!
//! Split out of the store binding so the physical `Store` handle and its schema
//! machinery each stay under the module-size cap. `mod.rs` owns the connection and
//! `db_path`; this module owns every `*_SCHEMA` DDL const, the `MIGRATIONS` ledger,
//! and the runner/validator that brings a connection to `SCHEMA_VERSION`.

use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};

use super::error::StoreError;

const BUSY_TIMEOUT: Duration = Duration::from_secs(10);
pub(crate) const SCHEMA_VERSION: i64 = 21;
pub(crate) const STORE_KIND: &str = "vaultspec_authoring";

pub(crate) const METADATA_SCHEMA: &str = "
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

const ACTOR_PROVENANCE_SCHEMA: &str = "
CREATE TABLE authoring_v8_empty_ledger_guard (
    must_be_empty INTEGER NOT NULL CHECK (must_be_empty = 0)
);
INSERT INTO authoring_v8_empty_ledger_guard (must_be_empty)
    SELECT 1
    WHERE EXISTS (SELECT 1 FROM authoring_changeset_revisions LIMIT 1);
DROP TABLE authoring_v8_empty_ledger_guard;

CREATE TABLE authoring_actor_records (
    actor_id       TEXT NOT NULL,
    actor_kind     TEXT NOT NULL CHECK (
        actor_kind IN ('human', 'agent')
    ),
    display_name   TEXT NOT NULL,
    display_summary TEXT,
    status         TEXT NOT NULL CHECK (status IN ('active', 'stale')),
    provenance_key TEXT NOT NULL,
    created_at_ms  INTEGER NOT NULL,
    updated_at_ms  INTEGER NOT NULL,
    record_json    TEXT NOT NULL,
    PRIMARY KEY (actor_id, actor_kind)
) WITHOUT ROWID;

CREATE UNIQUE INDEX idx_authoring_actor_records_provenance_key
    ON authoring_actor_records (provenance_key);
CREATE INDEX idx_authoring_actor_records_status
    ON authoring_actor_records (status, actor_kind);

ALTER TABLE authoring_changeset_revisions
    ADD COLUMN actor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE authoring_changeset_revisions
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE authoring_changeset_revisions
    ADD COLUMN delegated_by_actor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE authoring_changeset_revisions
    ADD COLUMN actor_provenance_key TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_authoring_changeset_revisions_actor
    ON authoring_changeset_revisions (
        actor_id,
        actor_kind,
        delegated_by_actor_id,
        seq
    );

UPDATE authoring_store_metadata
SET schema_version = 8
WHERE singleton = 1;
";

const APPROVAL_SCHEMA: &str = "
CREATE TABLE authoring_approval_requests (
    seq                        INTEGER PRIMARY KEY AUTOINCREMENT,
    approval_id                TEXT NOT NULL,
    proposal_id                TEXT NOT NULL,
    changeset_id               TEXT NOT NULL,
    queue_state                TEXT NOT NULL CHECK (
        queue_state IN ('queued', 'decision_submitted', 'closed')
    ),
    decision                   TEXT CHECK (
        decision IN ('approve', 'reject', 'request_changes')
    ),
    reviewer_actor_id          TEXT,
    reviewer_actor_kind        TEXT,
    reviewed_proposal_revision TEXT NOT NULL,
    reviewed_validation_digest TEXT NOT NULL,
    policy_version             TEXT NOT NULL,
    idempotency_key            TEXT NOT NULL,
    record_json                TEXT NOT NULL,
    created_at_ms              INTEGER NOT NULL,
    updated_at_ms              INTEGER NOT NULL,
    UNIQUE (approval_id)
);

CREATE INDEX idx_authoring_approval_requests_proposal
    ON authoring_approval_requests (proposal_id, seq);
CREATE INDEX idx_authoring_approval_requests_changeset
    ON authoring_approval_requests (changeset_id, updated_at_ms);

UPDATE authoring_store_metadata
SET schema_version = 9
WHERE singleton = 1;
";

const ACTOR_TOKEN_SCHEMA: &str = "
CREATE TABLE authoring_actor_tokens (
    seq                    INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash             TEXT NOT NULL,
    actor_id               TEXT NOT NULL,
    actor_kind             TEXT NOT NULL,
    delegated_by_actor_id  TEXT,
    issued_by_actor_id     TEXT NOT NULL,
    issued_at_ms           INTEGER NOT NULL,
    expires_at_ms          INTEGER NOT NULL,
    revoked_at_ms          INTEGER,
    record_json            TEXT NOT NULL,
    UNIQUE (token_hash)
);

CREATE INDEX idx_authoring_actor_tokens_actor
    ON authoring_actor_tokens (actor_id, actor_kind);

UPDATE authoring_store_metadata
SET schema_version = 10
WHERE singleton = 1;
";

const OPERATION_MODE_SCHEMA: &str = "
ALTER TABLE authoring_actor_records RENAME TO authoring_actor_records_v10;

CREATE TABLE authoring_actor_records (
    actor_id       TEXT NOT NULL,
    actor_kind     TEXT NOT NULL CHECK (
        actor_kind IN ('human', 'agent', 'system')
    ),
    display_name   TEXT NOT NULL,
    display_summary TEXT,
    status         TEXT NOT NULL CHECK (status IN ('active', 'stale')),
    provenance_key TEXT NOT NULL,
    created_at_ms  INTEGER NOT NULL,
    updated_at_ms  INTEGER NOT NULL,
    record_json    TEXT NOT NULL,
    PRIMARY KEY (actor_id, actor_kind)
) WITHOUT ROWID;

INSERT INTO authoring_actor_records
    (actor_id, actor_kind, display_name, display_summary, status,
     provenance_key, created_at_ms, updated_at_ms, record_json)
SELECT
    actor_id, actor_kind, display_name, display_summary, status,
    provenance_key, created_at_ms, updated_at_ms, record_json
FROM authoring_actor_records_v10;

DROP TABLE authoring_actor_records_v10;

CREATE UNIQUE INDEX idx_authoring_actor_records_provenance_key
    ON authoring_actor_records (provenance_key);
CREATE INDEX idx_authoring_actor_records_status
    ON authoring_actor_records (status, actor_kind);

CREATE TABLE authoring_operation_mode_events (
    seq               INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_id          TEXT NOT NULL,
    mode              TEXT NOT NULL CHECK (mode IN ('manual', 'assisted', 'autonomous')),
    policy_id         TEXT NOT NULL,
    policy_version    TEXT NOT NULL,
    actor_id          TEXT NOT NULL,
    actor_kind        TEXT NOT NULL,
    idempotency_key   TEXT NOT NULL,
    record_json       TEXT NOT NULL,
    created_at_ms     INTEGER NOT NULL,
    UNIQUE (scope_id, idempotency_key)
);

CREATE INDEX idx_authoring_operation_mode_events_scope
    ON authoring_operation_mode_events (scope_id, seq);

CREATE TABLE authoring_system_policy_approvals (
    approval_id        TEXT NOT NULL PRIMARY KEY,
    proposal_id        TEXT NOT NULL,
    changeset_id       TEXT NOT NULL,
    scope_id           TEXT NOT NULL,
    mode               TEXT NOT NULL CHECK (mode IN ('assisted', 'autonomous')),
    policy_id          TEXT NOT NULL,
    policy_version     TEXT NOT NULL,
    system_actor_id    TEXT NOT NULL,
    system_actor_kind  TEXT NOT NULL,
    requeued_at_ms     INTEGER,
    record_json        TEXT NOT NULL,
    created_at_ms      INTEGER NOT NULL,
    updated_at_ms      INTEGER NOT NULL
);

CREATE INDEX idx_authoring_system_policy_approvals_changeset
    ON authoring_system_policy_approvals (changeset_id);
CREATE INDEX idx_authoring_system_policy_approvals_scope
    ON authoring_system_policy_approvals (scope_id, created_at_ms);

CREATE TABLE authoring_after_fact_acknowledgements (
    seq                INTEGER PRIMARY KEY AUTOINCREMENT,
    changeset_id       TEXT NOT NULL,
    approval_id        TEXT NOT NULL,
    reviewer_actor_id  TEXT NOT NULL,
    reviewer_actor_kind TEXT NOT NULL,
    idempotency_key    TEXT NOT NULL,
    comment            TEXT,
    record_json        TEXT NOT NULL,
    created_at_ms      INTEGER NOT NULL,
    UNIQUE (changeset_id, reviewer_actor_id, reviewer_actor_kind, idempotency_key)
);

CREATE INDEX idx_authoring_after_fact_acknowledgements_changeset
    ON authoring_after_fact_acknowledgements (changeset_id, seq);

UPDATE authoring_store_metadata
SET schema_version = 11
WHERE singleton = 1;
";

const DIRECT_WRITE_SCHEMA: &str = "
CREATE TABLE authoring_direct_write_records (
    changeset_id        TEXT NOT NULL PRIMARY KEY,
    proposal_id         TEXT NOT NULL,
    approval_id         TEXT NOT NULL,
    document_ref        TEXT NOT NULL,
    document_path       TEXT NOT NULL,
    expected_blob_hash  TEXT NOT NULL,
    target_blob_hash    TEXT NOT NULL,
    actor_id            TEXT NOT NULL,
    actor_kind          TEXT NOT NULL,
    idempotency_key     TEXT NOT NULL,
    request_digest      TEXT NOT NULL,
    authoritative_path  TEXT NOT NULL CHECK (authoritative_path IN ('direct_changeset')),
    direct_elapsed_ms   INTEGER NOT NULL CHECK (direct_elapsed_ms >= 0),
    legacy_status       TEXT NOT NULL,
    apply_status        TEXT NOT NULL,
    apply_receipt_id    TEXT,
    record_json         TEXT NOT NULL,
    created_at_ms       INTEGER NOT NULL,
    updated_at_ms       INTEGER NOT NULL,
    UNIQUE (actor_id, actor_kind, idempotency_key)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_direct_write_records_proposal
    ON authoring_direct_write_records (proposal_id);
CREATE INDEX idx_authoring_direct_write_records_actor
    ON authoring_direct_write_records (actor_id, actor_kind, created_at_ms);

UPDATE authoring_store_metadata
SET schema_version = 12
WHERE singleton = 1;
";

const SESSION_SCHEMA: &str = "
CREATE TABLE authoring_sessions (
    session_id              TEXT NOT NULL,
    scope_id                TEXT NOT NULL,
    title                   TEXT NOT NULL,
    status                  TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'closed')),
    actor_id                TEXT NOT NULL,
    actor_kind              TEXT NOT NULL,
    delegated_by_actor_id   TEXT NOT NULL DEFAULT '',
    langgraph_thread_id     TEXT,
    langgraph_run_id        TEXT,
    langgraph_checkpoint_id TEXT,
    latest_turn_id          TEXT,
    latest_run_id           TEXT,
    record_json             TEXT NOT NULL,
    created_at_ms           INTEGER NOT NULL,
    updated_at_ms           INTEGER NOT NULL,
    cancelled_at_ms         INTEGER,
    PRIMARY KEY (session_id)
) WITHOUT ROWID;

CREATE TABLE authoring_prompt_turns (
    turn_id                 TEXT NOT NULL,
    session_id              TEXT NOT NULL,
    turn_index              INTEGER NOT NULL CHECK (turn_index > 0),
    prompt_digest           TEXT NOT NULL,
    prompt_text             TEXT NOT NULL,
    prompt_bytes            INTEGER NOT NULL CHECK (prompt_bytes >= 0),
    summary                 TEXT,
    actor_id                TEXT NOT NULL,
    actor_kind              TEXT NOT NULL,
    delegated_by_actor_id   TEXT NOT NULL DEFAULT '',
    langgraph_thread_id     TEXT,
    langgraph_run_id        TEXT,
    langgraph_checkpoint_id TEXT,
    record_json             TEXT NOT NULL,
    created_at_ms           INTEGER NOT NULL,
    PRIMARY KEY (turn_id),
    UNIQUE (session_id, turn_index)
) WITHOUT ROWID;

CREATE TABLE authoring_runs (
    run_id                  TEXT NOT NULL,
    session_id              TEXT NOT NULL,
    turn_id                 TEXT,
    status                  TEXT NOT NULL CHECK (
        status IN ('active', 'cancel_requested', 'cancelled', 'completed', 'failed')
    ),
    active                  INTEGER NOT NULL CHECK (active IN (0, 1)),
    owner_actor_id          TEXT NOT NULL,
    owner_actor_kind        TEXT NOT NULL,
    delegated_by_actor_id   TEXT NOT NULL DEFAULT '',
    langgraph_thread_id     TEXT,
    langgraph_run_id        TEXT,
    langgraph_checkpoint_id TEXT,
    cancellation_reason     TEXT,
    record_json             TEXT NOT NULL,
    created_at_ms           INTEGER NOT NULL,
    updated_at_ms           INTEGER NOT NULL,
    cancelled_at_ms         INTEGER,
    completed_at_ms         INTEGER,
    PRIMARY KEY (run_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_sessions_updated
    ON authoring_sessions (updated_at_ms DESC, session_id ASC);
CREATE INDEX idx_authoring_prompt_turns_session
    ON authoring_prompt_turns (session_id, turn_index ASC);
CREATE INDEX idx_authoring_runs_session
    ON authoring_runs (session_id, created_at_ms ASC);
CREATE UNIQUE INDEX idx_authoring_runs_one_active_per_session
    ON authoring_runs (session_id)
    WHERE active = 1;

UPDATE authoring_store_metadata
SET schema_version = 13
WHERE singleton = 1;
";

const TOOL_PERMISSION_SCHEMA: &str = "
CREATE TABLE authoring_tool_permission_requests (
    seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_call_id          TEXT NOT NULL,
    tool_name             TEXT NOT NULL,
    risk_tier             TEXT NOT NULL CHECK (
        risk_tier IN ('read_only', 'mutating', 'dangerous')
    ),
    scope_id              TEXT NOT NULL,
    queue_state           TEXT NOT NULL CHECK (
        queue_state IN ('pending', 'claimed', 'decided', 'expired')
    ),
    auto_permitted        INTEGER NOT NULL CHECK (auto_permitted IN (0, 1)),
    decision              TEXT CHECK (decision IN ('approve', 'reject')),
    requester_actor_id    TEXT NOT NULL,
    requester_actor_kind  TEXT NOT NULL,
    reviewer_actor_id     TEXT,
    reviewer_actor_kind   TEXT,
    idempotency_key       TEXT NOT NULL,
    record_json           TEXT NOT NULL,
    created_at_ms         INTEGER NOT NULL,
    expires_at_ms         INTEGER NOT NULL,
    updated_at_ms         INTEGER NOT NULL,
    UNIQUE (tool_call_id)
);

CREATE INDEX idx_authoring_tool_permission_requests_scope
    ON authoring_tool_permission_requests (scope_id, seq);
CREATE INDEX idx_authoring_tool_permission_requests_state
    ON authoring_tool_permission_requests (queue_state, expires_at_ms);

UPDATE authoring_store_metadata
SET schema_version = 14
WHERE singleton = 1;
";

// P49-R2: widen the `changeset_kind` CHECK to admit `direct` (operation-modes
// kind=direct). The column carries a CHECK constraint, so its value set can only be
// widened by recreating the table. `authoring_changeset_revisions` is FK-referenced by
// `authoring_changeset_child_operations`, and `foreign_keys` is ON, so BOTH tables are
// recreated in dependency order and the child FK is rebuilt against the new parent —
// a rename-only approach would leave the child FK dangling at the dropped parent (fatal
// on the next child insert). Data-preserving: every column of both tables is copied
// verbatim, including the actor-provenance columns added in v8.
const CHANGESET_KIND_DIRECT_SCHEMA: &str = "
ALTER TABLE authoring_changeset_child_operations RENAME TO authoring_ccho_pre_v15;
ALTER TABLE authoring_changeset_revisions RENAME TO authoring_ccr_pre_v15;

CREATE TABLE authoring_changeset_revisions (
    seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
    changeset_id          TEXT NOT NULL,
    changeset_revision    TEXT NOT NULL,
    previous_revision     TEXT,
    changeset_kind        TEXT NOT NULL CHECK (
        changeset_kind IN ('authoring', 'direct', 'rollback')
    ),
    status                TEXT NOT NULL CHECK (
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
    session_id            TEXT,
    summary               TEXT NOT NULL,
    operation_count       INTEGER NOT NULL CHECK (operation_count > 0),
    aggregate_digest      TEXT NOT NULL,
    created_at_ms         INTEGER NOT NULL,
    record_json           TEXT NOT NULL,
    actor_id              TEXT NOT NULL DEFAULT '',
    actor_kind            TEXT NOT NULL DEFAULT '',
    delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    actor_provenance_key  TEXT NOT NULL DEFAULT '',
    UNIQUE (changeset_id, changeset_revision)
);

INSERT INTO authoring_changeset_revisions
    (seq, changeset_id, changeset_revision, previous_revision, changeset_kind,
     status, session_id, summary, operation_count, aggregate_digest,
     created_at_ms, record_json, actor_id, actor_kind, delegated_by_actor_id,
     actor_provenance_key)
SELECT
    seq, changeset_id, changeset_revision, previous_revision, changeset_kind,
    status, session_id, summary, operation_count, aggregate_digest,
    created_at_ms, record_json, actor_id, actor_kind, delegated_by_actor_id,
    actor_provenance_key
FROM authoring_ccr_pre_v15;

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

INSERT INTO authoring_changeset_child_operations
    (seq, changeset_id, changeset_revision, child_key, target_order,
     operation_kind, target_json, base_revision, current_revision,
     materialized_operation_json, material_digest, validation_digest, record_json)
SELECT
    seq, changeset_id, changeset_revision, child_key, target_order,
    operation_kind, target_json, base_revision, current_revision,
    materialized_operation_json, material_digest, validation_digest, record_json
FROM authoring_ccho_pre_v15;

DROP TABLE authoring_ccho_pre_v15;
DROP TABLE authoring_ccr_pre_v15;

DELETE FROM sqlite_sequence WHERE name = 'authoring_changeset_revisions';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'authoring_changeset_revisions', COALESCE(MAX(seq), 0)
FROM authoring_changeset_revisions;
DELETE FROM sqlite_sequence WHERE name = 'authoring_changeset_child_operations';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'authoring_changeset_child_operations', COALESCE(MAX(seq), 0)
FROM authoring_changeset_child_operations;

CREATE INDEX idx_authoring_changeset_revisions_changeset
    ON authoring_changeset_revisions (changeset_id, seq);
CREATE INDEX idx_authoring_changeset_revisions_revision
    ON authoring_changeset_revisions (changeset_revision);
CREATE INDEX idx_authoring_changeset_revisions_actor
    ON authoring_changeset_revisions (
        actor_id,
        actor_kind,
        delegated_by_actor_id,
        seq
    );
CREATE INDEX idx_authoring_changeset_children_revision
    ON authoring_changeset_child_operations (
        changeset_id,
        changeset_revision,
        target_order
    );

UPDATE authoring_store_metadata
SET schema_version = 15
WHERE singleton = 1;
";

// W12.P32: durable interrupt + tool-call records (langgraph-integration ADR). Both are
// PRODUCT state that must survive independently of LangGraph checkpoint pruning, so they
// live in the authoring store, not the checkpointer. Two fresh additive tables (no
// CHECK-widen, no table recreate). `authoring_interrupts` is keyed by a STABLE
// `interrupt_id` so simultaneous interrupts resume BY ID, never by position;
// `authoring_tool_call_records` snapshots the executor-gate outcome per tool call. Both
// are bounded by their unique business key and indexed by run for the resume listing.
const INTERRUPT_AND_TOOL_CALL_SCHEMA: &str = "
CREATE TABLE authoring_interrupts (
    seq              INTEGER PRIMARY KEY AUTOINCREMENT,
    interrupt_id     TEXT NOT NULL,
    run_id           TEXT NOT NULL,
    kind             TEXT NOT NULL CHECK (
        kind IN ('tool_permission', 'changeset_approval')
    ),
    tool_call_id     TEXT,
    proposal_id      TEXT,
    resume_state     TEXT NOT NULL CHECK (
        resume_state IN ('pending', 'resolved')
    ),
    decision         TEXT,
    idempotency_key  TEXT NOT NULL,
    record_json      TEXT NOT NULL,
    created_at_ms    INTEGER NOT NULL,
    updated_at_ms    INTEGER NOT NULL,
    UNIQUE (interrupt_id)
);

CREATE INDEX idx_authoring_interrupts_run
    ON authoring_interrupts (run_id, seq);
CREATE INDEX idx_authoring_interrupts_state
    ON authoring_interrupts (resume_state, seq);

CREATE TABLE authoring_tool_call_records (
    seq              INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_call_id     TEXT NOT NULL,
    run_id           TEXT NOT NULL,
    tool_name        TEXT NOT NULL,
    risk_tier        TEXT NOT NULL CHECK (
        risk_tier IN ('read_only', 'mutating', 'dangerous')
    ),
    permitted        INTEGER NOT NULL CHECK (permitted IN (0, 1)),
    refusal_reason   TEXT,
    record_json      TEXT NOT NULL,
    created_at_ms    INTEGER NOT NULL,
    updated_at_ms    INTEGER NOT NULL,
    UNIQUE (tool_call_id)
);

CREATE INDEX idx_authoring_tool_call_records_run
    ON authoring_tool_call_records (run_id, seq);

UPDATE authoring_store_metadata
SET schema_version = 16
WHERE singleton = 1;
";

// W13.P26: advisory leases + fencing tokens (concurrency-leases-conflicts ADR). A single
// FRESH additive table (no CHECK-widen, no table recreate — nothing FK-references it),
// keyed by `scope_id` so each scope holds exactly ONE lease row that acquire/renew/
// release/expire update in place. This makes the table structurally bounded (one row per
// distinct scope ever leased) and makes the per-scope `fencing_token` durably monotonic:
// it strictly increments on every fresh acquisition and never resets, because the row
// persists across release→re-acquire and expiry→re-acquire. Leases are advisory and
// self-expiring, so they carry NO retention/compaction lifecycle; the background janitor
// (a later-phase advisory) reclaims `released`/`expired` rows as a pure reclaimer.
const LEASE_SCHEMA: &str = "
CREATE TABLE authoring_leases (
    scope_id                     TEXT NOT NULL,
    lease_id                     TEXT NOT NULL,
    purpose                      TEXT NOT NULL CHECK (
        purpose IN (
            'destructive',
            'whole_document',
            'rename',
            'archive',
            'long_running_rewrite'
        )
    ),
    state                        TEXT NOT NULL CHECK (
        state IN ('held', 'released', 'expired')
    ),
    holder_actor_id              TEXT NOT NULL,
    holder_actor_kind            TEXT NOT NULL,
    holder_delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    fencing_token                INTEGER NOT NULL CHECK (fencing_token > 0),
    idempotency_key              TEXT NOT NULL,
    record_json                  TEXT NOT NULL,
    acquired_at_ms               INTEGER NOT NULL,
    expires_at_ms                INTEGER NOT NULL,
    updated_at_ms                INTEGER NOT NULL,
    PRIMARY KEY (scope_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_leases_state
    ON authoring_leases (state, expires_at_ms);
CREATE INDEX idx_authoring_leases_holder
    ON authoring_leases (holder_actor_id, holder_actor_kind);

UPDATE authoring_store_metadata
SET schema_version = 17
WHERE singleton = 1;
";

// W13.P24: advisory review-station claims (review-station-state ADR). A single FRESH
// additive table (no CHECK-widen, no table recreate) keyed by `changeset_id` so each
// changeset holds exactly ONE claim row that claim/release/respond/expire update in place.
// A claim is ADVISORY assignment, NOT authority (review-claims-are-not-authority): the
// four-state served item (`queued`/`claimed`/`decision_submitted`/`closed`) is a
// projection COMPOSITION of the approval decision-lifecycle and this claim overlay, so the
// `claimed` fact is a separate advisory record rather than a widened approval queue state.
// Like the advisory lease, a claim is TTL-bounded and reclaimed expire-on-read, so it
// carries no retention/compaction lifecycle; a `released`/`expired` row persists (one row
// per changeset) until re-claimed.
const REVIEW_CLAIM_SCHEMA: &str = "
CREATE TABLE authoring_review_claims (
    changeset_id                   TEXT NOT NULL,
    claim_id                       TEXT NOT NULL,
    purpose                        TEXT NOT NULL CHECK (
        purpose IN ('review', 'clarify')
    ),
    state                          TEXT NOT NULL CHECK (
        state IN ('held', 'released', 'expired')
    ),
    reviewer_actor_id              TEXT NOT NULL,
    reviewer_actor_kind            TEXT NOT NULL,
    reviewer_delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    idempotency_key                TEXT NOT NULL,
    record_json                    TEXT NOT NULL,
    claimed_at_ms                  INTEGER NOT NULL,
    expires_at_ms                  INTEGER NOT NULL,
    updated_at_ms                  INTEGER NOT NULL,
    PRIMARY KEY (changeset_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_review_claims_state
    ON authoring_review_claims (state, expires_at_ms);
CREATE INDEX idx_authoring_review_claims_reviewer
    ON authoring_review_claims (reviewer_actor_id, reviewer_actor_kind);

UPDATE authoring_store_metadata
SET schema_version = 18
WHERE singleton = 1;
";

// W14.P47: the direct-write dual-run/legacy-comparison measurement machinery is
// retired (direct-changeset is the sole editor-save materializer) — the column
// that recorded a legacy `/ops/core` comparison outcome per save has no writer
// left, so it is dropped rather than kept as a permanently-`not_run` fossil.
// A dual-run-era row's `record_json` blob may still carry a `"legacy": {...}`
// key (the field WAS serialized under `skip_serializing_if = "Option::is_none"`
// whenever dual-run recorded a comparison); `DirectWriteRecord` keeps
// `deny_unknown_fields` deliberately (the strict wire contract is not loosened
// to paper over stale data), so the blob is sanitized in place — `json_remove`
// is a no-op where the key is already absent.
const DROP_DIRECT_WRITE_LEGACY_STATUS_SCHEMA: &str = "
UPDATE authoring_direct_write_records
SET record_json = json_remove(record_json, '$.legacy')
WHERE json_extract(record_json, '$.legacy') IS NOT NULL;

ALTER TABLE authoring_direct_write_records DROP COLUMN legacy_status;

UPDATE authoring_store_metadata
SET schema_version = 19
WHERE singleton = 1;
";

// W01.P02 (authoring-surface ADR D2): the section-anchored comments plane. A single
// FRESH additive table (no CHECK-widen, no table recreate — nothing FK-references it),
// keyed by a stable `comment_id`. A comment is a durable, non-re-derivable authoring-state
// entity: it anchors to a heading SECTION via the section selector (`sections.rs`) stored
// as JSON in `record_json`, carries a size-capped body, attributes to an actor ref, and
// tracks a resolved flag. Bounds live at the repository (`comments.rs`): a per-document
// cap, a per-store cap, and a resolved-comment retention window pruned opportunistically
// on create — so this table is NOT an only-growing accumulator. Like the advisory lease
// table, a comment is not rollback/review/audit material, so it carries no formal
// retention/compaction lifecycle (`authoring_retention_records`); miscategorizing an
// annotation as protected material would lie to the compaction system. The queryable
// columns (`document_node_id`, `resolved`, `resolved_at_ms`, `created_at_ms`, author) back
// the bounded per-document listing and the retention prune; the record JSON is the source
// of truth (selector + body + full attribution) mirroring how the lease row stores its
// record.
const COMMENTS_SCHEMA: &str = "
CREATE TABLE authoring_comments (
    comment_id                   TEXT NOT NULL,
    document_node_id             TEXT NOT NULL,
    author_actor_id              TEXT NOT NULL,
    author_actor_kind            TEXT NOT NULL,
    author_delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    resolved                     INTEGER NOT NULL CHECK (resolved IN (0, 1)),
    record_json                  TEXT NOT NULL,
    created_at_ms                INTEGER NOT NULL,
    updated_at_ms                INTEGER NOT NULL,
    resolved_at_ms               INTEGER,
    PRIMARY KEY (comment_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_comments_document
    ON authoring_comments (document_node_id, created_at_ms ASC, comment_id ASC);
CREATE INDEX idx_authoring_comments_resolved_retention
    ON authoring_comments (resolved_at_ms)
    WHERE resolved = 1 AND resolved_at_ms IS NOT NULL;
CREATE INDEX idx_authoring_comments_author
    ON authoring_comments (author_actor_id, author_actor_kind);

UPDATE authoring_store_metadata
SET schema_version = 20
WHERE singleton = 1;
";

// D1+D2/D4/D7 wire-gap closure (agent-wire-gaps plan P01.S01): ONE additive version
// bump carrying three independent shapes so later phases add only code, not a second
// migration. (1) `queue_state` on prompt turns backs the bounded FIFO turn queue —
// existing turns backfill to `direct` (they each started their own run, the pre-queue
// behavior); a queued turn carries no run until FIFO promotion flips it to `promoted`,
// and session cancel flips a still-queued turn to `voided` (readable history, never
// runnable). (2) `run_id`/`turn_id` provenance on changeset revisions is authored here
// but stamped by P03's tool-executor dispatch (human/direct changesets stay NULL).
// (3) `authoring_feedback_batches` is the immutable digest-addressed batch table P04
// consumes; a shape change discovered at P04 time ships as a FRESH version bump, never
// an edit of this landed version.
const QUEUE_PROVENANCE_FEEDBACK_SCHEMA: &str = "
ALTER TABLE authoring_prompt_turns
    ADD COLUMN queue_state TEXT NOT NULL DEFAULT 'direct'
    CHECK (queue_state IN ('direct', 'queued', 'promoted', 'voided'));

CREATE INDEX idx_authoring_prompt_turns_queued
    ON authoring_prompt_turns (session_id, turn_index ASC)
    WHERE queue_state = 'queued';

ALTER TABLE authoring_changeset_revisions ADD COLUMN run_id TEXT;
ALTER TABLE authoring_changeset_revisions ADD COLUMN turn_id TEXT;

CREATE TABLE authoring_feedback_batches (
    feedback_batch_id            TEXT NOT NULL,
    session_id                   TEXT NOT NULL,
    source_revision              TEXT NOT NULL,
    author_actor_id              TEXT NOT NULL,
    author_actor_kind            TEXT NOT NULL,
    author_delegated_by_actor_id TEXT NOT NULL DEFAULT '',
    comment_count                INTEGER NOT NULL CHECK (comment_count >= 0),
    total_bytes                  INTEGER NOT NULL CHECK (total_bytes >= 0),
    record_json                  TEXT NOT NULL,
    created_at_ms                INTEGER NOT NULL,
    PRIMARY KEY (feedback_batch_id)
) WITHOUT ROWID;

CREATE INDEX idx_authoring_feedback_batches_session
    ON authoring_feedback_batches (session_id, created_at_ms ASC);

UPDATE authoring_store_metadata
SET schema_version = 21
WHERE singleton = 1;
";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Migration {
    pub(crate) version: i64,
    pub(crate) name: &'static str,
    pub(crate) sql: &'static str,
}

pub(crate) const MIGRATIONS: &[Migration] = &[
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
    Migration {
        version: 8,
        name: "create_authoring_actor_records_and_ledger_provenance",
        sql: ACTOR_PROVENANCE_SCHEMA,
    },
    Migration {
        version: 9,
        name: "create_authoring_approval_requests",
        sql: APPROVAL_SCHEMA,
    },
    Migration {
        version: 10,
        name: "create_authoring_actor_tokens",
        sql: ACTOR_TOKEN_SCHEMA,
    },
    Migration {
        version: 11,
        name: "create_authoring_operation_modes",
        sql: OPERATION_MODE_SCHEMA,
    },
    Migration {
        version: 12,
        name: "create_authoring_direct_write_records",
        sql: DIRECT_WRITE_SCHEMA,
    },
    Migration {
        version: 13,
        name: "create_authoring_sessions_prompt_turns_and_runs",
        sql: SESSION_SCHEMA,
    },
    Migration {
        version: 14,
        name: "create_authoring_tool_permission_requests",
        sql: TOOL_PERMISSION_SCHEMA,
    },
    Migration {
        version: 15,
        name: "widen_changeset_kind_for_direct",
        sql: CHANGESET_KIND_DIRECT_SCHEMA,
    },
    Migration {
        version: 16,
        name: "create_authoring_interrupts_and_tool_call_records",
        sql: INTERRUPT_AND_TOOL_CALL_SCHEMA,
    },
    Migration {
        version: 17,
        name: "create_authoring_leases",
        sql: LEASE_SCHEMA,
    },
    Migration {
        version: 18,
        name: "create_authoring_review_claims",
        sql: REVIEW_CLAIM_SCHEMA,
    },
    Migration {
        version: 19,
        name: "drop_authoring_direct_write_legacy_status",
        sql: DROP_DIRECT_WRITE_LEGACY_STATUS_SCHEMA,
    },
    Migration {
        version: 20,
        name: "create_authoring_comments",
        sql: COMMENTS_SCHEMA,
    },
    Migration {
        version: 21,
        name: "add_queue_state_provenance_and_feedback_batches",
        sql: QUEUE_PROVENANCE_FEEDBACK_SCHEMA,
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

pub type Result<T> = std::result::Result<T, StoreError>;

pub(crate) fn configure_connection(conn: &Connection) -> Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

pub(crate) fn run_migrations(conn: &Connection, migrations: &[Migration]) -> Result<()> {
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

pub(crate) fn user_version(conn: &Connection) -> Result<i64> {
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

pub(crate) fn read_schema_metadata(conn: &Connection) -> Result<SchemaMetadata> {
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
