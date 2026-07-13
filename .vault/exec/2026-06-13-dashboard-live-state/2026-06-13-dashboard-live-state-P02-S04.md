---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Extend deriveInputs to read injected live signals for streamLost and brokenLinkCount, keeping it pure

## Scope

- `frontend/src/app/degradation/matrix.ts`

## Description

- Extended `deriveInputs` to take an optional `LiveSignals` argument
  (`streamConnected`, `brokenLinkCount`) and replaced the two hardwired literals:
  `streamLost` now derives from `streamConnected === false` (an explicit disconnect, not
  the initial null), and `brokenLinkCount` passes the injected count through.
- Kept the function pure - the signals are parameters, so the matrix stays fully
  testable and the `app/degradation` layer owns the surface mapping (ADR D4).

## Outcome

The two dead degradation rows (GUI finding 036) now derive from real state. 3 new tests
cover the streamLost null/true/false rule, the brokenLinkCount passthrough, and the
end-to-end `broken-highlighted` stage state; the existing 9 matrix tests stay green
(backward-compatible default-empty signals).

## Notes

The default `live = {}` preserves every existing caller's behavior (streamLost false,
brokenLinkCount 0) until the surface-states hook injects the real signals. No scaffolds
left.
