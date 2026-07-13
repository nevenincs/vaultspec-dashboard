---
tags:
  - '#adr'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-node-graph-rework-research]]"
---

# `node-graph-rework` adr: cosmos as a pure renderer over a revived d3-force layout, with a configurable circular canvas bound | (**status:** `accepted`)

## Problem Statement

The dashboard's headline node-graph canvas is in a degraded, mid-migration state: a
deliberate BRICK-1 work-in-progress (`CosmosField`) running `@cosmos.gl/graph`'s own
GPU force simulation. Live, the user observes seven defects: (1) all node positions
are bounded to a small **rectangle**; (2) nodes condense in the **upper-right
corner** rather than the canvas center; (3) the simulation **collapses the GPU/CPU**;
(4) nodes **overlap** (no collision); (5) edges carry **no semantic meaning**; (6)
the field **yanks** from a spread seed and **re-seeds/bounces on every refetch**; and
(7) the "Tune" force sliders are **dead**. The user additionally requires the canvas
bound to become a **circle** (not a rectangle) and to be a **configurable option**
(free / circle / rect, with a settable size).

This ADR settles the architecture for a from-scratch, pipeline-driven rework into a
**stable, performant, non-overlapping, interactive, FREE canvas** — content centered,
with a configurable containment defaulting to a circle — of the actual vault (~3126
document nodes + ~2500 relationships at document granularity). It is grounded in
`[[2026-06-17-node-graph-rework-research]]`, whose cosmos claims were verified against
the installed library source.

## Considerations

- **The two cosmos clamp mechanisms (verified in `dist/index.js`/`config.d.ts`).** The
  "rectangle" is the per-tick `clamp(pos, 0, spaceSize)` integration shader, compiled
  only while `enableSimulation` is true. The "corner cluster" is a separate upload-time
  rescale that cosmos **forces** when the sim is off and `rescalePositions` is left
  `undefined`, squeezing sparse content into a 10%-of-space sub-box. Both are defeatable
  and neither is a reason to abandon cosmos as a renderer.
- **A mature d3-force driver already exists, dormant.** `FieldLayout` (`forceLayout.ts`,
  from the node-graph-stability cycle, reviewed PASS) already implements `forceCollide`
  (guaranteed non-overlap), `settleOffline` (no cold-start yank), `applyChanges` with
  object constancy (no refetch bounce), an alpha-ceiling/dwell early-freeze (idle GPU),
  `setParams` (the Tune knobs), drag/pin, and NaN-repair. It was simply abandoned when
  the canvas migrated to cosmos's own sim.
- **The seam already speaks the full vocabulary.** `SceneController` already defines
  `set-layout-params`, `set-layout-mode`, `begin/end-interaction`, `set-frozen`,
  `set-pinned`, etc.; `SceneEdgeData` already carries `tier`/`confidence`/`relation`/
  `state`/`derivation`. Only `CosmosField.command()` fails to implement them.
- **Reuse-vs-rebuild.** The realistic renderer alternatives (a bespoke PixiJS/regl
  instanced renderer; sigma.js) cost far more to build than reusing cosmos's solid
  GPU point/line renderer with its sim off. The realistic layout alternatives (cosmos's
  GPU sim; a fresh d3 driver) are strictly worse than reviving the driver that already
  solves the hard cases.
- **Existing project law.** `graph-compute-is-cpu-gpu-is-render-and-search` already
  establishes CPU-for-compute / GPU-for-render; this ADR is that law applied at the
  frontend renderer boundary. Layer ownership and the frozen-seam discipline
  (`view-rewrite-preserves-the-state-and-scene-contract`) bound the change surface.
- **Concurrency.** `cosmosField.ts` is co-edited by an SDF-crisp-layer agent
  (`crispNodeLayer.ts`), and a live-engine migration agent restarts the engine
  frequently. A stable engine window and explicit field-code ownership are prerequisites
  for the Execute phase (not for research/decision/plan).

## Constraints

- **`enableSimulation` is init-only** — the sim-vs-renderer choice is made at `Graph`
  construction and cannot be toggled via `setConfig`; switching to renderer-only is a
  mount-time config change plus removing `graph.start()`.
- **cosmos has no collision and no radial/circular bound** — its force modules are
  Gravity/Center/ManyBody/Link/Mouse/Clusters/Drag only. Non-overlap and any bound
  shape must be enforced in the CPU layout, not in cosmos.
- **The SDF crisp layer reaches into cosmos internals** (`reglInstance`, the position
  FBO, `renderFrame`) and is pinned to 2.6.4; it samples whatever position texture
  cosmos holds, so it composes with externally-driven positions, but its ownership must
  be coordinated and it constrains cosmos upgrades.
