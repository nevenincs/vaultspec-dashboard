//! Agent tool-call executor run loop (W12.P41).
//!
//! This is THE seam that makes the P22 tool-permission plane and the P32 executor
//! gate real: an agent tool call becomes an effect ONLY by passing through here. The
//! run loop is one atomic, un-skippable step (arch-reviewer's run-loop bar):
//!
//!   resolve permission → `tool_execution_gate` → RECORD the `ToolCallRecord`
//!   BEFORE any dispatch → dispatch to the mapped existing backend command.
//!
//! Invariants this seam enforces (the security-critical contract reviewed on its own):
//! - RECORD BEFORE DISPATCH. A granted call writes its `ToolCallRecord` (permitted)
//!   before the caller dispatches; a refused call records the refusal and dispatches
//!   NOTHING. The gate outcome is durable before any effect.
//! - EFFECTIVELY-ONCE BY `tool_call_id`. A terminal call writes its record exactly once
//!   (P32 `ToolCallRepository` is `ON CONFLICT DO NOTHING`). A replay of a PERMITTED
//!   record RE-DRIVES the dispatch (disposition `Dispatch`, `replayed:true`): the caller
//!   dispatches the mapped command with an idempotency key deterministically derived
//!   from `tool_call_id`, so a completed dispatch is deduped by the command's own
//!   idempotency while a crash-lost dispatch runs fresh — the permitted-but-lost window
//!   HEALS, and a network-flap retry never double-applies. A replay of a REFUSED record
//!   stays terminal (`AlreadyHandled`) and never dispatches.
//! - DENIALS ARE VALUES. A gate refusal or an awaiting-permission suspension is an
//!   `ActionEligibility` value the caller returns on the 200 envelope, never a fault.
//! - DISPATCH ONLY THROUGH EXISTING COMMANDS. The granted disposition names a
//!   `CommandKind` (via `SemanticToolName::command()`); the caller routes it to the
//!   existing backend command. This seam adds no execution logic and no new model.
//!
//! A read/context tool needs no permission and dispatches freely. A mutating/dangerous
//! tool without a granted permission does NOT execute: it opens a `Pending` permission
//! request and RAISES a stable-id tool-permission interrupt (P32), suspending the run
//! until a human decides — never a terminal record, so a later grant lets the same
//! `tool_call_id` proceed. An explicitly rejected/expired permission is a terminal
//! refusal.
use ingest_struct::reader::blob_oid;

use super::interrupts::{
    InterruptKind, RecordInterruptInput, RecordToolCallInput, ToolCallRecord, tool_execution_gate,
};
use super::model::{ActionEligibility, ActorRef, CommandKind, InterruptId, RunId, ToolCallId};
use super::permissions::{ToolPermissionQueueState, ToolPermissionRequestInput};
use super::policy::{OperationMode, ToolRiskTier};
use super::store::unit_of_work::UnitOfWork;
use super::store::{Result as StoreResult, StoreError};
use super::tools::SemanticToolName;

/// The resolved inputs for one run-loop step. The `requester` is the server-held
/// principal (ASA-010), never a body claim.
#[derive(Debug, Clone)]
pub(crate) struct ExecuteToolCallRequest {
    pub tool: SemanticToolName,
    pub tool_call_id: ToolCallId,
    pub run_id: RunId,
    pub requester: ActorRef,
    pub scope_id: String,
    pub scope_mode: OperationMode,
    pub session_override: Option<OperationMode>,
    pub idempotency_key: String,
    pub now_ms: i64,
    pub ttl_ms: Option<i64>,
}

/// What the run-loop step decided. The caller acts on this: only `Dispatch` invokes a
/// backend command; every other disposition is terminal-or-suspended and dispatches
/// nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ExecuteDisposition {
    /// The gate granted a fresh call: dispatch this command through the existing
    /// backend command surface.
    Dispatch(CommandKind),
    /// A mutating/dangerous call without a granted permission: a `Pending` request was
    /// opened and a tool-permission interrupt raised. The run suspends; nothing runs.
    AwaitingPermission,
    /// The permission was explicitly rejected or expired: a terminal refusal, recorded,
    /// no dispatch.
    Refused,
    /// A prior terminal call for this `tool_call_id` already resolved: its recorded
    /// outcome is replayed and the caller must NOT dispatch again (idempotency).
    AlreadyHandled,
}

