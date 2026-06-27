---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement trackNode screen-space anchor subscriptions driven by camera and layout updates per G6.a

## Scope

- `frontend/src/scene/field/anchors.ts`

## Description

- Add `frontend/src/scene/field/anchors.ts`: `AnchorDriver` recomputing
  tracked nodes' screen-space anchors from injected sources (the seam's
  tracked-id registry, layout positions, the camera projection and scale)
  and dispatching through the seam's `emitAnchor`.
- Dispatch discipline per RL-4: anchors fire only on actual change
  (epsilon-compared), a node leaving the stage dispatches null exactly
  once, and memoized anchors for untracked ids are dropped so a re-track
  starts fresh - per-frame polling never crosses into React.
- Add the renderer-side `trackedNodeIds()` registry read to
  `frontend/src/scene/sceneController.ts`, alongside the existing
  renderer-side `emitAnchor` dispatch (same RL-4 facet of the seam).
- Add `frontend/src/scene/field/anchors.test.ts` covering projection with
  scale, change-only dispatch, leave-stage null dispatch, and re-track
  memo reset.

## Outcome

The hybrid pattern's bridge exists: islands can subscribe to a node and
receive its screen anchor on camera and layout motion only when it moves.
Gates green: typecheck, eslint, vitest (76 passed), prettier.

## Notes

The driver's `update()` is called by the field assembly on camera change
and on each layout position frame (S21 wiring); nothing here ticks on its
own.