- **`FieldLayout` is main-thread and was tuned for hundreds of nodes** (LOD-bounded
  connectivity slices). Document granularity is ~3126 nodes — larger than its tuned
  range. Per-tick `forceManyBody` + `forceCollide` cost at that size is the **primary
  performance risk** and must be **measured live** (D6); the fallbacks are a web worker
  or keeping document-LOD bounded.
- **Frozen `SceneController` seam** — any new command (the bound control) is an
  ADR-flagged additive redline, not a drive-by edit; it must not break the sigma.js
  fallback contract or the existing consumers.
- **Live-data verification only** — no mocks/fakes/stubs/tautological probes; the
  `debugSnapshot()` live-position read is the non-tautological overlap/motion check.

## Implementation

A high-level layering of the rework (detailed steps belong to the plan). Decisions:

- **D1 — Renderer: cosmos.gl as a pure GPU point/line renderer.** Construct the `Graph`
  with `enableSimulation: false` **and** `rescalePositions: false` (both required: the
  first removes the per-tick box clamp, the second removes the corner-squeeze that
  otherwise activates the instant the sim is off). Never call `graph.start()`. Each
  layout frame, push positions via `setPointPositions(flat, /*dontRescale*/ true)` then
  `render()` (which does not step any sim). Keep cosmos for picking, hover, selection/
  focus rings, and link rendering; keep the SDF crisp layer for the visible node bodies.
- **D2 — Layout engine: revive `FieldLayout` to drive cosmos.** The CPU d3-force driver
  becomes the single source of node positions; its `onPositions` frame feeds D1's
  position push, its `onSettle` drives a fit-once camera. cosmos's own GPU simulation is
  retired. This inherits `forceCollide` (non-overlap), `settleOffline` (no yank),
  `applyChanges` object constancy (no bounce), early-freeze (idle GPU), and `setParams`
  (live sliders) for free.
- **D3 — Canvas/space model: free, centered, infinite-zoom, with a configurable
  containment.** The canvas is unbounded with infinite zoom-out (cosmos `scaleExtent`
  `[1e-3, ∞]`); the layout centers at the origin via `forceX`/`forceY`. A new
  **containment** is added to the driver: `{ shape: 'free' | 'circle' | 'rect', size }`,
  **default `circle`**, enforced each tick. The default circle behaviour is a **soft
  radial centering blended with a hard rim clamp** (project any node beyond radius R
  back to the rim) so the disc fills evenly without crushing nodes to the center; `rect`
  clamps to a box; `free` applies no bound. It is surfaced through a new **ADR-flagged
  additive seam command** `set-bounds { shape, size }` (distinct from the existing
  `set-layout-mode force|circular`, which names a layout *algorithm*, not a containment
  *shape*); the view store owns the setting and the GraphControls expose it.
- **D4 — Edge semantics.** Map the wire's existing fields onto cosmos per-link channels:
  `tier` → color (declared/structural/temporal/semantic palette from the scene tokens),
  `confidence` → width/opacity, direction/`relation` → arrows where meaningful;
  `state` (resolved/stale/broken) modulates structural-tier edges. Hover/selection fades
  non-incident edges (`linkGreyoutOpacity`); `linkVisibilityDistanceRange` is tuned so
  edges do not silently vanish on zoom-out. The both-endpoints filter stays, but boundary
  truncation is **reported honestly** (count surfaced), and edge reduction at scale is
  LOD/degree/incident-on-hover, never a silent drop. The dormant `EdgeMeshLayer` is the
  visual reference for the tier treatment.
- **D5 — Performance.** Render-on-demand: push+`render()` only on `onPositions` frames;
  when the driver freezes, the GPU goes idle. Position retention by stable id via
  `applyChanges` (no full re-seed on refetch); a content-signature guard skips `set-data`
  work when nothing changed; `settleOffline` computes first load offline so it appears
  already-settled.
- **D6 — Scale gate (mandatory measurement).** Before the forces tier is declared done,
  measure the main-thread driver at the live ~3126-node document graph (tick time,
  frame budget, settle wall-clock) via the live app and `debugSnapshot()`. If it does
  not hold an interactive budget, escalate to a web worker for the solver or bound the
  document LOD — decided by measurement, not assumption.
- **D7 — Strict tier order.** T1 basics (renderer-only cosmos + free/centered canvas +
  configurable circular bound + real data colored by type + crisp render) → T2
  performance + canvas centering → T3 edge semantics → T4 sim/forces (collision, drag
  coupling, repel/attract/cluster) + wire the Tune sliders. Forces are LAST; each tier
  is verified live before the next.

## Rationale

