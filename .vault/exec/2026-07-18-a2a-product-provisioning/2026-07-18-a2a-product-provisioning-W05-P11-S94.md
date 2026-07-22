---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S94'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove status interpretation, cold readiness, foreign immutability, job settlement, query invalidation, and bounded polling from production store functions

## Scope

- `frontend/src/stores/server/a2aLifecycle.test.ts`

## Description

- Added `a2aLifecycle.test.ts` proving `deriveA2aLifecycleView` interpretation from spec-derived inputs: absent (install-only), cold-worker gateway-ready (still service-ready, process control offered), installed-stopped (start not stop), foreign-immutable (unavailable read from tiers.agent), recovery-required (degraded, repair+doctor only), busy (doctor only), and the unread/unknown state.
- Added live-wire hook tests: `useA2aLifecycleStatus` reads a conformant projection carrying the agent tier; a doctor run polls to a terminal state through `useA2aLifecycleJob`, polling stops (fetchStatus idle), and the settlement invalidates the mounted status query (dataUpdatedAt advances).

## Outcome

Nine tests green. Expected values are derived strictly from the ADR state model, never copied from run output. The bounded-polling, job-settlement, and query-invalidation semantics are proven from the production store functions against the real engine.

## Notes

Initial live test had a waitFor that resolved while the job query data was still undefined (`undefined !== "running"`); tightened the predicate to require a defined, terminal state.
