//! The ONE bounded, timed background janitor (agent-wire-gaps P04a / D1).
//!
//! A single sweep drives every genuinely undriven hygiene duty — the abandoned-run
//! reap (D1's crash backstop for a runtime that dies without reporting settlement),
//! tool-permission expiry, interrupt-side permission expiry, and lease expiry — plus a
//! stated COMPACTION BACKSTOP over the same bounded `compact_due` set the opportunistic
//! per-turn path owns. It is never a second owner of compaction and never a second
//! timer: `spawn_janitor` is the only background loop, and every duty is bounded by the
//! config's row budget and best-effort (a failing duty logs into the report and the
//! sweep continues).

use std::sync::Arc;

use serde_json::json;

use super::super::model::ActorKind;
use super::super::stream::{
    GENERATION_TRANSCRIPT_COMPACTION_MAX, GENERATION_TRANSCRIPT_SUMMARY_HASH,
};
use super::commands::{append_promoted_run_started, append_session_event_keyed};
use super::*;

/// The janitor's bounds, all fixed at construction (resource-bounds rule: every
/// accumulator and sweep carries its bound where it is created).
#[derive(Debug, Clone)]
pub struct JanitorConfig {
    /// An `active` run whose `updated_at_ms` is older than this is presumed abandoned
    /// (its driver died without reporting settlement) and is reaped to `Failed`.
    pub run_stale_after_ms: i64,
    /// The fixed sweep cadence for the background task.
    pub sweep_interval_ms: i64,
    /// The per-duty row budget: no duty touches more rows than this in one sweep; the
    /// remainder waits for the next sweep (the report says so honestly).
    pub per_duty_row_budget: u32,
}

impl JanitorConfig {
    /// The production bounds: a run is abandoned after 30 minutes without a settlement
    /// report; the sweep runs every 60 seconds; each duty touches at most 64 rows per
    /// sweep (matching the transcript-compaction sweep bound).
    pub fn default_bounds() -> Self {
        Self {
            run_stale_after_ms: 30 * 60 * 1000,
            sweep_interval_ms: 60 * 1000,
            per_duty_row_budget: GENERATION_TRANSCRIPT_COMPACTION_MAX,
        }
    }
}

/// What one sweep actually did — per-duty counts, the duties whose budget filled
/// (work remains for the next sweep), and any per-duty errors (best-effort: an error
/// never aborts the remaining duties).
#[derive(Debug, Default)]
pub struct SweepReport {
    pub reaped_runs: usize,
    pub promoted_turns: usize,
    pub expired_permissions: usize,
    pub interrupt_driven_expiries: usize,
    pub expired_leases: usize,
    pub backstop_compacted: usize,
    pub budget_exhausted: Vec<&'static str>,
    pub duty_errors: Vec<String>,
}

impl SweepReport {
    pub fn did_anything(&self) -> bool {
        self.reaped_runs
            + self.promoted_turns
            + self.expired_permissions
            + self.interrupt_driven_expiries
            + self.expired_leases
            + self.backstop_compacted
            > 0
            || !self.duty_errors.is_empty()
    }
}

/// The synthetic SYSTEM principal the reap's lifecycle events carry — the reap is
/// engine hygiene, never attributed to the dead owner. Reachable only from the
/// in-process sweep; no route resolves this principal.
fn janitor_actor() -> ActorRef {
    ActorRef {
        id: ActorId::new("system:janitor").expect("static janitor actor id is a valid token"),
        kind: ActorKind::System,
        delegated_by: None,
    }
}