/// The outcome of one run-loop step: the served eligibility (a value, even on refusal),
/// the disposition the caller acts on, and the durable records the step wrote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExecuteOutcome {
    pub eligibility: ActionEligibility,
    pub disposition: ExecuteDisposition,
    pub tool_call_record: Option<ToolCallRecord>,
    pub replayed: bool,
}

impl ExecuteOutcome {
    /// Whether the caller should dispatch a backend command for this step.
    pub fn should_dispatch(&self) -> Option<CommandKind> {
        match self.disposition {
            ExecuteDisposition::Dispatch(command) => Some(command),
            _ => None,
        }
    }
}

/// Run one atomic tool-call step through the permission gate. See the module contract:
/// resolve → gate → record-before-dispatch → dispatch decision, idempotent by
/// `tool_call_id`.
pub(crate) fn execute_tool_call(
    uow: &UnitOfWork<'_>,
    request: &ExecuteToolCallRequest,
) -> StoreResult<ExecuteOutcome> {
    let tool = request.tool;

    // Idempotency (effectively-once): a prior terminal call already wrote its record. A
    // permitted record RE-DRIVES the dispatch (command-layer idempotency dedups a
    // completed one, heals a crash-lost one); a refused record stays terminal.
    if let Some(existing) = uow.tool_call_records().get(&request.tool_call_id)? {
        return Ok(replayed(existing));
    }

    // A read/context tool has no side effect and needs no permission: it dispatches
    // freely, recording its permitted outcome before dispatch like every other call.
    if tool.risk_tier() == ToolRiskTier::ReadOnly {
        let gate = tool_execution_gate(tool, None);
        let record = record_tool_call(uow, request, true, None)?;
        return Ok(ExecuteOutcome {
            eligibility: gate,
            disposition: ExecuteDisposition::Dispatch(tool.command()),
            tool_call_record: Some(record),
            replayed: false,
        });
    }

    // A mutating/dangerous tool must hold a granted permission. Resolve the existing
    // request or open a fresh `Pending` one (which is not granted).
    match uow
        .tool_permissions()
        .latest_for_tool_call(&request.tool_call_id)?
    {
        Some(_) => {}
        None => {
            uow.tool_permissions()
                .request_permission(permission_input(request))?;
        }
    }
    // LAZY EXPIRY: a Pending-past-TTL permission terminally expires HERE, so the gate
    // refuses it rather than suspending forever (it otherwise heals only on a human
    // touch or the background janitor). `expire_if_due` returns the refreshed record.
    let permission = uow
        .tool_permissions()
        .expire_if_due(&request.tool_call_id, request.now_ms)?;

    let gate = tool_execution_gate(tool, Some(&permission));
    if gate.allowed {
        // Granted: RECORD before dispatch. If the record already existed (a concurrent
        // terminal write won), replay instead of double-dispatching.
        let outcome = uow
            .tool_call_records()
            .record_tool_call(record_input(request, true, None))?;
        if outcome.replayed {
            // A concurrent terminal write won: re-drive through the same permitted-replay
            // path (effectively-once) rather than dropping the dispatch.
            return Ok(replayed(outcome.record));
        }
        return Ok(ExecuteOutcome {
            eligibility: gate,
            disposition: ExecuteDisposition::Dispatch(tool.command()),
            tool_call_record: Some(outcome.record),
            replayed: false,
        });
    }

    // Not granted. An undecided request SUSPENDS the run on a stable-id interrupt (no
    // terminal record, so a later grant lets the same tool_call_id proceed); a decided
    // rejection or a lapsed window is a terminal refusal.
    match permission.queue_state {
        ToolPermissionQueueState::Pending | ToolPermissionQueueState::Claimed => {
            uow.interrupts()
                .record_interrupt(interrupt_input(request)?)?;
            Ok(ExecuteOutcome {
                eligibility: gate,
                disposition: ExecuteDisposition::AwaitingPermission,
                tool_call_record: None,
                replayed: false,
            })
        }
        ToolPermissionQueueState::Decided | ToolPermissionQueueState::Expired => {
            let record = record_tool_call(uow, request, false, gate.reason.clone())?;
            Ok(ExecuteOutcome {
                eligibility: gate,
                disposition: ExecuteDisposition::Refused,
                tool_call_record: Some(record),
                replayed: false,
            })
        }
    }
}

