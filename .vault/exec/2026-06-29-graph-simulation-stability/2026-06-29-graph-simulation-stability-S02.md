---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
step_id: 'S02'
related:
  - "[[2026-06-29-graph-simulation-stability-plan]]"
---

# Add a solver test asserting an additive setData pins survivors (no movement) and a no-new-node setData runs zero ticks

## Scope

- `frontend/src/scene/three/d3ForceSolver.test.ts`

## Description

- Added a `D3ForceSolver` describe block ("additive update pins survivors") with two tests:
  one asserting a no-new-node `prewarmReflow(() => false)` returns 0 ticks, stays settled,
  moves nothing, and leaves survivors pinned; one asserting that with a subset marked new
  (seeded far off), survivors do not move (< 1e-3) while at least one new node relaxes back
  (> 1 unit) and the field re-settles.
- Formatted the file with prettier to satisfy the gate.

## Outcome

20/20 solver tests pass (18 pre-existing + 2 new). The additive-pins-survivors discipline
now has explicit, white-box coverage at the solver layer.

## Notes

No `prewarmReflow` coverage existed before; this adds it directly rather than asserting only
through the field (which needs WebGL).
