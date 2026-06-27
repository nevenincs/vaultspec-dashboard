---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S13'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# integrate the graphology ForceAtlas2 web worker with warm-start and local-perturbation re-layout per G3.e, using Vite worker imports per the foundation report rider

## Scope

- `frontend/src/scene/field/layoutWorker.ts`

## Description

- Add `frontend/src/scene/field/fa2.worker.ts`: the worker body running
  graphology's synchronous ForceAtlas2 (inferred settings, Barnes-Hut) in
  timed tick batches, posting position frames back as transferable
  Float32Arrays; handles init/start/stop/change messages.
- Add `frontend/src/scene/field/layoutWorker.ts`: the typed worker protocol,
  the `FieldLayout` main-thread wrapper (injectable `WorkerLike` for tests),
  and the pure `seedPositions` warm-start function.
- Implement warm-start + local perturbation per G3.e: known positions (the
  S08 cache or the contract `seedPosition` hint) pass verbatim; new nodes
  seed at their positioned neighbors' centroid plus jitter; unconnected new
  nodes seed near the field centroid; cold start scatters within a fixed
  radius. `applyChanges` seeds only added nodes - the existing field never
  reflows globally.
- Spawn via the Vite-native worker URL pattern
  (`new Worker(new URL("./fa2.worker.ts", import.meta.url))`) per the
  foundation report rider, replacing the library's inline-blob worker.
- Add `frontend/src/scene/field/layoutWorker.test.ts` covering all four
  seeding priorities, init message assembly with warm-start applied,
  position fan-out with latest-frame snapshot, change-message local
  perturbation, and worker teardown.

## Outcome

The layout runs off the main thread with mental-map preservation as the
contract: warm starts verbatim, perturbation local, reflow never global.
Gates green: typecheck, eslint, vitest (71 passed), prettier; production
build passes.

## Notes

Fixed per audit finding fa2-init-collision-006: init now guards duplicate
edge ids exactly like change does, logging a diagnostic instead of dying
silently on a malformed keyframe.

The rider's production-bundle worker verification is half-done: the build is
green, but no app-entry code reaches `createFa2Worker` yet, so Vite emits no
worker chunk to inspect. Re-verify the emitted worker chunk when S21 mounts
the stage and the field becomes reachable from the entry - noted as a P03
boundary item.
