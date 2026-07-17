---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Consume run.completed in the frontend lifecycle adapter with terminal-aware invalidation and render the Done turn status from the wire, with live-wire tests

## Scope

- `frontend/src/stores/`

## Description

- Route the new run.completed lifecycle event through the agent shared-feed adapter. The run aggregate was already claimed, so the delta is terminal-aware invalidation: add isTerminalRunLifecycleEvent classifying run.completed, run.cancelled, and run.failed as settled.
- Give invalidateAgentSessions an includeInactive option that maps to the react-query refetchType: an in-flight event refreshes only active on-screen caches, a terminal event refetches even an inactive backgrounded session detail so the settled snapshot lands durably.
- Confirm the transcript already renders the Done turn status verbatim from the served run status (completed maps to the Done word, live collapses to false); no component change was needed beyond proving it.
- Add real react-query (no-mock) adapter tests: a terminal run.completed refetches an inactive session detail while an in-flight run.started does not, plus isTerminalRunLifecycleEvent classification.
- Add a wire-shaped synthetic-snapshot render test (through the real tolerant adapter) proving a completed run collapses the streaming chrome and renders Done.

## Outcome

Frontend adapter and view now consume run.completed end to end at the store layer: a terminal run event lands the settled snapshot on the open session, and the transcript renders Done from the wire. Frontend typecheck (tsc -b) and eslint pass; the agent lifecycle suite (12 tests, including the 5 new) and the Transcript render suite (14 tests, including the 2 new Done tests) pass against the live engine the global setup spawns. Landed on dashboard main as a frontend-only commit, outside the foreign engine-crate refactor blast radius.

## Notes

RESOLVED at the reconciliation gate: dashboard main independently adopted the run.completion routes (run.completed settle + POST complete callback), so the previously parked live proof now runs GREEN against main's own binary - no merge needed. agentRunCompletion.live.test.ts (2 tests: a real run driven through the settle reads back completed, active=false, no active_run, session active, reconciling to the Done precondition; idempotent re-complete no-op) landed on main. Step closed as delivered. No skips.
