//! Durable authoring actor records and provenance keys.
//!
//! P19 stores the minimal actor identity surface required for attributed
//! proposal history. Service identities, granted scopes, and authorization
//! policy are later security phases.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::model::{ActorId, ActorKind, ActorRef};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result, StoreError};

const ACTOR_SCHEMA: &str = "authoring.actor.v1";
const ACTOR_PROVENANCE_SCHEMA: &str = "authoring.actor_provenance.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorStatus {
    Active,
    Stale,
}

impl ActorStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Stale => "stale",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "active" => Ok(Self::Active),
            "stale" => Ok(Self::Stale),
            other => Err(StoreError::Actor(format!("unknown actor status `{other}`"))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorDisplayMetadata {
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_summary: Option<String>,
}

impl ActorDisplayMetadata {
    pub fn new(display_name: impl Into<String>, display_summary: Option<String>) -> Self {
        Self {
            display_name: display_name.into(),
            display_summary,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActorRecordInput {
    pub actor: ActorRef,
    pub display: ActorDisplayMetadata,
    pub status: ActorStatus,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl ActorRecordInput {
    pub fn active(actor: ActorRef, display: ActorDisplayMetadata, now_ms: i64) -> Self {
        Self {
            actor,
            display,
            status: ActorStatus::Active,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorRecord {
    pub schema_version: String,
    pub actor: ActorRef,
    pub display: ActorDisplayMetadata,
    pub status: ActorStatus,
    pub provenance_key: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl ActorRecord {
    fn new(input: ActorRecordInput) -> Result<Self> {
        validate_actor_record_input(&input)?;
        let provenance_key = actor_provenance_key(&input.actor);
        Ok(Self {
            schema_version: ACTOR_SCHEMA.to_string(),
            actor: input.actor,
            display: input.display,
            status: input.status,
            provenance_key,
            created_at_ms: input.created_at_ms,
            updated_at_ms: input.updated_at_ms,
        })
    }
}

pub struct ActorRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn actors<'repo>(&'repo self) -> ActorRepository<'repo, 'conn> {
        ActorRepository {
            repo: self.repository("authoring_actor_records"),
        }
    }
}

impl ActorRepository<'_, '_> {
    pub fn put_record(&self, input: ActorRecordInput) -> Result<ActorRecord> {
        if input.actor.delegated_by.is_some() {
            return Err(StoreError::Actor(
                "actor records cannot carry delegated_by provenance".to_string(),
            ));
        }
        let existing = self.record(&input.actor)?;
        let created_at_ms = existing
            .as_ref()
            .map(|record| record.created_at_ms)
            .unwrap_or(input.created_at_ms);
        let record = ActorRecord::new(ActorRecordInput {
            created_at_ms,
            ..input
        })?;
        let record_json = serde_json::to_string(&record)
            .map_err(|err| StoreError::Actor(format!("actor record json: {err}")))?;

        if existing.is_some() {
            self.repo.execute(
                "UPDATE authoring_actor_records
                 SET display_name = ?3,
                     display_summary = ?4,
                     status = ?5,
                     provenance_key = ?6,
                     updated_at_ms = ?7,
                     record_json = ?8
                 WHERE actor_id = ?1
                   AND actor_kind = ?2",
                rusqlite::params![
                    record.actor.id.as_str(),
                    actor_kind_name(record.actor.kind),
                    record.display.display_name.as_str(),
                    record.display.display_summary.as_deref(),
                    record.status.as_str(),
                    record.provenance_key.as_str(),
                    record.updated_at_ms,
                    record_json.as_str(),
                ],
            )?;
        } else {
            self.repo.execute(
                "INSERT INTO authoring_actor_records
                    (actor_id, actor_kind, display_name, display_summary, status,
                     provenance_key, created_at_ms, updated_at_ms, record_json)
                 VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    record.actor.id.as_str(),
                    actor_kind_name(record.actor.kind),
                    record.display.display_name.as_str(),
                    record.display.display_summary.as_deref(),
                    record.status.as_str(),
                    record.provenance_key.as_str(),
                    record.created_at_ms,
                    record.updated_at_ms,
                    record_json.as_str(),
                ],
            )?;
        }

        Ok(record)
    }

    pub fn record(&self, actor: &ActorRef) -> Result<Option<ActorRecord>> {
        self.record_by_identity(&actor.id, actor.kind)
    }

    pub fn record_by_identity(
        &self,
        actor_id: &ActorId,
        actor_kind: ActorKind,
    ) -> Result<Option<ActorRecord>> {
        let row = self.repo.query_optional(
            "SELECT actor_id, actor_kind, display_name, display_summary, status,
                    provenance_key, created_at_ms, updated_at_ms, record_json
             FROM authoring_actor_records
             WHERE actor_id = ?1
               AND actor_kind = ?2",
            rusqlite::params![actor_id.as_str(), actor_kind_name(actor_kind)],
            read_actor_row,
        )?;
        row.map(validate_actor_row).transpose()
    }

    /// Every registered record sharing an actor id, across kinds. An `ActorRef`
    /// carries a `delegated_by` id WITHOUT its kind, so the authorization engine
    /// (`security`) resolves a delegating principal's standing by id alone. Bounded
    /// read (the `(actor_id, actor_kind)` primary key admits at most one row per
    /// kind), returned in deterministic kind order.
    pub fn records_by_actor_id(&self, actor_id: &ActorId) -> Result<Vec<ActorRecord>> {
        let rows = self.repo.query_collect(
            "SELECT actor_id, actor_kind, display_name, display_summary, status,
                    provenance_key, created_at_ms, updated_at_ms, record_json
             FROM authoring_actor_records
             WHERE actor_id = ?1
             ORDER BY actor_kind",
            rusqlite::params![actor_id.as_str()],
            read_actor_row,
        )?;
        rows.into_iter().map(validate_actor_row).collect()
    }

    pub fn ensure_active(&self, actor: &ActorRef) -> Result<ActorRecord> {
        let record = self.record(actor)?.ok_or_else(|| {
            StoreError::Actor(format!(
                "actor `{}` of kind `{}` is not registered",
                actor.id,
                actor_kind_name(actor.kind)
            ))
        })?;
        if record.status != ActorStatus::Active {
            return Err(StoreError::Actor(format!(
                "actor `{}` of kind `{}` is stale",
                actor.id,
                actor_kind_name(actor.kind)
            )));
        }
        Ok(record)
    }
}

pub fn actor_provenance_key(actor: &ActorRef) -> String {
    #[derive(Serialize)]
    struct ProvenanceKeyInput<'a> {
        schema_version: &'static str,
        actor_kind: &'static str,
        actor_id: &'a str,
        delegated_by_actor_id: Option<&'a str>,
    }

    let input = ProvenanceKeyInput {
        schema_version: ACTOR_PROVENANCE_SCHEMA,
        actor_kind: actor_kind_name(actor.kind),
        actor_id: actor.id.as_str(),
        delegated_by_actor_id: actor.delegated_by.as_ref().map(ActorId::as_str),
    };
    let bytes = serde_json::to_vec(&input).expect("actor provenance key input serializes");
    format!("actor:{}", blob_oid(&bytes))
}

pub(crate) fn actor_kind_name(kind: ActorKind) -> &'static str {
    match kind {
        ActorKind::Human => "human",
        ActorKind::Agent => "agent",
        ActorKind::System => "system",
        ActorKind::ToolExecutor => "tool_executor",
    }
}

pub(crate) fn actor_kind_from_name(value: &str) -> Result<ActorKind> {
    match value {
        "human" => Ok(ActorKind::Human),
        "agent" => Ok(ActorKind::Agent),
        "system" => Ok(ActorKind::System),
        "tool_executor" => Ok(ActorKind::ToolExecutor),
        other => Err(StoreError::Actor(format!(
            "invalid stored actor kind `{other}`"
        ))),
    }
}

struct StoredActorRow {
    actor_id: String,
    actor_kind: String,
    display_name: String,
    display_summary: Option<String>,
    status: String,
    provenance_key: String,
    created_at_ms: i64,
    updated_at_ms: i64,
    record: ActorRecord,
}

fn read_actor_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredActorRow> {
    let record_json: String = row.get(8)?;
    let record = serde_json::from_str(&record_json).map_err(to_sql_error)?;
    Ok(StoredActorRow {
        actor_id: row.get(0)?,
        actor_kind: row.get(1)?,
        display_name: row.get(2)?,
        display_summary: row.get(3)?,
        status: row.get(4)?,
        provenance_key: row.get(5)?,
        created_at_ms: row.get(6)?,
        updated_at_ms: row.get(7)?,
        record,
    })
}

fn validate_actor_record_input(input: &ActorRecordInput) -> Result<()> {
    match input.actor.kind {
        ActorKind::Human | ActorKind::Agent | ActorKind::System => {}
        ActorKind::ToolExecutor => {
            return Err(StoreError::Actor(
                "actor records support only human, agent, and system actors in this subset"
                    .to_string(),
            ));
        }
    }
    if input.created_at_ms < 0 {
        return Err(StoreError::Actor(
            "created_at_ms must be non-negative".to_string(),
        ));
    }
    if input.updated_at_ms < input.created_at_ms {
        return Err(StoreError::Actor(
            "updated_at_ms cannot be before created_at_ms".to_string(),
        ));
    }
    validate_display_text("display_name", &input.display.display_name)?;
    if let Some(summary) = &input.display.display_summary {
        validate_display_text("display_summary", summary)?;
    }
    Ok(())
}

fn validate_display_text(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(StoreError::Actor(format!("{field} cannot be empty")));
    }
    if value.trim() != value {
        return Err(StoreError::Actor(format!(
            "{field} cannot carry surrounding whitespace"
        )));
    }
    if value.len() > 240 {
        return Err(StoreError::Actor(format!(
            "{field} must be at most 240 bytes"
        )));
    }
    Ok(())
}

fn validate_actor_row(row: StoredActorRow) -> Result<ActorRecord> {
    let record = row.record;
    if record.schema_version != ACTOR_SCHEMA {
        return Err(StoreError::Actor(format!(
            "unsupported actor schema `{}`",
            record.schema_version
        )));
    }
    expect_column("actor_id", row.actor_id.as_str(), record.actor.id.as_str())?;
    expect_column(
        "actor_kind",
        row.actor_kind.as_str(),
        actor_kind_name(record.actor.kind),
    )?;
    if actor_kind_from_name(&row.actor_kind)? != record.actor.kind {
        return Err(StoreError::Actor(
            "actor_kind column cannot be decoded as record actor kind".to_string(),
        ));
    }
    if record.actor.delegated_by.is_some() {
        return Err(StoreError::Actor(
            "actor record cannot carry delegated_by provenance".to_string(),
        ));
    }
    expect_column(
        "display_name",
        row.display_name.as_str(),
        record.display.display_name.as_str(),
    )?;
    expect_optional_column(
        "display_summary",
        row.display_summary.as_deref(),
        record.display.display_summary.as_deref(),
    )?;
    expect_column("status", row.status.as_str(), record.status.as_str())?;
    expect_column(
        "provenance_key",
        row.provenance_key.as_str(),
        record.provenance_key.as_str(),
    )?;
    if record.provenance_key != actor_provenance_key(&record.actor) {
        return Err(StoreError::Actor(
            "provenance_key does not match actor identity".to_string(),
        ));
    }
    if row.created_at_ms != record.created_at_ms {
        return Err(StoreError::Actor(format!(
            "column created_at_ms `{}` does not match actor record `{}`",
            row.created_at_ms, record.created_at_ms
        )));
    }
    if row.updated_at_ms != record.updated_at_ms {
        return Err(StoreError::Actor(format!(
            "column updated_at_ms `{}` does not match actor record `{}`",
            row.updated_at_ms, record.updated_at_ms
        )));
    }
    validate_actor_record_input(&ActorRecordInput {
        actor: record.actor.clone(),
        display: record.display.clone(),
        status: record.status,
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
    })?;
    Ok(record)
}

fn expect_column(field: &str, actual: &str, expected: &str) -> Result<()> {
    if actual == expected {
        return Ok(());
    }
    Err(StoreError::Actor(format!(
        "column {field} `{actual}` does not match actor record `{expected}`"
    )))
}

fn expect_optional_column(field: &str, actual: Option<&str>, expected: Option<&str>) -> Result<()> {
    if actual == expected {
        return Ok(());
    }
    Err(StoreError::Actor(format!(
        "column {field} `{}` does not match actor record `{}`",
        actual.unwrap_or("<null>"),
        expected.unwrap_or("<null>")
    )))
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
        let store = Store::open(&dir.path().join(".vault")).unwrap();
        (dir, store)
    }

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn delegated_actor(id: &str, kind: ActorKind, delegated_by: &str) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: Some(ActorId::new(delegated_by).unwrap()),
        }
    }

    fn display(name: &str) -> ActorDisplayMetadata {
        ActorDisplayMetadata::new(name, Some(format!("{name} summary")))
    }

    fn put(
        store: &mut Store,
        actor: ActorRef,
        display: ActorDisplayMetadata,
        status: ActorStatus,
        now_ms: i64,
    ) -> ActorRecord {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput {
                    actor,
                    display,
                    status,
                    created_at_ms: now_ms,
                    updated_at_ms: now_ms,
                })
            })
            .unwrap()
    }

    fn require_active(store: &mut Store, actor: &ActorRef) -> Result<ActorRecord> {
        store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().ensure_active(actor)
        })
    }

    #[test]
    fn human_actor_identity_persists_and_reopens() {
        let (dir, mut store) = temp_store();
        let human = actor("human:alice", ActorKind::Human);
        let created = put(
            &mut store,
            human.clone(),
            display("Alice"),
            ActorStatus::Active,
            100,
        );

        assert_eq!(created.actor, human);
        assert_eq!(created.status, ActorStatus::Active);
        assert_eq!(created.provenance_key, actor_provenance_key(&human));
        assert!(created.provenance_key.starts_with("actor:"));

        drop(store);
        let mut reopened = Store::open(&dir.path().join(".vault")).unwrap();
        let loaded = require_active(&mut reopened, &human).unwrap();

        assert_eq!(loaded, created);
    }

    #[test]
    fn agent_actor_identity_persists_with_display_metadata() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);
        let created = put(
            &mut store,
            agent.clone(),
            ActorDisplayMetadata::new("Writer agent", Some("Drafts proposals".to_string())),
            ActorStatus::Active,
            200,
        );

        let loaded = require_active(&mut store, &agent).unwrap();

        assert_eq!(loaded.actor, agent);
        assert_eq!(loaded.display.display_name, "Writer agent");
        assert_eq!(
            loaded.display.display_summary.as_deref(),
            Some("Drafts proposals")
        );
        assert_eq!(loaded.provenance_key, actor_provenance_key(&agent));
        assert!(loaded.provenance_key.starts_with("actor:"));
        assert_eq!(loaded, created);
    }

    #[test]
    fn delegated_actor_refs_have_stable_distinct_provenance() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);
        put(
            &mut store,
            agent.clone(),
            display("Writer agent"),
            ActorStatus::Active,
            300,
        );

        let delegated = delegated_actor("agent:writer", ActorKind::Agent, "human:alice");
        let loaded = require_active(&mut store, &delegated).unwrap();

        assert_eq!(loaded.actor, agent);
        assert_ne!(
            actor_provenance_key(&agent),
            actor_provenance_key(&delegated)
        );
    }

    #[test]
    fn provenance_key_is_not_delimiter_collision_prone() {
        let left = delegated_actor(
            "agent:writer",
            ActorKind::Agent,
            "human:alice:delegated_by:human:bob",
        );
        let right = delegated_actor(
            "agent:writer:delegated_by:human:alice",
            ActorKind::Agent,
            "human:bob",
        );

        assert_ne!(left, right);
        assert_ne!(actor_provenance_key(&left), actor_provenance_key(&right));
    }

    #[test]
    fn missing_actor_is_rejected() {
        let (_dir, mut store) = temp_store();
        let missing = actor("human:missing", ActorKind::Human);

        let err = require_active(&mut store, &missing).unwrap_err();

        assert!(
            matches!(err, StoreError::Actor(ref detail) if detail.contains("not registered")),
            "unexpected missing actor error: {err}"
        );
    }

    #[test]
    fn stale_actor_is_rejected() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:stale", ActorKind::Agent);
        put(
            &mut store,
            agent.clone(),
            display("Stale agent"),
            ActorStatus::Stale,
            400,
        );

        let err = require_active(&mut store, &agent).unwrap_err();

        assert!(
            matches!(err, StoreError::Actor(ref detail) if detail.contains("is stale")),
            "unexpected stale actor error: {err}"
        );
    }

    #[test]
    fn provenance_key_survives_display_updates_and_restart() {
        let (dir, mut store) = temp_store();
        let agent = actor("agent:stable", ActorKind::Agent);
        let first = put(
            &mut store,
            agent.clone(),
            display("Stable agent"),
            ActorStatus::Active,
            500,
        );
        let updated = put(
            &mut store,
            agent.clone(),
            ActorDisplayMetadata::new("Renamed agent", Some("New summary".to_string())),
            ActorStatus::Active,
            700,
        );

        assert_eq!(updated.created_at_ms, first.created_at_ms);
        assert_eq!(updated.updated_at_ms, 700);
        assert_eq!(updated.provenance_key, first.provenance_key);
        assert_eq!(
            updated.provenance_key,
            actor_provenance_key(&agent),
            "display metadata must not re-key actor provenance"
        );

        drop(store);
        let mut reopened = Store::open(&dir.path().join(".vault")).unwrap();
        let reopened_record = require_active(&mut reopened, &agent).unwrap();

        assert_eq!(reopened_record.display.display_name, "Renamed agent");
        assert_eq!(reopened_record.provenance_key, first.provenance_key);
    }

    #[test]
    fn system_actor_identity_persists_for_backend_policy_authority() {
        let (_dir, mut store) = temp_store();
        let system = actor("system:automation", ActorKind::System);

        let created = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput::active(
                    system.clone(),
                    display("System automation"),
                    800,
                ))
            })
            .unwrap();

        assert_eq!(created.actor, system);
        assert_eq!(created.status, ActorStatus::Active);
        assert_eq!(created.provenance_key, actor_provenance_key(&system));
    }

    #[test]
    fn tool_executor_identity_is_not_a_registry_record_in_this_subset() {
        let (_dir, mut store) = temp_store();
        let tool = actor("tool:writer", ActorKind::ToolExecutor);

        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors()
                    .put_record(ActorRecordInput::active(tool, display("Tool writer"), 800))
            })
            .unwrap_err();

        assert!(
            matches!(err, StoreError::Actor(ref detail) if detail.contains("human, agent, and system")),
            "unexpected tool executor error: {err}"
        );
    }
}
