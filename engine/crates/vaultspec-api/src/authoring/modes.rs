//! Operation-mode execution layer (W10.P48).
//!
//! Modes are policy bundles over the existing authoring lifecycle. This module
//! selects the per-worktree mode, records system-actor auto-approvals, exposes the
//! after-the-fact lane marker state, and implements the kill switch by re-queuing
//! not-yet-applying system-approved changesets for human review. It does not
//! classify operation risk, decide policy requirements, or materialize documents:
//! those remain in `policy`, `approvals`, and `apply`.

use std::path::Path;

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::actors::{ActorDisplayMetadata, ActorRecordInput};
use super::approvals::{
    ApprovalDecision, ApprovalRequestInput, ApprovalRequestRecord, ReviewDecisionInput,
    ReviewedTuple, V1_POLICY_VERSION,
};
use super::ledger::{
    ChangesetAggregateRecord, ChangesetChildOperationInput, ChangesetRevisionInput,
};
use super::model::{
    ActionEligibility, ActorId, ActorKind, ActorRef, ApprovalId, ChangesetId, ChangesetKind,
    ChangesetStatus, CommandKind, IdempotencyKey, ProposalId,
};
use super::policy::{
    ApprovalRequirement, OperationMode, PolicyDecisionProjection, decide_changeset_approval,
    system_auto_approval_eligibility,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};
use super::transitions::{ValidationFreshness, policy_requeue_transition_eligibility};

const MODE_RECORD_SCHEMA: &str = "authoring.operation_mode.v1";
const SYSTEM_POLICY_APPROVAL_SCHEMA: &str = "authoring.system_policy_approval.v1";
const AFTER_FACT_ACK_SCHEMA: &str = "authoring.after_fact_acknowledgement.v1";

