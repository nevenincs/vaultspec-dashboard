---
tags:
  - '#plan'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-06-17'
tier: L2
related:
  - '[[2026-06-17-node-graph-rework-adr]]'
  - '[[2026-06-17-node-graph-rework-research]]'
---


# `node-graph-rework` plan

Rework the headline node-graph canvas into a stable, performant, non-overlapping, free and centered canvas with a configurable circular bound, by running cosmos as a pure GPU renderer over a revived d3-force layout.

### Phase `P01` - Tier 1 - basics: free centered canvas, configurable circular bound, real data

Switch cosmos to renderer-only and render the real vault statically inside a configurable, default-circular bound on a free, centered canvas - no live simulation yet.

- [x] `P01.S01` - Switch the cosmos Graph to renderer-only: enableSimulation false, rescalePositions false, drop graph.start(); `frontend/src/scene/field/cosmosField.ts`.
- [x] `P01.S02` - Add the bound model and additive set-bounds command (shape free/circle/rect plus size) to the scene seam; `frontend/src/scene/sceneController.ts`.
- [x] `P01.S03` - Place nodes as a static phyllotaxis disc centered at origin, non-overlapping by construction within the bound; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P01.S04` - Implement set-bounds in CosmosField.command to apply shape and size to placement and camera fit; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P01.S05` - Render the real vault documents colored by doc type and confirm crisp SDF node bodies are visible; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P01.S06` - Hold the bound shape and size in the view store, defaulting to circle; `frontend/src/stores/view/viewStore.ts`.
- [x] `P01.S07` - Expose the bound shape and size control in GraphControls; `frontend/src/app/stage/GraphControls.tsx`.
- [x] `P01.S08` - Verify live: free centered canvas, circular bound, real data colored by type, crisp render, no rectangle or corner cluster; `frontend/src/scene/field/cosmosField.ts`.

### Phase `P02` - Tier 2 - performance and centering

Make the static field cheap and centered: render-on-demand, position retention with no refetch bounce, content dedup, fit-once centering, and a live scale measurement at full node count.

- [x] `P02.S09` - Render on demand: push positions and render only on a position change, idle otherwise; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P02.S10` - Retain node positions by stable id across set-data, placing only newly added nodes; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P02.S11` - Skip set-data work via a content signature when nodes and edges are unchanged; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P02.S12` - Fit the camera once so content centers and fills the visible canvas; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P02.S13` - Measure the render and upload budget live at roughly 3126 nodes and record the result; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P02.S14` - Verify live: no refetch bounce, idle GPU at rest, centered and filled, acceptable performance at scale; `frontend/src/scene/field/cosmosField.ts`.

### Phase `P03` - Tier 3 - edge semantics and rendering

Encode the wire's tier, confidence, relation and state onto cosmos per-link channels and keep edges legible at every zoom, reducing honestly instead of dropping silently.

- [x] `P03.S15` - Map edge tier to color and confidence to width and opacity via per-link cosmos channels; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P03.S16` - Render direction arrows by relation and apply resolved, stale and broken state treatment to structural edges; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P03.S17` - Tune linkVisibilityDistanceRange and greyout so edges stay visible on zoom-out and non-incident edges fade on hover; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P03.S18` - Handle hidden edges honestly: keep the both-endpoints filter, surface the dropped count, reduce by degree and hover LOD; `frontend/src/scene/field/cosmosField.ts`.
- [x] `P03.S19` - Verify live: edges meaningful by tier and confidence, legible at every zoom, never silently hidden; `frontend/src/scene/field/cosmosField.ts`.

### Phase `P04` - Tier 4 - simulation and forces

Revive the live d3-force tick driving cosmos for guaranteed non-overlap, neighbor-coupled drag, and live Tune controls, validated at full scale - done last after basics, performance and edges are solid.

- [ ] `P04.S20` - Drive cosmos from the live FieldLayout tick, pushing positions on onPositions with the settle and reheat lifecycle; `frontend/src/scene/field/cosmosField.ts`.
- [ ] `P04.S21` - Guarantee non-overlap via forceCollide with a per-node radius of sprite radius plus padding; `frontend/src/scene/field/cosmosField.ts`.
- [ ] `P04.S22` - Apply the circular and rect containment as a force during the live tick; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `P04.S23` - Couple drag to neighbors via cosmos onDrag into FieldLayout dragNode and releaseNode without auto-pinning; `frontend/src/scene/field/cosmosField.ts`.
- [ ] `P04.S24` - Wire the Tune sliders, freeze, and begin and end interaction through CosmosField.command into FieldLayout; `frontend/src/scene/field/cosmosField.ts`.
- [ ] `P04.S25` - Integrate set-pinned and set-selected and focus with the live simulation; `frontend/src/scene/field/cosmosField.ts`.
- [ ] `P04.S26` - Validate at full scale and verify live: nodes never overlap, sliders live, drag couples neighbors, field settles to idle; `frontend/src/scene/field/cosmosField.ts`.

## Description

This plan executes the accepted `node-graph-rework` ADR. The headline canvas is mid-migration on cosmos's own GPU simulation, which box-clamps positions (the rectangle), squeezes them into a corner, overlaps nodes, yanks and bounces on every refetch, renders meaningless edges, and exposes dead Tune sliders. The rework runs cosmos as a pure GPU point-and-line renderer (its own simulation off, rescale off) and revives the dormant `FieldLayout` d3-force driver as the position source, adding the one capability neither has: a configurable containment whose default shape is a circle. The work proceeds in four strictly ordered tiers, each verified against the live app before the next begins - basics, then performance and centering, then edge semantics, then the live simulation and forces. Forces are deliberately last. Grounding is in the ADR and its research.

## Steps







## Parallelization

Phases are strictly sequential: P01 (basics) must land and verify live before P02, and so on through P04. Forces (P04) must not be touched until basics, performance, and edges are solid. Within a phase, steps are mostly sequential because they share `cosmosField.ts`; the seam change (P01.S02) and the view-store and control steps (P01.S06, P01.S07) can proceed alongside the renderer steps once the `set-bounds` command shape is fixed. The Execute phase additionally requires a stable engine window and exclusive ownership of the field layout code, coordinated with the concurrent live-engine and SDF-crisp-layer agents; research, decision, and planning carried no such dependency.

## Verification

The plan is complete when every Step is closed and the full frontend lint gate (`just dev lint frontend`: eslint, prettier, tsc) is green. Each tier carries a live-data verification step (no mocks, stubs, or tautological probes; the field `debugSnapshot` live-position read is the non-tautological overlap and motion check), and the user is the ground truth for visual outcomes. Tier acceptance: T1 - the canvas is free and centered with a visible circular bound (configurable to free or rect with a settable size), real vault documents render colored by doc type with crisp bodies, and neither the rectangle nor the corner cluster remains. T2 - no refetch bounce, the GPU is idle at rest, content centers and fills the canvas, and the measured budget at roughly 3126 nodes is acceptable (or the worker or LOD fallback is taken on evidence). T3 - edges encode tier and confidence, stay legible at every zoom, and are reduced honestly rather than hidden silently. T4 - nodes never overlap, the Tune sliders, freeze, and drag are live and couple neighbors, and the field settles to an idle rest at full scale. Final review is a passing `vaultspec-code-review`.
