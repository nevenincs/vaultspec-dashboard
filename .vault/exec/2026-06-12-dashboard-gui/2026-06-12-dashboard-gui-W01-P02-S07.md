---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement set-visibility membership diffs with d3-interpolator fade transitions per G3.f

## Scope

- `frontend/src/scene/visibility.ts`

## Description

- Add `frontend/src/scene/visibility.ts`: `VisibilityTracker`, one instance
  per entity class (nodes, edges), diffing each new visibility membership
  against the current one per RL-5a - the scene receives computed
  membership from the locked `set-visibility` command, never filter
  semantics.
- Animate the diff with d3 interpolators (`interpolateNumber` under
  `easeCubicOut`) over the 200ms band gui-spec motion rules set: entering
  ids fade 0 to 1, leaving ids fade 1 to 0 and drop from the sample once
  settled; mid-transition retargeting starts from current progress so rapid
  filter changes never snap.
- Surface `hiddenCount` for the filter bar's "N hidden" chip and expose a
  single per-id progress channel renderers map onto alpha and scale (fade
  AND shrink per G3.f).
- Add `frontend/src/scene/visibility.test.ts` covering fade-in, fade-out
  with settled drop, mid-transition retargeting, settled steady-state, and
  hidden counting.

## Outcome

Filter application is now an animated membership diff in the scene layer,
decoupled from filter semantics. Gates green: typecheck, eslint, vitest
(32 passed), prettier.

## Notes

This record's body was clobbered in the shared worktree between authoring
and staging (commit 9595f7f shipped the code without it); re-authored and
committed separately. Staging discipline tightened per team-lead's policy.

