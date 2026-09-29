---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-09-23'
body_schema: 'body-v2'
body_hash: 'sha256:a82f422107e671c8efa172e0a895291582025bdd5e174fe93be852eb736702aa'
related:
  - "[[2026-06-29-graph-simulation-stability-plan]]"
---

# `graph-simulation-stability` ledger

## Changes

- `S01` `T` `frontend/src/scene/three/threeField.ts`
- `S02` `T` `frontend/src/scene/three/d3ForceSolver.test.ts`
- `S03` `T` `frontend/`
- `S04` `T` `drag still moves`
- `S04` `T` `selection/highlight/focus intact`
- `S04` `T` `frontend/src/app/stage/Stage.tsx`
- `S01` `M` `.vault/adr/2026-07-03-graph-simulation-stability-adr.md`
- `S01` `M` `.vault/index/graph-simulation-stability.index.md`
- `S01` `M` `frontend/src/scene/three/d3ForceSolver.ts`
- `S01` `M` `frontend/src/scene/three/threeField/config.ts`
- `S01` `M` `frontend/src/scene/three/threeField/data.ts`
- `S01` `M` `frontend/src/scene/three/threeField/gpuResources.ts`
- `S01` `M` `frontend/src/scene/three/threeField/interaction.ts`
- `S01` `M` `frontend/src/scene/three/threeField/simulation.ts`
- `S01` `M` `frontend/src/scene/three/threeField/state.ts`
- `S01` `M` `frontend/src/scene/three/threeField/viewport.ts`
- `S01` `A` `.vault/audit/2026-09-05-graph-simulation-stability-force-balance-audit.md`
- `S01` `A` `.vault/exec/2026-09-05-graph-simulation-stability/2026-09-05-graph-simulation-stability-S01.md`
- `S01` `A` `.vault/plan/2026-09-05-graph-simulation-stability-plan.md`
- `S01` `A` `.vault/reference/2026-09-05-graph-simulation-stability-force-balance-reference.md`
- `S01` `A` `frontend/src/scene/three/d3ForceMass.test.ts`
- `S01` `A` `frontend/src/scene/three/d3ForceMass.ts`
- `S01` `A` `frontend/src/scene/three/d3ForceSolver.momentum.test.ts`
- `S01` `A` `frontend/src/scene/three/symmetricManyBody.test.ts`
- `S01` `A` `frontend/src/scene/three/symmetricManyBody.ts`
- `S01` `A` `frontend/src/scene/three/threeField.clock.test.ts`
- `S01` `A` `frontend/src/scene/three/threeField.lifecycle.test.ts`
- `S01` `A` `frontend/src/scene/three/threeField/simulationClock.ts`
- `S01` `verify:` `npx vitest run src/scene/three src/scene/field src/app/viewer/PropertiesPopover.render.test.tsx` -> `pass`
- `S02` `M` `frontend/src/app/left/AddProjectDialog.tsx`
- `S02` `M` `frontend/src/app/left/AddProjectDialog.localization.test.tsx`
- `S02` `M` `frontend/src/scene/field/categoryColor.ts`
- `S02` `M` `frontend/src/scene/field/tokenReads.test.ts`
- `S02` `M` `frontend/src/scene/field/tokenReads.ts`
- `S02` `M` `frontend/src/scene/three/appearance.ts`
- `S02` `M` `frontend/src/scene/three/d3ForceMass.ts`
- `S02` `M` `frontend/src/scene/three/d3ForceSolver.ts`
- `S02` `M` `frontend/src/scene/three/graphControlSchema.test.ts`
- `S02` `M` `frontend/src/scene/three/graphControlSchema.ts`
- `S02` `M` `frontend/src/scene/three/symmetricManyBody.test.ts`
- `S02` `M` `frontend/src/scene/three/symmetricManyBody.ts`
- `S02` `M` `frontend/src/scene/three/threeField.clock.test.ts`
- `S02` `M` `frontend/src/scene/three/threeField.lifecycle.test.ts`
- `S02` `M` `frontend/src/scene/three/threeField/config.ts`
- `S02` `M` `frontend/src/scene/three/threeField/data.ts`
- `S02` `M` `frontend/src/scene/three/threeField/gpuResources.ts`
- `S02` `M` `frontend/src/scene/three/threeField/simulation.ts`
- `S02` `M` `frontend/src/scene/three/threeField/simulationClock.ts`
- `S02` `M` `frontend/src/scene/three/threeField/state.ts`
- `S02` `A` `frontend/dev/performance/graphFixtures.ts`
- `S02` `A` `frontend/dev/performance/graphHarness.ts`
- `S02` `A` `frontend/dev/performance/pairedKernels.ts`
- `S02` `A` `frontend/dev/tooling/graph-performance.ts`
- `S02` `A` `frontend/src/scene/three/compatibleSceneUpdate.ts`
- `S02` `A` `frontend/src/scene/three/d3ForceMass.pruning.test.ts`
- `S02` `A` `frontend/src/scene/three/threeField.reuse.test.ts`
- `S02` `verify:` `just test frontend` -> `pass`
