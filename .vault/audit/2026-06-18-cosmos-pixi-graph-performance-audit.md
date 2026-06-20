---
tags:
  - '#audit'
  - '#cosmos-pixi-graph-performance'
date: '2026-06-18'
modified: '2026-06-18'
related: []
---

# `cosmos-pixi-graph-performance` code review

## Scope

Audited the active dashboard graph surface, the `CosmosField` renderer, the scene command bridge, dashboard hover/selection projection, and the 11-node `GraphLab` synthetic in a real Chromium runtime. No production code was changed during this review.

Runtime probe 1: the 11-node graph was sampled while no scene commands, hover events, data uploads, or selection commands were occurring. With simulation active, requestAnimationFrame averaged 78.54 ms with p95 116.6 ms. After sending the existing `set-simulation-active:false` command, the same page averaged 16.64 ms with p95 16.7 ms.

Runtime probe 2: `readPixels` was patched before graph load. With the pointer over the canvas, Cosmos performed 2x2 hover-FBO readbacks and the browser reported GPU stalls due to `ReadPixels`. Those readbacks continued after simulation was paused, proving hover picking is a separate GPU-to-CPU escape path from the force simulation loop.

## Findings

## cosmos-sim-loop-001 | critical | Cosmos runs a space-sized GPU quadtree for 11 nodes

`CosmosField` constructs `Graph` with `spaceSize` 8192 and `enableSimulation:true`. In the Cosmos bundle, that `spaceSize` is reduced to 4096 under the WebGL limit, then the many-body implementation derives quadtree depth from `Math.log2(adjustedSpaceSize)` and allocates float framebuffer levels from 2x2 through 4096x4096. `renderFrame()` then performs hover picking, `runSimulationStep()`, link draw, and point draw every frame. The measured slowdown reproduces with no React churn and disappears when the simulation is paused, so the hot path is the active Cosmos GPU force loop configured from world size rather than corpus size.

## cosmos-cooldown-002 | high | Tiny graphs stay in the hot simulation path for too long

The app defaults `simulationDecay` to 1800, cold start alpha to 0.75, and interaction decay to 8000. `startCosmosSimulation()` calls `graph.start()` and then restarts the frame loop through `ensureRenderLoop()`. During the runtime probe the simulation alpha was still above 0.63 after several seconds on an 11-node graph. That keeps the expensive force pipeline active long after the initial layout should have settled.

## scene-command-gap-003 | high | The active Cosmos field ignores locked scene commands

`Stage` sends `apply-deltas` and `set-visibility`, and `SceneController` defines those commands as part of the scene seam. `CosmosField.command()` handles only keyframe data, representation, bounds, selection, zoom, config, simulation, edge params, frozen, interaction, and pinned commands. It has no cases for `apply-deltas`, `set-visibility`, `set-time`, `set-overlays`, or `pulse`. The active graph therefore drops the advertised lightweight delta and visibility paths, which leaves the full keyframe path as the practical update mechanism and makes filter/overlay semantics unreliable.

## hover-state-004 | medium | Pointer hover is persisted through dashboard state

`Stage` forwards every scene hover event into `setHover`. `commitHover()` then updates the dashboard-state query cache, performs `patchDashboardState()`, and invalidates that dashboard-state query after the server reply. Transient pointer movement is therefore network-backed shared state. Even though this was not the root cause of the idle 11-node frame cost, it can amplify interaction latency and force unrelated dashboard-state selectors to re-run during hover.

## selection-emphasis-005 | medium | Dashboard-state identity churn wakes Cosmos emphasis

`deriveDashboardStageSceneView()` clones `selectedIds` from dashboard state every time the state object changes. `projectDashboardSelectionToScene()` always sends a fresh `set-selected` set, and `CosmosField.setSelected()` always runs `applyEmphasis()`. That path calls native Cosmos selection/greyout configuration and wakes the render loop even if the selected ids are semantically unchanged. Hover writes are enough to create this churn because hover also mutates dashboard state.

## signature-006 | low | The keyframe dedup signature omits appearance fields

`contentSignature()` keys off node ids, seed positions, and edge endpoint identity. It does not include node or edge appearance inputs that feed point sizes, point colors, link colors, link widths, tags, confidence, tier, status, or category. Identical topology with changed appearance can therefore short-circuit before the renderer uploads updated colors, sizes, widths, or hover cohorts.

