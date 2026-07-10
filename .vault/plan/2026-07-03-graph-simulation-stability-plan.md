---
tags:
  - '#plan'
  - '#graph-simulation-stability'
date: '2026-07-03'
modified: '2026-07-03'
tier: L1
related:
  - '[[2026-07-03-graph-simulation-stability-reference]]'
  - '[[2026-06-29-graph-simulation-stability-adr]]'
  - '[[2026-06-29-graph-simulation-stability-research]]'
---
# `graph-simulation-stability` plan

- [x] `S01` - Add the render-time position lerp: display buffer eased toward solver positions (~0.1/frame while simulating, dragged node exempt, snap on settle/data-swap/reduced-motion) feeding the GPU texture, overlays, and picking; `frontend/src/scene/three/threeField.ts`.
- [x] `S02` - Retune the canonical schema: collideStrength 0.8 to 0.35 and alphaDecay 0.05 to 0.03 per the reference audit; `update schema guard tests; `frontend/src/scene/three/graphControlSchema.ts`.
- [x] `S03` - Fix frame-rate-dependent sim speed with a bounded fixed-timestep accumulator (up to 3 catch-up ticks per frame at a 60Hz target) so anneal/stall budgets hold in wall-clock terms on slow renderers; `frontend/src/scene/three/threeField.ts`.
- [x] `S04` - Verify: solver and scene suites green, full frontend gate, live headless smoothness check; `frontend/src/scene/ + just dev lint frontend`.

## Description

## Steps

## Parallelization

## Verification
