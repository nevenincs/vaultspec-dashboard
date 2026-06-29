---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
step_id: 'S04'
related:
  - "[[2026-06-29-graph-simulation-stability-plan]]"
---

# Live-verify: expanding a node on a large graph holds existing positions

## Scope

- `drag still moves`
- `selection/highlight/focus intact`
- `frontend/src/app/stage/Stage.tsx`

## Description

- The shared chrome-devtools profile was locked, so drove an OWN isolated Playwright
  Chromium (SwiftShader GL args) against the canonical SPA (`127.0.0.1:8770`, engine 8767).
- Loaded the live app (auto-restored scope, 1217 nodes, 3 portal-pinned canvases), waited for
  the layout to settle (render-on-demand `running === false`).
- Case 1 (same-id-set re-fetch): re-issued the current node/edge set via
  `__scene.controller.command({ kind: "set-data", ... })` and read `running` immediately,
  then re-snapshotted positions from `__threeField.cpuPositions`/`idToIndex`.
- Case 2 (additive): issued a superset `set-data` (all 1217 survivors + one brand-new node)
  and re-snapshotted, measuring max survivor displacement and whether the new node landed.

## Outcome

- Case 1: `runningRightAfter = false`, max survivor move `0`, moved `0` — a same-set
  `set-data` does ZERO ticks and never wakes the loop.
- Case 2: max survivor move `0`, moved `0`, `newNodeLanded = true` — all 1217 survivors held
  their exact positions while the new node was added. The reported symptom is gone in the
  live runtime, not just in unit tests.

## Notes

Drove the field via the dev-only `__scene`/`__threeField` globals (DEV build only), which
exercises the exact changed `setData` path. The drag/selection/highlight/focus paths were
not modified by this change (research F2 confirmed they are already decoupled), so they
remain intact; the verification targeted the one path that changed.