The research verified, in the installed cosmos source, that both bounding symptoms are
defeatable configuration facts, not architectural limits: the box is the sim-gated
clamp shader, and the corner-squeeze is the `rescalePositions===undefined && !enableSimulation`
rescale trap. Turning cosmos into a renderer (D1) removes both at once. The decisive
finding is that the hard parts — guaranteed non-overlap, no cold-start yank, no refetch
bounce, idle-GPU settle, live slider params — are **already implemented and reviewed**
in the dormant `FieldLayout`; reviving it (D2) is lower-risk than finishing cosmos's
bricks (which would still need a collision force cosmos cannot provide) or rebuilding a
driver. This also **corrects the handover's framing**: `settleOffline`/freeze are not
faulty "kill-switch band-aids" but the correct d3 force-graph lifecycle, and were never
the defect — abandoning the driver for cosmos's box-clamped, re-seed-every-frame GPU sim
was. cosmos cannot express a circular bound, so the configurable containment lives in the
layout tick (D3), which is also exactly where a free/rect/circle option naturally
belongs. The seam already carries full edge semantics and layout commands, so D4 and the
slider wiring are mostly "implement the contract the seam already defines." D1/D2 are a
direct instance of the existing `graph-compute-is-cpu-gpu-is-render-and-search` law at
the renderer boundary.

## Consequences

- **Gains.** A free, centered, infinitely-zoomable canvas with a configurable circular
  bound; guaranteed non-overlap; no seed-yank and no refetch-bounce; an idle GPU at rest;
  live, honest Tune sliders; and meaningful, tier-encoded edges — most of it achieved by
  reconnecting existing, reviewed machinery rather than new construction, which keeps the
  blast radius small and the change reviewable.
- **Difficulties / risks.** The main-thread driver at ~3126 nodes is the real risk and is
  gated on live measurement (D6). The SDF crisp layer couples to cosmos internals and is
  co-owned, requiring concurrency coordination. The bound control is a new seam command
  (a reviewed redline). `enableSimulation` being init-only means the renderer-only switch
  is a mount-time change.
- **Pathways opened.** Once the cosmos path reaches parity, the dormant PixiJS field and
  `EdgeMeshLayer` can be removed outright (per `no-deprecation-bridges`), collapsing two
  code paths to one. The containment abstraction generalizes to future bound shapes.
- **Pitfalls (the regression traps).** Forgetting `rescalePositions:false` silently
  re-creates the corner squeeze; re-enabling cosmos's sim silently re-creates the box
  clamp. Both must be guarded (and are candidates for codification).

## Addendum (2026-06-17): research-driven revision to follow the knowledge-graph norm

After the renderer/bound/edge tiers shipped, the layout-engine decisions (D2/D3) were
grounded in dedicated research into how second-brain / knowledge-graph tools actually lay
out graphs at scale (Obsidian, Logseq, Foam, Roam, Kumu, Cosmograph, and the vasturiano
force-graph library), at the user's explicit direction to FOLLOW the norm, not diverge
from it. The findings revise the layout decisions:

- The proven norm is a FREE, infinite pan-zoom canvas centred by weak gravity, with
  many-body repulsion and link springs, OVERLAP-TOLERANT, settled-then-frozen with
  render-on-demand (idle GPU). No surveyed tool enforces a hard bound or guarantees
  non-overlap; "centered" is gravity, not a clip. CPU d3-force is adequate at ~3k nodes
  (GPU only matters past ~100k); a web worker is the standard escape hatch if the main
  thread stalls.
- D2 revised: revive `FieldLayout` WITHOUT the collide force (overlap-tolerant). Measured
  on the live corpus: collide was the bottleneck (~30 ms/tick at 3239 nodes); without it
  the tick is ~16 ms - main-thread viable, no worker. `FieldLayout` drives cosmos's
  renderer per tick and freezes when settled.
- D3 revised: the DEFAULT bound is FREE + soft center gravity (NOT a hard circle clamp; a
  hard radial clamp fights the force layout - a documented anti-pattern). The circle/rect
  options remain CONFIGURABLE but as SOFT compactness presets (stronger center gravity),
  honoring the user's "must be an option" while following the norm. Guaranteed non-overlap
  is dropped as a live-layout property; the static phyllotaxis disc remains
  non-overlapping-by-construction as the seed.
- D6 resolved: main-thread d3 without collide is viable at 3239 nodes; the web worker is
  the documented escape hatch, not built.
- Renderer (D1) and edge encoding (D4) are unchanged.

Grounding: the Tier-4 research strands appended to `[[2026-06-17-node-graph-rework-research]]`.
User directive: follow the norm.

## Codification candidates

- **Rule slug:** `cosmos-runs-as-a-renderer-not-a-simulator`.
  **Rule:** The dashboard canvas constructs `@cosmos.gl/graph` with its own simulation
  OFF (`enableSimulation:false`) and `rescalePositions:false`, and drives node positions
  from the CPU d3-force layout each frame; enabling cosmos's GPU simulation (which
  re-introduces the `spaceSize` box-clamp) or leaving `rescalePositions` default (which
  re-introduces the corner-squeeze) is forbidden. (Candidate only — promote per the
  codify discipline after it holds across the cycle, not on first encounter. Sibling of
  `graph-compute-is-cpu-gpu-is-render-and-search`.)
