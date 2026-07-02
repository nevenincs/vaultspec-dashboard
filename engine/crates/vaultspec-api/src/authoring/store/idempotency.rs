//! Scoped idempotency outcome repository.
//!
//! W02.P07 persists replay guards for mutating frontend and agent commands. It
//! deliberately stops at in-flight and recorded command outcomes; apply jobs,
//! changeset records, outbox rows, routes, and core calls are later phases.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::{Result, StoreError};
use crate::authoring::model::{
    ActorId, ActorKind, ActorRef, CommandKind, IdempotencyKey, ReceiptId,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdempotencyScope {
    pub kind: String,
    pub id: String,
    pub revision: Option<String>,
    pub digest: String,
}

impl IdempotencyScope {
    pub fn new(
        kind: impl Into<String>,
        id: impl Into<String>,
        revision: Option<String>,
        digest: impl Into<String>,
    ) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
            revision,
            digest: digest.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdempotencyKeyScope {
    pub actor: ActorRef,
    pub command: CommandKind,
    pub key: IdempotencyKey,
}

impl IdempotencyKeyScope {
    pub fn new(actor: ActorRef, command: CommandKind, key: IdempotencyKey) -> Self {
        Self {
            actor,
            command,
            key,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdempotencyState {
    InFlight,
    Recorded,
}

impl IdempotencyState {
    fn as_str(self) -> &'static str {
        match self {
            Self::InFlight => "in_flight",
            Self::Recorded => "recorded",
        }
    }

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "in_flight" => Ok(Self::InFlight),
            "recorded" => Ok(Self::Recorded),
            other => Err(StoreError::Idempotency(format!(
                "unknown idempotency state `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeKind {
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RecordedOutcome {
    pub kind: OutcomeKind,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub schema: String,
    pub payload: Value,
    pub http_status: Option<u16>,
    pub completed_at_ms: i64,
    pub outcome_expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct IdempotencyRecord {
    pub key_scope: IdempotencyKeyScope,
    pub scope: IdempotencyScope,
    pub request_digest: String,
    pub receipt_id: Option<ReceiptId>,
    pub state: IdempotencyState,
    pub outcome: Option<RecordedOutcome>,
    pub started_at_ms: i64,
    pub updated_at_ms: i64,
    pub in_flight_expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InFlightReservation {
    pub key_scope: IdempotencyKeyScope,
    pub scope: IdempotencyScope,
    pub request_digest: String,
    pub receipt_id: ReceiptId,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdempotencyConflict {
    pub key_scope: IdempotencyKeyScope,
    pub existing_scope: IdempotencyScope,
    pub requested_scope: IdempotencyScope,
    pub existing_request_digest: String,
    pub requested_request_digest: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReserveDecision {
    Reserved(InFlightReservation),
    InFlight(IdempotencyRecord),
    Replay(IdempotencyRecord),
    Conflict(IdempotencyConflict),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReplayLookup {
    None,
    InFlight(IdempotencyRecord),
    Replay(IdempotencyRecord),
    Conflict(IdempotencyConflict),
    Expired(IdempotencyRecord),
}

pub struct IdempotencyRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn idempotency<'repo>(&'repo self) -> IdempotencyRepository<'repo, 'conn> {
        IdempotencyRepository {
            repo: self.repository("authoring_idempotency_records"),
        }
    }
}

impl IdempotencyRepository<'_, '_> {
    pub fn reserve_in_flight(
        &self,
        key_scope: IdempotencyKeyScope,
        scope: IdempotencyScope,
        request_digest: impl Into<String>,
        receipt_id: ReceiptId,
        now_ms: i64,
        in_flight_expires_at_ms: Option<i64>,
    ) -> Result<ReserveDecision> {
        let request_digest = request_digest.into();
        match self.lookup_replay(&key_scope, &scope, &request_digest, now_ms)? {
            ReplayLookup::None | ReplayLookup::Expired(_) => {}
            ReplayLookup::InFlight(record) => return Ok(ReserveDecision::InFlight(record)),
            ReplayLookup::Replay(record) => return Ok(ReserveDecision::Replay(record)),
            ReplayLookup::Conflict(conflict) => return Ok(ReserveDecision::Conflict(conflict)),
        }

        self.delete_key_scope(&key_scope)?;
        self.repo.execute(
            "INSERT INTO authoring_idempotency_records
                (actor_id, actor_kind, delegated_by_actor_id, command_kind,
                 idempotency_key, scope_kind, scope_id, scope_revision,
                 scope_digest, request_digest, receipt_id, state, started_at_ms,
                 updated_at_ms, in_flight_expires_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14)",
            (
                key_scope.actor.id.as_str(),
                actor_kind_name(key_scope.actor.kind),
                delegated_by_key(&key_scope.actor),
                command_name(key_scope.command),
                key_scope.key.as_str(),
                scope.kind.as_str(),
                scope.id.as_str(),
                scope.revision.as_deref(),
                scope.digest.as_str(),
                request_digest.as_str(),
                receipt_id.as_str(),
                IdempotencyState::InFlight.as_str(),
                now_ms,
                in_flight_expires_at_ms,
            ),
        )?;

        Ok(ReserveDecision::Reserved(InFlightReservation {
            key_scope,
            scope,
            request_digest,
            receipt_id,
        }))
    }

    pub fn record_outcome(
        &self,
        reservation: &InFlightReservation,
        outcome: RecordedOutcome,
        now_ms: i64,
    ) -> Result<IdempotencyRecord> {
        let outcome_json = serde_json::to_string(&outcome.payload).map_err(|err| {
            StoreError::Idempotency(format!("idempotency outcome is not serializable: {err}"))
        })?;
        let updated = self.repo.execute(
            "UPDATE authoring_idempotency_records
             SET state = ?6,
                 outcome_kind = ?7,
                 aggregate_kind = ?8,
                 aggregate_id = ?9,
                 outcome_schema = ?10,
                 outcome_json = ?11,
                 http_status = ?12,
                 updated_at_ms = ?13,
                 completed_at_ms = ?14,
                 outcome_expires_at_ms = ?15
             WHERE actor_id = ?1
               AND actor_kind = ?2
               AND delegated_by_actor_id = ?3
               AND command_kind = ?4
               AND idempotency_key = ?5
               AND receipt_id = ?16
               AND scope_digest = ?17
               AND request_digest = ?18
               AND state = 'in_flight'",
            rusqlite::params![
                reservation.key_scope.actor.id.as_str(),
                actor_kind_name(reservation.key_scope.actor.kind),
                delegated_by_key(&reservation.key_scope.actor),
                command_name(reservation.key_scope.command),
                reservation.key_scope.key.as_str(),
                IdempotencyState::Recorded.as_str(),
                outcome_kind_name(outcome.kind),
                outcome.aggregate_kind.as_str(),
                outcome.aggregate_id.as_str(),
                outcome.schema.as_str(),
                outcome_json,
                outcome.http_status.map(i64::from),
                now_ms,
                outcome.completed_at_ms,
                outcome.outcome_expires_at_ms,
                reservation.receipt_id.as_str(),
                reservation.scope.digest.as_str(),
                reservation.request_digest.as_str(),
            ],
        )?;
        if updated != 1 {
            return Err(StoreError::Idempotency(format!(
                "idempotency reservation `{}` is stale or no longer in flight",
                reservation.key_scope.key.as_str()
            )));
        }

        self.find_record(&reservation.key_scope)?.ok_or_else(|| {
            StoreError::Idempotency(format!(
                "missing idempotency record `{}` after outcome recording",
                reservation.key_scope.key.as_str()
            ))
        })
    }

    pub fn lookup_replay(
        &self,
        key_scope: &IdempotencyKeyScope,
        scope: &IdempotencyScope,
        request_digest: &str,
        now_ms: i64,
    ) -> Result<ReplayLookup> {
        let Some(record) = self.find_record(key_scope)? else {
            return Ok(ReplayLookup::None);
        };

        if record_expired(&record, now_ms) {
            return Ok(ReplayLookup::Expired(record));
        }

        if record.scope.digest != scope.digest || record.request_digest != request_digest {
            return Ok(ReplayLookup::Conflict(IdempotencyConflict {
                key_scope: key_scope.clone(),
                existing_scope: record.scope,
                requested_scope: scope.clone(),
                existing_request_digest: record.request_digest,
                requested_request_digest: request_digest.to_string(),
            }));
        }

        Ok(match record.state {
            IdempotencyState::InFlight => ReplayLookup::InFlight(record),
            IdempotencyState::Recorded => ReplayLookup::Replay(record),
        })
    }

    pub fn expire_outcomes(&self, now_ms: i64, max_rows: u32) -> Result<usize> {
        self.repo.execute(
            "DELETE FROM authoring_idempotency_records
             WHERE rowid IN (
                 SELECT rowid
                 FROM authoring_idempotency_records
                 WHERE state = 'recorded'
                   AND outcome_expires_at_ms IS NOT NULL
                   AND outcome_expires_at_ms <= ?1
                 ORDER BY outcome_expires_at_ms ASC, updated_at_ms ASC
                 LIMIT ?2
             )",
            (now_ms, i64::from(max_rows)),
        )
    }

    fn delete_key_scope(&self, key_scope: &IdempotencyKeyScope) -> Result<usize> {
        self.repo.execute(
            "DELETE FROM authoring_idempotency_records
             WHERE actor_id = ?1
               AND actor_kind = ?2
               AND delegated_by_actor_id = ?3
               AND command_kind = ?4
               AND idempotency_key = ?5",
            (
                key_scope.actor.id.as_str(),
                actor_kind_name(key_scope.actor.kind),
                delegated_by_key(&key_scope.actor),
                command_name(key_scope.command),
                key_scope.key.as_str(),
            ),
        )
    }

    fn find_record(&self, key_scope: &IdempotencyKeyScope) -> Result<Option<IdempotencyRecord>> {
        self.repo.query_optional(
            "SELECT actor_id, actor_kind, delegated_by_actor_id, command_kind,
                    idempotency_key, scope_kind, scope_id, scope_revision,
                    scope_digest, request_digest, receipt_id, state, outcome_kind,
                    aggregate_kind, aggregate_id, outcome_schema, outcome_json,
                    http_status, started_at_ms, updated_at_ms,
                    in_flight_expires_at_ms, completed_at_ms, outcome_expires_at_ms
             FROM authoring_idempotency_records
             WHERE actor_id = ?1
               AND actor_kind = ?2
               AND delegated_by_actor_id = ?3
               AND command_kind = ?4
               AND idempotency_key = ?5",
            (
                key_scope.actor.id.as_str(),
                actor_kind_name(key_scope.actor.kind),
                delegated_by_key(&key_scope.actor),
                command_name(key_scope.command),
                key_scope.key.as_str(),
            ),
            read_record,
        )
    }
}

fn record_expired(record: &IdempotencyRecord, now_ms: i64) -> bool {
    match record.state {
        IdempotencyState::InFlight => record
            .in_flight_expires_at_ms
            .is_some_and(|expires_at_ms| expires_at_ms <= now_ms),
        IdempotencyState::Recorded => record
            .outcome
            .as_ref()
            .and_then(|outcome| outcome.outcome_expires_at_ms)
            .is_some_and(|expires_at_ms| expires_at_ms <= now_ms),
    }
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
    serde_json::from_value(Value::String(value.to_string())).map_err(|err| {
        StoreError::Idempotency(format!("invalid stored actor kind `{value}`: {err}"))
    })
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
        .map_err(|err| StoreError::Idempotency(format!("invalid stored command `{value}`: {err}")))
}

fn outcome_kind_name(kind: OutcomeKind) -> String {
    serde_json::to_value(kind)
        .expect("outcome kind serializes")
        .as_str()
        .expect("outcome kind serializes as string")
        .to_string()
}

fn outcome_kind_from_name(value: &str) -> Result<OutcomeKind> {
    serde_json::from_value(Value::String(value.to_string())).map_err(|err| {
        StoreError::Idempotency(format!("invalid stored outcome kind `{value}`: {err}"))
    })
}

fn read_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<IdempotencyRecord> {
    let actor_id: String = row.get(0)?;
    let actor_kind: String = row.get(1)?;
    let delegated_by_actor_id: String = row.get(2)?;
    let command_kind: String = row.get(3)?;
    let idempotency_key: String = row.get(4)?;
    let scope_kind: String = row.get(5)?;
    let scope_id: String = row.get(6)?;
    let scope_revision: Option<String> = row.get(7)?;
    let scope_digest: String = row.get(8)?;
    let request_digest: String = row.get(9)?;
    let receipt_id: Option<String> = row.get(10)?;
    let state: String = row.get(11)?;
    let outcome_kind: Option<String> = row.get(12)?;
    let aggregate_kind: Option<String> = row.get(13)?;
    let aggregate_id: Option<String> = row.get(14)?;
    let outcome_schema: Option<String> = row.get(15)?;
    let outcome_json: Option<String> = row.get(16)?;
    let http_status: Option<i64> = row.get(17)?;
    let started_at_ms: i64 = row.get(18)?;
    let updated_at_ms: i64 = row.get(19)?;
    let in_flight_expires_at_ms: Option<i64> = row.get(20)?;
    let completed_at_ms: Option<i64> = row.get(21)?;
    let outcome_expires_at_ms: Option<i64> = row.get(22)?;

    let actor_id = ActorId::new(actor_id).map_err(to_sql_error)?;
    let actor_kind = actor_kind_from_name(&actor_kind).map_err(to_sql_error)?;
    let delegated_by = if delegated_by_actor_id.is_empty() {
        None
    } else {
        Some(ActorId::new(delegated_by_actor_id).map_err(to_sql_error)?)
    };
    let command = command_from_name(&command_kind).map_err(to_sql_error)?;
    let key = IdempotencyKey::new(idempotency_key).map_err(to_sql_error)?;
    let receipt_id = receipt_id
        .map(ReceiptId::new)
        .transpose()
        .map_err(to_sql_error)?;
    let state = IdempotencyState::from_str(&state).map_err(to_sql_error)?;

    let outcome = match (
        outcome_kind,
        aggregate_kind,
        aggregate_id,
        outcome_schema,
        outcome_json,
        completed_at_ms,
    ) {
        (
            Some(kind),
            Some(aggregate_kind),
            Some(aggregate_id),
            Some(schema),
            Some(json),
            Some(completed_at_ms),
        ) => Some(RecordedOutcome {
            kind: outcome_kind_from_name(&kind).map_err(to_sql_error)?,
            aggregate_kind,
            aggregate_id,
            schema,
            payload: serde_json::from_str(&json).map_err(to_sql_error)?,
            http_status: http_status.map(|status| status as u16),
            completed_at_ms,
            outcome_expires_at_ms,
        }),
        _ => None,
    };

    Ok(IdempotencyRecord {
        key_scope: IdempotencyKeyScope {
            actor: ActorRef {
                id: actor_id,
                kind: actor_kind,
                delegated_by,
            },
            command,
            key,
        },
        scope: IdempotencyScope {
            kind: scope_kind,
            id: scope_id,
            revision: scope_revision,
            digest: scope_digest,
        },
        request_digest,
        receipt_id,
        state,
        outcome,
        started_at_ms,
        updated_at_ms,
        in_flight_expires_at_ms,
    })
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::authoring::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let store = Store::open(&vault_root).unwrap();
        (dir, store)
    }

    fn actor(id: &str) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn key(value: &str) -> IdempotencyKey {
        IdempotencyKey::new(value).unwrap()
    }

    fn receipt(value: &str) -> ReceiptId {
        ReceiptId::new(value).unwrap()
    }

    fn scope(kind: &str, id: &str, digest: &str) -> IdempotencyScope {
        IdempotencyScope::new(kind, id, Some("rev:1".to_string()), digest)
    }

    fn key_scope(command: CommandKind, key: IdempotencyKey) -> IdempotencyKeyScope {
        IdempotencyKeyScope::new(actor("human:alice"), command, key)
    }

    fn outcome(aggregate_kind: &str, aggregate_id: &str, payload: Value) -> RecordedOutcome {
        RecordedOutcome {
            kind: OutcomeKind::Accepted,
            aggregate_kind: aggregate_kind.to_string(),
            aggregate_id: aggregate_id.to_string(),
            schema: "authoring.command.outcome.v1".to_string(),
            payload,
            http_status: Some(202),
            completed_at_ms: 120,
            outcome_expires_at_ms: None,
        }
    }

    fn create_probe_table(store: &mut Store) {
        store
            .conn
            .execute_batch(
                "
                CREATE TABLE side_effect_probe (
                    label TEXT NOT NULL
                );
                ",
            )
            .unwrap();
    }

    fn side_effect_count(store: &Store) -> i64 {
        store
            .conn
            .query_row("SELECT count(*) FROM side_effect_probe", [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    fn run_command_once(
        store: &mut Store,
        command: CommandKind,
        target_scope: IdempotencyScope,
        key: IdempotencyKey,
        receipt_id: ReceiptId,
        payload: Value,
    ) -> ReserveDecision {
        store
            .with_unit_of_work(command, |uow| {
                let repo = uow.idempotency();
                let key_scope = key_scope(command, key);
                let decision = repo.reserve_in_flight(
                    key_scope.clone(),
                    target_scope,
                    "request:digest:1",
                    receipt_id,
                    100,
                    Some(500),
                )?;
                if let ReserveDecision::Reserved(reservation) = &decision {
                    uow.repository("side_effect_probe").execute(
                        "INSERT INTO side_effect_probe (label) VALUES (?1)",
                        ["side-effect"],
                    )?;
                    repo.record_outcome(
                        reservation,
                        outcome("command", key_scope.key.as_str(), payload),
                        121,
                    )?;
                }
                Ok(decision)
            })
            .unwrap()
    }

    #[test]
    fn duplicate_create_replays_recorded_outcome_without_second_side_effect() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);
        let command = CommandKind::CreateSession;
        let key = key("idem:create:session");
        let target = scope("session", "session_1", "scope:digest:session_1");

        let first = run_command_once(
            &mut store,
            command,
            target.clone(),
            key.clone(),
            receipt("receipt:create:1"),
            json!({"session_id": "session_1"}),
        );
        assert!(matches!(first, ReserveDecision::Reserved(_)));

        let second = run_command_once(
            &mut store,
            command,
            target,
            key,
            receipt("receipt:create:2"),
            json!({"session_id": "session_2"}),
        );

        match second {
            ReserveDecision::Replay(record) => {
                assert_eq!(record.state, IdempotencyState::Recorded);
                assert_eq!(
                    record.outcome.unwrap().payload,
                    json!({"session_id": "session_1"})
                );
            }
            other => panic!("expected replayed create outcome, got {other:?}"),
        }
        assert_eq!(side_effect_count(&store), 1);
    }

    #[test]
    fn duplicate_apply_replays_recorded_outcome_without_second_side_effect() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);
        let command = CommandKind::RequestApply;
        let key = key("idem:apply:changeset");
        let target = scope("changeset", "changeset_1", "scope:digest:changeset_1");

        run_command_once(
            &mut store,
            command,
            target.clone(),
            key.clone(),
            receipt("receipt:apply:1"),
            json!({"apply_receipt": "receipt_1"}),
        );
        let second = run_command_once(
            &mut store,
            command,
            target,
            key,
            receipt("receipt:apply:2"),
            json!({"apply_receipt": "receipt_2"}),
        );

        match second {
            ReserveDecision::Replay(record) => {
                assert_eq!(
                    record.outcome.unwrap().payload,
                    json!({"apply_receipt": "receipt_1"})
                );
            }
            other => panic!("expected replayed apply outcome, got {other:?}"),
        }
        assert_eq!(side_effect_count(&store), 1);
    }

    #[test]
    fn duplicate_in_flight_command_replays_in_flight_state() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key = key("idem:proposal:in-flight");
        let target = scope("proposal", "proposal_1", "scope:digest:proposal_1");
        let key_scope = key_scope(command, key.clone());

        store
            .with_unit_of_work(command, |uow| {
                assert!(matches!(
                    uow.idempotency().reserve_in_flight(
                        key_scope.clone(),
                        target.clone(),
                        "request:digest:1",
                        receipt("receipt:proposal:1"),
                        100,
                        Some(500),
                    )?,
                    ReserveDecision::Reserved(_)
                ));
                Ok(())
            })
            .unwrap();

        let second = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    target,
                    "request:digest:1",
                    receipt("receipt:proposal:2"),
                    101,
                    Some(500),
                )
            })
            .unwrap();

        match second {
            ReserveDecision::InFlight(record) => {
                assert_eq!(record.state, IdempotencyState::InFlight);
                assert!(record.outcome.is_none());
                assert_eq!(record.receipt_id.unwrap().as_str(), "receipt:proposal:1");
            }
            other => panic!("expected in-flight replay, got {other:?}"),
        }
    }

    #[test]
    fn key_reuse_with_conflicting_scope_is_rejected() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key_scope = key_scope(command, key("idem:conflict"));
        let first_scope = scope("proposal", "proposal_1", "scope:digest:proposal_1");
        store
            .with_unit_of_work(command, |uow| {
                assert!(matches!(
                    uow.idempotency().reserve_in_flight(
                        key_scope.clone(),
                        first_scope,
                        "request:digest:1",
                        receipt("receipt:conflict:1"),
                        100,
                        None,
                    )?,
                    ReserveDecision::Reserved(_)
                ));
                Ok(())
            })
            .unwrap();

        let conflict = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    scope("proposal", "proposal_2", "scope:digest:proposal_2"),
                    "request:digest:2",
                    receipt("receipt:conflict:2"),
                    101,
                    None,
                )
            })
            .unwrap();

        match conflict {
            ReserveDecision::Conflict(conflict) => {
                assert_eq!(conflict.existing_scope.id, "proposal_1");
                assert_eq!(conflict.requested_scope.id, "proposal_2");
                assert_eq!(conflict.existing_request_digest, "request:digest:1");
                assert_eq!(conflict.requested_request_digest, "request:digest:2");
            }
            other => panic!("expected scope conflict, got {other:?}"),
        }
    }

    #[test]
    fn same_key_can_be_used_by_a_different_actor_without_conflict() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let idempotency_key = key("idem:shared-by-different-actors");
        let target = scope("proposal", "proposal_1", "scope:digest:proposal_1");

        store
            .with_unit_of_work(command, |uow| {
                assert!(matches!(
                    uow.idempotency().reserve_in_flight(
                        IdempotencyKeyScope::new(
                            actor("human:alice"),
                            command,
                            idempotency_key.clone()
                        ),
                        target.clone(),
                        "request:digest:1",
                        receipt("receipt:actor:1"),
                        100,
                        None,
                    )?,
                    ReserveDecision::Reserved(_)
                ));
                assert!(matches!(
                    uow.idempotency().reserve_in_flight(
                        IdempotencyKeyScope::new(actor("human:bob"), command, idempotency_key),
                        target,
                        "request:digest:1",
                        receipt("receipt:actor:2"),
                        100,
                        None,
                    )?,
                    ReserveDecision::Reserved(_)
                ));
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn expired_outcome_record_is_removed_and_allows_new_reservation() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key_scope = key_scope(command, key("idem:expired"));
        let target = scope("proposal", "proposal_1", "scope:digest:proposal_1");

        store
            .with_unit_of_work(command, |uow| {
                let repo = uow.idempotency();
                let ReserveDecision::Reserved(reservation) = repo.reserve_in_flight(
                    key_scope.clone(),
                    target.clone(),
                    "request:digest:old",
                    receipt("receipt:expired:1"),
                    100,
                    Some(150),
                )?
                else {
                    panic!("first reservation should be new");
                };
                repo.record_outcome(
                    &reservation,
                    RecordedOutcome {
                        outcome_expires_at_ms: Some(150),
                        ..outcome("proposal", "old", json!({"proposal_id": "old"}))
                    },
                    110,
                )?;
                assert_eq!(repo.expire_outcomes(151, 10)?, 1);
                Ok(())
            })
            .unwrap();

        let fresh = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    scope("proposal", "proposal_2", "scope:digest:proposal_2"),
                    "request:digest:new",
                    receipt("receipt:expired:2"),
                    152,
                    Some(300),
                )
            })
            .unwrap();

        match fresh {
            ReserveDecision::Reserved(reservation) => {
                assert_eq!(reservation.scope.id, "proposal_2");
                assert_eq!(reservation.request_digest, "request:digest:new");
            }
            other => panic!("expected new reservation after expiry, got {other:?}"),
        }
    }

    #[test]
    fn expired_recorded_row_allows_new_scope_without_compaction() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key_scope = key_scope(command, key("idem:expired-recorded-conflict"));

        store
            .with_unit_of_work(command, |uow| {
                let repo = uow.idempotency();
                let ReserveDecision::Reserved(reservation) = repo.reserve_in_flight(
                    key_scope.clone(),
                    scope("proposal", "proposal_old", "scope:digest:old"),
                    "request:digest:old",
                    receipt("receipt:expired-recorded:old"),
                    100,
                    Some(150),
                )?
                else {
                    panic!("first reservation should be new");
                };
                repo.record_outcome(
                    &reservation,
                    RecordedOutcome {
                        outcome_expires_at_ms: Some(150),
                        ..outcome("proposal", "proposal_old", json!({"proposal_id": "old"}))
                    },
                    110,
                )?;
                Ok(())
            })
            .unwrap();

        let fresh = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    scope("proposal", "proposal_new", "scope:digest:new"),
                    "request:digest:new",
                    receipt("receipt:expired-recorded:new"),
                    151,
                    Some(300),
                )
            })
            .unwrap();

        match fresh {
            ReserveDecision::Reserved(reservation) => {
                assert_eq!(reservation.scope.id, "proposal_new");
                assert_eq!(reservation.request_digest, "request:digest:new");
            }
            other => panic!("expected new reservation after recorded expiry, got {other:?}"),
        }
    }

    #[test]
    fn expired_in_flight_row_allows_new_scope_and_blocks_stale_receipt() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key_scope = key_scope(command, key("idem:expired-in-flight-conflict"));
        let old_reservation = store
            .with_unit_of_work(command, |uow| {
                let ReserveDecision::Reserved(reservation) = uow.idempotency().reserve_in_flight(
                    key_scope.clone(),
                    scope("proposal", "proposal_old", "scope:digest:old"),
                    "request:digest:old",
                    receipt("receipt:expired-in-flight:old"),
                    100,
                    Some(150),
                )?
                else {
                    panic!("first reservation should be new");
                };
                Ok(reservation)
            })
            .unwrap();

        let fresh = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().reserve_in_flight(
                    key_scope,
                    scope("proposal", "proposal_new", "scope:digest:new"),
                    "request:digest:new",
                    receipt("receipt:expired-in-flight:new"),
                    151,
                    Some(300),
                )
            })
            .unwrap();

        match fresh {
            ReserveDecision::Reserved(reservation) => {
                assert_eq!(reservation.scope.id, "proposal_new");
                assert_eq!(reservation.request_digest, "request:digest:new");
            }
            other => panic!("expected new reservation after in-flight expiry, got {other:?}"),
        }

        let err = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().record_outcome(
                    &old_reservation,
                    outcome("proposal", "stale", json!({"proposal_id": "stale"})),
                    152,
                )
            })
            .unwrap_err();
        assert!(err.to_string().contains("stale"));
    }

    #[test]
    fn stale_reservation_receipt_cannot_record_after_expiry_re_reserve() {
        let (_dir, mut store) = temp_store();
        let command = CommandKind::CreateProposal;
        let key_scope = key_scope(command, key("idem:stale-reservation"));
        let target = scope("proposal", "proposal_1", "scope:digest:proposal_1");
        let old_reservation = store
            .with_unit_of_work(command, |uow| {
                let ReserveDecision::Reserved(reservation) = uow.idempotency().reserve_in_flight(
                    key_scope.clone(),
                    target.clone(),
                    "request:digest:1",
                    receipt("receipt:old"),
                    100,
                    Some(150),
                )?
                else {
                    panic!("first reservation should be new");
                };
                Ok(reservation)
            })
            .unwrap();

        store
            .with_unit_of_work(command, |uow| {
                assert!(matches!(
                    uow.idempotency().reserve_in_flight(
                        key_scope,
                        target,
                        "request:digest:1",
                        receipt("receipt:new"),
                        151,
                        Some(300),
                    )?,
                    ReserveDecision::Reserved(_)
                ));
                Ok(())
            })
            .unwrap();

        let err = store
            .with_unit_of_work(command, |uow| {
                uow.idempotency().record_outcome(
                    &old_reservation,
                    outcome("proposal", "stale", json!({"proposal_id": "stale"})),
                    152,
                )
            })
            .unwrap_err();
        assert!(err.to_string().contains("stale"));
    }
}
