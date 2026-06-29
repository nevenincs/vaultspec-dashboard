---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
step_id: 'S01'
related:
  - "[[2026-06-29-graph-simulation-stability-plan]]"
---

# Unify the warm-start dispatch so every warm path pins survivors and relaxes only new nodes via prewarmReflow

## Scope

- `frontend/src/scene/three/threeField.ts`

## Description

- Collapsed the `warm && reflow` special-case in `setData` so EVERY warm path routes through
  `prewarmReflow((i) => !prevPos.has(nodes[i].id), WARM_START_ALPHA)` — pinning carried
  survivors and relaxing only genuinely-new nodes.
- Changed the cold branch to a plain `prewarm()` (full energy + the existing one-time
  `fitToView`); the warm-vs-cold gate (`carried >= 0.5 × n` for a data update, `carried > 0`
  for a filter reflow) is unchanged, so `reflow` still drives the gate.
- Rewrote the explanatory comment to state the new invariant: the settled layout is
  authoritative; an additive change never re-simulates a settled node, and a same-id-set
  update does zero ticks.

## Outcome

The plain warm-start `prewarm` that `wakeAllFree()`d the whole graph (releasing the
frozen-not-converged tension on every ego expansion / live delta / re-fetch) is gone. An
additive `set-data` now pins survivors; survivors move only by an explicit drag.

## Notes

The `reflow` parameter is retained — it still selects the warm gate threshold; only the
prewarm dispatch was unified. No `SceneController`/solver surface change (field-internal).
