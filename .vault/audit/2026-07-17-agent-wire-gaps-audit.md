---
tags:
  - '#audit'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
related:
  - '[[2026-07-17-agent-wire-gaps-adr]]'
  - '[[2026-07-17-agent-wire-gaps-plan]]'
---

# `agent-wire-gaps` audit: `P01 run lifecycle, cancel semantics, and queued-turn review`

## Scope

Independent code review of the P01 commit (run outcome enum, run-scoped cancel,
explicit session cancel, queued-turn primitive, v21 migration, frontend Stop
cutover; commit `1653b4b85d` plus the revision commits closing its findings)
against the ADR's D1/D2 as amended and the plan's P01 verification scenarios.
Reviewer: independent Sonnet persona; two passes (initial + revision re-check).

## Findings

### promotion-atomicity | low | Verified sound — promotion is genuinely inside the terminal unit of work

`Store::with_unit_of_work` wraps each command in one rusqlite transaction;
`complete_run`/`cancel_run` call `promote_next_queued_turn` inside that same
closure, and the crash-injection test proves an injected failure between settle
and promote rolls back BOTH. Not a finding against the code — recorded because
the reviewer verified the actual transaction plumbing rather than test names.

### queue-void | low | Verified sound — no path promotes into a cancelled session

`cancel_session` voids queued turns in the same unit of work and never
promotes; `promote_next_queued_turn` independently re-checks session liveness;
voided turns are excluded from promotion and `queued_turn_ids` by the bounded
`queue_state` vocabulary.

### owner-forgery | low | Verified sound — typed 403 before any state change

`authorize_run_owner` (owner or delegator) runs before mutation; an early error
rolls back even the idempotency reservation, so a forbidden attempt persists
nothing.

### missing-failure-reason-bounds-test | medium | CLOSED — bounds now exercised

`validate_failure_reason` had no test of its actual bounds. Closed by
`failure_reason_bounds_reject_empty_padded_and_oversized`: empty, padded, and
oversized reasons rejected; the 500-byte maximum accepted; the run untouched by
rejected attempts.

### missing-delegation-positive-test | medium | CLOSED — delegator branch proven

Only the forbidden path of the owner guard was tested. Closed by
`a_delegator_may_complete_its_delegated_agents_run`: a delegator legitimately
completes its delegated agent's run; session stays active.

### missing-live-stop-path-test | medium | CLOSED — live wire proof landed

The plan's named "Stop leaves the session Active and the conversation
continues" live scenario had no test. Closed by
`stopPath.live.test.ts` (commit `38bdecebe5`) against the real spawned engine:
run cancel leaves the session active with no active run; the SAME session
accepts the next turn as a direct start.

### resume-run-untested | low | OPEN backlog — `resume_run` has no test anywhere

The run-level resume (`POST /v1/runs/{run_id}/resume`) is called by no test in
the authoring crate; the coverage previously believed adjacent
(`interrupt_resume_route_resolves_by_id_and_replays`, and the
`resume_interrupt` owner-floor hardening) exercises the same-named but distinct
interrupt-resume command. Pre-existing recovery-path surface, not new D1/D2
behavior — non-blocking, filed as follow-up.

### p04a-janitor-review | low | APPROVED after one revision round — single-janitor posture verified end to end

Independent review of the P04a background janitor (base commit plus the
revision commit). Verified by code trace: one background task, serve-spawned
only, abort-on-drop, `janitor_sweep` directly testable; the abandoned-run reap
skips the owner guard deliberately and its only call site is the in-process
sweep (unreachable from any route); reap + `run.completed` + queued-turn
promotion share one unit of work with an exactly-once event proof; the
interrupt duty honestly drives the gating permission's existing lazy expiry
rather than inventing interrupt-record state; the compaction backstop reuses
the per-turn `compact_due` with no second ownership; the `system` actor kind
was already a safe frontend fallback. Two interim findings — `budget_exhausted`
honesty missing for four of five duties, and a tautological backstop test
(nothing was compaction-due within the test's 30-minute horizon against the
7-day retention window) — were closed in the revision commit with scanned-row
reporting on every duty and a real two-path backstop proof (owner-compacted →
janitor adds nothing; orphaned due transcript → only the backstop reaches it).

### tree-wide-gate-held | low | OPEN — S13/S59 await the parallel lane's frontend settle

The plan's two tree-wide full-gate steps stay open honestly: the Rust gate is
green across the workspace, but the shared worktree's parallel session has
live frontend WIP (a localization-scan failure in its Composer team-selector
wiring) that fails `just dev lint all` at the tree level. The steps tick when
that lane commits clean.

## Recommendations

- P01 APPROVED after revision re-check; all three named revision scenarios are
  closed with real, non-tautological, passing tests; the full authoring lib
  suite is green.
- Follow-up (non-blocking): add one store-level `resume_run` regression test
  (snapshot returned for a live run; the renamed `resumed` status served on the
  route).
- The tree-wide full-gate step (P01.S13) is held open until the shared
  worktree's parallel-lane churn quiets; the Rust gate and this lane's files
  are individually clean.
