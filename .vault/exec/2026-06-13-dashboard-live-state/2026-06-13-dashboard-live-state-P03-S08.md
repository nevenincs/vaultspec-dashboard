---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S08'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---




# Add the live e2e for the stream-lost degraded surface and live reactivity

## Scope

- `frontend/e2e/adverse.spec.ts`

## Description

- Added a live-state e2e to the adverse spec (dev server + mock engine): boot, assert
  no `RECONNECTING` and no white screen, flip the stores-owned live-connection signal to
  lost via the dev-exposed store, then assert the timeline renders the designed
  `RECONNECTING` degraded surface and the app boundary never fired.

## Outcome

6 live tests pass in chromium (5 platform + this live-state case). The stream-lost
degradation truth is proven end to end against the running app: a lost stream is a
designed degraded state, not a crash and not a silent swallow.

## Notes

The manual signal flip is deterministic because the graph-sync hook only re-asserts
connection on a stream-status change (its effect deps), not on the store value. A real
`StreamLostError` reaches the same surface through the policy bind; the live
constellation delta animation and live push-driven reactivity remain engine-blocked
(S50) and are unit-covered, not faked in the e2e.