## gpu-readback-hover-007 | critical | Canvas hover pulls GPU state back to CPU

Cosmos `renderFrame()` calls `findHoveredItem()` while the pointer is on the canvas. That path renders hover picking into GPU framebuffers, then reads the point hover FBO back to CPU through `regl.read()` / `readPixels`. Link hover has the same pattern through a link index framebuffer when link hover callbacks are enabled. The runtime probe counted 2x2 `readPixels` calls while the pointer was over the canvas and still counted them after simulation was paused. A CPU-free canvas cannot use this picking model; it synchronizes the GPU pipeline with CPU every hover sample.

## hover-boundary-008 | high | GPU-picked hover is translated into backend dashboard state

After the readback returns a point index, `CosmosField` maps that index through `indexToId`, computes hover emphasis from CPU node arrays and feature-tag maps, emits a scene hover event, and `Stage` persists that event via `setHover`. `commitHover()` optimistically rewrites dashboard-state cache, calls the engine dashboard-state PATCH endpoint, and invalidates the query on success. The tests intentionally assert that hover lands in canonical dashboard state. This confirms the suspected boundary leak: a canvas-local pointer sample becomes backend-validated application state.

## gpu-state-mirror-009 | high | Highlight membership is recomputed on CPU before every upload

The current highlight model stores `hoveredId`, `selectedIds`, `hoverEmphasisIds`, `idToIndex`, `indexToId`, and `tagToNodeIds` in CPU-side `CosmosField` fields. `buildHoverEmphasisIds()` finds the hovered node in the current CPU node array, unions CPU feature-tag cohorts, then `applyEmphasis()` converts ids back to indices and calls `selectPointsByIndices()`. Cosmos then rebuilds a CPU `Float32Array` greyout texture and uploads it. The GPU eventually paints the highlight, but the state decision and validation do not live in GPU-resident state.

## Recommendations

- Make the active renderer corpus-bounded before treating it as the default surface. For 11 nodes, either disable Cosmos simulation after a single layout pass, use a deterministic CPU/static seed layout, or initialize Cosmos with a small/classic/bounded many-body path whose quadtree depth is tied to point count rather than `spaceSize`.
- Reduce or bypass force simulation for small slices. A tiny graph should settle in one or a few frames, not remain in `simulating` for seconds.
- Implement or intentionally reject every locked `SceneCommand` in `CosmosField.command()`. The scene seam should not silently drop deltas or visibility.
- Keep hover local to the scene or debounce it into shared state only when a persistent cross-surface intent exists.
- Add semantic equality guards before emitting `set-selected` and before calling `applyEmphasis()`.
- Expand the keyframe signature or split topology and appearance signatures so appearance-only changes update the GPU buffers without re-layout.
- Replace CPU readback picking with CPU event-to-GPU upload or pure GPU visual feedback that does not require reading the picked id every sample. If CPU identity is needed for DOM chrome, gate it behind dwell/click rather than hover-frame sampling.
- Treat GPU-visible selection, hover, feature membership, and display labels as uploaded buffers/textures with explicit versions. The render loop should consume those buffers only; it should not query backend state or recompute graph membership.
- Split canvas-local transient state from persisted dashboard state. Selection/open/filter can cross boundaries; pointer hover should not unless promoted by a deliberate user action.

## Codification candidates

- **Source:** finding `cosmos-sim-loop-001`.
  **Rule slug:** `graph-simulation-budget-is-corpus-bounded`.
  **Rule:** A graph renderer that runs a force simulation must derive simulation, quadtree, and frame-loop budgets from the active bounded corpus size and must pass a measured tiny-corpus frame gate before becoming the default surface.

- **Source:** finding `hover-state-004`.
  **Rule slug:** `pointer-hover-is-view-local`.
  **Rule:** Pointer hover is view-local render state unless a documented feature requires persisted cross-surface hover intent.

- **Source:** findings `gpu-readback-hover-007` and `gpu-state-mirror-009`.
  **Rule slug:** `canvas-render-loop-is-gpu-resident`.
  **Rule:** The canvas render loop must consume uploaded GPU-resident state and must not read GPU framebuffers back to CPU or validate transient render state against backend/dashboard state.
