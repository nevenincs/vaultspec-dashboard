---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S04'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# lock the SceneController command, event, and anchor surface with the RL-1 to RL-5 fold confirmed as final

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Re-verify the folded shapes against the contract before locking:
  `SceneEdgeData` mirrors the contract edge fields, `SceneNodeData` the node
  fields, `SceneDelta` the ordered delta-log entry shape with the single
  monotonic sequence clock shared by the diff endpoint and the graph SSE
  channel.
- Declare the seam locked in `frontend/src/scene/sceneController.ts`:
  replace the foundation's "NOT locked" header with the lock statement
  naming the S03 verdict and the surface-change discipline (ADR-flagged
  redlines only from here on).
- Fold RL-5c at lock time: add `expand` and `pin` to the `SceneEvent` union
  (a locked seam cannot carry an "open by design" event set) and add the
  matching `set-pinned` command so pin layout-fixing (G5.d) is expressible
  without a future surface change.
- Extend `frontend/src/scene/sceneController.test.ts` to cover the locked
  event union and the new command.

## Outcome

The SceneController command, event, and anchor surface is locked: commands
in (`set-data`, `apply-deltas`, `focus-node`, `set-visibility`, `set-time`,
`set-pinned`), events out (`hover`, `select`, `open`, `expand`, `pin`),
anchors via `trackNode` subscription, lifecycle via `mount`/`resize`/
`destroy`. RL-1 (renderer owns positions; `seedPosition` is a warm-start
hint only), RL-2 (contract edge shape with tier, confidence, structural
state), RL-3 (one delta shape for diff and live stream), RL-4 (anchor
subscription, no polling), RL-5a (scene receives computed visibility
membership, never filter semantics) are all final as folded. Gates green:
typecheck, eslint, vitest (15 passed), prettier.

## Notes

Two additions were made at lock time beyond the foundation scaffold, both
inside RL-5c's anticipated growth: the `expand`/`pin` events and the
`set-pinned` command. Flagged to experience-architect in the P01
phase-boundary review request for confirmation; if redlined, the edit is
cheap now and expensive after W01.P03 builds the field against it.