pub const MODE_POLICY_ID: &str = "authoring.operation_modes";
pub const MODE_POLICY_VERSION: &str = "authoring.operation_modes.v1";
pub const SYSTEM_AUTO_APPROVER_ID: &str = "system:operation-modes";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationModeRecord {
    pub schema_version: String,
    pub scope_id: String,
    pub mode: OperationMode,
    pub policy_id: String,
    pub policy_version: String,
    pub actor: ActorRef,
    pub idempotency_key: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SystemPolicyApprovalRecord {
    pub schema_version: String,
    pub approval_id: ApprovalId,
    pub proposal_id: ProposalId,
    pub changeset_id: ChangesetId,
    pub scope_id: String,
    pub mode: OperationMode,
    pub policy_id: String,
    pub policy_version: String,
    pub system_actor: ActorRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requeued_at_ms: Option<i64>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AfterFactAcknowledgementRecord {
    pub schema_version: String,
    pub changeset_id: ChangesetId,
    pub approval_id: ApprovalId,
    pub reviewer: ActorRef,
    pub idempotency_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationModeUpdate {
    pub record: OperationModeRecord,
    pub previous_mode: OperationMode,
    pub replayed: bool,
    pub requeued_approvals: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModeAutoApprovalOutcome {
    pub policy: PolicyDecisionProjection,
    pub eligibility: ActionEligibility,
    pub approval: Option<ApprovalRequestRecord>,
    pub marker: Option<SystemPolicyApprovalRecord>,
}

impl ModeAutoApprovalOutcome {
    pub fn approved(&self) -> bool {
        self.eligibility.allowed && self.marker.is_some()
    }

    pub fn should_auto_apply(&self) -> bool {
        self.approved() && self.policy.effective_mode == OperationMode::Autonomous
    }
}

pub struct ModeRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    system_approvals: SqliteRepository<'repo, 'conn>,
    acknowledgements: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn modes<'repo>(&'repo self) -> ModeRepository<'repo, 'conn> {
        ModeRepository {
            repo: self.repository("authoring_operation_mode_events"),
            system_approvals: self.repository("authoring_system_policy_approvals"),
            acknowledgements: self.repository("authoring_after_fact_acknowledgements"),
            uow: self,
        }
    }
}

pub fn scope_id_for_worktree(worktree_root: &Path) -> String {
    worktree_root.to_string_lossy().replace('\\', "/")
}

pub fn system_actor() -> ActorRef {
    ActorRef {
        id: ActorId::new(SYSTEM_AUTO_APPROVER_ID).expect("system actor id is valid"),
        kind: ActorKind::System,
        delegated_by: None,
    }
}

impl ModeRepository<'_, '_> {
    pub fn current_mode(&self, scope_id: &str) -> StoreResult<OperationMode> {
        Ok(self.current_record(scope_id)?.mode)
    }

    pub fn current_record(&self, scope_id: &str) -> StoreResult<OperationModeRecord> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_operation_mode_events
             WHERE scope_id = ?1
             ORDER BY seq DESC
             LIMIT 1",
            [scope_id],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => read_mode_record(&json),
            None => Ok(default_mode_record(scope_id)),
        }
    }

    pub fn set_scope_mode(
        &self,
        scope_id: &str,
        mode: OperationMode,
        actor: &ActorRef,
        idempotency_key: &IdempotencyKey,
        now_ms: i64,
    ) -> StoreResult<OperationModeUpdate> {
        self.uow.actors().ensure_active(actor)?;
        if let Some(existing) = self.mode_event_by_idempotency(scope_id, idempotency_key)? {
            let previous_mode = self.previous_mode_before(scope_id, existing.created_at_ms)?;
            return Ok(OperationModeUpdate {
                record: existing,
                previous_mode,
                replayed: true,
                requeued_approvals: 0,
            });
        }

        let previous = self.current_record(scope_id)?;
        let record = OperationModeRecord {
            schema_version: MODE_RECORD_SCHEMA.to_string(),
            scope_id: scope_id.to_string(),
            mode,
            policy_id: MODE_POLICY_ID.to_string(),
            policy_version: format!("{MODE_POLICY_VERSION}:{now_ms}"),
            actor: actor.clone(),
            idempotency_key: idempotency_key.as_str().to_string(),
            created_at_ms: now_ms,
        };
        self.store_mode_event(&record)?;
        let requeued_approvals = if mode_is_downgrade(previous.mode, mode) {
            self.requeue_system_approvals(scope_id, now_ms)?
        } else {
            0
        };
        Ok(OperationModeUpdate {
            record,
            previous_mode: previous.mode,
            replayed: false,
            requeued_approvals,
        })
    }

    pub fn maybe_auto_approve(
        &self,
        scope_id: &str,
        approval: &ApprovalRequestRecord,
        now_ms: i64,
    ) -> StoreResult<ModeAutoApprovalOutcome> {
        let mode_record = self.current_record(scope_id)?;
        let latest = self
            .uow
            .ledger()
            .latest(&approval.changeset_id)?
            .ok_or_else(|| {
                StoreError::Mode(format!(
                    "changeset `{}` has no ledger revision",
                    approval.changeset_id
                ))
            })?;
        let operations = latest
            .children
            .iter()
            .map(|child| child.operation)
            .collect::<Vec<_>>();
        let policy =
            decide_changeset_approval(mode_record.mode, None, latest.kind, operations.as_slice());
        // A DIRECT changeset is human-self-approved at creation (operation-modes
        // kind=direct); the mode machinery must NEVER system-auto-approve it (P49-R2).
        // This guard is LOAD-BEARING, not merely defensive: a crashed direct save can
        // leave a Draft kind=Direct changeset, and the GENERIC submit route
        // (POST /proposals/{id}/submit) gates nothing on kind — so a client can push
        // that partially-composed save into this composition. Without the guard,
        // assisted/autonomous mode would land a SYSTEM approval on a human's own save.
        if latest.kind == ChangesetKind::Direct {
            return Ok(ModeAutoApprovalOutcome {
                policy,
                eligibility: ActionEligibility::denied(
                    CommandKind::Approve,
                    "a direct changeset is human-self-approved and is never system-auto-approved",
                ),
                approval: None,
                marker: None,
            });
        }
        if policy.requirement != ApprovalRequirement::SystemAutoApprovable {
            let reason = policy.reason.clone();
            return Ok(ModeAutoApprovalOutcome {
                policy,
                eligibility: ActionEligibility::denied(CommandKind::Approve, reason),
                approval: None,
                marker: None,
            });
        }

        let system = system_actor();
        ensure_system_actor(self.uow, now_ms)?;
        let eligibility =
            system_auto_approval_eligibility(CommandKind::Approve, &system, policy.requirement);
        if !eligibility.allowed {
            return Ok(ModeAutoApprovalOutcome {
                policy,
                eligibility,
                approval: None,
                marker: None,
            });
        }

        let validation = self
            .uow
            .validations()
            .latest_for_changeset(&approval.changeset_id)?;
        let current_validation_digest = validation
            .as_ref()
            .map(|record| record.validation_digest.clone())
            .unwrap_or_default();
        let validation_freshness = ValidationFreshness {
            record_present: validation.is_some(),
            approval_ready: validation
                .as_ref()
                .is_some_and(|record| record.approval_ready),
            digest_matches_reviewed: validation.as_ref().is_some_and(|record| {
                record.validation_digest == approval.reviewed.validation_digest
            }),
        };

        let outcome = self
            .uow
            .approvals()
            .submit_decision(ReviewDecisionInput {
                proposal_id: &approval.proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &system,
                validation: validation_freshness,
                current_validation_digest: &current_validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: Some(format!(
                    "system auto-approval under {}@{} in {} mode",
                    mode_record.policy_id,
                    mode_record.policy_version,
                    mode_as_str(mode_record.mode)
                )),
                decided_at_ms: now_ms,
            })
            .map_err(|err| StoreError::Mode(err.to_string()))?;
        if !outcome.eligibility.allowed {
            return Ok(ModeAutoApprovalOutcome {
                policy,
                eligibility: outcome.eligibility,
                approval: Some(outcome.record),
                marker: None,
            });
        }

        let marker = SystemPolicyApprovalRecord {
            schema_version: SYSTEM_POLICY_APPROVAL_SCHEMA.to_string(),
            approval_id: outcome.record.approval_id.clone(),
            proposal_id: outcome.record.proposal_id.clone(),
            changeset_id: outcome.record.changeset_id.clone(),
            scope_id: scope_id.to_string(),
            mode: mode_record.mode,
            policy_id: mode_record.policy_id,
            policy_version: mode_record.policy_version,
            system_actor: system,
            requeued_at_ms: None,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
        };
        self.store_system_policy_approval(&marker)?;
        Ok(ModeAutoApprovalOutcome {
            policy,
            eligibility: outcome.eligibility,
            approval: Some(outcome.record),
            marker: Some(marker),
        })
    }

    pub fn applied_under_policy_markers(
        &self,
        scope_id: &str,
        limit: usize,
    ) -> StoreResult<Vec<SystemPolicyApprovalRecord>> {
        let rows = self.system_approvals.query_collect(
            "SELECT spa.record_json
             FROM authoring_system_policy_approvals spa
             JOIN (
                 SELECT changeset_id, MAX(seq) AS latest_seq
                 FROM authoring_changeset_revisions
                 GROUP BY changeset_id
             ) latest ON latest.changeset_id = spa.changeset_id
             JOIN authoring_changeset_revisions rev ON rev.seq = latest.latest_seq
             WHERE spa.scope_id = ?1
               AND spa.requeued_at_ms IS NULL
               AND rev.status = 'applied'
             ORDER BY rev.created_at_ms DESC
             LIMIT ?2",
            rusqlite::params![scope_id, limit as i64],
            |row| row.get::<_, String>(0),
        )?;
        rows.into_iter()
            .map(|json| read_system_marker(&json))
            .collect()
    }

    pub fn acknowledge_after_fact(
        &self,
        changeset_id: &ChangesetId,
        approval_id: &ApprovalId,
        reviewer: &ActorRef,
        idempotency_key: &IdempotencyKey,
        comment: Option<String>,
        now_ms: i64,
    ) -> StoreResult<AfterFactAcknowledgementRecord> {
        self.uow.actors().ensure_active(reviewer)?;
        let existing = self.acknowledgements.query_optional(
            "SELECT record_json
             FROM authoring_after_fact_acknowledgements
             WHERE changeset_id = ?1
               AND reviewer_actor_id = ?2
               AND reviewer_actor_kind = ?3
               AND idempotency_key = ?4",
            rusqlite::params![
                changeset_id.as_str(),
                reviewer.id.as_str(),
                super::actors::actor_kind_name(reviewer.kind),
                idempotency_key.as_str()
            ],
            |row| row.get::<_, String>(0),
        )?;
        if let Some(json) = existing {
            return read_acknowledgement(&json);
        }
        let record = AfterFactAcknowledgementRecord {
            schema_version: AFTER_FACT_ACK_SCHEMA.to_string(),
            changeset_id: changeset_id.clone(),
            approval_id: approval_id.clone(),
            reviewer: reviewer.clone(),
            idempotency_key: idempotency_key.as_str().to_string(),
            comment,
            created_at_ms: now_ms,
        };
        let record_json =
            serde_json::to_string(&record).map_err(|err| StoreError::Mode(err.to_string()))?;
        self.acknowledgements.execute(
            "INSERT INTO authoring_after_fact_acknowledgements
                (changeset_id, approval_id, reviewer_actor_id, reviewer_actor_kind,
                 idempotency_key, comment, record_json, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                record.changeset_id.as_str(),
                record.approval_id.as_str(),
                record.reviewer.id.as_str(),
                super::actors::actor_kind_name(record.reviewer.kind),
                record.idempotency_key.as_str(),
                record.comment.as_deref(),
                record_json.as_str(),
                record.created_at_ms,
            ],
        )?;
        Ok(record)
    }

    pub fn acknowledgement_count(&self, changeset_id: &ChangesetId) -> StoreResult<usize> {
        let count = self.acknowledgements.query_optional(
            "SELECT COUNT(*)
             FROM authoring_after_fact_acknowledgements
             WHERE changeset_id = ?1",
            [changeset_id.as_str()],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count.unwrap_or_default() as usize)
    }

    pub fn policy_requeue_reason(&self, changeset_id: &ChangesetId) -> StoreResult<Option<String>> {
        let requeued = self.system_approvals.query_optional(
            "SELECT 1
             FROM authoring_system_policy_approvals
             WHERE changeset_id = ?1
               AND requeued_at_ms IS NOT NULL
             ORDER BY requeued_at_ms DESC, updated_at_ms DESC
             LIMIT 1",
            [changeset_id.as_str()],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(requeued.map(|_| "policy_version_changed".to_string()))
    }

    fn mode_event_by_idempotency(
        &self,
        scope_id: &str,
        idempotency_key: &IdempotencyKey,
    ) -> StoreResult<Option<OperationModeRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_operation_mode_events
             WHERE scope_id = ?1 AND idempotency_key = ?2",
            rusqlite::params![scope_id, idempotency_key.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        json.map(|json| read_mode_record(&json)).transpose()
    }

    fn previous_mode_before(
        &self,
        scope_id: &str,
        created_at_ms: i64,
    ) -> StoreResult<OperationMode> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_operation_mode_events
             WHERE scope_id = ?1 AND created_at_ms < ?2
             ORDER BY seq DESC
             LIMIT 1",
            rusqlite::params![scope_id, created_at_ms],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(read_mode_record(&json)?.mode),
            None => Ok(OperationMode::DEFAULT),
        }
    }

    fn store_mode_event(&self, record: &OperationModeRecord) -> StoreResult<()> {
        validate_mode_record(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Mode(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_operation_mode_events
                (scope_id, mode, policy_id, policy_version, actor_id, actor_kind,
                 idempotency_key, record_json, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                record.scope_id.as_str(),
                mode_as_str(record.mode),
                record.policy_id.as_str(),
                record.policy_version.as_str(),
                record.actor.id.as_str(),
                super::actors::actor_kind_name(record.actor.kind),
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.created_at_ms,
            ],
        )?;
        Ok(())
    }

    fn store_system_policy_approval(&self, record: &SystemPolicyApprovalRecord) -> StoreResult<()> {
        validate_system_marker(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Mode(err.to_string()))?;
        self.system_approvals.execute(
            "INSERT INTO authoring_system_policy_approvals
                (approval_id, proposal_id, changeset_id, scope_id, mode, policy_id,
                 policy_version, system_actor_id, system_actor_kind, requeued_at_ms,
                 record_json, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(approval_id) DO UPDATE SET
                 requeued_at_ms = excluded.requeued_at_ms,
                 record_json = excluded.record_json,
                 updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.approval_id.as_str(),
                record.proposal_id.as_str(),
                record.changeset_id.as_str(),
                record.scope_id.as_str(),
                mode_as_str(record.mode),
                record.policy_id.as_str(),
                record.policy_version.as_str(),
                record.system_actor.id.as_str(),
                super::actors::actor_kind_name(record.system_actor.kind),
                record.requeued_at_ms,
                record_json.as_str(),
                record.created_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }

    fn requeue_system_approvals(&self, scope_id: &str, now_ms: i64) -> StoreResult<usize> {
        ensure_system_actor(self.uow, now_ms)?;
        let rows = self.system_approvals.query_collect(
            "SELECT record_json
             FROM authoring_system_policy_approvals
             WHERE scope_id = ?1 AND requeued_at_ms IS NULL
             ORDER BY created_at_ms ASC",
            [scope_id],
            |row| row.get::<_, String>(0),
        )?;
        let mut requeued = 0usize;
        for json in rows {
            let mut marker = read_system_marker(&json)?;
            let Some(latest) = self.uow.ledger().latest(&marker.changeset_id)? else {
                continue;
            };
            if latest.status != ChangesetStatus::Approved {
                continue;
            }
            let Some(mut old_approval) = self
                .uow
                .approvals()
                .record_by_approval(&marker.approval_id)?
            else {
                continue;
            };
            old_approval.stale = true;
            old_approval.stale_reason = Some("policy_version_changed".to_string());
            old_approval.updated_at_ms = now_ms;
            self.uow.approvals().store_record(&old_approval)?;

            let system = system_actor();
            // ONE declared policy-requeue arc (Approved → NeedsReview) under the system
            // actor — never a synthetic Approved → Draft re-draft (P48-R1: an
            // undeclared arc distorts provenance and leaks into projections + the event
            // stream). Gate it on the fine helper (system actor over an approved head).
            if !policy_requeue_transition_eligibility(&latest, &system).allowed {
                continue;
            }
            let needs_review = append_status_revision(
                self.uow,
                &latest,
                ChangesetStatus::NeedsReview,
                &system,
                now_ms,
            )?;
            let approval_id =
                requeue_approval_id(&marker.changeset_id, &marker.approval_id, now_ms)?;
            self.uow
                .approvals()
                .request_approval(ApprovalRequestInput {
                    approval_id,
                    proposal_id: marker.proposal_id.clone(),
                    changeset_id: marker.changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: needs_review.changeset_revision.clone(),
                        validation_digest: old_approval.reviewed.validation_digest.clone(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: format!("requeue:{}:{now_ms}", marker.approval_id.as_str()),
                    created_at_ms: now_ms + 1,
                })
                .map_err(|err| StoreError::Mode(err.to_string()))?;
            marker.requeued_at_ms = Some(now_ms);
            marker.updated_at_ms = now_ms;
            self.store_system_policy_approval(&marker)?;
            requeued += 1;
        }
        Ok(requeued)
    }
}

fn ensure_system_actor(uow: &UnitOfWork<'_>, now_ms: i64) -> StoreResult<()> {
    let actor = system_actor();
    if uow.actors().ensure_active(&actor).is_ok() {
        return Ok(());
    }
    uow.actors().put_record(ActorRecordInput::active(
        actor,
        ActorDisplayMetadata::new(
            "Operation mode policy",
            Some("System auto-approval actor".into()),
        ),
        now_ms,
    ))?;
    Ok(())
}

fn append_status_revision(
    uow: &UnitOfWork<'_>,
    previous: &ChangesetAggregateRecord,
    status: ChangesetStatus,
    actor: &ActorRef,
    created_at_ms: i64,
) -> StoreResult<ChangesetAggregateRecord> {
    let children = previous
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
        .collect::<Vec<_>>();
    let next = ChangesetAggregateRecord::new(ChangesetRevisionInput {
        changeset_id: previous.changeset_id.clone(),
        previous_revision: Some(previous.changeset_revision.clone()),
        kind: previous.kind,
        status,
        session_id: previous.session_id.clone(),
        actor: actor.clone(),
        summary: previous.summary.clone(),
        children,
        created_at_ms,
    })
    .map_err(|err| StoreError::Ledger(err.to_string()))?;
    uow.ledger().append_revision(&next)?;
    Ok(next)
}

fn default_mode_record(scope_id: &str) -> OperationModeRecord {
    OperationModeRecord {
        schema_version: MODE_RECORD_SCHEMA.to_string(),
        scope_id: scope_id.to_string(),
        mode: OperationMode::DEFAULT,
        policy_id: MODE_POLICY_ID.to_string(),
        policy_version: MODE_POLICY_VERSION.to_string(),
        actor: system_actor(),
        idempotency_key: "default".to_string(),
        created_at_ms: 0,
    }
}

fn requeue_approval_id(
    changeset_id: &ChangesetId,
    stale_approval_id: &ApprovalId,
    now_ms: i64,
) -> StoreResult<ApprovalId> {
    ApprovalId::new(format!(
        "approval:{}",
        blob_oid(format!("{changeset_id}:{stale_approval_id}:{now_ms}").as_bytes())
    ))
    .map_err(|err| StoreError::Mode(format!("requeue approval id is invalid: {err}")))
}

fn mode_is_downgrade(previous: OperationMode, next: OperationMode) -> bool {
    // Autonomy rank is owned by `policy::OperationMode` (one source, P48-R1 dedup).
    next.autonomy_rank() < previous.autonomy_rank()
}

pub fn mode_as_str(mode: OperationMode) -> &'static str {
    match mode {
        OperationMode::Manual => "manual",
        OperationMode::Assisted => "assisted",
        OperationMode::Autonomous => "autonomous",
    }
}

fn read_mode_record(json: &str) -> StoreResult<OperationModeRecord> {
    let record: OperationModeRecord =
        serde_json::from_str(json).map_err(|err| StoreError::Mode(err.to_string()))?;
    validate_mode_record(&record)?;
    Ok(record)
}

fn read_system_marker(json: &str) -> StoreResult<SystemPolicyApprovalRecord> {
    let record: SystemPolicyApprovalRecord =
        serde_json::from_str(json).map_err(|err| StoreError::Mode(err.to_string()))?;
    validate_system_marker(&record)?;
    Ok(record)
}

fn read_acknowledgement(json: &str) -> StoreResult<AfterFactAcknowledgementRecord> {
    let record: AfterFactAcknowledgementRecord =
        serde_json::from_str(json).map_err(|err| StoreError::Mode(err.to_string()))?;
    if record.schema_version != AFTER_FACT_ACK_SCHEMA {
        return Err(StoreError::Mode(format!(
            "unsupported acknowledgement schema `{}`",
            record.schema_version
        )));
    }
    Ok(record)
}

fn validate_mode_record(record: &OperationModeRecord) -> StoreResult<()> {
    if record.schema_version != MODE_RECORD_SCHEMA {
        return Err(StoreError::Mode(format!(
            "unsupported operation mode schema `{}`",
            record.schema_version
        )));
    }
    if record.scope_id.trim().is_empty() {
        return Err(StoreError::Mode("scope_id cannot be empty".to_string()));
    }
    Ok(())
}

fn validate_system_marker(record: &SystemPolicyApprovalRecord) -> StoreResult<()> {
    if record.schema_version != SYSTEM_POLICY_APPROVAL_SCHEMA {
        return Err(StoreError::Mode(format!(
            "unsupported system approval schema `{}`",
            record.schema_version
        )));
    }
    if record.system_actor.kind != ActorKind::System {
        return Err(StoreError::Mode(
            "system policy approval marker requires a system actor".to_string(),
        ));
    }
    if record.mode == OperationMode::Manual {
        return Err(StoreError::Mode(
            "manual mode cannot create a system policy approval marker".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::api::{
        ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, DraftMutation,
        TargetRevisionFence,
    };
    use crate::authoring::approvals::ApprovalQueueState;
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::model::{ChangesetKind, DocumentRef, RevisionToken, SessionId};
    use crate::authoring::operations::MaterializedProposalOperation;
    use crate::authoring::policy::RiskClass;
    use crate::authoring::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
    use crate::authoring::store::Store;
    use crate::authoring::store::unit_of_work::Repository;
    use crate::authoring::validation::{
        CurrentRevisionObservation, ValidationStatus, ValidationStatusRecord,
        validate_changeset_material,
    };

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        write_doc(
            dir.path(),
            ".vault/plan/mode-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nold body\n",
        );
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for (id, kind) in [
                    ("agent:author", ActorKind::Agent),
                    ("human:admin", ActorKind::Human),
                    ("human:reviewer", ActorKind::Human),
                ] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, kind),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();
        (dir, store)
    }

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn existing_doc(root: &Path) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("mode-plan".to_string()))
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("mode tests use an existing document");
        };
        base_revision.clone()
    }

    fn materialized(
        root: &Path,
        changeset_id: &ChangesetId,
    ) -> (
        MaterializedProposalOperation,
        PreimageRecord,
        ValidationStatusRecord,
    ) {
        let reader = SnapshotReader::for_worktree(root);
        let document = existing_doc(root);
        let snapshot = reader.require_current_base(&document).unwrap();
        let preimage = reader
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_1".to_string(),
                changeset_id: changeset_id.as_str().to_string(),
                operation_id: "child_1".to_string(),
                document: document.clone(),
                captured_at_ms: 10,
            })
            .unwrap();
        let revision = base_revision(&document);
        let draft = ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: "---\ntags:\n  - '#plan'\n---\n\nnew body\n".to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
            },
        };
        let operation = MaterializedProposalOperation::materialize_replace_body(
            changeset_id,
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap();
        let current = CurrentRevisionObservation::from_snapshot("child_1", &snapshot);
        let validation = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            &[],
            20,
        )
        .unwrap();
        assert_eq!(validation.status, ValidationStatus::ValidWithWarnings);
        assert!(validation.approval_ready);
        (operation, preimage, validation)
    }

    fn materialized_child(
        operation: MaterializedProposalOperation,
        validation: &ValidationStatusRecord,
    ) -> ChangesetChildOperationInput {
        ChangesetChildOperationInput::from_materialized(
            operation,
            validation.material_digest.clone(),
            validation.validation_digest.clone(),
        )
    }

    fn structural_child(
        root: &Path,
        operation: ChangesetOperationKind,
    ) -> ChangesetChildOperationInput {
        let document = existing_doc(root);
        let revision = base_revision(&document);
        ChangesetChildOperationInput {
            child_key: "child_1".to_string(),
            operation,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            materialized_operation: None,
            material_digest: None,
            validation_digest: None,
        }
    }

    fn changeset_record(
        changeset_id: &ChangesetId,
        previous: Option<RevisionToken>,
        status: ChangesetStatus,
        actor: &ActorRef,
        child: ChangesetChildOperationInput,
        created_at_ms: i64,
        kind: ChangesetKind,
    ) -> ChangesetAggregateRecord {
        ChangesetAggregateRecord::new(ChangesetRevisionInput {
            changeset_id: changeset_id.clone(),
            previous_revision: previous,
            kind,
            status,
            session_id: Some(SessionId::new("session_1").unwrap()),
            actor: actor.clone(),
            summary: "mode proposal".to_string(),
            children: vec![child],
            created_at_ms,
        })
        .unwrap()
    }

    fn seed_needs_review(
        store: &mut Store,
        changeset_id: &ChangesetId,
        author: &ActorRef,
        child: ChangesetChildOperationInput,
    ) -> RevisionToken {
        seed_needs_review_of_kind(store, changeset_id, author, child, ChangesetKind::Authoring)
    }

    fn seed_needs_review_of_kind(
        store: &mut Store,
        changeset_id: &ChangesetId,
        author: &ActorRef,
        child: ChangesetChildOperationInput,
        kind: ChangesetKind,
    ) -> RevisionToken {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let draft = changeset_record(
                    changeset_id,
                    None,
                    ChangesetStatus::Draft,
                    author,
                    child.clone(),
                    30,
                    kind,
                );
                uow.ledger().append_revision(&draft)?;
                let needs_review = changeset_record(
                    changeset_id,
                    Some(draft.changeset_revision.clone()),
                    ChangesetStatus::NeedsReview,
                    author,
                    child,
                    31,
                    kind,
                );
                uow.ledger().append_revision(&needs_review)?;
                Ok(needs_review.changeset_revision)
            })
            .unwrap()
    }

    fn request_approval(
        store: &mut Store,
        proposal_id: &ProposalId,
        changeset_id: &ChangesetId,
        reviewed_revision: &RevisionToken,
        validation_digest: &str,
    ) -> ApprovalRequestRecord {
        store
            .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                Ok(uow.approvals().request_approval(ApprovalRequestInput {
                    approval_id: ApprovalId::new("approval_1").unwrap(),
                    proposal_id: proposal_id.clone(),
                    changeset_id: changeset_id.clone(),
                    reviewed: ReviewedTuple {
                        proposal_revision: reviewed_revision.clone(),
                        validation_digest: validation_digest.to_string(),
                        policy_version: V1_POLICY_VERSION.to_string(),
                    },
                    idempotency_key: "idem:approval:1".to_string(),
                    created_at_ms: 40,
                }))
            })
            .unwrap()
            .unwrap()
            .record
    }

    fn set_mode(
        store: &mut Store,
        root: &Path,
        mode: OperationMode,
        actor: &ActorRef,
        now_ms: i64,
    ) -> OperationModeUpdate {
        let scope_id = scope_id_for_worktree(root);
        store
            .with_unit_of_work(CommandKind::SetOperationMode, |uow| {
                uow.modes().set_scope_mode(
                    &scope_id,
                    mode,
                    actor,
                    &IdempotencyKey::new(format!("idem:mode:{now_ms}")).unwrap(),
                    now_ms,
                )
            })
            .unwrap()
    }

    fn append_apply_statuses(store: &mut Store, changeset_id: &ChangesetId) {
        let system = system_actor();
        store
            .with_unit_of_work(CommandKind::RequestApply, |uow| {
                let approved = uow.ledger().latest(changeset_id)?.unwrap();
                let applying =
                    append_status_revision(uow, &approved, ChangesetStatus::Applying, &system, 70)?;
                append_status_revision(uow, &applying, ChangesetStatus::Applied, &system, 71)?;
                Ok(())
            })
            .unwrap();
    }

    fn marker_by_approval(
        store: &mut Store,
        approval_id: &ApprovalId,
    ) -> SystemPolicyApprovalRecord {
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let json = uow
                    .repository("authoring_system_policy_approvals")
                    .query_optional(
                        "SELECT record_json
                         FROM authoring_system_policy_approvals
                         WHERE approval_id = ?1",
                        [approval_id.as_str()],
                        |row| row.get::<_, String>(0),
                    )?
                    .expect("system policy marker exists");
                read_system_marker(&json)
            })
            .unwrap()
    }

    #[test]
    fn eligible_changeset_is_approved_by_system_actor_in_autonomous_mode() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let author = actor("agent:author", ActorKind::Agent);
        let admin = actor("human:admin", ActorKind::Human);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let proposal_id = ProposalId::new("proposal_1").unwrap();
        let (operation, preimage, validation) = materialized(root, &changeset_id);
        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.snapshots().store_preimage(&preimage)?;
                uow.validations().store_record(&validation)
            })
            .unwrap();
        let reviewed = seed_needs_review(
            &mut store,
            &changeset_id,
            &author,
            materialized_child(operation, &validation),
        );
        let approval = request_approval(
            &mut store,
            &proposal_id,
            &changeset_id,
            &reviewed,
            &validation.validation_digest,
        );
        set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

        let scope_id = scope_id_for_worktree(root);
        let outcome = store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
            })
            .unwrap();

        assert!(outcome.approved(), "system approval should be recorded");
        assert_eq!(
            outcome.policy.requirement,
            ApprovalRequirement::SystemAutoApprovable
        );
        assert_eq!(outcome.policy.risk, RiskClass::NonDestructive);
        let recorded = outcome.approval.expect("approval outcome is returned");
        let decision = recorded.decision.expect("decision is recorded");
        assert_eq!(decision.reviewer, system_actor());
        assert_eq!(decision.resulting_status, ChangesetStatus::Approved);
        assert_eq!(
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    Ok(uow.ledger().latest(&changeset_id)?.unwrap().status)
                })
                .unwrap(),
            ChangesetStatus::Approved
        );
    }

    #[test]
    fn direct_changeset_is_never_system_auto_approved_even_in_autonomous_mode() {
        // P49-R2 site-c guard (LOAD-BEARING): a crashed direct save can leave a Draft
        // kind=Direct changeset that a client pushes through the GENERIC submit route
        // (which gates nothing on kind) into this composition. Even in autonomous mode
        // over a non-destructive body edit — which WOULD auto-approve for Authoring —
        // a Direct changeset must be refused: it is the human's own self-approved save,
        // never a system approval.
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let author = actor("human:reviewer", ActorKind::Human);
        let admin = actor("human:admin", ActorKind::Human);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let proposal_id = ProposalId::new("proposal_1").unwrap();
        let (operation, preimage, validation) = materialized(root, &changeset_id);
        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.snapshots().store_preimage(&preimage)?;
                uow.validations().store_record(&validation)
            })
            .unwrap();
        let reviewed = seed_needs_review_of_kind(
            &mut store,
            &changeset_id,
            &author,
            materialized_child(operation, &validation),
            ChangesetKind::Direct,
        );
        let approval = request_approval(
            &mut store,
            &proposal_id,
            &changeset_id,
            &reviewed,
            &validation.validation_digest,
        );
        set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

        let scope_id = scope_id_for_worktree(root);
        let outcome = store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
            })
            .unwrap();

        assert!(
            !outcome.approved(),
            "a direct changeset must never be system-auto-approved: {:?}",
            outcome.eligibility
        );
        assert!(
            outcome.marker.is_none(),
            "no system approval marker for a direct save"
        );
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("human-self-approved")),
            "the refusal names the human-self-approval reason: {:?}",
            outcome.eligibility
        );
    }

    #[test]
    fn destructive_operation_keeps_the_human_floor_in_autonomous_mode() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let author = actor("agent:author", ActorKind::Agent);
        let admin = actor("human:admin", ActorKind::Human);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let proposal_id = ProposalId::new("proposal_1").unwrap();
        let reviewed = seed_needs_review(
            &mut store,
            &changeset_id,
            &author,
            structural_child(root, ChangesetOperationKind::Rename),
        );
        let approval = request_approval(
            &mut store,
            &proposal_id,
            &changeset_id,
            &reviewed,
            "validation:v1",
        );
        set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);

        let scope_id = scope_id_for_worktree(root);
        let outcome = store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
            })
            .unwrap();

        assert!(!outcome.approved());
        assert_eq!(outcome.policy.risk, RiskClass::Destructive);
        assert_eq!(
            outcome.policy.requirement,
            ApprovalRequirement::HumanApprovalRequired
        );
        assert!(
            outcome
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("human approval"))
        );
        let (status, decision) = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let status = uow.ledger().latest(&changeset_id)?.unwrap().status;
                let decision = uow
                    .approvals()
                    .latest_for_proposal(&proposal_id)?
                    .unwrap()
                    .decision;
                Ok((status, decision))
            })
            .unwrap();
        assert_eq!(status, ChangesetStatus::NeedsReview);
        assert!(decision.is_none());
    }

    #[test]
    fn applied_system_approval_is_served_in_the_after_fact_lane() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let author = actor("agent:author", ActorKind::Agent);
        let admin = actor("human:admin", ActorKind::Human);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let proposal_id = ProposalId::new("proposal_1").unwrap();
        let (operation, preimage, validation) = materialized(root, &changeset_id);
        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.snapshots().store_preimage(&preimage)?;
                uow.validations().store_record(&validation)
            })
            .unwrap();
        let reviewed = seed_needs_review(
            &mut store,
            &changeset_id,
            &author,
            materialized_child(operation, &validation),
        );
        let approval = request_approval(
            &mut store,
            &proposal_id,
            &changeset_id,
            &reviewed,
            &validation.validation_digest,
        );
        set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);
        let scope_id = scope_id_for_worktree(root);
        store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
            })
            .unwrap();
        append_apply_statuses(&mut store, &changeset_id);

        let lane = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.projections()
                    .list_proposals(root)
                    .map(|page| page.applied_under_policy)
                    .map_err(|err| StoreError::Mode(err.to_string()))
            })
            .unwrap();

        assert_eq!(lane.items.len(), 1);
        let item = &lane.items[0];
        assert_eq!(item.proposal.changeset_id, changeset_id);
        assert_eq!(item.proposal.status, ChangesetStatus::Applied);
        assert_eq!(item.mode, OperationMode::Autonomous);
        assert_eq!(item.policy_id, MODE_POLICY_ID);
        assert_eq!(item.system_actor, system_actor());
        assert!(item.proposal.rollback.available);
        assert_eq!(item.acknowledgement_count, 0);
    }

    #[test]
    fn mode_downgrade_requeues_not_yet_applying_system_approval_as_human_review() {
        let (dir, mut store) = temp_store();
        let root = dir.path();
        let author = actor("agent:author", ActorKind::Agent);
        let admin = actor("human:admin", ActorKind::Human);
        let changeset_id = ChangesetId::new("changeset_1").unwrap();
        let proposal_id = ProposalId::new("proposal_1").unwrap();
        let (operation, preimage, validation) = materialized(root, &changeset_id);
        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.snapshots().store_preimage(&preimage)?;
                uow.validations().store_record(&validation)
            })
            .unwrap();
        let reviewed = seed_needs_review(
            &mut store,
            &changeset_id,
            &author,
            materialized_child(operation, &validation),
        );
        let approval = request_approval(
            &mut store,
            &proposal_id,
            &changeset_id,
            &reviewed,
            &validation.validation_digest,
        );
        set_mode(&mut store, root, OperationMode::Autonomous, &admin, 50);
        let scope_id = scope_id_for_worktree(root);
        let auto = store
            .with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes().maybe_auto_approve(&scope_id, &approval, 60)
            })
            .unwrap();
        assert!(auto.approved());
        let stale_approval_id = auto.approval.as_ref().unwrap().approval_id.clone();

        let update = set_mode(&mut store, root, OperationMode::Manual, &admin, 65);

        assert_eq!(update.requeued_approvals, 1);
        let (latest, old, replacement) = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let latest = uow.ledger().latest(&changeset_id)?.unwrap();
                let old = uow
                    .approvals()
                    .record_by_approval(&stale_approval_id)?
                    .unwrap();
                let replacement = uow.approvals().latest_for_proposal(&proposal_id)?.unwrap();
                Ok((latest, old, replacement))
            })
            .unwrap();
        assert_eq!(latest.status, ChangesetStatus::NeedsReview);
        // P48-R1: the kill switch re-queues through the SINGLE declared
        // Approved→NeedsReview arc — the head's predecessor is the Approved auto-approval,
        // NOT a synthetic Approved→Draft re-draft, and the system actor never authored a
        // Draft revision.
        let history = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.ledger().history(&changeset_id)
            })
            .unwrap();
        let predecessor = &history.revisions[history.revisions.len() - 2];
        assert_eq!(
            predecessor.status,
            ChangesetStatus::Approved,
            "requeue is a direct Approved→NeedsReview hop, not through Draft"
        );
        assert!(
            !history
                .revisions
                .iter()
                .any(|rev| rev.status == ChangesetStatus::Draft && rev.actor == system_actor()),
            "the requeue never emits a synthetic Approved→Draft re-draft"
        );
        assert!(old.stale);
        assert_eq!(old.stale_reason.as_deref(), Some("policy_version_changed"));
        assert_ne!(replacement.approval_id, stale_approval_id);
        assert!(!replacement.stale);
        assert_eq!(replacement.queue_state, ApprovalQueueState::Queued);
        assert_eq!(
            replacement.reviewed.proposal_revision,
            latest.changeset_revision
        );
        let projection = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.projections()
                    .project_proposal(&changeset_id, root)
                    .map_err(|err| StoreError::Mode(err.to_string()))
            })
            .unwrap()
            .unwrap();
        assert!(
            !projection.approval.stale,
            "the replacement approval remains actionable for human review"
        );
        assert_eq!(
            projection.approval.stale_reason.as_deref(),
            Some("policy_version_changed"),
            "the served review item carries the kill-switch policy stale reason"
        );
        let marker = marker_by_approval(&mut store, &stale_approval_id);
        assert_eq!(marker.requeued_at_ms, Some(65));
    }
}
