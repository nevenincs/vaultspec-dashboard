---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:220ac1a6d04b43721883d0bc3709151f937cb7f3f546c4d0329ab72e8962fa66'
step_id: 'S02'
related:
  - "[[2026-09-05-graph-simulation-stability-plan]]"
---

# Engineer and verify correctness-preserving graph simulation performance with pinned-region pruning, update reuse, overload scheduling and reproducible measurements

## Scope

- `frontend`

## Changes

- `M` `frontend/src/app/left/AddProjectDialog.tsx`
- `M` `frontend/src/app/left/AddProjectDialog.localization.test.tsx`
- `M` `frontend/src/scene/field/categoryColor.ts`
- `M` `frontend/src/scene/field/tokenReads.test.ts`
- `M` `frontend/src/scene/field/tokenReads.ts`
- `M` `frontend/src/scene/three/appearance.ts`
- `M` `frontend/src/scene/three/d3ForceMass.ts`
- `M` `frontend/src/scene/three/d3ForceSolver.ts`
- `M` `frontend/src/scene/three/graphControlSchema.test.ts`
- `M` `frontend/src/scene/three/graphControlSchema.ts`
- `M` `frontend/src/scene/three/symmetricManyBody.test.ts`
- `M` `frontend/src/scene/three/symmetricManyBody.ts`
- `M` `frontend/src/scene/three/threeField.clock.test.ts`
- `M` `frontend/src/scene/three/threeField.lifecycle.test.ts`
- `M` `frontend/src/scene/three/threeField/config.ts`
- `M` `frontend/src/scene/three/threeField/data.ts`
- `M` `frontend/src/scene/three/threeField/gpuResources.ts`
- `M` `frontend/src/scene/three/threeField/simulation.ts`
- `M` `frontend/src/scene/three/threeField/simulationClock.ts`
- `M` `frontend/src/scene/three/threeField/state.ts`
- `A` `frontend/dev/performance/graphFixtures.ts`
- `A` `frontend/dev/performance/graphHarness.ts`
- `A` `frontend/dev/performance/pairedKernels.ts`
- `A` `frontend/dev/tooling/graph-performance.ts`
- `A` `frontend/src/scene/three/compatibleSceneUpdate.ts`
- `A` `frontend/src/scene/three/d3ForceMass.pruning.test.ts`
- `A` `frontend/src/scene/three/threeField.reuse.test.ts`
- `verify:` `just test frontend` -> `pass`
