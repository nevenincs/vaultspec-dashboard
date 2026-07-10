//! Retention, compaction, and backup metadata repository.
//!
//! W02.P08 defines how later authoring records declare retention class,
//! protection, compaction markers, rollback limitations, and backup coverage. It
//! deliberately does not create proposal, approval, apply, rollback, outbox,
//! route, or LangGraph domain tables.

use super::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::{Result, StoreError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetentionClass {
    ProtectedProductState,
    RollbackMaterial,
    AuditReceipt,
    ReviewMaterial,
    GenerationTranscript,
    ExpiringIdempotency,
}

impl RetentionClass {
    fn as_str(self) -> &'static str {
        match self {
            Self::ProtectedProductState => "protected_product_state",
            Self::RollbackMaterial => "rollback_material",
            Self::AuditReceipt => "audit_receipt",
            Self::ReviewMaterial => "review_material",
            Self::GenerationTranscript => "generation_transcript",
            Self::ExpiringIdempotency => "expiring_idempotency",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "protected_product_state" => Ok(Self::ProtectedProductState),
            "rollback_material" => Ok(Self::RollbackMaterial),
            "audit_receipt" => Ok(Self::AuditReceipt),
            "review_material" => Ok(Self::ReviewMaterial),
            "generation_transcript" => Ok(Self::GenerationTranscript),
            "expiring_idempotency" => Ok(Self::ExpiringIdempotency),
            other => Err(StoreError::Retention(format!(
                "unknown retention class `{other}`"
            ))),
        }
    }

    fn is_hard_protected(self) -> bool {
        matches!(
            self,
            Self::ProtectedProductState | Self::RollbackMaterial | Self::AuditReceipt
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleStatus {
    Pending,
    Active,
    Applied,
    Rejected,
    Superseded,
    Expired,
}

impl LifecycleStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Active => "active",
            Self::Applied => "applied",
            Self::Rejected => "rejected",
            Self::Superseded => "superseded",
            Self::Expired => "expired",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "pending" => Ok(Self::Pending),
            "active" => Ok(Self::Active),
            "applied" => Ok(Self::Applied),
            "rejected" => Ok(Self::Rejected),
            "superseded" => Ok(Self::Superseded),
            "expired" => Ok(Self::Expired),
            other => Err(StoreError::Retention(format!(
                "unknown lifecycle status `{other}`"
            ))),
        }
    }

    fn is_terminal(self) -> bool {
        matches!(self, Self::Rejected | Self::Superseded | Self::Expired)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PayloadState {
    Full,
    Summarized,
    HashOnly,
}

impl PayloadState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Summarized => "summarized",
            Self::HashOnly => "hash_only",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "full" => Ok(Self::Full),
            "summarized" => Ok(Self::Summarized),
            "hash_only" => Ok(Self::HashOnly),
            other => Err(StoreError::Retention(format!(
                "unknown payload state `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactionDisposition {
    Compacted,
    SkippedProtected,
    MarkedLimitation,
}

impl CompactionDisposition {
    fn as_str(self) -> &'static str {
        match self {
            Self::Compacted => "compacted",
            Self::SkippedProtected => "skipped_protected",
            Self::MarkedLimitation => "marked_limitation",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "compacted" => Ok(Self::Compacted),
            "skipped_protected" => Ok(Self::SkippedProtected),
            "marked_limitation" => Ok(Self::MarkedLimitation),
            other => Err(StoreError::Retention(format!(
                "unknown compaction disposition `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionRecordRef {
    pub kind: String,
    pub id: String,
}

impl RetentionRecordRef {
    pub fn new(kind: impl Into<String>, id: impl Into<String>) -> Result<Self> {
        let kind = non_empty("record_kind", kind.into())?;
        let id = non_empty("record_id", id.into())?;
        Ok(Self { kind, id })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionRecord {
    pub record_ref: RetentionRecordRef,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub retention_class: RetentionClass,
    pub lifecycle_status: LifecycleStatus,
    pub payload_state: PayloadState,
    pub protected: bool,
    pub protected_reason: Option<String>,
    pub content_hash: String,
    pub payload_bytes: i64,
    pub summary_json: Option<String>,
    pub summary_hash: Option<String>,
    pub compact_after_ms: Option<i64>,
    pub expires_at_ms: Option<i64>,
    pub rollback_available: bool,
    pub rollback_unavailable_reason: Option<String>,
    pub backup_required: bool,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl RetentionRecord {
    pub fn new(
        record_ref: RetentionRecordRef,
        aggregate_kind: impl Into<String>,
        aggregate_id: impl Into<String>,
        retention_class: RetentionClass,
        lifecycle_status: LifecycleStatus,
        content_hash: impl Into<String>,
        now_ms: i64,
    ) -> Result<Self> {
        let aggregate_kind = non_empty("aggregate_kind", aggregate_kind.into())?;
        let aggregate_id = non_empty("aggregate_id", aggregate_id.into())?;
        let content_hash = non_empty("content_hash", content_hash.into())?;
        let protected = retention_class.is_hard_protected()
            || matches!(lifecycle_status, LifecycleStatus::Pending);
        let backup_required = !matches!(retention_class, RetentionClass::GenerationTranscript);
        Ok(Self {
            record_ref,
            aggregate_kind,
            aggregate_id,
            retention_class,
            lifecycle_status,
            payload_state: PayloadState::Full,
            protected,
            protected_reason: protected
                .then(|| default_protection_reason(retention_class, lifecycle_status)),
            content_hash,
            payload_bytes: 0,
            summary_json: None,
            summary_hash: None,
            compact_after_ms: None,
            expires_at_ms: None,
            rollback_available: true,
            rollback_unavailable_reason: None,
            backup_required,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionRequest {
    pub record_ref: RetentionRecordRef,
    pub run_id: String,
    pub marker_id: String,
    pub now_ms: i64,
    pub summary_json: Option<String>,
    pub summary_hash: Option<String>,
    pub allow_rollback_limitation: bool,
    pub rollback_unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionMarker {
    pub marker_id: String,
    pub run_id: Option<String>,
    pub record_ref: RetentionRecordRef,
    pub disposition: CompactionDisposition,
    pub reason: String,
    pub before_hash: String,
    pub after_hash: Option<String>,
    pub rollback_limitation_recorded: bool,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompactionDecision {
    Compacted(RetentionRecord),
    Blocked(CompactionMarker),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionRunSummary {
    pub run_id: String,
    pub compacted_count: usize,
    pub skipped_count: usize,
    pub limited_count: usize,
}

/// The bounded cap on the durable compaction-run audit table (resource-bounds: an
/// only-growing SQLite table must carry a prune). `compact_due` keeps only the most-recent
/// runs and prunes older audit rows, so even sustained real compaction activity cannot grow
/// the table without limit. This bounds only the coarse run-level audit log; the
/// per-record compaction MARKERS (their provenance) are retained under record retention.
const MAX_COMPACTION_RUN_AUDIT_ROWS: i64 = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupExport {
    pub export_id: String,
    pub required_count: usize,
    pub included_count: usize,
    pub omitted_count: usize,
    pub items: Vec<BackupExportItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupExportItem {
    pub record_ref: RetentionRecordRef,
    pub retention_class: RetentionClass,
    pub payload_state: PayloadState,
    pub content_hash: String,
    pub rollback_available: bool,
    pub included: bool,
    pub omission_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionStatus {
    pub total_records: usize,
    pub protected_records: usize,
    pub compactable_due_records: usize,
    pub compacted_records: usize,
    pub rollback_unavailable_records: usize,
    pub pending_backup_records: usize,
    pub compaction_marker_count: usize,
}

pub struct RetentionRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn retention<'repo>(&'repo self) -> RetentionRepository<'repo, 'conn> {
        RetentionRepository {
            repo: self.repository("authoring_retention_records"),
        }
    }
}

impl RetentionRepository<'_, '_> {
    pub fn upsert_record(&self, record: &RetentionRecord) -> Result<()> {
        validate_record(record)?;
        self.repo.execute(
            "INSERT INTO authoring_retention_records
                (record_kind, record_id, aggregate_kind, aggregate_id,
                 retention_class, lifecycle_status, payload_state, protected,
                 protected_reason, content_hash, payload_bytes, summary_json,
                 summary_hash, compact_after_ms, expires_at_ms,
                 rollback_available, rollback_unavailable_reason,
                 backup_required, created_at_ms, updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                 ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
             ON CONFLICT(record_kind, record_id) DO UPDATE SET
                 aggregate_kind = excluded.aggregate_kind,
                 aggregate_id = excluded.aggregate_id,
                 retention_class = excluded.retention_class,
                 lifecycle_status = excluded.lifecycle_status,
                 payload_state = CASE
                     WHEN authoring_retention_records.payload_state != 'full'
                     THEN authoring_retention_records.payload_state
                     ELSE excluded.payload_state
                 END,
                 protected = excluded.protected,
                 protected_reason = excluded.protected_reason,
                 content_hash = CASE
                     WHEN authoring_retention_records.payload_state != 'full'
                     THEN authoring_retention_records.content_hash
                     ELSE excluded.content_hash
                 END,
                 payload_bytes = CASE
                     WHEN authoring_retention_records.payload_state != 'full'
                     THEN authoring_retention_records.payload_bytes
                     ELSE excluded.payload_bytes
                 END,
                 summary_json = CASE
                     WHEN authoring_retention_records.payload_state != 'full'
                     THEN authoring_retention_records.summary_json
                     ELSE excluded.summary_json
                 END,
                 summary_hash = CASE
                     WHEN authoring_retention_records.payload_state != 'full'
                     THEN authoring_retention_records.summary_hash
                     ELSE excluded.summary_hash
                 END,
                 compact_after_ms = excluded.compact_after_ms,
                 expires_at_ms = excluded.expires_at_ms,
                 rollback_available = CASE
                     WHEN authoring_retention_records.rollback_available = 0
                     THEN 0
                     ELSE excluded.rollback_available
                 END,
                 rollback_unavailable_reason = CASE
                     WHEN authoring_retention_records.rollback_available = 0
                     THEN authoring_retention_records.rollback_unavailable_reason
                     ELSE excluded.rollback_unavailable_reason
                 END,
                 backup_required = excluded.backup_required,
                 updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.record_ref.kind.as_str(),
                record.record_ref.id.as_str(),
                record.aggregate_kind.as_str(),
                record.aggregate_id.as_str(),
                record.retention_class.as_str(),
                record.lifecycle_status.as_str(),
                record.payload_state.as_str(),
                bool_i64(record.protected),
                record.protected_reason.as_deref(),
                record.content_hash.as_str(),
                record.payload_bytes,
                record.summary_json.as_deref(),
                record.summary_hash.as_deref(),
                record.compact_after_ms,
                record.expires_at_ms,
                bool_i64(record.rollback_available),
                record.rollback_unavailable_reason.as_deref(),
                bool_i64(record.backup_required),
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn record(&self, record_ref: &RetentionRecordRef) -> Result<Option<RetentionRecord>> {
        self.repo.query_optional(
            "SELECT record_kind, record_id, aggregate_kind, aggregate_id,
                    retention_class, lifecycle_status, payload_state, protected,
                    protected_reason, content_hash, payload_bytes, summary_json,
                    summary_hash, compact_after_ms, expires_at_ms,
                    rollback_available, rollback_unavailable_reason,
                    backup_required, created_at_ms, updated_at_ms
             FROM authoring_retention_records
             WHERE record_kind = ?1
               AND record_id = ?2",
            (record_ref.kind.as_str(), record_ref.id.as_str()),
            read_record,
        )
    }

    pub fn compact_record(&self, request: CompactionRequest) -> Result<CompactionDecision> {
        validate_non_empty("run_id", &request.run_id)?;
        validate_non_empty("marker_id", &request.marker_id)?;
        let record = self.record(&request.record_ref)?.ok_or_else(|| {
            StoreError::Retention(format!(
                "missing retention record `{}`/`{}`",
                request.record_ref.kind, request.record_ref.id
            ))
        })?;

        if record.protected && !matches!(record.retention_class, RetentionClass::RollbackMaterial) {
            let reason = record.protected_reason.clone().unwrap_or_else(|| {
                "protected authoring product state cannot be compacted".to_string()
            });
            let marker = self.insert_marker(
                &request,
                &record,
                CompactionDisposition::SkippedProtected,
                reason,
                false,
                None,
            )?;
            return Ok(CompactionDecision::Blocked(marker));
        }

        if matches!(record.retention_class, RetentionClass::AuditReceipt) {
            let marker = self.insert_marker(
                &request,
                &record,
                CompactionDisposition::SkippedProtected,
                "audit receipts are product history and cannot be compacted".to_string(),
                false,
                None,
            )?;
            return Ok(CompactionDecision::Blocked(marker));
        }

        if matches!(record.retention_class, RetentionClass::RollbackMaterial)
            && !request.allow_rollback_limitation
        {
            let marker = self.insert_marker(
                &request,
                &record,
                CompactionDisposition::SkippedProtected,
                "rollback material requires an explicit rollback limitation before compaction"
                    .to_string(),
                false,
                None,
            )?;
            return Ok(CompactionDecision::Blocked(marker));
        }

        if !record.lifecycle_status.is_terminal()
            && !matches!(record.retention_class, RetentionClass::RollbackMaterial)
        {
            let marker = self.insert_marker(
                &request,
                &record,
                CompactionDisposition::SkippedProtected,
                "non-terminal authoring records are retained in full".to_string(),
                false,
                None,
            )?;
            return Ok(CompactionDecision::Blocked(marker));
        }

        let rollback_limitation =
            matches!(record.retention_class, RetentionClass::RollbackMaterial);
        let rollback_unavailable_reason = if rollback_limitation {
            Some(non_empty(
                "rollback_unavailable_reason",
                request.rollback_unavailable_reason.clone().ok_or_else(|| {
                    StoreError::Retention(
                        "rollback material compaction requires a limitation reason".to_string(),
                    )
                })?,
            )?)
        } else {
            None
        };
        let summary_hash = request
            .summary_hash
            .clone()
            .or_else(|| rollback_limitation.then(|| record.content_hash.clone()))
            .ok_or_else(|| {
                StoreError::Retention("compaction requires a summary hash".to_string())
            })?;
        let disposition = if rollback_limitation {
            CompactionDisposition::MarkedLimitation
        } else {
            CompactionDisposition::Compacted
        };
        self.repo.execute(
            "UPDATE authoring_retention_records
             SET payload_state = ?3,
                 summary_json = ?4,
                 summary_hash = ?5,
                 rollback_available = ?6,
                 rollback_unavailable_reason = ?7,
                 updated_at_ms = ?8
             WHERE record_kind = ?1
               AND record_id = ?2",
            (
                request.record_ref.kind.as_str(),
                request.record_ref.id.as_str(),
                PayloadState::Summarized.as_str(),
                request.summary_json.as_deref(),
                summary_hash.as_str(),
                bool_i64(!rollback_limitation),
                rollback_unavailable_reason.as_deref(),
                request.now_ms,
            ),
        )?;
        self.insert_marker(
            &request,
            &record,
            disposition,
            rollback_unavailable_reason.unwrap_or_else(|| {
                "terminal compactable artifact summarized by retention policy".to_string()
            }),
            rollback_limitation,
            Some(summary_hash),
        )?;
        self.record(&request.record_ref)?
            .ok_or_else(|| {
                StoreError::Retention(format!(
                    "missing retention record `{}`/`{}` after compaction",
                    request.record_ref.kind, request.record_ref.id
                ))
            })
            .map(CompactionDecision::Compacted)
    }

    pub fn compact_due(
        &self,
        run_id: impl Into<String>,
        now_ms: i64,
        max_rows: u32,
        summary_hash: impl Into<String>,
    ) -> Result<CompactionRunSummary> {
        let run_id = non_empty("run_id", run_id.into())?;
        let summary_hash = non_empty("summary_hash", summary_hash.into())?;
        let due = self.due_compactable_records(now_ms, max_rows)?;
        let mut compacted_count = 0;
        let mut skipped_count = 0;
        let mut limited_count = 0;

        for (idx, record_ref) in due.iter().enumerate() {
            let decision = self.compact_record(CompactionRequest {
                record_ref: record_ref.clone(),
                run_id: run_id.clone(),
                marker_id: format!("{run_id}:marker:{idx}"),
                now_ms,
                summary_json: Some("{\"summary\":\"retention compacted\"}".to_string()),
                summary_hash: Some(summary_hash.clone()),
                allow_rollback_limitation: false,
                rollback_unavailable_reason: None,
            })?;
            match decision {
                CompactionDecision::Compacted(_) => compacted_count += 1,
                CompactionDecision::Blocked(_) => skipped_count += 1,
            }
        }
        let remaining = self.due_compactable_count(now_ms)?;
        if remaining > 0 {
            limited_count = remaining;
        }
        // Record a durable audit row ONLY when the sweep actually did something. S262 drives
        // this hook once per genuine prompt turn, and MOST turns are pure no-ops (nothing
        // newly due); an unconditional insert would grow the run table ~one row per turn
        // forever (resource-bounds: no only-growing table without a prune). A no-op sweep
        // (nothing compacted, skipped, or still-limited) writes nothing.
        if compacted_count + skipped_count + limited_count > 0 {
            self.repo.execute(
                "INSERT INTO authoring_compaction_runs
                    (run_id, started_at_ms, completed_at_ms, max_rows,
                     compacted_count, skipped_count, limited_count, status)
                 VALUES
                    (?1, ?2, ?2, ?3, ?4, ?5, ?6, 'completed')",
                (
                    run_id.as_str(),
                    now_ms,
                    i64::from(max_rows),
                    compacted_count as i64,
                    skipped_count as i64,
                    limited_count as i64,
                ),
            )?;
            // And even real compaction activity cannot grow the audit table without limit:
            // keep only the most-recent rows.
            self.prune_compaction_runs(MAX_COMPACTION_RUN_AUDIT_ROWS)?;
        }
        Ok(CompactionRunSummary {
            run_id,
            compacted_count,
            skipped_count,
            limited_count,
        })
    }

    pub fn create_backup_export(
        &self,
        export_id: impl Into<String>,
        reason: impl Into<String>,
        now_ms: i64,
    ) -> Result<BackupExport> {
        let export_id = non_empty("export_id", export_id.into())?;
        let reason = non_empty("reason", reason.into())?;
        let items = self.backup_manifest_items()?;
        let required_count = items.iter().filter(|item| item.included).count();
        let included_count = items.iter().filter(|item| item.included).count();
        let omitted_count = required_count.saturating_sub(included_count);
        let omitted_count = omitted_count + items.iter().filter(|item| !item.included).count();

        self.repo.execute(
            "INSERT INTO authoring_backup_exports
                (export_id, reason, created_at_ms, required_count,
                 included_count, omitted_count)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6)",
            (
                export_id.as_str(),
                reason.as_str(),
                now_ms,
                required_count as i64,
                included_count as i64,
                omitted_count as i64,
            ),
        )?;
        for item in &items {
            self.repo.execute(
                "INSERT INTO authoring_backup_export_items
                    (export_id, record_kind, record_id, retention_class,
                     payload_state, content_hash, rollback_available,
                     included, omission_reason)
                 VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                (
                    export_id.as_str(),
                    item.record_ref.kind.as_str(),
                    item.record_ref.id.as_str(),
                    item.retention_class.as_str(),
                    item.payload_state.as_str(),
                    item.content_hash.as_str(),
                    bool_i64(item.rollback_available),
                    bool_i64(item.included),
                    item.omission_reason.as_deref(),
                ),
            )?;
        }
        Ok(BackupExport {
            export_id,
            required_count,
            included_count,
            omitted_count,
            items,
        })
    }

    pub fn status(&self, now_ms: i64) -> Result<RetentionStatus> {
        Ok(RetentionStatus {
            total_records: self.count_records("1 = 1", [])?,
            protected_records: self.count_records("protected = 1", [])?,
            compactable_due_records: self.due_compactable_count(now_ms)?,
            compacted_records: self.count_records("payload_state != 'full'", [])?,
            rollback_unavailable_records: self.count_records("rollback_available = 0", [])?,
            pending_backup_records: self.count_records("backup_required = 1", [])?,
            compaction_marker_count: self.count_markers()?,
        })
    }

    pub fn markers_for(&self, record_ref: &RetentionRecordRef) -> Result<Vec<CompactionMarker>> {
        let mut markers = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_compaction_markers
             WHERE record_kind = ?1
               AND record_id = ?2",
            (record_ref.kind.as_str(), record_ref.id.as_str()),
            |row| row.get::<_, i64>(0),
        )?;
        let mut result = Vec::new();
        while markers > 0 {
            let marker = self.repo.query_row(
                "SELECT marker_id, run_id, record_kind, record_id, disposition,
                        reason, before_hash, after_hash,
                        rollback_limitation_recorded, created_at_ms
                 FROM authoring_compaction_markers
                 WHERE record_kind = ?1
                   AND record_id = ?2
                 ORDER BY created_at_ms ASC, marker_id ASC
                 LIMIT 1 OFFSET ?3",
                (
                    record_ref.kind.as_str(),
                    record_ref.id.as_str(),
                    result.len() as i64,
                ),
                read_marker,
            )?;
            result.push(marker);
            markers -= 1;
        }
        Ok(result)
    }

    fn insert_marker(
        &self,
        request: &CompactionRequest,
        record: &RetentionRecord,
        disposition: CompactionDisposition,
        reason: String,
        rollback_limitation_recorded: bool,
        after_hash: Option<String>,
    ) -> Result<CompactionMarker> {
        validate_non_empty("reason", &reason)?;
        let marker = CompactionMarker {
            marker_id: request.marker_id.clone(),
            run_id: Some(request.run_id.clone()),
            record_ref: request.record_ref.clone(),
            disposition,
            reason,
            before_hash: record.content_hash.clone(),
            after_hash,
            rollback_limitation_recorded,
            created_at_ms: request.now_ms,
        };
        self.repo.execute(
            "INSERT INTO authoring_compaction_markers
                (marker_id, run_id, record_kind, record_id, disposition,
                 reason, before_hash, after_hash,
                 rollback_limitation_recorded, created_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            (
                marker.marker_id.as_str(),
                marker.run_id.as_deref(),
                marker.record_ref.kind.as_str(),
                marker.record_ref.id.as_str(),
                marker.disposition.as_str(),
                marker.reason.as_str(),
                marker.before_hash.as_str(),
                marker.after_hash.as_deref(),
                bool_i64(marker.rollback_limitation_recorded),
                marker.created_at_ms,
            ),
        )?;
        Ok(marker)
    }

    fn due_compactable_records(
        &self,
        now_ms: i64,
        max_rows: u32,
    ) -> Result<Vec<RetentionRecordRef>> {
        let mut refs = Vec::new();
        let count = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_retention_records
             WHERE retention_class IN ('generation_transcript', 'review_material')
               AND lifecycle_status IN ('rejected', 'superseded', 'expired')
               AND payload_state = 'full'
               AND protected = 0
               AND compact_after_ms IS NOT NULL
               AND compact_after_ms <= ?1",
            [now_ms],
            |row| row.get::<_, i64>(0),
        )?;
        for idx in 0..count.min(i64::from(max_rows)) {
            let record_ref = self.repo.query_row(
                "SELECT record_kind, record_id
                 FROM authoring_retention_records
                 WHERE retention_class IN ('generation_transcript', 'review_material')
                   AND lifecycle_status IN ('rejected', 'superseded', 'expired')
                   AND payload_state = 'full'
                   AND protected = 0
                   AND compact_after_ms IS NOT NULL
                   AND compact_after_ms <= ?1
                 ORDER BY compact_after_ms ASC, record_kind ASC, record_id ASC
                 LIMIT 1 OFFSET ?2",
                (now_ms, idx),
                |row| {
                    RetentionRecordRef::new(row.get::<_, String>(0)?, row.get::<_, String>(1)?)
                        .map_err(to_sql_error)
                },
            )?;
            refs.push(record_ref);
        }
        Ok(refs)
    }

    fn due_compactable_count(&self, now_ms: i64) -> Result<usize> {
        let count = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_retention_records
             WHERE retention_class IN ('generation_transcript', 'review_material')
               AND lifecycle_status IN ('rejected', 'superseded', 'expired')
               AND payload_state = 'full'
               AND protected = 0
               AND compact_after_ms IS NOT NULL
               AND compact_after_ms <= ?1",
            [now_ms],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count as usize)
    }

    fn backup_manifest_items(&self) -> Result<Vec<BackupExportItem>> {
        let count = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_retention_records",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let mut items = Vec::new();
        for idx in 0..count {
            items.push(self.repo.query_row(
                "SELECT record_kind, record_id, retention_class, payload_state,
                        content_hash, rollback_available, backup_required
                 FROM authoring_retention_records
                 ORDER BY record_kind ASC, record_id ASC
                 LIMIT 1 OFFSET ?1",
                [idx],
                read_backup_item,
            )?);
        }
        Ok(items)
    }

    fn count_records<P>(&self, predicate: &str, params: P) -> Result<usize>
    where
        P: rusqlite::Params,
    {
        let sql = format!("SELECT count(*) FROM authoring_retention_records WHERE {predicate}");
        let count = self
            .repo
            .query_row(sql.as_str(), params, |row| row.get::<_, i64>(0))?;
        Ok(count as usize)
    }

    fn count_markers(&self) -> Result<usize> {
        let count = self.repo.query_row(
            "SELECT count(*) FROM authoring_compaction_markers",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count as usize)
    }

    /// The number of durable compaction-run audit rows. Bounded by
    /// [`MAX_COMPACTION_RUN_AUDIT_ROWS`]; a no-op sweep contributes none.
    pub fn compaction_run_count(&self) -> Result<usize> {
        let count = self.repo.query_row(
            "SELECT count(*) FROM authoring_compaction_runs",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count as usize)
    }

    /// Prune the compaction-run audit table to its most-recent `keep` rows (by completion
    /// time, `run_id` tie-broken), returning how many rows were removed. This is the bounded
    /// DELETE that keeps the only-growing audit table within
    /// [`MAX_COMPACTION_RUN_AUDIT_ROWS`]; `compact_due` calls it after every real sweep.
    fn prune_compaction_runs(&self, keep: i64) -> Result<usize> {
        let pruned = self.repo.execute(
            "DELETE FROM authoring_compaction_runs
             WHERE run_id NOT IN (
                 SELECT run_id
                 FROM authoring_compaction_runs
                 ORDER BY completed_at_ms DESC, run_id DESC
                 LIMIT ?1
             )",
            [keep.max(0)],
        )?;
        Ok(pruned)
    }
}

fn validate_record(record: &RetentionRecord) -> Result<()> {
    validate_non_empty("record_kind", &record.record_ref.kind)?;
    validate_non_empty("record_id", &record.record_ref.id)?;
    validate_non_empty("aggregate_kind", &record.aggregate_kind)?;
    validate_non_empty("aggregate_id", &record.aggregate_id)?;
    validate_non_empty("content_hash", &record.content_hash)?;
    if record.payload_bytes < 0 {
        return Err(StoreError::Retention(
            "payload_bytes must be non-negative".to_string(),
        ));
    }
    if record.protected && record.protected_reason.is_none() {
        return Err(StoreError::Retention(
            "protected retention records require a protected_reason".to_string(),
        ));
    }
    if !record.rollback_available && record.rollback_unavailable_reason.is_none() {
        return Err(StoreError::Retention(
            "unavailable rollback records require a reason".to_string(),
        ));
    }
    Ok(())
}

fn default_protection_reason(
    retention_class: RetentionClass,
    lifecycle_status: LifecycleStatus,
) -> String {
    match (retention_class, lifecycle_status) {
        (_, LifecycleStatus::Pending) => "pending authoring records are product state".to_string(),
        (RetentionClass::RollbackMaterial, _) => {
            "rollback material is protected until an explicit limitation is recorded".to_string()
        }
        (RetentionClass::AuditReceipt, _) => {
            "audit and apply receipts are product history".to_string()
        }
        _ => "authoring product state is protected by default".to_string(),
    }
}

fn read_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<RetentionRecord> {
    let record_kind: String = row.get(0)?;
    let record_id: String = row.get(1)?;
    let retention_class: String = row.get(4)?;
    let lifecycle_status: String = row.get(5)?;
    let payload_state: String = row.get(6)?;
    Ok(RetentionRecord {
        record_ref: RetentionRecordRef::new(record_kind, record_id).map_err(to_sql_error)?,
        aggregate_kind: row.get(2)?,
        aggregate_id: row.get(3)?,
        retention_class: RetentionClass::from_str(&retention_class).map_err(to_sql_error)?,
        lifecycle_status: LifecycleStatus::from_str(&lifecycle_status).map_err(to_sql_error)?,
        payload_state: PayloadState::from_str(&payload_state).map_err(to_sql_error)?,
        protected: row.get::<_, i64>(7)? != 0,
        protected_reason: row.get(8)?,
        content_hash: row.get(9)?,
        payload_bytes: row.get(10)?,
        summary_json: row.get(11)?,
        summary_hash: row.get(12)?,
        compact_after_ms: row.get(13)?,
        expires_at_ms: row.get(14)?,
        rollback_available: row.get::<_, i64>(15)? != 0,
        rollback_unavailable_reason: row.get(16)?,
        backup_required: row.get::<_, i64>(17)? != 0,
        created_at_ms: row.get(18)?,
        updated_at_ms: row.get(19)?,
    })
}

fn read_marker(row: &rusqlite::Row<'_>) -> rusqlite::Result<CompactionMarker> {
    let disposition: String = row.get(4)?;
    Ok(CompactionMarker {
        marker_id: row.get(0)?,
        run_id: row.get(1)?,
        record_ref: RetentionRecordRef::new(row.get::<_, String>(2)?, row.get::<_, String>(3)?)
            .map_err(to_sql_error)?,
        disposition: CompactionDisposition::from_str(&disposition).map_err(to_sql_error)?,
        reason: row.get(5)?,
        before_hash: row.get(6)?,
        after_hash: row.get(7)?,
        rollback_limitation_recorded: row.get::<_, i64>(8)? != 0,
        created_at_ms: row.get(9)?,
    })
}

fn read_backup_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<BackupExportItem> {
    let retention_class: String = row.get(2)?;
    let payload_state: String = row.get(3)?;
    let included = row.get::<_, i64>(6)? != 0;
    Ok(BackupExportItem {
        record_ref: RetentionRecordRef::new(row.get::<_, String>(0)?, row.get::<_, String>(1)?)
            .map_err(to_sql_error)?,
        retention_class: RetentionClass::from_str(&retention_class).map_err(to_sql_error)?,
        payload_state: PayloadState::from_str(&payload_state).map_err(to_sql_error)?,
        content_hash: row.get(4)?,
        rollback_available: row.get::<_, i64>(5)? != 0,
        included,
        omission_reason: (!included)
            .then(|| "optional generation artifact follows transient retention policy".to_string()),
    })
}

fn non_empty(field: &str, value: String) -> Result<String> {
    validate_non_empty(field, &value)?;
    Ok(value)
}

fn validate_non_empty(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(StoreError::Retention(format!("{field} cannot be empty")));
    }
    Ok(())
}

fn bool_i64(value: bool) -> i64 {
    i64::from(value)
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
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
}
