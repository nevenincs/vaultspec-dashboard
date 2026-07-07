//! Durable authoring lifecycle event vocabulary and projector feed records.
//!
//! The outbox table is the persistence primitive; this module owns the stable
//! lifecycle vocabulary layered on top of it so command handlers do not mint
//! ad-hoc event names or schema versions at mutation sites.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::model::{ActorRef, ApplyState, ChangesetStatus, CommandKind, IdempotencyKey};
use super::store::outbox::{OutboxEvent, OutboxEventDraft};
use super::store::{Result as StoreResult, StoreError};

pub(crate) const LIFECYCLE_EVENT_SCHEMA_VERSION: i64 = 1;
pub(crate) const LIFECYCLE_EVENT_SCHEMA: &str = "authoring.lifecycle_event.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LifecycleAggregateKind {
    Session,
    Run,
    Proposal,
    Changeset,
    Approval,
    Validation,
    Apply,
    Rollback,
    Lease,
}

impl LifecycleAggregateKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Session => "session",
            Self::Run => "run",
            Self::Proposal => "proposal",
            Self::Changeset => "changeset",
            Self::Approval => "approval",
            Self::Validation => "validation",
            Self::Apply => "apply",
            Self::Rollback => "rollback",
            Self::Lease => "lease",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "session" => Some(Self::Session),
            "run" => Some(Self::Run),
            "proposal" => Some(Self::Proposal),
            "changeset" => Some(Self::Changeset),
            "approval" => Some(Self::Approval),
            "validation" => Some(Self::Validation),
            "apply" => Some(Self::Apply),
            "rollback" => Some(Self::Rollback),
            "lease" => Some(Self::Lease),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LifecycleEventKind {
    SessionCreated,
    RunStarted,
    ProposalCreated,
    ProposalUpdated,
    PreviewUpdated,
    ValidationUpdated,
    ApprovalRequested,
    ApprovalResolved,
    ApplyStarted,
    ApplyRecorded,
    ApplyFailed,
    ConflictRecorded,
    ProposalRejected,
    RollbackCreated,
    CancellationRecorded,
    FailureRecorded,
    LeaseUpdated,
    RecoverySnapshotServed,
}

