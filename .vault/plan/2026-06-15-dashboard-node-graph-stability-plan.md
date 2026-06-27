---
tags:
  - '#plan'
  - '#dashboard-node-graph-stability'
date: '2026-06-15'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-15-dashboard-node-graph-stability-adr]]'
  - '[[2026-06-15-dashboard-node-graph-stability-research]]'
---

# `dashboard-node-graph-stability` plan

### Phase `P01` - d3-force solver driver behind the layout seam

Replace the graphology ForceAtlas2 worker with a main-thread d3-force simulation that drives the existing FieldLayout interface, retiring the worker and its dependencies.

- [x] `P01.S01` - Add the d3-force runtime dependency and its types; `frontend/package.json`.
- [x] `P01.S02` - Author the main-thread d3-force FieldLayout driver - composed forces, fixed cooling lifecycle, phyllotaxis cold-seed plus verbatim warm-start, fx/fy pin support, and a finite-coordinate guard on emitted frames; `frontend/src/scene/field/forceLayout.ts`.
- [x] `P01.S03` - Define the Obsidian-knob LayoutParams type and map each knob onto its d3 force as the driver's tunable surface; `frontend/src/scene/field/forceLayout.ts`.
- [x] `P01.S04` - Retire the ForceAtlas2 worker and its convergence module, drop the graphology dependencies, and repoint LayoutParams importers to the new driver; `frontend/src/scene/field/fa2.worker.ts`.

### Phase `P02` - Render-loop hardening: camera, gating, pinning, robustness

Make the per-frame render loop in the field assembly rock-solid: fit the camera once on settle then hand it to the user, gate per-frame work on the simulation clock, pin at the solver, and guard the tick and listener bodies.

- [x] `P02.S05` - Replace the per-frame camera snap with a one-shot animated fit on first settle that then disarms auto-fit, re-arming only on a new slice; `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `P02.S06` - Gate the per-frame overlay, hit-index, and edge-mesh work on actual movement so it ceases when the simulation freezes; `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `P02.S07` - Route set-pinned to solver-level fx/fy pinning and remove the pinned-position display-overwrite of the authoritative frame; `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `P02.S08` - Wrap the position-listener and ticker bodies so one throwing consumer cannot kill the loop, and close the async mount/destroy race; `frontend/src/scene/field/fieldAssembly.ts`.

### Phase `P03` - Control surface: the Obsidian knob set

Replace the ForceAtlas2 parameter vocabulary with the Obsidian knob set across the scene controller command and the AlgorithmPanel UI.

- [x] `P03.S09` - Update the set-layout-params and layout-changed command surface and getLayoutState to the Obsidian LayoutParams vocabulary; `frontend/src/scene/sceneController.ts`.
- [x] `P03.S10` - Rebuild the layout panel sliders to Repel, Link force, Link distance, and Center with the new defaults and reset target; `frontend/src/app/stage/AlgorithmPanel.tsx`.

### Phase `P04` - Tests, scope-fence verification, and the full gate

Port the worker-oriented layout tests to the d3-force driver, add render-loop and scope-fence coverage, and bring the full frontend lint and test gate green.

- [x] `P04.S11` - Author the d3-force driver tests - warm-start and phyllotaxis seeding, cooling settle-then-freeze, finite-guard, and fx/fy pinning - replacing the retired worker and convergence tests; `frontend/src/scene/field/forceLayout.test.ts`.
- [x] `P04.S12` - Add render-loop coverage: fit-once-then-disarm, freeze-stops-per-frame-work, and listener-throw isolation; `frontend/src/scene/field/fieldAssembly.test.ts`.
- [x] `P04.S13` - Update the representation and controller tests to the new vocabulary and assert the connectivity-only scope fence - lineage and semantic stay deterministic and mode-switch object constancy holds; `frontend/src/scene/sceneController.representation.test.ts`.
- [x] `P04.S14` - Bring the full frontend gate green - eslint, prettier, tsc, and vitest; `frontend`.

## Description

This plan executes the accepted node-graph-stability ADR: it makes the connectivity
(Obsidian-like) force-directed graph rock-solid by replacing the graphology ForceAtlas2
worker with a main-thread d3-force simulation and hardening the scene render loop. The
research verified eleven defects, all in the scene render loop rather than on the wire: a
per-frame camera snap (the flicker), per-frame hull/hit-index/edge recompute (the
degradation), an unguarded NaN path (the crash), a worker re-entry race (the thrash), and
pin-fighting plus unguarded loop bodies. The fix is the engine the ADR chose - d3-force
brings native alpha cooling (settle-then-freeze), warm-start, solver-level `fx`/`fy`
pinning, and singularity-safe forces - combined with render-loop discipline: fit the camera
once on settle then hand it to the user, gate per-frame work on the simulation clock, guard
coordinates and loop bodies, and expose only the Obsidian knob set while keeping the cooling
schedule fixed. Scope is fenced to connectivity mode; lineage and semantic remain
deterministic seed layouts the simulation is held stopped over, with mode-switch object
constancy preserved. Work is grounded in the linked ADR and research; the layout seam (the
FieldLayout interface) is preserved so the field assembly that drives it changes minimally.

## Steps

## Parallelization

The phases are largely sequential because they share the same files and a single
data-flow spine. P01 (the d3-force driver) is the foundation and must land first: it
defines the FieldLayout driver, the Obsidian LayoutParams type, and retires the worker -
everything downstream imports from it. Within P01, S01 (dependency) precedes S02/S03 (the
driver and its param type, which are cohesive and may be authored together), and S04
(retire FA2, drop graphology, repoint importers) lands last once the replacement exists. P02
(render-loop hardening) all touches the one field-assembly module and is best done as one
focused sequence after P01, since its four steps interleave in the same `onPositions` and
lifecycle code; they are not safely parallel against each other. P03 (control surface) can
proceed in parallel with P02 once P01 fixes the LayoutParams vocabulary, since it touches the
controller command and the panel UI rather than the render loop. P04 (tests and gate) is
last: S11-S13 follow their respective implementation phases (driver tests after P01,
render-loop tests after P02, controller/representation tests after P03), and S14 (the full
gate) is the terminal check that closes the plan.

## Verification

The plan is complete when every Step is closed and these criteria hold, each verifiable:

- The connectivity layout settles to a still, stable state and then freezes - no perpetual
  jitter, no per-frame camera motion after the first settle, and idle CPU drops once frozen.
  Verified by the cooling settle-then-freeze test and by manual observation in the live app.
- No graphology import remains and `frontend/package.json` carries `d3-force` (not
  `graphology-layout-forceatlas2`); the ForceAtlas2 worker and convergence modules are gone.
- The eleven verified defects are addressed at the root: fit-once camera (no per-frame snap),
  per-frame work gated on movement, a finite-coordinate guard so no NaN reaches the camera or
  hit index, solver-level `fx`/`fy` pinning with no display-overwrite, and guarded
  tick/listener bodies. Each has a corresponding test in P04.
- The layout panel exposes only the Obsidian knob set (Repel, Link force, Link distance,
  Center) and the cooling schedule is fixed in code, not user-exposed.
- The connectivity-only scope fence holds: lineage and semantic still produce their
  deterministic seed layouts with the simulation stopped, and mode switches preserve
  id-keyed object constancy. Verified by the representation test.
- The full frontend gate is green: `just dev lint frontend` (eslint, prettier, tsc) exits 0
  and `vitest` passes, per the declaring-green-runs-the-full-gate rule.
