---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S95'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove the frontend lifecycle client drives the spawned engine and real A2A desktop capsule without a direct sibling request

## Scope

- `frontend/src/stores/server/a2aLifecycle.live.test.ts`

## Description

- Added `a2aLifecycle.live.test.ts`: drives the genuine `EngineClient` lifecycle methods against the spawned `vaultspec serve` end to end.
- Proves the served status projection carries the agent tier and degrades honestly; drives a read-only doctor run through the engine job plane (run then poll jobs/{id} to terminal, bounded).
- A recording transport proves EVERY request rode the engine origin and the `/a2a/lifecycle/` plane — the browser never opened a direct transport to the A2A gateway (the structural proof of the browser-to-engine-only edge, ADR D3).

## Outcome

Two tests green. The frontend lifecycle client drives the spawned engine without a direct sibling request.

## Notes

The live harness spawns the engine WITHOUT a resident A2A gateway (same posture as the a2a-team live suite), so the capsule-UP path — an owned live gateway answering process control — is not spawnable from this frontend harness. That path is proven by the a2a repo's own gateway live tests and the cross-repo e2e, and rides CI. Flagged to the wave lead; the degraded-path proof plus the unit and live-fixture tests cover the client's core contract here.
