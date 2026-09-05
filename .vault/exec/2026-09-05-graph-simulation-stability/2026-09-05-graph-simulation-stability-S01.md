---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:1f56ea8402784d1eec638677561c45c341e8d7e837caa06d6765e0fe03ef2609'
step_id: 'S01'
related:
  - "[[2026-09-05-graph-simulation-stability-plan]]"
---

# Correct force inertia, frame cadence and unintended host energy entry; verify regression and existing stability contracts

## Scope

- `frontend/src/scene/three`

## Changes

- `M` `.vault/adr/2026-07-03-graph-simulation-stability-adr.md`

- `M` `.vault/index/graph-simulation-stability.index.md`

- `M` `frontend/src/scene/three/d3ForceSolver.ts`

- `M` `frontend/src/scene/three/threeField/config.ts`

- `M` `frontend/src/scene/three/threeField/data.ts`

- `M` `frontend/src/scene/three/threeField/gpuResources.ts`

- `M` `frontend/src/scene/three/threeField/interaction.ts`

- `M` `frontend/src/scene/three/threeField/simulation.ts`

- `M` `frontend/src/scene/three/threeField/state.ts`

- `M` `frontend/src/scene/three/threeField/viewport.ts`

- `A` `.vault/audit/2026-09-05-graph-simulation-stability-force-balance-audit.md`

- `A` `.vault/exec/2026-09-05-graph-simulation-stability/2026-09-05-graph-simulation-stability-S01.md`

- `A` `.vault/plan/2026-09-05-graph-simulation-stability-plan.md`

- `A` `.vault/reference/2026-09-05-graph-simulation-stability-force-balance-reference.md`

- `A` `frontend/src/scene/three/d3ForceMass.test.ts`

- `A` `frontend/src/scene/three/d3ForceMass.ts`

- `A` `frontend/src/scene/three/d3ForceSolver.momentum.test.ts`

- `A` `frontend/src/scene/three/symmetricManyBody.test.ts`

- `A` `frontend/src/scene/three/symmetricManyBody.ts`

- `A` `frontend/src/scene/three/threeField.clock.test.ts`

- `A` `frontend/src/scene/three/threeField.lifecycle.test.ts`

- `A` `frontend/src/scene/three/threeField/simulationClock.ts`

- `verify:` `npx vitest run src/scene/three src/scene/field src/app/viewer/PropertiesPopover.render.test.tsx` -> `pass`
