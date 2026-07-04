//! Append-only changeset ledger records.
//!
//! W03.P15 owns durable aggregate revisions and ordered child operation rows.
//! Lifecycle transition legality, proposal command orchestration, approvals,
//! apply, routes, streams, and LangGraph state are later phases.
#![allow(dead_code)]

use std::collections::BTreeSet;

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::actors::{actor_kind_from_name, actor_kind_name, actor_provenance_key};
use super::api::{ChangesetOperationKind, TargetRevisionFence};
use super::model::{
    ActorId, ActorRef, AuthoringModelError, ChangesetId, ChangesetKind, ChangesetStatus,
    RevisionToken, SessionId, validate_authoring_token,
};
use super::operations::MaterializedProposalOperation;
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};
use super::transitions::ledger_append_transition_blocker;

const LEDGER_SCHEMA: &str = "authoring.ledger.v2";

#[derive(Debug, thiserror::Error)]
pub enum LedgerError {
    #[error("changeset revision requires at least one child operation")]
    EmptyChildren,
    #[error("changeset child_key cannot be empty")]
    EmptyChildKey,
    #[error("duplicate child_key `{child_key}` in changeset revision")]
    DuplicateChildKey { child_key: String },
    #[error("summary cannot be empty")]
    EmptySummary,
    #[error("created_at_ms must be non-negative")]
    NegativeCreatedAt,
    #[error("child `{child_key}` materialized operation does not match child metadata")]
    MaterializedChildMismatch { child_key: String },
    #[error("ledger json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("authoring model: {0}")]
    Model(#[from] AuthoringModelError),
}

pub type Result<T> = std::result::Result<T, LedgerError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetRevisionInput {
    pub changeset_id: ChangesetId,
    pub previous_revision: Option<RevisionToken>,
    pub kind: ChangesetKind,
    pub status: ChangesetStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
    pub actor: ActorRef,
    pub summary: String,
    pub children: Vec<ChangesetChildOperationInput>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetChildOperationInput {
    pub child_key: String,
    pub operation: ChangesetOperationKind,
    pub target: TargetRevisionFence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub materialized_operation: Option<MaterializedProposalOperation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_digest: Option<String>,
}

impl ChangesetChildOperationInput {
    pub fn from_materialized(
        operation: MaterializedProposalOperation,
        material_digest: impl Into<String>,
        validation_digest: impl Into<String>,
    ) -> Self {
        Self {
            child_key: operation.child_key.clone(),
            operation: operation.operation,
            target: operation.target.clone(),
            materialized_operation: Some(operation),
            material_digest: Some(material_digest.into()),
            validation_digest: Some(validation_digest.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetAggregateRecord {
    pub schema_version: String,
    pub changeset_id: ChangesetId,
    pub changeset_revision: RevisionToken,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_revision: Option<RevisionToken>,
    pub kind: ChangesetKind,
    pub status: ChangesetStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,
    pub actor: ActorRef,
    pub actor_provenance_key: String,
    pub summary: String,
    pub operation_count: usize,
    pub aggregate_digest: String,
    pub children: Vec<ChangesetChildOperationRecord>,
    pub created_at_ms: i64,
}

impl ChangesetAggregateRecord {
    pub fn new(input: ChangesetRevisionInput) -> Result<Self> {
        validate_revision_input(&input)?;
        let digest = aggregate_digest(&input)?;
        let actor_provenance_key = actor_provenance_key(&input.actor);
        let changeset_revision = RevisionToken::new(format!("changeset:{}", digest_hash(&digest)))?;
        let children = input
            .children
            .into_iter()
            .enumerate()
            .map(|(target_order, child)| {
                ChangesetChildOperationRecord::from_input(
                    input.changeset_id.clone(),
                    changeset_revision.clone(),
                    target_order,
                    child,
                )
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            schema_version: LEDGER_SCHEMA.to_string(),
            changeset_id: input.changeset_id,
            changeset_revision,
            previous_revision: input.previous_revision,
            kind: input.kind,
            status: input.status,
            session_id: input.session_id,
            actor: input.actor,
            actor_provenance_key,
            summary: input.summary,
            operation_count: children.len(),
            aggregate_digest: digest,
            children,
            created_at_ms: input.created_at_ms,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetChildOperationRecord {
    pub changeset_id: ChangesetId,
    pub changeset_revision: RevisionToken,
    pub child_key: String,
    pub target_order: usize,
    pub operation: ChangesetOperationKind,
    pub target: TargetRevisionFence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub materialized_operation: Option<MaterializedProposalOperation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_digest: Option<String>,
}

impl ChangesetChildOperationRecord {
    fn from_input(
        changeset_id: ChangesetId,
        changeset_revision: RevisionToken,
        target_order: usize,
        input: ChangesetChildOperationInput,
    ) -> Result<Self> {
        if let Some(materialized) = &input.materialized_operation {
            let mismatch = materialized.changeset_id != changeset_id
                || materialized.child_key != input.child_key
                || materialized.operation != input.operation
                || materialized.target != input.target;
            if mismatch {
                return Err(LedgerError::MaterializedChildMismatch {
                    child_key: input.child_key,
                });
            }
        }
        Ok(Self {
            changeset_id,
            changeset_revision,
            child_key: input.child_key,
            target_order,
            operation: input.operation,
            base_revision: input.target.base_revision.clone(),
            current_revision: input.target.current_revision.clone(),
            target: input.target,
            materialized_operation: input.materialized_operation,
            material_digest: input.material_digest,
            validation_digest: input.validation_digest,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangesetHistory {
    pub changeset_id: ChangesetId,
    pub revisions: Vec<ChangesetAggregateRecord>,
}

impl ChangesetHistory {
    pub fn latest(&self) -> Option<&ChangesetAggregateRecord> {
        self.revisions.last()
    }
}

#[derive(Serialize)]
struct AggregateDigestInput<'a> {
    schema_version: &'static str,
    changeset_id: &'a ChangesetId,
    previous_revision: &'a Option<RevisionToken>,
    kind: ChangesetKind,
    status: ChangesetStatus,
    session_id: &'a Option<SessionId>,
    actor: &'a ActorRef,
    actor_provenance_key: String,
    summary: &'a str,
    created_at_ms: i64,
    children: Vec<ChildDigestInput<'a>>,
}

#[derive(Serialize)]
struct ChildDigestInput<'a> {
    child_key: &'a str,
    target_order: usize,
    operation: ChangesetOperationKind,
    target: &'a TargetRevisionFence,
    material_digest: &'a Option<String>,
    validation_digest: &'a Option<String>,
    materialized_operation: &'a Option<MaterializedProposalOperation>,
}

fn validate_revision_input(input: &ChangesetRevisionInput) -> Result<()> {
    if input.summary.trim().is_empty() {
        return Err(LedgerError::EmptySummary);
    }
    if input.created_at_ms < 0 {
        return Err(LedgerError::NegativeCreatedAt);
    }
    if input.children.is_empty() {
        return Err(LedgerError::EmptyChildren);
    }
    let mut child_keys = BTreeSet::new();
    for child in &input.children {
        validate_child_key(&child.child_key)?;
        if !child_keys.insert(child.child_key.as_str()) {
            return Err(LedgerError::DuplicateChildKey {
                child_key: child.child_key.clone(),
            });
        }
    }
    Ok(())
}

fn validate_child_key(value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(LedgerError::EmptyChildKey);
    }
    validate_authoring_token("child_key", value)?;
    Ok(())
}

fn aggregate_digest(input: &ChangesetRevisionInput) -> Result<String> {
    let actor_provenance_key = actor_provenance_key(&input.actor);
    let children = input
        .children
        .iter()
        .enumerate()
        .map(|(target_order, child)| ChildDigestInput {
            child_key: child.child_key.as_str(),
            target_order,
            operation: child.operation,
            target: &child.target,
            material_digest: &child.material_digest,
            validation_digest: &child.validation_digest,
            materialized_operation: &child.materialized_operation,
        })
        .collect();
    let bytes = serde_json::to_vec(&AggregateDigestInput {
        schema_version: LEDGER_SCHEMA,
        changeset_id: &input.changeset_id,
        previous_revision: &input.previous_revision,
        kind: input.kind,
        status: input.status,
        session_id: &input.session_id,
        actor: &input.actor,
        actor_provenance_key,
        summary: input.summary.as_str(),
        created_at_ms: input.created_at_ms,
        children,
    })?;
    Ok(format!("ledger:{}", blob_oid(&bytes)))
}

fn digest_hash(digest: &str) -> &str {
    digest.strip_prefix("ledger:").unwrap_or(digest)
}

pub struct LedgerRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

struct StoredRevisionRow {
    changeset_id: String,
    changeset_revision: String,
    previous_revision: Option<String>,
    changeset_kind: String,
    status: String,
    session_id: Option<String>,
    summary: String,
    operation_count: i64,
    aggregate_digest: String,
    actor_id: String,
    actor_kind: String,
    delegated_by_actor_id: String,
    actor_provenance_key: String,
    created_at_ms: i64,
    record: ChangesetAggregateRecord,
}

struct StoredChildOperationRow {
    changeset_id: String,
    changeset_revision: String,
    child_key: String,
    target_order: i64,
    operation_kind: String,
    target_json: String,
    base_revision: Option<String>,
    current_revision: Option<String>,
    materialized_operation_json: Option<String>,
    material_digest: Option<String>,
    validation_digest: Option<String>,
    record: ChangesetChildOperationRecord,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn ledger<'repo>(&'repo self) -> LedgerRepository<'repo, 'conn> {
        LedgerRepository {
            repo: self.repository("authoring_changeset_revisions"),
        }
    }
}

impl LedgerRepository<'_, '_> {
    pub fn append_revision(&self, record: &ChangesetAggregateRecord) -> StoreResult<()> {
        self.validate_active_actor(record)?;
        validate_record_for_store(record)?;
        self.validate_append_chain(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Ledger(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_changeset_revisions
                (changeset_id, changeset_revision, previous_revision, changeset_kind,
                 status, session_id, summary, operation_count, aggregate_digest,
                 actor_id, actor_kind, delegated_by_actor_id, actor_provenance_key,
                 created_at_ms, record_json)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                record.changeset_id.as_str(),
                record.changeset_revision.as_str(),
                record.previous_revision.as_ref().map(RevisionToken::as_str),
                changeset_kind_as_str(record.kind),
                changeset_status_as_str(record.status),
                record.session_id.as_ref().map(SessionId::as_str),
                record.summary.as_str(),
                record.operation_count as i64,
                record.aggregate_digest.as_str(),
                record.actor.id.as_str(),
                actor_kind_name(record.actor.kind),
                delegated_by_key(&record.actor),
                record.actor_provenance_key.as_str(),
                record.created_at_ms,
                record_json.as_str(),
            ],
        )?;
        for child in &record.children {
            self.insert_child(child)?;
        }
        Ok(())
    }

    fn validate_active_actor(&self, record: &ChangesetAggregateRecord) -> StoreResult<()> {
        let status = self.repo.query_optional(
            "SELECT status
             FROM authoring_actor_records
             WHERE actor_id = ?1
               AND actor_kind = ?2",
            rusqlite::params![record.actor.id.as_str(), actor_kind_name(record.actor.kind)],
            |row| row.get::<_, String>(0),
        )?;
        match status.as_deref() {
            Some("active") => Ok(()),
            Some("stale") => Err(StoreError::Actor(format!(
                "actor `{}` of kind `{}` is stale",
                record.actor.id,
                actor_kind_name(record.actor.kind)
            ))),
            Some(other) => Err(StoreError::Actor(format!(
                "actor `{}` of kind `{}` has unsupported status `{other}`",
                record.actor.id,
                actor_kind_name(record.actor.kind)
            ))),
            None => Err(StoreError::Actor(format!(
                "actor `{}` of kind `{}` is not registered",
                record.actor.id,
                actor_kind_name(record.actor.kind)
            ))),
        }
    }

    pub fn revision(
        &self,
        changeset_id: &ChangesetId,
        changeset_revision: &RevisionToken,
    ) -> StoreResult<Option<ChangesetAggregateRecord>> {
        let row = self.repo.query_optional(
            "SELECT changeset_id, changeset_revision, previous_revision,
                    changeset_kind, status, session_id, summary, operation_count,
                    aggregate_digest, actor_id, actor_kind, delegated_by_actor_id,
                    actor_provenance_key, created_at_ms, record_json
             FROM authoring_changeset_revisions
             WHERE changeset_id = ?1
               AND changeset_revision = ?2",
            rusqlite::params![changeset_id.as_str(), changeset_revision.as_str()],
            read_revision_row,
        )?;
        row.map(|record| self.attach_children(record)).transpose()
    }

    pub fn latest(
        &self,
        changeset_id: &ChangesetId,
    ) -> StoreResult<Option<ChangesetAggregateRecord>> {
        let row = self.repo.query_optional(
            "SELECT changeset_id, changeset_revision, previous_revision,
                    changeset_kind, status, session_id, summary, operation_count,
                    aggregate_digest, actor_id, actor_kind, delegated_by_actor_id,
                    actor_provenance_key, created_at_ms, record_json
             FROM authoring_changeset_revisions
             WHERE changeset_id = ?1
             ORDER BY seq DESC
             LIMIT 1",
            [changeset_id.as_str()],
            read_revision_row,
        )?;
        row.map(|record| self.attach_children(record)).transpose()
    }

    pub fn history(&self, changeset_id: &ChangesetId) -> StoreResult<ChangesetHistory> {
        let rows = self.repo.query_collect(
            "SELECT changeset_id, changeset_revision, previous_revision,
                    changeset_kind, status, session_id, summary, operation_count,
                    aggregate_digest, actor_id, actor_kind, delegated_by_actor_id,
                    actor_provenance_key, created_at_ms, record_json
             FROM authoring_changeset_revisions
             WHERE changeset_id = ?1
             ORDER BY seq ASC",
            [changeset_id.as_str()],
            read_revision_row,
        )?;
        let mut revisions = Vec::with_capacity(rows.len());
        let mut previous = None;
        for row in rows {
            let record = self.attach_children(row)?;
            if record.previous_revision != previous {
                return Err(StoreError::Ledger(format!(
                    "changeset `{}` revision chain is broken",
                    changeset_id
                )));
            }
            previous = Some(record.changeset_revision.clone());
            revisions.push(record);
        }
        Ok(ChangesetHistory {
            changeset_id: changeset_id.clone(),
            revisions,
        })
    }

    fn insert_child(&self, child: &ChangesetChildOperationRecord) -> StoreResult<()> {
        let target_json = serde_json::to_string(&child.target)
            .map_err(|err| StoreError::Ledger(err.to_string()))?;
        let materialized_json = child
            .materialized_operation
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|err| StoreError::Ledger(err.to_string()))?;
        let record_json =
            serde_json::to_string(child).map_err(|err| StoreError::Ledger(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_changeset_child_operations
                (changeset_id, changeset_revision, child_key, target_order,
                 operation_kind, target_json, base_revision, current_revision,
                 materialized_operation_json, material_digest, validation_digest,
                 record_json)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                child.changeset_id.as_str(),
                child.changeset_revision.as_str(),
                child.child_key.as_str(),
                child.target_order as i64,
                operation_kind_as_str(child.operation),
                target_json.as_str(),
                child.base_revision.as_ref().map(RevisionToken::as_str),
                child.current_revision.as_ref().map(RevisionToken::as_str),
                materialized_json.as_deref(),
                child.material_digest.as_deref(),
                child.validation_digest.as_deref(),
                record_json.as_str(),
            ],
        )?;
        Ok(())
    }

    fn validate_append_chain(&self, record: &ChangesetAggregateRecord) -> StoreResult<()> {
        let latest = self.latest(&record.changeset_id)?;
        match (latest.as_ref(), &record.previous_revision) {
            (None, None) => {}
            (None, Some(previous)) => Err(StoreError::Ledger(format!(
                "previous revision `{previous}` has no changeset history"
            )))?,
            (Some(_), None) => Err(StoreError::Ledger(format!(
                "changeset `{}` already has an initial revision",
                record.changeset_id
            )))?,
            (Some(latest), Some(previous)) if latest.changeset_revision == *previous => {}
            (Some(latest), Some(previous)) => Err(StoreError::Ledger(format!(
                "previous revision `{previous}` does not match latest `{}`",
                latest.changeset_revision
            )))?,
        }
        if let Some(reason) = ledger_append_transition_blocker(latest.as_ref(), record) {
            return Err(StoreError::Ledger(reason));
        }
        Ok(())
    }

    fn attach_children(&self, row: StoredRevisionRow) -> StoreResult<ChangesetAggregateRecord> {
        let mut record = validate_revision_row(row)?;
        let children = self.repo.query_collect(
            "SELECT changeset_id, changeset_revision, child_key, target_order,
                    operation_kind, target_json, base_revision, current_revision,
                    materialized_operation_json, material_digest, validation_digest,
                    record_json
             FROM authoring_changeset_child_operations
             WHERE changeset_id = ?1
               AND changeset_revision = ?2
             ORDER BY target_order ASC",
            rusqlite::params![
                record.changeset_id.as_str(),
                record.changeset_revision.as_str()
            ],
            read_child_row,
        )?;
        let children = children
            .into_iter()
            .map(validate_child_row)
            .collect::<StoreResult<Vec<_>>>()?;
        if record.children != children {
            return Err(StoreError::Ledger(format!(
                "changeset `{}` revision `{}` child rows do not match aggregate record",
                record.changeset_id, record.changeset_revision
            )));
        }
        record.children = children;
        validate_record_for_store(&record)?;
        Ok(record)
    }
}

fn read_revision_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredRevisionRow> {
    let record_json: String = row.get(14)?;
    let record = serde_json::from_str(&record_json).map_err(to_sql_error)?;
    Ok(StoredRevisionRow {
        changeset_id: row.get(0)?,
        changeset_revision: row.get(1)?,
        previous_revision: row.get(2)?,
        changeset_kind: row.get(3)?,
        status: row.get(4)?,
        session_id: row.get(5)?,
        summary: row.get(6)?,
        operation_count: row.get(7)?,
        aggregate_digest: row.get(8)?,
        actor_id: row.get(9)?,
        actor_kind: row.get(10)?,
        delegated_by_actor_id: row.get(11)?,
        actor_provenance_key: row.get(12)?,
        created_at_ms: row.get(13)?,
        record,
    })
}

fn read_child_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredChildOperationRow> {
    let record_json: String = row.get(11)?;
    let record = serde_json::from_str(&record_json).map_err(to_sql_error)?;
    Ok(StoredChildOperationRow {
        changeset_id: row.get(0)?,
        changeset_revision: row.get(1)?,
        child_key: row.get(2)?,
        target_order: row.get(3)?,
        operation_kind: row.get(4)?,
        target_json: row.get(5)?,
        base_revision: row.get(6)?,
        current_revision: row.get(7)?,
        materialized_operation_json: row.get(8)?,
        material_digest: row.get(9)?,
        validation_digest: row.get(10)?,
        record,
    })
}

fn validate_revision_row(row: StoredRevisionRow) -> StoreResult<ChangesetAggregateRecord> {
    let record = row.record;
    expect_column(
        "changeset_id",
        row.changeset_id.as_str(),
        record.changeset_id.as_str(),
    )?;
    expect_column(
        "changeset_revision",
        row.changeset_revision.as_str(),
        record.changeset_revision.as_str(),
    )?;
    expect_optional_column(
        "previous_revision",
        row.previous_revision.as_deref(),
        record.previous_revision.as_ref().map(RevisionToken::as_str),
    )?;
    expect_column(
        "changeset_kind",
        row.changeset_kind.as_str(),
        changeset_kind_as_str(record.kind),
    )?;
    expect_column(
        "status",
        row.status.as_str(),
        changeset_status_as_str(record.status),
    )?;
    expect_optional_column(
        "session_id",
        row.session_id.as_deref(),
        record.session_id.as_ref().map(SessionId::as_str),
    )?;
    expect_column("summary", row.summary.as_str(), record.summary.as_str())?;
    if row.operation_count != record.operation_count as i64 {
        return Err(StoreError::Ledger(format!(
            "column operation_count `{}` does not match ledger record `{}`",
            row.operation_count, record.operation_count
        )));
    }
    expect_column(
        "aggregate_digest",
        row.aggregate_digest.as_str(),
        record.aggregate_digest.as_str(),
    )?;
    expect_column("actor_id", row.actor_id.as_str(), record.actor.id.as_str())?;
    expect_column(
        "actor_kind",
        row.actor_kind.as_str(),
        actor_kind_name(record.actor.kind),
    )?;
    if actor_kind_from_name(&row.actor_kind).map_err(|err| StoreError::Ledger(err.to_string()))?
        != record.actor.kind
    {
        return Err(StoreError::Ledger(
            "actor_kind column cannot be decoded as ledger record actor kind".to_string(),
        ));
    }
    expect_optional_column(
        "delegated_by_actor_id",
        empty_as_none(row.delegated_by_actor_id.as_str()),
        record.actor.delegated_by.as_ref().map(ActorId::as_str),
    )?;
    expect_column(
        "actor_provenance_key",
        row.actor_provenance_key.as_str(),
        record.actor_provenance_key.as_str(),
    )?;
    let recomputed_actor_key = actor_provenance_key(&record.actor);
    if record.actor_provenance_key != recomputed_actor_key {
        return Err(StoreError::Ledger(
            "actor_provenance_key does not match ledger actor".to_string(),
        ));
    }
    if row.created_at_ms != record.created_at_ms {
        return Err(StoreError::Ledger(format!(
            "column created_at_ms `{}` does not match ledger record `{}`",
            row.created_at_ms, record.created_at_ms
        )));
    }
    Ok(record)
}

fn validate_child_row(row: StoredChildOperationRow) -> StoreResult<ChangesetChildOperationRecord> {
    let record = row.record;
    expect_column(
        "child changeset_id",
        row.changeset_id.as_str(),
        record.changeset_id.as_str(),
    )?;
    expect_column(
        "child changeset_revision",
        row.changeset_revision.as_str(),
        record.changeset_revision.as_str(),
    )?;
    expect_column(
        "child_key",
        row.child_key.as_str(),
        record.child_key.as_str(),
    )?;
    if row.target_order != record.target_order as i64 {
        return Err(StoreError::Ledger(format!(
            "column target_order `{}` does not match child record `{}`",
            row.target_order, record.target_order
        )));
    }
    expect_column(
        "operation_kind",
        row.operation_kind.as_str(),
        operation_kind_as_str(record.operation),
    )?;
    let target: TargetRevisionFence = serde_json::from_str(&row.target_json)
        .map_err(|err| StoreError::Ledger(err.to_string()))?;
    if target != record.target {
        return Err(StoreError::Ledger(
            "column target_json does not match child record".to_string(),
        ));
    }
    validate_child_revision_fences(&record)?;
    expect_optional_column(
        "base_revision",
        row.base_revision.as_deref(),
        record.base_revision.as_ref().map(RevisionToken::as_str),
    )?;
    expect_optional_column(
        "current_revision",
        row.current_revision.as_deref(),
        record.current_revision.as_ref().map(RevisionToken::as_str),
    )?;
    let materialized_operation = row
        .materialized_operation_json
        .as_deref()
        .map(serde_json::from_str::<MaterializedProposalOperation>)
        .transpose()
        .map_err(|err| StoreError::Ledger(err.to_string()))?;
    if materialized_operation != record.materialized_operation {
        return Err(StoreError::Ledger(
            "column materialized_operation_json does not match child record".to_string(),
        ));
    }
    expect_optional_column(
        "material_digest",
        row.material_digest.as_deref(),
        record.material_digest.as_deref(),
    )?;
    expect_optional_column(
        "validation_digest",
        row.validation_digest.as_deref(),
        record.validation_digest.as_deref(),
    )?;
    Ok(record)
}

fn validate_child_revision_fences(record: &ChangesetChildOperationRecord) -> StoreResult<()> {
    let expected_base = record.target.base_revision.as_ref();
    if record.base_revision.as_ref() != expected_base {
        return Err(StoreError::Ledger(format!(
            "child `{}` base_revision does not match target revision fence",
            record.child_key
        )));
    }
    let expected_current = record.target.current_revision.as_ref();
    if record.current_revision.as_ref() != expected_current {
        return Err(StoreError::Ledger(format!(
            "child `{}` current_revision does not match target revision fence",
            record.child_key
        )));
    }
    Ok(())
}

fn expect_column(field: &str, actual: &str, expected: &str) -> StoreResult<()> {
    if actual == expected {
        return Ok(());
    }
    Err(StoreError::Ledger(format!(
        "column {field} `{actual}` does not match ledger record `{expected}`"
    )))
}

fn expect_optional_column(
    field: &str,
    actual: Option<&str>,
    expected: Option<&str>,
) -> StoreResult<()> {
    if actual == expected {
        return Ok(());
    }
    Err(StoreError::Ledger(format!(
        "column {field} `{}` does not match ledger record `{}`",
        actual.unwrap_or("<null>"),
        expected.unwrap_or("<null>")
    )))
}

fn validate_record_for_store(record: &ChangesetAggregateRecord) -> StoreResult<()> {
    if record.schema_version != LEDGER_SCHEMA {
        return Err(StoreError::Ledger(format!(
            "unsupported ledger schema `{}`",
            record.schema_version
        )));
    }
    if record.created_at_ms < 0 {
        return Err(StoreError::Ledger(
            "created_at_ms must be non-negative".to_string(),
        ));
    }
    if record.summary.trim().is_empty() {
        return Err(StoreError::Ledger("summary cannot be empty".to_string()));
    }
    if record.operation_count != record.children.len() || record.children.is_empty() {
        return Err(StoreError::Ledger(
            "operation_count must match non-empty children".to_string(),
        ));
    }
    if record.actor_provenance_key != actor_provenance_key(&record.actor) {
        return Err(StoreError::Ledger(
            "actor_provenance_key does not match ledger actor".to_string(),
        ));
    }
    let mut child_keys = BTreeSet::new();
    for (expected_order, child) in record.children.iter().enumerate() {
        validate_child_key(&child.child_key).map_err(|err| StoreError::Ledger(err.to_string()))?;
        if child.changeset_id != record.changeset_id
            || child.changeset_revision != record.changeset_revision
        {
            return Err(StoreError::Ledger(format!(
                "child `{}` does not belong to its aggregate revision",
                child.child_key
            )));
        }
        if child.target_order != expected_order {
            return Err(StoreError::Ledger(format!(
                "target_order {} is not contiguous at index {expected_order}",
                child.target_order
            )));
        }
        validate_child_revision_fences(child)?;
        if !child_keys.insert(child.child_key.as_str()) {
            return Err(StoreError::Ledger(format!(
                "duplicate child_key `{}`",
                child.child_key
            )));
        }
    }
    let (aggregate_digest, changeset_revision) =
        recompute_record_identity(record).map_err(|err| StoreError::Ledger(err.to_string()))?;
    if aggregate_digest != record.aggregate_digest {
        return Err(StoreError::Ledger(
            "aggregate_digest does not match ledger record body".to_string(),
        ));
    }
    if changeset_revision != record.changeset_revision {
        return Err(StoreError::Ledger(
            "changeset_revision does not match aggregate digest".to_string(),
        ));
    }
    Ok(())
}

fn recompute_record_identity(record: &ChangesetAggregateRecord) -> Result<(String, RevisionToken)> {
    let input = ChangesetRevisionInput {
        changeset_id: record.changeset_id.clone(),
        previous_revision: record.previous_revision.clone(),
        kind: record.kind,
        status: record.status,
        session_id: record.session_id.clone(),
        actor: record.actor.clone(),
        summary: record.summary.clone(),
        children: record
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
            .collect(),
        created_at_ms: record.created_at_ms,
    };
    let digest = aggregate_digest(&input)?;
    let revision = RevisionToken::new(format!("changeset:{}", digest_hash(&digest)))?;
    Ok((digest, revision))
}

fn delegated_by_key(actor: &ActorRef) -> &str {
    actor
        .delegated_by
        .as_ref()
        .map(ActorId::as_str)
        .unwrap_or("")
}

fn empty_as_none(value: &str) -> Option<&str> {
    if value.is_empty() { None } else { Some(value) }
}

fn changeset_kind_as_str(kind: ChangesetKind) -> &'static str {
    match kind {
        ChangesetKind::Authoring => "authoring",
        ChangesetKind::Rollback => "rollback",
    }
}

fn changeset_status_as_str(status: ChangesetStatus) -> &'static str {
    match status {
        ChangesetStatus::Draft => "draft",
        ChangesetStatus::Generating => "generating",
        ChangesetStatus::Proposed => "proposed",
        ChangesetStatus::NeedsReview => "needs_review",
        ChangesetStatus::Approved => "approved",
        ChangesetStatus::Applying => "applying",
        ChangesetStatus::Applied => "applied",
        ChangesetStatus::PartiallyApplied => "partially_applied",
        ChangesetStatus::CompensationRequired => "compensation_required",
        ChangesetStatus::Rejected => "rejected",
        ChangesetStatus::Conflicted => "conflicted",
        ChangesetStatus::Superseded => "superseded",
        ChangesetStatus::Failed => "failed",
        ChangesetStatus::RollbackProposed => "rollback_proposed",
        ChangesetStatus::Cancelled => "cancelled",
    }
}

fn operation_kind_as_str(kind: ChangesetOperationKind) -> &'static str {
    match kind {
        ChangesetOperationKind::CreateDocument => "create_document",
        ChangesetOperationKind::ReplaceBody => "replace_body",
        ChangesetOperationKind::AppendBody => "append_body",
        ChangesetOperationKind::EditFrontmatter => "edit_frontmatter",
        ChangesetOperationKind::Rename => "rename",
        ChangesetOperationKind::Archive => "archive",
        ChangesetOperationKind::Unarchive => "unarchive",
        ChangesetOperationKind::Link => "link",
        ChangesetOperationKind::SectionEdit => "section_edit",
    }
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
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

        assert!(
            matches!(err, StoreError::Ledger(detail) if detail.contains("does not match latest"))
        );
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
}
