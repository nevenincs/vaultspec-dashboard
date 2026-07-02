//! Transactional outbox repository for durable authoring lifecycle events.
//!
//! W02.P09 persists publication records in the same unit of work as the
//! product-state mutation that produced them. Delivery workers and stream routes
//! are later phases; this module only owns durable rows, sequence identity,
//! claim/release state, restart recovery, and duplicate guards.

use serde_json::Value;

use super::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::{Result, StoreError};
use crate::authoring::model::{ActorId, ActorKind, ActorRef, CommandKind, IdempotencyKey};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PublicationState {
    Pending,
    Publishing,
    Published,
}

impl PublicationState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Publishing => "publishing",
            Self::Published => "published",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "pending" => Ok(Self::Pending),
            "publishing" => Ok(Self::Publishing),
            "published" => Ok(Self::Published),
            other => Err(StoreError::Outbox(format!(
                "unknown outbox publication state `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct OutboxEventDraft {
    pub event_id: String,
    pub dedupe_key: String,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub event_kind: String,
    pub schema_version: i64,
    pub actor: ActorRef,
    pub command: Option<CommandKind>,
    pub idempotency_key: Option<IdempotencyKey>,
    pub payload: Value,
    pub payload_hash: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OutboxEvent {
    pub seq: i64,
    pub event_id: String,
    pub dedupe_key: String,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub event_kind: String,
    pub schema_version: i64,
    pub actor: ActorRef,
    pub command: Option<CommandKind>,
    pub idempotency_key: Option<IdempotencyKey>,
    pub payload: Value,
    pub payload_hash: String,
    pub publication_state: PublicationState,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub publish_claim_id: Option<String>,
    pub publish_claimed_at_ms: Option<i64>,
    pub publish_lease_expires_at_ms: Option<i64>,
    pub publish_attempts: i64,
    pub published_at_ms: Option<i64>,
    pub last_publish_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AppendDecision {
    Inserted(OutboxEvent),
    Duplicate(OutboxEvent),
}

#[derive(Debug, Clone, PartialEq)]
pub enum PublishDecision {
    Published(OutboxEvent),
    AlreadyPublished(OutboxEvent),
    StaleClaim(Option<OutboxEvent>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReleaseDecision {
    Released(OutboxEvent),
    AlreadyPublished(OutboxEvent),
    StaleClaim(Option<OutboxEvent>),
}

pub struct OutboxRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn outbox<'repo>(&'repo self) -> OutboxRepository<'repo, 'conn> {
        OutboxRepository {
            repo: self.repository("authoring_outbox_events"),
        }
    }
}

impl OutboxRepository<'_, '_> {
    pub fn append_event(&self, draft: OutboxEventDraft) -> Result<AppendDecision> {
        validate_draft(&draft)?;
        let payload_json = serde_json::to_string(&draft.payload).map_err(|err| {
            StoreError::Outbox(format!("outbox payload is not serializable: {err}"))
        })?;

        let command_kind = draft.command.map(command_name);
        let actor_kind = actor_kind_name(draft.actor.kind);
        let inserted = self.repo.execute(
            "INSERT INTO authoring_outbox_events
                (event_id, dedupe_key, aggregate_kind, aggregate_id, event_kind,
                 schema_version, actor_id, actor_kind, delegated_by_actor_id,
                 command_kind, idempotency_key, payload_json, payload_hash,
                 publication_state, created_at_ms, updated_at_ms,
                 publish_attempts)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                 ?14, ?15, ?15, 0)
             ON CONFLICT(dedupe_key) DO NOTHING",
            rusqlite::params![
                draft.event_id.as_str(),
                draft.dedupe_key.as_str(),
                draft.aggregate_kind.as_str(),
                draft.aggregate_id.as_str(),
                draft.event_kind.as_str(),
                draft.schema_version,
                draft.actor.id.as_str(),
                actor_kind,
                delegated_by_key(&draft.actor),
                command_kind.as_deref(),
                draft.idempotency_key.as_ref().map(IdempotencyKey::as_str),
                payload_json,
                draft.payload_hash.as_str(),
                PublicationState::Pending.as_str(),
                draft.created_at_ms,
            ],
        )?;
        if inserted == 0 {
            let existing = self.find_by_dedupe_key(&draft.dedupe_key)?.ok_or_else(|| {
                StoreError::Outbox(format!(
                    "dedupe_key `{}` conflicted but no row could be replayed",
                    draft.dedupe_key
                ))
            })?;
            if event_matches_draft(&existing, &draft) {
                return Ok(AppendDecision::Duplicate(existing));
            }
            return Err(StoreError::Outbox(format!(
                "dedupe_key `{}` already records a different outbox event",
                draft.dedupe_key
            )));
        }

        let seq = self
            .repo
            .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?;
        let event = self.event(seq)?.ok_or_else(|| {
            StoreError::Outbox(format!("missing inserted outbox event seq {seq}"))
        })?;
        Ok(AppendDecision::Inserted(event))
    }

    pub fn latest_seq(&self) -> Result<i64> {
        let seq = self.repo.query_optional(
            "SELECT seq
             FROM sqlite_sequence
             WHERE name = 'authoring_outbox_events'",
            [],
            |row| row.get(0),
        )?;
        Ok(seq.unwrap_or(0))
    }

    pub fn events_after(&self, last_seq: i64, max_rows: u32) -> Result<Vec<OutboxEvent>> {
        if max_rows == 0 {
            return Ok(Vec::new());
        }
        let count = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_outbox_events
             WHERE seq > ?1",
            [last_seq],
            |row| row.get::<_, i64>(0),
        )?;
        let mut events = Vec::new();
        for idx in 0..count.min(i64::from(max_rows)) {
            events.push(self.repo.query_row(
                "SELECT seq, event_id, dedupe_key, aggregate_kind, aggregate_id,
                        event_kind, schema_version, actor_id, actor_kind,
                        delegated_by_actor_id, command_kind, idempotency_key,
                        payload_json, payload_hash, publication_state,
                        created_at_ms, updated_at_ms, publish_claim_id,
                        publish_claimed_at_ms, publish_lease_expires_at_ms,
                        publish_attempts, published_at_ms, last_publish_error
                 FROM authoring_outbox_events
                 WHERE seq > ?1
                 ORDER BY seq ASC
                 LIMIT 1 OFFSET ?2",
                (last_seq, idx),
                read_event,
            )?);
        }
        Ok(events)
    }

    pub fn claim_pending(
        &self,
        claim_id: impl Into<String>,
        now_ms: i64,
        lease_expires_at_ms: i64,
        max_rows: u32,
    ) -> Result<Vec<OutboxEvent>> {
        let claim_id = non_empty("publish_claim_id", claim_id.into())?;
        if lease_expires_at_ms <= now_ms {
            return Err(StoreError::Outbox(
                "publish lease expiry must be after claim time".to_string(),
            ));
        }
        if max_rows == 0 {
            return Ok(Vec::new());
        }

        let seqs = self.claimable_sequences(now_ms, max_rows)?;
        let mut claimed = Vec::new();
        for seq in seqs {
            let updated = self.repo.execute(
                "UPDATE authoring_outbox_events
                 SET publication_state = 'publishing',
                     publish_claim_id = ?1,
                     publish_claimed_at_ms = ?2,
                     publish_lease_expires_at_ms = ?3,
                     publish_attempts = publish_attempts + 1,
                     updated_at_ms = ?2
                 WHERE seq = ?4
                   AND (
                       publication_state = 'pending'
                       OR (
                           publication_state = 'publishing'
                           AND publish_lease_expires_at_ms IS NOT NULL
                           AND publish_lease_expires_at_ms <= ?5
                       )
                   )",
                (claim_id.as_str(), now_ms, lease_expires_at_ms, seq, now_ms),
            )?;
            if updated == 1
                && let Some(event) = self.event(seq)?
            {
                claimed.push(event);
            }
        }
        Ok(claimed)
    }

    pub fn mark_published(
        &self,
        seq: i64,
        claim_id: impl AsRef<str>,
        now_ms: i64,
    ) -> Result<PublishDecision> {
        validate_seq(seq)?;
        let claim_id = claim_id.as_ref();
        validate_non_empty("publish_claim_id", claim_id)?;
        let updated = self.repo.execute(
            "UPDATE authoring_outbox_events
             SET publication_state = 'published',
                 publish_lease_expires_at_ms = NULL,
                 published_at_ms = ?3,
                 last_publish_error = NULL,
                 updated_at_ms = ?3
             WHERE seq = ?1
               AND publication_state = 'publishing'
               AND publish_claim_id = ?2
               AND publish_lease_expires_at_ms IS NOT NULL
               AND publish_lease_expires_at_ms > ?3",
            (seq, claim_id, now_ms),
        )?;
        if updated == 1 {
            let event = self.event(seq)?.ok_or_else(|| {
                StoreError::Outbox(format!("missing published outbox event seq {seq}"))
            })?;
            return Ok(PublishDecision::Published(event));
        }

        Ok(match self.event(seq)? {
            Some(event) if event.publication_state == PublicationState::Published => {
                PublishDecision::AlreadyPublished(event)
            }
            event => PublishDecision::StaleClaim(event),
        })
    }

    pub fn mark_failed_or_release(
        &self,
        seq: i64,
        claim_id: impl AsRef<str>,
        error: impl Into<String>,
        now_ms: i64,
    ) -> Result<ReleaseDecision> {
        validate_seq(seq)?;
        let claim_id = claim_id.as_ref();
        validate_non_empty("publish_claim_id", claim_id)?;
        let error = non_empty("last_publish_error", error.into())?;
        let updated = self.repo.execute(
            "UPDATE authoring_outbox_events
             SET publication_state = 'pending',
                 publish_claim_id = NULL,
                 publish_claimed_at_ms = NULL,
                 publish_lease_expires_at_ms = NULL,
                 last_publish_error = ?3,
                 updated_at_ms = ?4
             WHERE seq = ?1
               AND publication_state = 'publishing'
               AND publish_claim_id = ?2",
            (seq, claim_id, error.as_str(), now_ms),
        )?;
        if updated == 1 {
            let event = self.event(seq)?.ok_or_else(|| {
                StoreError::Outbox(format!("missing released outbox event seq {seq}"))
            })?;
            return Ok(ReleaseDecision::Released(event));
        }

        Ok(match self.event(seq)? {
            Some(event) if event.publication_state == PublicationState::Published => {
                ReleaseDecision::AlreadyPublished(event)
            }
            event => ReleaseDecision::StaleClaim(event),
        })
    }

    pub fn recover_stale_claims(&self, now_ms: i64, max_rows: u32) -> Result<usize> {
        if max_rows == 0 {
            return Ok(0);
        }
        self.repo.execute(
            "UPDATE authoring_outbox_events
             SET publication_state = 'pending',
                 publish_claim_id = NULL,
                 publish_claimed_at_ms = NULL,
                 publish_lease_expires_at_ms = NULL,
                 updated_at_ms = ?1
             WHERE seq IN (
                 SELECT seq
                 FROM authoring_outbox_events
                 WHERE publication_state = 'publishing'
                   AND publish_lease_expires_at_ms IS NOT NULL
                   AND publish_lease_expires_at_ms <= ?1
                 ORDER BY publish_lease_expires_at_ms ASC, seq ASC
                 LIMIT ?2
             )",
            (now_ms, i64::from(max_rows)),
        )
    }

    pub fn event(&self, seq: i64) -> Result<Option<OutboxEvent>> {
        validate_seq(seq)?;
        self.repo.query_optional(
            "SELECT seq, event_id, dedupe_key, aggregate_kind, aggregate_id,
                    event_kind, schema_version, actor_id, actor_kind,
                    delegated_by_actor_id, command_kind, idempotency_key,
                    payload_json, payload_hash, publication_state,
                    created_at_ms, updated_at_ms, publish_claim_id,
                    publish_claimed_at_ms, publish_lease_expires_at_ms,
                    publish_attempts, published_at_ms, last_publish_error
             FROM authoring_outbox_events
             WHERE seq = ?1",
            [seq],
            read_event,
        )
    }

    fn find_by_dedupe_key(&self, dedupe_key: &str) -> Result<Option<OutboxEvent>> {
        self.repo.query_optional(
            "SELECT seq, event_id, dedupe_key, aggregate_kind, aggregate_id,
                    event_kind, schema_version, actor_id, actor_kind,
                    delegated_by_actor_id, command_kind, idempotency_key,
                    payload_json, payload_hash, publication_state,
                    created_at_ms, updated_at_ms, publish_claim_id,
                    publish_claimed_at_ms, publish_lease_expires_at_ms,
                    publish_attempts, published_at_ms, last_publish_error
             FROM authoring_outbox_events
             WHERE dedupe_key = ?1",
            [dedupe_key],
            read_event,
        )
    }

    fn claimable_sequences(&self, now_ms: i64, max_rows: u32) -> Result<Vec<i64>> {
        let count = self.repo.query_row(
            "SELECT count(*)
             FROM authoring_outbox_events
             WHERE publication_state = 'pending'
                OR (
                    publication_state = 'publishing'
                    AND publish_lease_expires_at_ms IS NOT NULL
                    AND publish_lease_expires_at_ms <= ?1
                )",
            [now_ms],
            |row| row.get::<_, i64>(0),
        )?;
        let mut seqs = Vec::new();
        for idx in 0..count.min(i64::from(max_rows)) {
            seqs.push(self.repo.query_row(
                "SELECT seq
                 FROM authoring_outbox_events
                 WHERE publication_state = 'pending'
                    OR (
                        publication_state = 'publishing'
                        AND publish_lease_expires_at_ms IS NOT NULL
                        AND publish_lease_expires_at_ms <= ?1
                    )
                 ORDER BY seq ASC
                 LIMIT 1 OFFSET ?2",
                (now_ms, idx),
                |row| row.get(0),
            )?);
        }
        Ok(seqs)
    }
}

fn validate_draft(draft: &OutboxEventDraft) -> Result<()> {
    validate_non_empty("event_id", &draft.event_id)?;
    validate_non_empty("dedupe_key", &draft.dedupe_key)?;
    validate_non_empty("aggregate_kind", &draft.aggregate_kind)?;
    validate_non_empty("aggregate_id", &draft.aggregate_id)?;
    validate_non_empty("event_kind", &draft.event_kind)?;
    validate_non_empty("payload_hash", &draft.payload_hash)?;
    if draft.schema_version <= 0 {
        return Err(StoreError::Outbox(
            "schema_version must be positive".to_string(),
        ));
    }
    if let Some(command) = draft.command
        && !command.requires_unit_of_work()
    {
        return Err(StoreError::Outbox(format!(
            "read-only command `{command:?}` cannot append outbox events"
        )));
    }
    Ok(())
}

fn event_matches_draft(event: &OutboxEvent, draft: &OutboxEventDraft) -> bool {
    event.event_id == draft.event_id
        && event.dedupe_key == draft.dedupe_key
        && event.aggregate_kind == draft.aggregate_kind
        && event.aggregate_id == draft.aggregate_id
        && event.event_kind == draft.event_kind
        && event.schema_version == draft.schema_version
        && event.actor == draft.actor
        && event.command == draft.command
        && event.idempotency_key == draft.idempotency_key
        && event.payload == draft.payload
        && event.payload_hash == draft.payload_hash
}

fn delegated_by_key(actor: &ActorRef) -> &str {
    actor
        .delegated_by
        .as_ref()
        .map(ActorId::as_str)
        .unwrap_or("")
}

fn actor_kind_name(kind: ActorKind) -> String {
    serde_json::to_value(kind)
        .expect("actor kind serializes")
        .as_str()
        .expect("actor kind serializes as a string")
        .to_string()
}

fn actor_kind_from_name(value: &str) -> Result<ActorKind> {
    serde_json::from_value(Value::String(value.to_string()))
        .map_err(|err| StoreError::Outbox(format!("invalid stored actor kind `{value}`: {err}")))
}

fn command_name(command: CommandKind) -> String {
    serde_json::to_value(command)
        .expect("command kind serializes")
        .as_str()
        .expect("command kind serializes as string")
        .to_string()
}

fn command_from_name(value: &str) -> Result<CommandKind> {
    serde_json::from_value(Value::String(value.to_string()))
        .map_err(|err| StoreError::Outbox(format!("invalid stored command `{value}`: {err}")))
}

fn validate_seq(seq: i64) -> Result<()> {
    if seq <= 0 {
        return Err(StoreError::Outbox("seq must be positive".to_string()));
    }
    Ok(())
}

fn non_empty(field: &str, value: String) -> Result<String> {
    validate_non_empty(field, &value)?;
    Ok(value)
}

fn validate_non_empty(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(StoreError::Outbox(format!("{field} cannot be empty")));
    }
    Ok(())
}

fn read_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<OutboxEvent> {
    let actor_id: String = row.get(7)?;
    let actor_kind: String = row.get(8)?;
    let delegated_by_actor_id: String = row.get(9)?;
    let command_kind: Option<String> = row.get(10)?;
    let idempotency_key: Option<String> = row.get(11)?;
    let payload_json: String = row.get(12)?;
    let publication_state: String = row.get(14)?;

    Ok(OutboxEvent {
        seq: row.get(0)?,
        event_id: row.get(1)?,
        dedupe_key: row.get(2)?,
        aggregate_kind: row.get(3)?,
        aggregate_id: row.get(4)?,
        event_kind: row.get(5)?,
        schema_version: row.get(6)?,
        actor: ActorRef {
            id: ActorId::new(actor_id).map_err(to_sql_error)?,
            kind: actor_kind_from_name(&actor_kind).map_err(to_sql_error)?,
            delegated_by: if delegated_by_actor_id.is_empty() {
                None
            } else {
                Some(ActorId::new(delegated_by_actor_id).map_err(to_sql_error)?)
            },
        },
        command: command_kind
            .as_deref()
            .map(command_from_name)
            .transpose()
            .map_err(to_sql_error)?,
        idempotency_key: idempotency_key
            .map(IdempotencyKey::new)
            .transpose()
            .map_err(to_sql_error)?,
        payload: serde_json::from_str(&payload_json).map_err(to_sql_error)?,
        payload_hash: row.get(13)?,
        publication_state: PublicationState::from_str(&publication_state).map_err(to_sql_error)?,
        created_at_ms: row.get(15)?,
        updated_at_ms: row.get(16)?,
        publish_claim_id: row.get(17)?,
        publish_claimed_at_ms: row.get(18)?,
        publish_lease_expires_at_ms: row.get(19)?,
        publish_attempts: row.get(20)?,
        published_at_ms: row.get(21)?,
        last_publish_error: row.get(22)?,
    })
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Barrier};
    use std::time::Duration;

    use serde_json::json;

    use super::*;
    use crate::authoring::store::Store;

    fn temp_store() -> (tempfile::TempDir, std::path::PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = super::super::db_path(&vault_root);
        let store = Store::open(&vault_root).unwrap();
        (dir, path, store)
    }

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:alice").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn draft(n: i64) -> OutboxEventDraft {
        OutboxEventDraft {
            event_id: format!("event:proposal:{n}"),
            dedupe_key: format!("proposal:{n}:created"),
            aggregate_kind: "proposal".to_string(),
            aggregate_id: format!("proposal_{n}"),
            event_kind: "proposal_created".to_string(),
            schema_version: 1,
            actor: actor(),
            command: Some(CommandKind::CreateProposal),
            idempotency_key: Some(IdempotencyKey::new(format!("idem:proposal:{n}")).unwrap()),
            payload: json!({"proposal_id": format!("proposal_{n}")}),
            payload_hash: format!("hash:proposal:{n}"),
            created_at_ms: 1_000 + n,
        }
    }

    fn append(store: &mut Store, draft: OutboxEventDraft) -> OutboxEvent {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                match uow.outbox().append_event(draft)? {
                    AppendDecision::Inserted(event) | AppendDecision::Duplicate(event) => Ok(event),
                }
            })
            .unwrap()
    }

    fn outbox_count(store: &Store) -> i64 {
        store
            .conn
            .query_row("SELECT count(*) FROM authoring_outbox_events", [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn product_state_and_outbox_event_commit_or_roll_back_together() {
        let (_dir, _path, mut store) = temp_store();
        store
            .conn
            .execute_batch(
                "
                CREATE TABLE product_state_probe (
                    label TEXT NOT NULL
                );
                ",
            )
            .unwrap();

        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.repository("product_state_probe").execute(
                    "INSERT INTO product_state_probe (label) VALUES (?1)",
                    ["rolled-back"],
                )?;
                uow.outbox().append_event(draft(1))?;
                Err::<(), StoreError>(StoreError::Outbox("intentional rollback probe".to_string()))
            })
            .unwrap_err();
        assert!(err.to_string().contains("intentional rollback probe"));

        let product_count: i64 = store
            .conn
            .query_row("SELECT count(*) FROM product_state_probe", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(product_count, 0);
        assert_eq!(outbox_count(&store), 0);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.repository("product_state_probe").execute(
                    "INSERT INTO product_state_probe (label) VALUES (?1)",
                    ["committed"],
                )?;
                uow.outbox().append_event(draft(1))?;
                Ok(())
            })
            .unwrap();

        let product_count: i64 = store
            .conn
            .query_row("SELECT count(*) FROM product_state_probe", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(product_count, 1);
        assert_eq!(outbox_count(&store), 1);
    }

    #[test]
    fn sequence_is_monotonic_across_transactions_and_restart() {
        let (_dir, path, mut store) = temp_store();
        let first_pair = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let first = match uow.outbox().append_event(draft(1))? {
                    AppendDecision::Inserted(event) => event,
                    other => panic!("expected inserted event, got {other:?}"),
                };
                let second = match uow.outbox().append_event(draft(2))? {
                    AppendDecision::Inserted(event) => event,
                    other => panic!("expected inserted event, got {other:?}"),
                };
                Ok((first.seq, second.seq))
            })
            .unwrap();
        assert_eq!(first_pair, (1, 2));

        let third = append(&mut store, draft(3));
        assert_eq!(third.seq, 3);

        drop(store);
        let mut reopened = Store::open_at(&path).unwrap();
        let latest = reopened
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.outbox().latest_seq())
            .unwrap();
        assert_eq!(latest, 3);

        let fourth = append(&mut reopened, draft(4));
        assert_eq!(fourth.seq, 4);
    }

    #[test]
    fn sequence_is_not_reused_after_event_rows_are_removed() {
        let (_dir, _path, mut store) = temp_store();
        let first = append(&mut store, draft(1));

        store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.repository("authoring_outbox_events").execute(
                    "DELETE FROM authoring_outbox_events WHERE seq = ?1",
                    [first.seq],
                )?;
                Ok(())
            })
            .unwrap();

        let latest_after_delete = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| uow.outbox().latest_seq())
            .unwrap();
        assert_eq!(latest_after_delete, first.seq);
        assert_eq!(outbox_count(&store), 0);

        let second = append(&mut store, draft(2));
        assert_eq!(second.seq, first.seq + 1);
    }

    #[test]
    fn concurrent_duplicate_append_replays_existing_event() {
        let (_dir, path, store) = temp_store();
        drop(store);

        let barrier = Arc::new(Barrier::new(2));
        let first_barrier = Arc::clone(&barrier);
        let first_path = path.clone();
        let first = std::thread::spawn(move || {
            let mut store = Store::open_at(&first_path).unwrap();
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    let decision = uow.outbox().append_event(draft(1))?;
                    first_barrier.wait();
                    std::thread::sleep(Duration::from_millis(150));
                    Ok(decision)
                })
                .unwrap()
        });

        let second_barrier = Arc::clone(&barrier);
        let second_path = path.clone();
        let second = std::thread::spawn(move || {
            second_barrier.wait();
            let mut store = Store::open_at(&second_path).unwrap();
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    uow.outbox().append_event(draft(1))
                })
                .unwrap()
        });

        let first = first.join().unwrap();
        let second = second.join().unwrap();
        let first_seq = match first {
            AppendDecision::Inserted(event) => event.seq,
            other => panic!("expected first insert, got {other:?}"),
        };
        match second {
            AppendDecision::Duplicate(event) => assert_eq!(event.seq, first_seq),
            other => panic!("expected racing duplicate replay, got {other:?}"),
        }

        let verifier = Store::open_at(&path).unwrap();
        assert_eq!(outbox_count(&verifier), 1);
    }

    #[test]
    fn worker_restart_reclaims_expired_claims_without_republishing_terminal_rows() {
        let (_dir, path, mut store) = temp_store();
        let first = append(&mut store, draft(1));
        append(&mut store, draft(2));

        let claimed = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().claim_pending("worker:one", 100, 200, 1)
            })
            .unwrap();
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].seq, first.seq);
        assert_eq!(claimed[0].publication_state, PublicationState::Publishing);
        assert_eq!(claimed[0].publish_attempts, 1);

        drop(store);
        let mut reopened = Store::open_at(&path).unwrap();
        let recovered = reopened
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().recover_stale_claims(201, 10)
            })
            .unwrap();
        assert_eq!(recovered, 1);

        let reclaimed = reopened
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().claim_pending("worker:two", 202, 302, 1)
            })
            .unwrap();
        assert_eq!(reclaimed.len(), 1);
        assert_eq!(reclaimed[0].seq, first.seq);
        assert_eq!(reclaimed[0].publish_attempts, 2);

        let published = reopened
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().mark_published(first.seq, "worker:two", 203)
            })
            .unwrap();
        assert!(matches!(published, PublishDecision::Published(_)));

        let recovered = reopened
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().recover_stale_claims(400, 10)
            })
            .unwrap();
        assert_eq!(recovered, 0);
        let next = reopened
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().claim_pending("worker:three", 401, 501, 10)
            })
            .unwrap();
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].seq, first.seq + 1);
    }

    #[test]
    fn duplicate_dedupe_key_replays_existing_event_and_conflicts_on_payload_change() {
        let (_dir, _path, mut store) = temp_store();
        let first = append(&mut store, draft(1));

        let duplicate = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.outbox().append_event(draft(1))
            })
            .unwrap();
        match duplicate {
            AppendDecision::Duplicate(event) => assert_eq!(event.seq, first.seq),
            other => panic!("expected duplicate replay, got {other:?}"),
        }
        assert_eq!(outbox_count(&store), 1);

        let mut conflicting = draft(1);
        conflicting.payload = json!({"proposal_id": "proposal_1", "changed": true});
        conflicting.payload_hash = "hash:proposal:1:changed".to_string();
        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.outbox().append_event(conflicting)?;
                Ok(())
            })
            .unwrap_err();
        assert!(err.to_string().contains("dedupe_key"));
        assert_eq!(outbox_count(&store), 1);
    }

    #[test]
    fn committed_pending_events_survive_restart_before_publication() {
        let (_dir, path, mut store) = temp_store();
        let inserted = append(&mut store, draft(1));
        drop(store);

        let mut reopened = Store::open_at(&path).unwrap();
        let events = reopened
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let latest = uow.outbox().latest_seq()?;
                assert_eq!(latest, inserted.seq);
                uow.outbox().events_after(0, 10)
            })
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].seq, inserted.seq);
        assert_eq!(events[0].publication_state, PublicationState::Pending);
        assert_eq!(events[0].payload, json!({"proposal_id": "proposal_1"}));
    }

    #[test]
    fn expired_claim_cannot_mark_event_published() {
        let (_dir, _path, mut store) = temp_store();
        let inserted = append(&mut store, draft(1));
        store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().claim_pending("worker:one", 100, 200, 1)
            })
            .unwrap();

        let expired_claim = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().mark_published(inserted.seq, "worker:one", 200)
            })
            .unwrap();
        assert!(matches!(
            expired_claim,
            PublishDecision::StaleClaim(Some(_))
        ));

        store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                assert_eq!(uow.outbox().recover_stale_claims(200, 10)?, 1);
                let claimed = uow.outbox().claim_pending("worker:two", 201, 301, 1)?;
                assert_eq!(claimed[0].seq, inserted.seq);
                uow.outbox().mark_published(inserted.seq, "worker:two", 202)
            })
            .unwrap();
    }

    #[test]
    fn publication_guards_ignore_stale_or_duplicate_completion() {
        let (_dir, _path, mut store) = temp_store();
        let inserted = append(&mut store, draft(1));
        let claimed = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().claim_pending("worker:one", 100, 200, 1)
            })
            .unwrap();
        assert_eq!(claimed[0].seq, inserted.seq);

        let stale = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox()
                    .mark_published(inserted.seq, "worker:other", 110)
            })
            .unwrap();
        assert!(matches!(stale, PublishDecision::StaleClaim(Some(_))));

        let published = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().mark_published(inserted.seq, "worker:one", 111)
            })
            .unwrap();
        assert!(matches!(published, PublishDecision::Published(_)));

        let duplicate_publish = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox().mark_published(inserted.seq, "worker:one", 112)
            })
            .unwrap();
        assert!(matches!(
            duplicate_publish,
            PublishDecision::AlreadyPublished(_)
        ));

        let release_after_publish = store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                uow.outbox()
                    .mark_failed_or_release(inserted.seq, "worker:one", "too late", 113)
            })
            .unwrap();
        assert!(matches!(
            release_after_publish,
            ReleaseDecision::AlreadyPublished(_)
        ));
        assert_eq!(outbox_count(&store), 1);
    }
}