/// Replay a prior terminal record (effectively-once). A PERMITTED record RE-DRIVES the
/// dispatch — the caller re-issues the mapped command under its deterministic
/// idempotency key, so a completed dispatch dedups and a crash-lost one runs fresh. A
/// REFUSED record is terminal and never dispatches.
fn replayed(record: ToolCallRecord) -> ExecuteOutcome {
    let command = SemanticToolName::from_wire(&record.tool_name).map(|tool| tool.command());
    if record.permitted {
        ExecuteOutcome {
            eligibility: ActionEligibility::allowed(command.unwrap_or(CommandKind::ReadContext)),
            disposition: command
                .map(ExecuteDisposition::Dispatch)
                .unwrap_or(ExecuteDisposition::AlreadyHandled),
            tool_call_record: Some(record),
            replayed: true,
        }
    } else {
        let reason = record
            .refusal_reason
            .clone()
            .unwrap_or_else(|| "tool call was previously refused".to_string());
        ExecuteOutcome {
            eligibility: ActionEligibility::denied(
                command.unwrap_or(CommandKind::ReadContext),
                reason,
            ),
            disposition: ExecuteDisposition::AlreadyHandled,
            tool_call_record: Some(record),
            replayed: true,
        }
    }
}

fn record_tool_call(
    uow: &UnitOfWork<'_>,
    request: &ExecuteToolCallRequest,
    permitted: bool,
    refusal_reason: Option<String>,
) -> StoreResult<ToolCallRecord> {
    Ok(uow
        .tool_call_records()
        .record_tool_call(record_input(request, permitted, refusal_reason))?
        .record)
}

fn record_input(
    request: &ExecuteToolCallRequest,
    permitted: bool,
    refusal_reason: Option<String>,
) -> RecordToolCallInput {
    RecordToolCallInput {
        tool_call_id: request.tool_call_id.clone(),
        run_id: request.run_id.clone(),
        tool: request.tool,
        permitted,
        refusal_reason,
        created_at_ms: request.now_ms,
    }
}

fn permission_input(request: &ExecuteToolCallRequest) -> ToolPermissionRequestInput {
    ToolPermissionRequestInput {
        tool_call_id: request.tool_call_id.clone(),
        tool: request.tool,
        scope_id: request.scope_id.clone(),
        requester: request.requester.clone(),
        scope_mode: request.scope_mode,
        session_override: request.session_override,
        idempotency_key: format!("tool-permission:{}", request.idempotency_key),
        created_at_ms: request.now_ms,
        ttl_ms: request.ttl_ms,
    }
}

