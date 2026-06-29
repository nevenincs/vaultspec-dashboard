---
tags:
  - '#plan'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
tier: L1
related:
  - '[[2026-06-29-graph-simulation-stability-adr]]'
  - '[[2026-06-29-graph-simulation-stability-research]]'
---

# `graph-simulation-stability` plan

Make the settled graph static unless dragged: pin survivors and relax only new nodes on every additive `set-data`.

## Description

Implements the accepted ADR. The single load-bearing change is in the three.js field's
`setData` (`frontend/src/scene/three/threeField.ts`): collapse the `warm && reflow`
special-case so EVERY warm path pins carried survivors and relaxes ONLY genuinely-new
nodes via the existing `D3ForceSolver.prewarmReflow`, while the cold path (disjoint
corpus) keeps the full `prewarm` plus the one-time camera fit. The warm-vs-cold gate is
unchanged. This removes the reported symptom (opening/expanding a node, a live delta, or a
same-scope re-fetch reshapes the settled layout) at its source, reusing a discipline
already proven on the filter-reflow path. The collide-annealing fixed-point idea is
rejected (d3-force is an annealer, not a minimizer) and `positionCache` wiring is deferred.
A solver-level test asserts the additive path pins survivors and does zero ticks when
nothing is new; live verification confirms a large graph stays still on expansion.

## Steps

- [x] `S01` - Unify the warm-start dispatch so every warm path pins survivors and relaxes only new nodes via prewarmReflow; `frontend/src/scene/three/threeField.ts`.
- [x] `S02` - Add a solver test asserting an additive setData pins survivors (no movement) and a no-new-node setData runs zero ticks; `frontend/src/scene/three/d3ForceSolver.test.ts`.
- [x] `S03` - Run the full frontend gate (just dev lint frontend) and the test suite to exit 0; `frontend/`.
- [x] `S04` - Live-verify: expanding a node on a large graph holds existing positions; `drag still moves; selection/highlight/focus intact; `frontend/src/app/stage/Stage.tsx`.
## Parallelization

Steps are sequential: the field change (S01) must land before its test (S02), and both
before the gate (S03) and live verification (S04).

## Verification

- `S01` lands the warm-path unification in `setData`; an additive (superset) `set-data`
  pins survivors and a same-id-set `set-data` does zero ticks.
- `S02` adds a solver/field-level test that asserts survivors do not move on an additive
  update and that a no-new-node update runs zero ticks; the test is green.
- `S03` `just dev lint frontend` is exit 0 (eslint + prettier + tsc) and the frontend test
  suite passes.
- `S04` live verification at the canonical dev server: open/expand a node on a large graph
  and confirm the existing nodes hold their positions (only new ego nodes appear/relax),
  while a drag still moves nodes and selection/highlight/focus still work.