/// One full janitor sweep. Each duty runs in its own unit of work, bounded by the
/// config's row budget, best-effort: a duty error is recorded in the report and the
/// remaining duties still run. Directly testable — the background task is only a timer
/// around this function.
pub fn janitor_sweep(store: &mut Store, now_ms: i64, config: &JanitorConfig) -> SweepReport {
    let mut report = SweepReport::default();
    let budget = config.per_duty_row_budget;

    // Duty 1 — abandoned-run reap (D1): the same Failed settle + run.completed +
    // queued-turn promotion a reported completion performs, atomic per unit of work.
    let cutoff = now_ms.saturating_sub(config.run_stale_after_ms);
    let reap = store.with_unit_of_work(CommandKind::CompleteRun, |uow| {
        let stale = uow.sessions().stale_active_runs(cutoff, budget)?;
        let exhausted = stale.len() as u32 >= budget;
        let mut reaped = 0usize;
        let mut promoted = 0usize;
        let actor = janitor_actor();
        for run in stale {
            let reason = format!(
                "abandoned: no settlement report within {} ms",
                config.run_stale_after_ms
            );
            let (run, changed) = uow
                .sessions()
                .reap_abandoned_run(&run.run_id, &reason, now_ms)?;
            if !changed {
                continue;
            }
            reaped += 1;
            let receipt = ReceiptId::new(format!("janitor:reap:{}", run.run_id.as_str()))
                .map_err(|err| StoreError::Session(err.to_string()))?;
            let context = SessionCommandContext {
                actor: actor.clone(),
                idempotency_key: IdempotencyKey::new(format!(
                    "janitor:reap:{}",
                    run.run_id.as_str()
                ))
                .map_err(|err| StoreError::Session(err.to_string()))?,
                now_ms,
                in_flight_expires_at_ms: None,
                outcome_expires_at_ms: None,
            };
            append_session_event_keyed(
                uow,
                LifecycleAggregateKind::Run,
                run.run_id.as_str(),
                LifecycleEventKind::RunCompleted,
                &context,
                &receipt,
                "",
                json!({ "run": run }),
            )?;
            // D2: settlement — reported or reaped — is the queue's promotion trigger.
            if let Some(next) = uow
                .sessions()
                .promote_next_queued_turn(&run.session_id, now_ms)?
            {
                append_promoted_run_started(uow, &next, &context, &receipt)?;
                promoted += 1;
            }
        }
        Ok((reaped, promoted, exhausted))
    });
    match reap {
        Ok((reaped, promoted, exhausted)) => {
            report.reaped_runs = reaped;
            report.promoted_turns = promoted;
            if exhausted {
                report.budget_exhausted.push("run_reap");
            }
        }
        Err(err) => report.duty_errors.push(format!("run_reap: {err}")),
    }

    // Duty 2 — tool-permission expiry: make the lazy expire-on-touch transition
    // eventual for pending requests nothing touches again.
    match store.with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
        uow.tool_permissions().expire_due(now_ms, budget)
    }) {
        Ok(expired) => report.expired_permissions = expired,
        Err(err) => report.duty_errors.push(format!("permission_expiry: {err}")),
    }

    // Duty 3 — interrupt reaping: an interrupt carries no TTL and resolution stays the
    // resume path's job; reaping means driving the SAME permission lazy-expiry from the
    // pending-interrupt side, so a resume of a dead interrupt refuses instead of
    // suspending forever.
    match store.with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
        let pending = uow.interrupts().pending_interrupts(budget)?;
        let mut expired = 0usize;
        for interrupt in pending {
            let Some(tool_call_id) = interrupt.tool_call_id else {
                continue;
            };
            // `expire_if_due` returns the record whether or not it transitioned; a
            // genuine expiry performed by THIS call is recognizable as an `Expired`
            // state stamped with this sweep's clock.
            let record = uow
                .tool_permissions()
                .expire_if_due(&tool_call_id, now_ms)?;
            if matches!(
                record.queue_state,
                super::super::permissions::ToolPermissionQueueState::Expired
            ) && record.updated_at_ms == now_ms
            {
                expired += 1;
            }
        }
        Ok(expired)
    }) {
        Ok(expired) => report.interrupt_driven_expiries = expired,
        Err(err) => report.duty_errors.push(format!("interrupt_reap: {err}")),
    }

    // Duty 4 — lease expiry: the same expire-on-read transition, driven eventually.
    match store.with_unit_of_work(CommandKind::RenewLease, |uow| {
        uow.leases().expire_due(now_ms, budget)
    }) {
        Ok(expired) => report.expired_leases = expired,
        Err(err) => report.duty_errors.push(format!("lease_expiry: {err}")),
    }

    // Duty 5 — compaction BACKSTOP only: the per-turn path owns compaction; this sweep
    // covers a session that never receives another turn. Same bounded due-set, same
    // hash — a session already compacted by its own turn is simply not due here.
    match store.with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
        uow.retention().compact_due(
            format!("janitor:backstop:{now_ms}"),
            now_ms,
            budget.min(GENERATION_TRANSCRIPT_COMPACTION_MAX),
            GENERATION_TRANSCRIPT_SUMMARY_HASH,
        )
    }) {
        Ok(summary) => report.backstop_compacted = summary.compacted_count,
        Err(err) => report
            .duty_errors
            .push(format!("compaction_backstop: {err}")),
    }

    report
}