fn interrupt_input(request: &ExecuteToolCallRequest) -> StoreResult<RecordInterruptInput> {
    // A STABLE, BOUNDED, collision-free id: the tool_call_id is hashed (blob_oid), so an
    // arbitrarily long client id can never overflow InterruptId's cap and collide with
    // another call on a shared sentinel. Re-raising the same suspended call is idempotent
    // (P32 records once), so resume is BY id, never by position. No fallback — a
    // construction failure propagates rather than aliasing onto a shared id.
    let interrupt_id = InterruptId::new(format!(
        "interrupt:tool/{}",
        blob_oid(request.tool_call_id.as_str().as_bytes())
    ))
    .map_err(|err| StoreError::Validation(format!("interrupt id: {err}")))?;
    Ok(RecordInterruptInput {
        interrupt_id,
        run_id: request.run_id.clone(),
        kind: InterruptKind::ToolPermission,
        tool_call_id: Some(request.tool_call_id.clone()),
        proposal_id: None,
        idempotency_key: format!("interrupt:{}", request.idempotency_key),
        created_at_ms: request.now_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::{ActorId, ActorKind, CommandKind};
    use crate::authoring::permissions::ToolPermissionDecisionKind;
    use crate::authoring::store::{Store, StoreError};

    fn requester() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:author").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn reviewer() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for actor in [requester(), reviewer()] {
                    let id = actor.id.as_str().to_string();
                    uow.actors().put_record(ActorRecordInput::active(
                        actor,
                        ActorDisplayMetadata::new(&id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();
        (dir, store)
    }

    fn request(tool: SemanticToolName, tool_call_id: &str, now: i64) -> ExecuteToolCallRequest {
        ExecuteToolCallRequest {
            tool,
            tool_call_id: ToolCallId::new(tool_call_id).unwrap(),
            run_id: RunId::new("run:1").unwrap(),
            requester: requester(),
            scope_id: "worktree".to_string(),
            scope_mode: OperationMode::Manual,
            session_override: None,
            idempotency_key: format!("idem:{tool_call_id}"),
            now_ms: now,
            ttl_ms: None,
        }
    }

    fn execute(store: &mut Store, req: &ExecuteToolCallRequest) -> ExecuteOutcome {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                execute_tool_call(uow, req)
            })
            .unwrap()
    }

    fn grant(store: &mut Store, tool_call_id: &str, now: i64) {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                uow.tool_permissions()
                    .submit_decision(
                        &ToolCallId::new(tool_call_id).unwrap(),
                        ToolPermissionDecisionKind::Approve,
                        &reviewer(),
                        None,
                        now,
                    )
                    .map_err(|err| StoreError::Permission(err.to_string()))?;
                Ok(())
            })
            .unwrap();
    }

    fn reject(store: &mut Store, tool_call_id: &str, now: i64) {
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                uow.tool_permissions()
                    .submit_decision(
                        &ToolCallId::new(tool_call_id).unwrap(),
                        ToolPermissionDecisionKind::Reject,
                        &reviewer(),
                        None,
                        now,
                    )
                    .map_err(|err| StoreError::Permission(err.to_string()))?;
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn read_only_tool_dispatches_freely_and_records_permitted() {
        let (_dir, mut store) = temp_store();
        let req = request(SemanticToolName::ReadContext, "call_read", 10);
        let outcome = execute(&mut store, &req);
        assert_eq!(
            outcome.disposition,
            ExecuteDisposition::Dispatch(CommandKind::ReadContext)
        );
        assert!(outcome.eligibility.allowed);
        let record = outcome.tool_call_record.expect("read tool records");
        assert!(record.permitted);
    }

    #[test]
    fn mutating_tool_without_permission_suspends_on_an_interrupt_and_does_not_dispatch() {
        let (_dir, mut store) = temp_store();
        let req = request(SemanticToolName::ProposeChangeset, "call_mutate", 10);
        let outcome = execute(&mut store, &req);

        assert_eq!(outcome.disposition, ExecuteDisposition::AwaitingPermission);
        assert!(!outcome.eligibility.allowed, "no grant → not allowed");
        assert!(
            outcome.tool_call_record.is_none(),
            "an awaiting call is not a terminal tool-call record"
        );
        // A stable-id tool-permission interrupt was raised for the run.
        let interrupts = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .interrupts_for_run(&RunId::new("run:1").unwrap(), 100)
            })
            .unwrap();
        assert_eq!(interrupts.len(), 1);
        assert_eq!(interrupts[0].kind, InterruptKind::ToolPermission);
        assert!(!interrupts[0].is_resolved());
    }

    #[test]
    fn mutating_tool_dispatches_after_a_grant_then_re_drives_effectively_once() {
        let (_dir, mut store) = temp_store();
        let req = request(SemanticToolName::ProposeChangeset, "call_grant", 10);

        // First attempt suspends (no grant yet).
        let first = execute(&mut store, &req);
        assert_eq!(first.disposition, ExecuteDisposition::AwaitingPermission);

        // A human grants the queued permission.
        grant(&mut store, "call_grant", 20);

        // Re-executing the SAME tool_call_id now dispatches (a fresh terminal record).
        let granted = execute(&mut store, &req);
        assert_eq!(
            granted.disposition,
            ExecuteDisposition::Dispatch(CommandKind::CreateProposal)
        );
        assert!(granted.tool_call_record.as_ref().unwrap().permitted);
        assert!(!granted.replayed);

        // EFFECTIVELY-ONCE: a retry of the same id RE-DRIVES the dispatch (replayed=true)
        // — the command's own idempotency key (derived from tool_call_id) dedups a
        // completed dispatch, so re-driving heals a crash-lost one without double-apply.
        let replay = execute(&mut store, &req);
        assert_eq!(
            replay.disposition,
            ExecuteDisposition::Dispatch(CommandKind::CreateProposal)
        );
        assert!(replay.replayed);
        assert!(replay.should_dispatch().is_some());
        assert!(replay.tool_call_record.unwrap().permitted);
    }

    #[test]
    fn a_pending_permission_past_its_ttl_terminally_refuses_not_suspends() {
        // LAZY EXPIRY: a mutating call whose permission window has lapsed refuses at the
        // gate rather than suspending forever.
        let (_dir, mut store) = temp_store();
        let mut req = request(SemanticToolName::ProposeChangeset, "call_ttl", 10);
        req.ttl_ms = Some(5);

        // First call opens a Pending permission expiring at now+5 and suspends.
        let first = execute(&mut store, &req);
        assert_eq!(first.disposition, ExecuteDisposition::AwaitingPermission);

        // Re-execute past the TTL: expire_if_due fires, the gate sees Expired → Refused.
        let mut later = req.clone();
        later.now_ms = 1_000;
        let refused = execute(&mut store, &later);
        assert_eq!(refused.disposition, ExecuteDisposition::Refused);
        assert!(!refused.eligibility.allowed);
        assert!(!refused.tool_call_record.unwrap().permitted);
    }

    #[test]
    fn a_long_tool_call_id_yields_a_bounded_collision_free_interrupt_id() {
        // The interrupt id is hashed (blob_oid), so an arbitrarily long client id can
        // never overflow the id cap or collide with another call on a shared sentinel:
        // two distinct long ids raise two DISTINCT interrupts.
        let (_dir, mut store) = temp_store();
        // Valid ToolCallIds (≤160 bytes) whose raw "interrupt:tool/{id}" prefix WOULD
        // overflow InterruptId's 160-byte cap — the old sentinel-fallback collision case.
        let long_a = format!("call_{}", "a".repeat(150));
        let long_b = format!("call_{}", "b".repeat(150));
        execute(
            &mut store,
            &request(SemanticToolName::ProposeChangeset, &long_a, 10),
        );
        execute(
            &mut store,
            &request(SemanticToolName::ProposeChangeset, &long_b, 11),
        );

        let interrupts = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.interrupts()
                    .interrupts_for_run(&RunId::new("run:1").unwrap(), 100)
            })
            .unwrap();
        assert_eq!(
            interrupts.len(),
            2,
            "two long ids raise two distinct interrupts"
        );
        assert_ne!(
            interrupts[0].interrupt_id.as_str(),
            interrupts[1].interrupt_id.as_str(),
            "no collision on a shared sentinel"
        );
    }

    #[test]
    fn rejected_permission_is_a_terminal_refusal_that_never_dispatches() {
        let (_dir, mut store) = temp_store();
        let req = request(SemanticToolName::RequestApply, "call_reject", 10);

        // Suspend, then a human REJECTS the permission.
        assert_eq!(
            execute(&mut store, &req).disposition,
            ExecuteDisposition::AwaitingPermission
        );
        reject(&mut store, "call_reject", 20);

        let refused = execute(&mut store, &req);
        assert_eq!(refused.disposition, ExecuteDisposition::Refused);
        assert!(!refused.eligibility.allowed);
        let record = refused.tool_call_record.expect("refusal is recorded");
        assert!(
            !record.permitted,
            "a refused tool call records permitted=false"
        );
        assert!(record.refusal_reason.is_some());

        // A replay of a refused call stays refused and never dispatches.
        let replay = execute(&mut store, &req);
        assert_eq!(replay.disposition, ExecuteDisposition::AlreadyHandled);
        assert!(replay.should_dispatch().is_none());
    }
}