impl LifecycleEventKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::SessionCreated => "session.created",
            Self::RunStarted => "run.started",
            Self::ProposalCreated => "proposal.created",
            Self::ProposalUpdated => "proposal.updated",
            Self::PreviewUpdated => "preview.updated",
            Self::ValidationUpdated => "validation.updated",
            Self::ApprovalRequested => "approval.requested",
            Self::ApprovalResolved => "approval.resolved",
            Self::ApplyStarted => "apply.started",
            Self::ApplyRecorded => "apply.recorded",
            Self::ApplyFailed => "apply.failed",
            Self::ConflictRecorded => "conflict.recorded",
            Self::ProposalRejected => "proposal.rejected",
            Self::RollbackCreated => "rollback.created",
            Self::CancellationRecorded => "cancellation.recorded",
            Self::FailureRecorded => "failure.recorded",
            Self::LeaseUpdated => "lease.updated",
            Self::RecoverySnapshotServed => "recovery.snapshot_served",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "session.created" => Some(Self::SessionCreated),
            "run.started" => Some(Self::RunStarted),
            "proposal.created" => Some(Self::ProposalCreated),
            "proposal.updated" => Some(Self::ProposalUpdated),
            "preview.updated" => Some(Self::PreviewUpdated),
            "validation.updated" => Some(Self::ValidationUpdated),
            "approval.requested" => Some(Self::ApprovalRequested),
            "approval.resolved" => Some(Self::ApprovalResolved),
            "apply.started" => Some(Self::ApplyStarted),
            "apply.recorded" => Some(Self::ApplyRecorded),
            "apply.failed" => Some(Self::ApplyFailed),
            "conflict.recorded" => Some(Self::ConflictRecorded),
            "proposal.rejected" => Some(Self::ProposalRejected),
            "rollback.created" => Some(Self::RollbackCreated),
            "cancellation.recorded" => Some(Self::CancellationRecorded),
            "failure.recorded" => Some(Self::FailureRecorded),
            "lease.updated" => Some(Self::LeaseUpdated),
            "recovery.snapshot_served" => Some(Self::RecoverySnapshotServed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LifecycleTransition {
    SessionCreated,
    RunStarted,
    ProposalCreated,
    ProposalUpdated,
    PreviewUpdated,
    ValidationUpdated,
    ApprovalRequested,
    ApprovalResolved,
    ApplyStarted,
    ApplyRecorded,
    ApplyFailed,
    ConflictRecorded,
    ProposalRejected,
    RollbackCreated,
    CancellationRecorded,
    FailureRecorded,
    LeaseUpdated,
    RecoverySnapshotServed,
}

impl LifecycleTransition {
    pub(crate) fn event_kind(self) -> LifecycleEventKind {
        match self {
            Self::SessionCreated => LifecycleEventKind::SessionCreated,
            Self::RunStarted => LifecycleEventKind::RunStarted,
            Self::ProposalCreated => LifecycleEventKind::ProposalCreated,
            Self::ProposalUpdated => LifecycleEventKind::ProposalUpdated,
            Self::PreviewUpdated => LifecycleEventKind::PreviewUpdated,
            Self::ValidationUpdated => LifecycleEventKind::ValidationUpdated,
            Self::ApprovalRequested => LifecycleEventKind::ApprovalRequested,
            Self::ApprovalResolved => LifecycleEventKind::ApprovalResolved,
            Self::ApplyStarted => LifecycleEventKind::ApplyStarted,
            Self::ApplyRecorded => LifecycleEventKind::ApplyRecorded,
            Self::ApplyFailed => LifecycleEventKind::ApplyFailed,
            Self::ConflictRecorded => LifecycleEventKind::ConflictRecorded,
            Self::ProposalRejected => LifecycleEventKind::ProposalRejected,
            Self::RollbackCreated => LifecycleEventKind::RollbackCreated,
            Self::CancellationRecorded => LifecycleEventKind::CancellationRecorded,
            Self::FailureRecorded => LifecycleEventKind::FailureRecorded,
            Self::LeaseUpdated => LifecycleEventKind::LeaseUpdated,
            Self::RecoverySnapshotServed => LifecycleEventKind::RecoverySnapshotServed,
        }
    }

    pub(crate) fn from_changeset_status(status: ChangesetStatus) -> Option<Self> {
        match status {
            ChangesetStatus::Draft => Some(Self::ProposalCreated),
            ChangesetStatus::Generating => Some(Self::RunStarted),
            ChangesetStatus::Proposed => Some(Self::ProposalUpdated),
            ChangesetStatus::NeedsReview => Some(Self::ApprovalRequested),
            ChangesetStatus::Approved => Some(Self::ApprovalResolved),
            ChangesetStatus::Applying => Some(Self::ApplyStarted),
            ChangesetStatus::Applied => Some(Self::ApplyRecorded),
            ChangesetStatus::PartiallyApplied => Some(Self::ApplyRecorded),
            ChangesetStatus::CompensationRequired => Some(Self::FailureRecorded),
            ChangesetStatus::Conflicted => Some(Self::ConflictRecorded),
            ChangesetStatus::Rejected => Some(Self::ProposalRejected),
            ChangesetStatus::Superseded => Some(Self::ProposalUpdated),
            ChangesetStatus::Cancelled => Some(Self::CancellationRecorded),
            ChangesetStatus::Failed => Some(Self::ApplyFailed),
            ChangesetStatus::RollbackProposed => Some(Self::RollbackCreated),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LifecycleEventInput {
    pub(crate) event_id: String,
    pub(crate) dedupe_key: String,
    pub(crate) aggregate_kind: LifecycleAggregateKind,
    pub(crate) aggregate_id: String,
    pub(crate) event_kind: LifecycleEventKind,
    pub(crate) actor: ActorRef,
    pub(crate) command: Option<CommandKind>,
    pub(crate) idempotency_key: Option<IdempotencyKey>,
    pub(crate) payload: Value,
    pub(crate) created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LifecycleEventFeedRecord {
    pub(crate) seq: i64,
    pub(crate) event_id: String,
    pub(crate) aggregate_kind: String,
    pub(crate) aggregate_id: String,
    pub(crate) event_kind: String,
    pub(crate) schema_version: i64,
    pub(crate) actor: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) command: Option<CommandKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) idempotency_key: Option<IdempotencyKey>,
    pub(crate) payload: Value,
    pub(crate) payload_hash: String,
    pub(crate) created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LifecycleEventFeedPage {
    pub(crate) schema: &'static str,
    pub(crate) schema_version: i64,
    pub(crate) latest_outbox_seq: i64,
    pub(crate) high_water_seq: i64,
    pub(crate) items: Vec<LifecycleEventFeedRecord>,
}

pub(crate) fn lifecycle_event_draft(input: LifecycleEventInput) -> StoreResult<OutboxEventDraft> {
    let payload = wrap_payload(input.event_kind, input.payload);
    let payload_hash = payload_hash(&payload)?;
    Ok(OutboxEventDraft {
        event_id: input.event_id,
        dedupe_key: input.dedupe_key,
        aggregate_kind: input.aggregate_kind.as_str().to_string(),
        aggregate_id: input.aggregate_id,
        event_kind: input.event_kind.as_str().to_string(),
        schema_version: LIFECYCLE_EVENT_SCHEMA_VERSION,
        actor: input.actor,
        command: input.command,
        idempotency_key: input.idempotency_key,
        payload,
        payload_hash,
        created_at_ms: input.created_at_ms,
    })
}

pub(crate) fn apply_recorded_event(
    changeset_id: impl AsRef<str>,
    result_revision: impl AsRef<str>,
    receipt_payload: Value,
    state: ApplyState,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    created_at_ms: i64,
) -> StoreResult<OutboxEventDraft> {
    let changeset_id = changeset_id.as_ref();
    let result_revision = result_revision.as_ref();
    let event_kind = match state {
        ApplyState::Applied => LifecycleEventKind::ApplyRecorded,
        ApplyState::PartiallyApplied => LifecycleEventKind::ApplyRecorded,
        ApplyState::NotRequested | ApplyState::Requested | ApplyState::Running => {
            LifecycleEventKind::ApplyStarted
        }
        ApplyState::CompensationRequired => LifecycleEventKind::FailureRecorded,
        ApplyState::Failed => LifecycleEventKind::ApplyFailed,
    };
    lifecycle_event_draft(LifecycleEventInput {
        event_id: format!("apply-event:{result_revision}"),
        dedupe_key: format!("apply:{changeset_id}:{result_revision}"),
        aggregate_kind: LifecycleAggregateKind::Changeset,
        aggregate_id: changeset_id.to_string(),
        event_kind,
        actor,
        command: Some(CommandKind::RequestApply),
        idempotency_key: Some(idempotency_key),
        payload: receipt_payload,
        created_at_ms,
    })
}

pub(crate) fn apply_started_event(
    changeset_id: impl AsRef<str>,
    source_revision: impl AsRef<str>,
    applying_revision: impl AsRef<str>,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    created_at_ms: i64,
) -> StoreResult<OutboxEventDraft> {
    let changeset_id = changeset_id.as_ref();
    let source_revision = source_revision.as_ref();
    let applying_revision = applying_revision.as_ref();
    lifecycle_event_draft(LifecycleEventInput {
        event_id: format!("apply-started-event:{applying_revision}"),
        dedupe_key: format!("apply-started:{changeset_id}:{applying_revision}"),
        aggregate_kind: LifecycleAggregateKind::Changeset,
        aggregate_id: changeset_id.to_string(),
        event_kind: LifecycleEventKind::ApplyStarted,
        actor,
        command: Some(CommandKind::RequestApply),
        idempotency_key: Some(idempotency_key),
        payload: json!({
            "changeset_id": changeset_id,
            "source_revision": source_revision,
            "applying_revision": applying_revision,
        }),
        created_at_ms,
    })
}

pub(crate) fn projector_feed_page(
    events: Vec<OutboxEvent>,
    latest_outbox_seq: i64,
) -> StoreResult<LifecycleEventFeedPage> {
    let high_water_seq = events
        .last()
        .map(|event| event.seq)
        .unwrap_or(latest_outbox_seq);
    let items = events
        .into_iter()
        .map(projector_feed_record)
        .collect::<StoreResult<Vec<_>>>()?;
    Ok(LifecycleEventFeedPage {
        schema: LIFECYCLE_EVENT_SCHEMA,
        schema_version: LIFECYCLE_EVENT_SCHEMA_VERSION,
        latest_outbox_seq,
        high_water_seq,
        items,
    })
}

fn projector_feed_record(event: OutboxEvent) -> StoreResult<LifecycleEventFeedRecord> {
    validate_event_row(&event)?;
    Ok(LifecycleEventFeedRecord {
        seq: event.seq,
        event_id: event.event_id,
        aggregate_kind: event.aggregate_kind,
        aggregate_id: event.aggregate_id,
        event_kind: event.event_kind,
        schema_version: event.schema_version,
        actor: event.actor,
        command: event.command,
        idempotency_key: event.idempotency_key,
        payload: event.payload,
        payload_hash: event.payload_hash,
        created_at_ms: event.created_at_ms,
    })
}

fn validate_schema_version(schema_version: i64) -> StoreResult<()> {
    if schema_version == LIFECYCLE_EVENT_SCHEMA_VERSION {
        return Ok(());
    }
    Err(StoreError::Outbox(format!(
        "unsupported lifecycle event schema_version `{schema_version}`"
    )))
}

fn validate_event_row(event: &OutboxEvent) -> StoreResult<()> {
    validate_schema_version(event.schema_version)?;
    if LifecycleAggregateKind::from_str(&event.aggregate_kind).is_none() {
        return Err(StoreError::Outbox(format!(
            "unknown lifecycle aggregate_kind `{}`",
            event.aggregate_kind
        )));
    }
    if LifecycleEventKind::from_str(&event.event_kind).is_none() {
        return Err(StoreError::Outbox(format!(
            "unknown lifecycle event_kind `{}`",
            event.event_kind
        )));
    }
    if event.payload.get("schema").and_then(Value::as_str) != Some(LIFECYCLE_EVENT_SCHEMA) {
        return Err(StoreError::Outbox(
            "lifecycle event payload schema is missing or unsupported".to_string(),
        ));
    }
    if event.payload.get("schema_version").and_then(Value::as_i64)
        != Some(LIFECYCLE_EVENT_SCHEMA_VERSION)
    {
        return Err(StoreError::Outbox(
            "lifecycle event payload schema_version is missing or unsupported".to_string(),
        ));
    }
    if event.payload.get("event_kind").and_then(Value::as_str) != Some(event.event_kind.as_str()) {
        return Err(StoreError::Outbox(format!(
            "lifecycle event payload kind does not match row event_kind `{}`",
            event.event_kind
        )));
    }
    if event.payload.get("data").is_none() {
        return Err(StoreError::Outbox(
            "lifecycle event payload data is missing".to_string(),
        ));
    }
    Ok(())
}

fn wrap_payload(event_kind: LifecycleEventKind, payload: Value) -> Value {
    json!({
        "schema": LIFECYCLE_EVENT_SCHEMA,
        "schema_version": LIFECYCLE_EVENT_SCHEMA_VERSION,
        "event_kind": event_kind.as_str(),
        "data": payload,
    })
}

fn payload_hash(payload: &Value) -> StoreResult<String> {
    let bytes = serde_json::to_vec(payload)
        .map_err(|err| StoreError::Outbox(format!("event payload is not serializable: {err}")))?;
    Ok(blob_oid(bytes.as_slice()))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::model::{ActorId, ActorKind};
    use super::super::store::Store;
    use super::super::store::outbox::{AppendDecision, OutboxEventDraft};
    use super::*;

    fn actor() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:alice").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn idem(label: &str) -> IdempotencyKey {
        IdempotencyKey::new(format!("idem:{label}")).unwrap()
    }

    fn input(
        label: &str,
        aggregate_kind: LifecycleAggregateKind,
        event_kind: LifecycleEventKind,
        command: CommandKind,
    ) -> LifecycleEventInput {
        LifecycleEventInput {
            event_id: format!("event:{label}"),
            dedupe_key: format!("dedupe:{label}"),
            aggregate_kind,
            aggregate_id: format!("{label}_id"),
            event_kind,
            actor: actor(),
            command: Some(command),
            idempotency_key: Some(idem(label)),
            payload: json!({"label": label}),
            created_at_ms: 1_000,
        }
    }

    fn append_event(store: &mut Store, draft: OutboxEventDraft, command: CommandKind) {
        store
            .with_unit_of_work(command, |uow| match uow.outbox().append_event(draft)? {
                AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
            })
            .unwrap();
    }

    #[test]
    fn builders_cover_required_lifecycle_events_with_schema_wrapped_payloads() {
        let cases = [
            (
                "session",
                LifecycleAggregateKind::Session,
                LifecycleEventKind::SessionCreated,
                CommandKind::CreateSession,
                "session.created",
            ),
            (
                "proposal",
                LifecycleAggregateKind::Proposal,
                LifecycleEventKind::ProposalUpdated,
                CommandKind::EditProposal,
                "proposal.updated",
            ),
            (
                "validation",
                LifecycleAggregateKind::Validation,
                LifecycleEventKind::ValidationUpdated,
                CommandKind::ValidateProposal,
                "validation.updated",
            ),
            (
                "approval",
                LifecycleAggregateKind::Approval,
                LifecycleEventKind::ApprovalResolved,
                CommandKind::Approve,
                "approval.resolved",
            ),
            (
                "rollback",
                LifecycleAggregateKind::Rollback,
                LifecycleEventKind::RollbackCreated,
                CommandKind::CreateRollback,
                "rollback.created",
            ),
        ];

        for (label, aggregate_kind, event_kind, command, expected_kind) in cases {
            let draft =
                lifecycle_event_draft(input(label, aggregate_kind, event_kind, command)).unwrap();
            assert_eq!(draft.aggregate_kind, aggregate_kind.as_str());
            assert_eq!(draft.event_kind, expected_kind);
            assert_eq!(draft.schema_version, LIFECYCLE_EVENT_SCHEMA_VERSION);
            assert_eq!(draft.payload["schema"], LIFECYCLE_EVENT_SCHEMA);
            assert_eq!(
                draft.payload["schema_version"],
                LIFECYCLE_EVENT_SCHEMA_VERSION
            );
            assert_eq!(draft.payload["event_kind"], expected_kind);
            assert_eq!(draft.payload["data"]["label"], label);
            assert!(!draft.payload_hash.is_empty());
        }
    }

    #[test]
    fn changeset_status_mapping_uses_canonical_transition_events() {
        let cases = [
            (ChangesetStatus::Draft, LifecycleEventKind::ProposalCreated),
            (
                ChangesetStatus::Proposed,
                LifecycleEventKind::ProposalUpdated,
            ),
            (
                ChangesetStatus::NeedsReview,
                LifecycleEventKind::ApprovalRequested,
            ),
            (
                ChangesetStatus::Approved,
                LifecycleEventKind::ApprovalResolved,
            ),
            (ChangesetStatus::Applying, LifecycleEventKind::ApplyStarted),
            (ChangesetStatus::Applied, LifecycleEventKind::ApplyRecorded),
            (ChangesetStatus::Failed, LifecycleEventKind::ApplyFailed),
            (
                ChangesetStatus::RollbackProposed,
                LifecycleEventKind::RollbackCreated,
            ),
            (
                ChangesetStatus::Conflicted,
                LifecycleEventKind::ConflictRecorded,
            ),
            (
                ChangesetStatus::Cancelled,
                LifecycleEventKind::CancellationRecorded,
            ),
        ];

        for (status, expected_kind) in cases {
            let transition = LifecycleTransition::from_changeset_status(status).unwrap();
            assert_eq!(transition.event_kind(), expected_kind);
        }
    }

    #[test]
    fn apply_recorded_builder_uses_stable_identity_and_hashes() {
        let first = apply_recorded_event(
            "changeset_1",
            "rev_2",
            json!({"receipt_id": "receipt_1", "state": "applied"}),
            ApplyState::Applied,
            actor(),
            idem("apply"),
            1_234,
        )
        .unwrap();
        let replay = apply_recorded_event(
            "changeset_1",
            "rev_2",
            json!({"receipt_id": "receipt_1", "state": "applied"}),
            ApplyState::Applied,
            actor(),
            idem("apply"),
            1_234,
        )
        .unwrap();
        let failed = apply_recorded_event(
            "changeset_1",
            "rev_3",
            json!({"receipt_id": "receipt_2", "state": "failed"}),
            ApplyState::Failed,
            actor(),
            idem("apply_failed"),
            1_235,
        )
        .unwrap();

        assert_eq!(first.event_kind, "apply.recorded");
        assert_eq!(first.aggregate_kind, "changeset");
        assert_eq!(first.aggregate_id, "changeset_1");
        assert_eq!(first.dedupe_key, replay.dedupe_key);
        assert_eq!(first.payload_hash, replay.payload_hash);
        assert_eq!(failed.event_kind, "apply.failed");
        assert_ne!(first.dedupe_key, failed.dedupe_key);
    }

    #[test]
    fn projector_feed_replays_real_outbox_rows_after_restart() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        let first = lifecycle_event_draft(input(
            "proposal",
            LifecycleAggregateKind::Proposal,
            LifecycleEventKind::ProposalUpdated,
            CommandKind::EditProposal,
        ))
        .unwrap();
        let second = lifecycle_event_draft(input(
            "validation",
            LifecycleAggregateKind::Validation,
            LifecycleEventKind::ValidationUpdated,
            CommandKind::ValidateProposal,
        ))
        .unwrap();
        append_event(&mut store, first, CommandKind::EditProposal);
        append_event(&mut store, second, CommandKind::ValidateProposal);
        drop(store);

        let mut reopened = Store::open(&vault_root).unwrap();
        let (events, latest_seq) = reopened
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok((
                    uow.outbox().events_after(0, 10)?,
                    uow.outbox().latest_seq()?,
                ))
            })
            .unwrap();
        let feed = projector_feed_page(events, latest_seq).unwrap();

        assert_eq!(feed.schema, LIFECYCLE_EVENT_SCHEMA);
        assert_eq!(feed.latest_outbox_seq, 2);
        assert_eq!(feed.high_water_seq, 2);
        assert_eq!(feed.items.len(), 2);
        assert_eq!(feed.items[0].seq, 1);
        assert_eq!(feed.items[0].event_kind, "proposal.updated");
        assert_eq!(feed.items[1].seq, 2);
        assert_eq!(feed.items[1].event_kind, "validation.updated");
    }

    #[test]
    fn projector_feed_rejects_unsupported_schema_versions() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        let mut draft = lifecycle_event_draft(input(
            "proposal",
            LifecycleAggregateKind::Proposal,
            LifecycleEventKind::ProposalUpdated,
            CommandKind::EditProposal,
        ))
        .unwrap();
        draft.schema_version = LIFECYCLE_EVENT_SCHEMA_VERSION + 1;
        append_event(&mut store, draft, CommandKind::EditProposal);

        let (events, latest_seq) = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok((
                    uow.outbox().events_after(0, 10)?,
                    uow.outbox().latest_seq()?,
                ))
            })
            .unwrap();
        let err = projector_feed_page(events, latest_seq).unwrap_err();

        assert!(
            err.to_string()
                .contains("unsupported lifecycle event schema_version")
        );
    }

    #[test]
    fn projector_feed_rejects_malformed_same_version_lifecycle_rows() {
        let valid = lifecycle_event_draft(input(
            "proposal",
            LifecycleAggregateKind::Proposal,
            LifecycleEventKind::ProposalUpdated,
            CommandKind::EditProposal,
        ))
        .unwrap();
        let cases = [
            (
                "unknown_kind",
                {
                    let mut draft = valid.clone();
                    draft.event_id = "event:unknown_kind".to_string();
                    draft.dedupe_key = "dedupe:unknown_kind".to_string();
                    draft.event_kind = "proposal.unknown".to_string();
                    draft
                },
                "unknown lifecycle event_kind",
            ),
            (
                "raw_payload",
                {
                    let mut draft = valid.clone();
                    draft.event_id = "event:raw_payload".to_string();
                    draft.dedupe_key = "dedupe:raw_payload".to_string();
                    draft.payload = json!({"label": "raw_payload"});
                    draft
                },
                "payload schema is missing",
            ),
            (
                "mismatched_kind",
                {
                    let mut draft = valid.clone();
                    draft.event_id = "event:mismatched_kind".to_string();
                    draft.dedupe_key = "dedupe:mismatched_kind".to_string();
                    draft.payload["event_kind"] = json!("validation.updated");
                    draft
                },
                "payload kind does not match",
            ),
        ];

        for (label, draft, expected) in cases {
            let dir = tempfile::tempdir().unwrap();
            let vault_root = dir.path().join(".vault");
            let mut store = Store::open(&vault_root).unwrap();
            append_event(&mut store, draft, CommandKind::EditProposal);
            let (events, latest_seq) = store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    Ok((
                        uow.outbox().events_after(0, 10)?,
                        uow.outbox().latest_seq()?,
                    ))
                })
                .unwrap();
            let err = projector_feed_page(events, latest_seq).unwrap_err();
            assert!(
                err.to_string().contains(expected),
                "{label} produced unexpected error: {err}"
            );
        }
    }
}