/// Spawn the ONE background janitor task: a fixed-cadence timer around
/// [`janitor_sweep`]. Serve-time only (CLI paths never spawn it); the caller holds the
/// returned handle in an abort-on-drop guard so the task dies with the serve future.
pub fn spawn_janitor(
    state: Arc<crate::app::AppState>,
    config: JanitorConfig,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let interval = std::time::Duration::from_millis(config.sweep_interval_ms.max(1000) as u64);
        loop {
            tokio::time::sleep(interval).await;
            let now = crate::app::now_ms();
            let report = state.with_authoring_store(|store| Ok(janitor_sweep(store, now, &config)));
            match report {
                Ok(report) if report.did_anything() => {
                    eprintln!(
                        "vaultspec serve: janitor sweep — reaped {} run(s), promoted {}, expired {} permission(s) (+{} via interrupts), {} lease(s), backstop-compacted {}{}",
                        report.reaped_runs,
                        report.promoted_turns,
                        report.expired_permissions,
                        report.interrupt_driven_expiries,
                        report.expired_leases,
                        report.backstop_compacted,
                        if report.duty_errors.is_empty() {
                            String::new()
                        } else {
                            format!("; errors: {}", report.duty_errors.join(" | "))
                        }
                    );
                }
                Ok(_) => {}
                Err(err) => eprintln!("vaultspec serve: janitor sweep skipped: {err}"),
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::super::tests::{
        accepted, actor, context, event_kinds, register_actor, session_request, temp_store,
        turn_request,
    };
    use super::*;

    const STALE: i64 = 30 * 60 * 1000;

    fn janitor_config(budget: u32) -> JanitorConfig {
        JanitorConfig {
            run_stale_after_ms: STALE,
            sweep_interval_ms: 60_000,
            per_duty_row_budget: budget,
        }
    }

    /// Open a session with one active run whose last touch is `now_ms`.
    fn active_run_at(store: &mut Store, actor: &ActorRef, tag: &str, now_ms: i64) -> RunId {
        let session = accepted(
            create_session(
                store,
                context(actor, &format!("idem:jan:{tag}:create"), now_ms),
                session_request(&format!("Janitor session {tag}")),
            )
            .unwrap(),
        );
        accepted(
            start_prompt_turn(
                store,
                context(actor, &format!("idem:jan:{tag}:turn"), now_ms),
                session.session_id.clone(),
                turn_request("A prompt whose driver dies."),
            )
            .unwrap(),
        )
        .run_id
        .clone()
        .unwrap()
    }

    #[test]
    fn janitor_reaps_a_stale_active_run_once_and_spares_a_fresh_one() {
        let (_dir, _path, mut store) = temp_store();
        let owner = actor();
        register_actor(&mut store, &owner);
        let stale_run = active_run_at(&mut store, &owner, "stale", 100);
        let fresh_run = active_run_at(&mut store, &owner, "fresh", 90_000_000);

        let report = janitor_sweep(&mut store, 100 + STALE + 1, &janitor_config(16));
        assert_eq!(
            report.reaped_runs, 1,
            "only the stale run reaps: {report:?}"
        );
        assert!(report.duty_errors.is_empty(), "{report:?}");

        let stale = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.sessions().run(&stale_run)
            })
            .unwrap()
            .unwrap();
        assert_eq!(stale.status, RunStatus::Failed);
        assert!(
            stale
                .failure_reason
                .as_deref()
                .unwrap()
                .starts_with("abandoned"),
            "distinct abandoned reason: {:?}",
            stale.failure_reason
        );
        let fresh = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.sessions().run(&fresh_run)
            })
            .unwrap()
            .unwrap();
        assert_eq!(fresh.status, RunStatus::Active, "a fresh run is untouched");

        // Exactly ONE run.completed for the reaped run, and a re-sweep changes nothing.
        let completed = event_kinds(&mut store)
            .iter()
            .filter(|kind| kind.as_str() == "run.completed")
            .count();
        assert_eq!(completed, 1);
        let again = janitor_sweep(&mut store, 100 + STALE + 2, &janitor_config(16));
        assert_eq!(again.reaped_runs, 0, "terminal runs replay as no-ops");
        let completed_again = event_kinds(&mut store)
            .iter()
            .filter(|kind| kind.as_str() == "run.completed")
            .count();
        assert_eq!(completed_again, 1, "no duplicate completion event");
    }

    #[test]
    fn janitor_reap_promotes_the_queued_turn() {
        let (_dir, _path, mut store) = temp_store();
        let owner = actor();
        register_actor(&mut store, &owner);
        let session = accepted(
            create_session(
                &mut store,
                context(&owner, "idem:jan:promote:create", 100),
                session_request("Janitor promotion session"),
            )
            .unwrap(),
        );
        accepted(
            start_prompt_turn(
                &mut store,
                context(&owner, "idem:jan:promote:turn1", 110),
                session.session_id.clone(),
                turn_request("First prompt, abandoned."),
            )
            .unwrap(),
        );
        let queued = accepted(
            start_prompt_turn(
                &mut store,
                context(&owner, "idem:jan:promote:turn2", 120),
                session.session_id.clone(),
                turn_request("Second prompt, waiting."),
            )
            .unwrap(),
        );
        assert_eq!(queued.status, "queued");

        let report = janitor_sweep(&mut store, 120 + STALE + 1, &janitor_config(16));
        assert_eq!(report.reaped_runs, 1, "{report:?}");
        assert_eq!(
            report.promoted_turns, 1,
            "the queued turn promotes: {report:?}"
        );
        let kinds = event_kinds(&mut store);
        assert!(
            kinds.iter().rev().take(2).any(|kind| kind == "run.started"),
            "promotion emits run.started: {kinds:?}"
        );
        let snapshot = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.sessions().snapshot(&session.session_id, None)
            })
            .unwrap();
        assert!(snapshot.queued_turn_ids.is_empty(), "the queue drained");
        assert!(snapshot.active_run.is_some(), "the promoted run is live");
    }

    #[test]
    fn janitor_drives_permission_interrupt_and_lease_expiry() {
        use super::super::super::interrupts::{InterruptKind, RecordInterruptInput};
        use super::super::super::leases::{AcquireLeaseInput, LeasePurpose, LeaseState};
        use super::super::super::model::{InterruptId, ToolCallId};
        use super::super::super::permissions::{
            ToolPermissionQueueState, ToolPermissionRequestInput,
        };
        use super::super::super::policy::OperationMode;
        use super::super::super::tools::SemanticToolName;

        let (_dir, _path, mut store) = temp_store();
        let owner = actor();
        register_actor(&mut store, &owner);

        // A pending human-gated permission with a short window, its gating interrupt, and
        // a short-TTL lease.
        let call_a = ToolCallId::new("call:janitor:a").unwrap();
        let call_b = ToolCallId::new("call:janitor:b").unwrap();
        store
            .with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                for (call, key) in [(&call_a, "idem:jan:perm:a"), (&call_b, "idem:jan:perm:b")] {
                    uow.tool_permissions()
                        .request_permission(ToolPermissionRequestInput {
                            tool_call_id: (*call).clone(),
                            tool: SemanticToolName::ProposeChangeset,
                            scope_id: "worktree".to_string(),
                            requester: owner.clone(),
                            scope_mode: OperationMode::Manual,
                            session_override: None,
                            idempotency_key: key.to_string(),
                            created_at_ms: 100,
                            ttl_ms: Some(50),
                        })?;
                }
                uow.interrupts().record_interrupt(RecordInterruptInput {
                    interrupt_id: InterruptId::new("interrupt:janitor:b").unwrap(),
                    run_id: RunId::new("run:janitor:b").unwrap(),
                    kind: InterruptKind::ToolPermission,
                    tool_call_id: Some(call_b.clone()),
                    proposal_id: None,
                    idempotency_key: "idem:jan:int:b".to_string(),
                    created_at_ms: 100,
                })?;
                uow.leases().acquire_lease(AcquireLeaseInput {
                    scope_id: "scope:janitor:lease".to_string(),
                    purpose: LeasePurpose::WholeDocument,
                    holder: owner.clone(),
                    idempotency_key: "idem:jan:lease".to_string(),
                    created_at_ms: 100,
                    ttl_ms: Some(50),
                })?;
                Ok(())
            })
            .unwrap();

        let report = janitor_sweep(&mut store, 100 + STALE + 1, &janitor_config(16));
        assert!(report.duty_errors.is_empty(), "{report:?}");
        assert!(
            report.expired_permissions >= 1,
            "the pending permission sweep drives expiry: {report:?}"
        );
        assert_eq!(
            report.expired_leases, 1,
            "the held lease expires: {report:?}"
        );

        // Every pending record ends Expired regardless of which duty reached it first —
        // the interrupt-side duty drives the SAME transition as the direct sweep.
        store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                for call in [&call_a, &call_b] {
                    let record = uow.tool_permissions().latest_for_tool_call(call)?.unwrap();
                    assert_eq!(record.queue_state, ToolPermissionQueueState::Expired);
                }
                let lease = uow.leases().current("scope:janitor:lease")?.unwrap();
                assert_eq!(lease.state, LeaseState::Expired);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn janitor_backstop_never_double_compacts_and_stays_bounded_under_backlog() {
        let (_dir, _path, mut store) = temp_store();
        let owner = actor();
        register_actor(&mut store, &owner);

        // Backlog: three stale runs against a budget of two — the sweep reaps only its
        // budget, says so, and the next sweep finishes the remainder.
        for (tag, at) in [("b1", 100), ("b2", 200), ("b3", 300)] {
            active_run_at(&mut store, &owner, tag, at);
        }
        let first = janitor_sweep(&mut store, 300 + STALE + 1, &janitor_config(2));
        assert_eq!(first.reaped_runs, 2, "budget-bounded: {first:?}");
        assert!(
            first.budget_exhausted.contains(&"run_reap"),
            "the report names the exhausted duty: {first:?}"
        );
        // The compaction backstop ran as a pure no-op on a store whose per-turn path owns
        // every compactable record — never a second compaction of the same due set.
        assert_eq!(first.backstop_compacted, 0, "{first:?}");

        let second = janitor_sweep(&mut store, 300 + STALE + 2, &janitor_config(2));
        assert_eq!(
            second.reaped_runs, 1,
            "the remainder reaps next sweep: {second:?}"
        );
        assert_eq!(
            second.backstop_compacted, 0,
            "still nothing due: {second:?}"
        );
    }
}
