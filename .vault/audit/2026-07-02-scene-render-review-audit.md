---
tags:
  - '#audit'
  - '#scene-render-review'
date: '2026-07-02'
modified: '2026-07-02'
related: []
---

# `scene-render-review` audit: `scene and GPU render layer architecture review`

## Scope

Standing architecture review of the SCENE / GPU RENDER LAYER
(`frontend/src/scene/`, plus the app-side canvas plumbing it depends on):
`threeField.ts` render correctness and performance (instancing, LOD, label +
minimap per-frame passes, rings/anchors, picking, drag/pin, spotlight,
`cpuPositions`), the `SceneController` command/event contract
(`dashboard-layer-ownership`), the portal-pinned canvas + rect bridge
(`graph-canvas-is-portal-pinned-never-reparented`), the `uiScale()` bridge and
literal-hex theme seam (`no-hardcoded-px-in-dom-styling`,
`themes-are-oklch-generated-from-a-token-tier`), GPU resource lifecycle
(`bounded-by-default-for-every-accumulator`), and stable-selector discipline at
scene-consuming hooks. The D3ForceSolver energy model is SETTLED
(`graph-layout-is-pin-authoritative-not-force-converged`, GIR-001) and is not
re-litigated. This pass also re-verifies, against CURRENT code, the GIR/GS
remediations that landed in this layer since the graph review. Finding IDs
`SGR-###`; audit-only, no product code changed.

## Findings

### SGR-001 | info | The SceneController seam and layer boundaries hold; the controller model is now delta-truthful

Data enters the scene ONLY as commands (`set-data`, `apply-deltas`,
`set-visibility`, selection/spotlight/camera members on the locked union with
documented additive redlines); interaction leaves ONLY as events (hover,
select, open, expand, pin, camera-change, context-menu, render-capability,
graph-truncated). The scene fetches nothing and reads no raw `tiers` — even its
own GPU capability is EMITTED as an event and rendered by chrome as a designed
CanvasState. The GIR-006 remediation is landed: `apply-deltas` now folds into
the controller's held model (`sceneController.ts:506-515` via
`foldSceneDeltas`), so `nodeCount`/`edgeCount` stay truthful after a live
splice and the controller and field can no longer diverge.

### SGR-002 | info | Portal-pin verified by construction: one app-lifetime host, a bounded settle-loop rect bridge, no re-parent path

`GraphCanvasHost.tsx` is the single app-lifetime mount of `Stage` (and thus the
canvas); dockview owns only an empty placeholder whose rect `canvasPin.ts`
publishes. The bridge is bounded-by-default: the measure loop is a SETTLE loop
(stops after 6 stable frames; re-poked by ResizeObserver, window
resize/scroll-capture, and the dock's `onDidLayoutChange` hook), so an idle
workspace spins no rAF. Hide is `display:none`, never unmount, so a closed
graph costs no GPU and no context. A dockview tab drag drops the host's pointer
events so drop targets beneath stay reachable. No code path re-parents the
canvas; `Stage`'s unmount (and therefore `controller.destroy()`) is reachable
only at app teardown. The inline px in the host's positioning style are
MEASURED DOM rects, not authored sizes — outside the `lint:px` contract's
intent and correctly so.

### SGR-003 | info | Prior remediations re-verified landed in current code; theme changes genuinely reach the GL buffers

(a) GS-004: the 2D ring pass gates on `visibleNodeIds` (`threeField.ts:1964`)
and `emitAnchors` masks tracked ids the filter hides (`:1907-1921`) with the
selection-survives semantics documented in place. (b) GIR-008: `disposeGraph`
now clears `idToIndex`/`neighbors`/`featureCohort`/`cpuPositions`
(`:1481-1490`) so an empty set-data leaves no ghost state. (c) The
`refresh-theme` command rebuilds GL resources from cached marks, re-reading
every literal-hex scene token (the `getComputedStyle` bake), preserving the
d3 layout and camera — a `[data-theme]` flip genuinely re-colours the baked
instanced buffers and uniforms, closing the loop the literal-hex seam
otherwise leaves open. (d) GL context loss/restore: `preventDefault` +
bounded rebuild retries (`MAX_GL_RESTORE_ATTEMPTS` 3) from the persisted CPU
layout; capability transitions are emitted honestly.

### SGR-004 | high | uiScale() is a getComputedStyle call and it executes INSIDE the pick loop — O(N) forced style reads per pointermove

`uiScale()` → `rootFontPx()` → `getComputedStyle(document.documentElement)` on
EVERY invocation (`scene/three/uiScale.ts:21-34` — no cache). Call sites by
cost: WORST — `pickNodeAtScreen` computes `PICK_RADIUS_PX * uiScale()` INSIDE
the per-node loop (`threeField.ts:2691`), so a single pointermove over a
5,000-node document graph performs ~5,000 forced computed-style reads, and a
hover sweep at 60Hz approaches 300k/sec — precisely while React hover-card
updates are dirtying style and making each read a real recalculation. Also
per-frame: `renderFrame` (`:1875`), `drawLabels` (`:1943`, plus
`labelTextStyle` re-reading `rootFontPx` per call), `fitTargetForBounds`
(`:2285`), and the material builds. The root font size changes only on the
UI-scale preference — this is a constant being re-measured at interaction
frequency. Fix shape (two steps, both trivial): hoist the `uiScale()` read out
of the pick loop (one line, removes the O(N) multiplier); then cache
`rootFontPx` at module level, invalidated by a window `resize` listener plus
the settings-echo that changes the root font — `labelStyle.ts` shares the
cache for free.

### SGR-005 | medium | Picking is an O(N) linear scan per pointermove with no spatial structure and no pointer-delta gate

`pickNodeAtScreen` (`threeField.ts:2680-2703`) walks every node, projecting
each through `worldToScreen`, on EVERY pointermove (hover) and pointerdown.
Fine at constellation scale (~100s); at document scale (up to
`MAX_DOCUMENT_NODES` 5,000 wire-side, `MAX_SCENE_NODES` 20,000 defensive) a
hover sweep is a steady CPU tax on the interaction thread, additive with
SGR-004. Two cheap wins before any real index: (a) skip the pick when the
pointer moved <1px since the last hit test (pointermove fires at device rate);
(b) hoist the per-node invariants (SGR-004's uiScale, the camera half-extents
inside `worldToScreen`) out of the loop. The honest structural fix, when
document-scale hover matters: a coarse uniform screen-space grid over
`cpuPositions`, rebuilt lazily per (tick|camera-change) — positions are static
between ticks in the settled common case, so the grid amortizes to
build-once-per-frame-at-most and pick-in-O(cell).

### SGR-006 | low | Per-frame allocations and token→CSS re-conversions in the 2D overlay passes

`drawLabels` re-derives per frame what only changes per theme: the ink/accent/
highlight/pill hex→CSS strings (`toString(16)` + concatenation), the
`labelTextStyle` objects, and `hexCss` conversions in `renderMinimap`. During
settle/autoframe-ease sequences (the frames-per-second window) this is
avoidable GC churn and string work. Cache the derived CSS strings and text
styles keyed on the theme epoch (they are invalidated exactly when
`refresh-theme` fires, which already rebuilds everything) and reuse across
frames.

### SGR-007 | low | destroy()/remount asymmetry: the glyph atlas is disposed while a retained glyph mesh still references it

`destroy()` releases the renderer, listeners, minimap, labels, and DISPOSES the
glyph atlas texture — but retains the graph meshes/materials/`positionTex` in
`this.scene` (three.js re-uploads retained CPU-side resources under a new
renderer, so a remount renders; the path is near-theoretical since the host is
app-lifetime). The wrinkle: after destroy, `glyphAtlas` is null while a
retained `glyphMesh` material still references the disposed texture object —
on a remount with icons enabled the field renders glyphs from a texture it
believes does not exist, and the `buildGlyphs` guard (`!this.glyphMesh`) will
never rebuild the atlas. Drift-prone bookkeeping rather than a live bug. Cheap
hardening: call `disposeGraph()` + `disposeGlyphs()` in `destroy()` so
teardown is total and a remount rebuilds through the normal `set-data` path.

### SGR-008 | info | Bounded-by-default and LOD verified across the render layer

The scene's own wire-ingestion clamp (`MAX_SCENE_NODES` 20,000 +
`graph-truncated` event) backs the stores adapter's cap; every GPU buffer is
sized by node/edge count; the pulse timer is single and self-clearing; the
autoframe interval is torn down and its ease is deadband+epsilon bounded;
labels are sanitized, char-capped, width-elided, and budgeted with the
FPS-adaptive quarter cut; the perf-adaptive LOD (frame-cost EMA with
degrade/restore hysteresis, dpr halving) covers the software-WebGL tier;
`frustumCulled=false` on all meshes is the correct deliberate choice (positions
live in the GPU texture, so three cannot cull on the CPU — offscreen vertices
are the GPU's problem and filtered nodes collapse to zero scale via `aHidden`).
No unbounded accumulator found in the render layer.

### SGR-009 | info | Stable-selector spot-check at scene-consuming seams: no violation found (spot-check depth)

`MinimapWidget` (chrome-hosts-canvas via `setMinimapCanvas`, view through
`useMinimapChromeView`), the Stage hook set (re-verified through the GIR/GS
passes), and `useSceneThemeRefresh` (effect-only subscription to the
framework-free theme controller) show no derive-inside-selector patterns. This
is SPOT-CHECK depth, not a sweep; the previously-recommended structural guard
(lint/test flagging derivation inside zustand selectors) remains the durable
closure for this recurring class.

## Recommendations

1. SGR-004 first — one-line hoist out of the pick loop, then the module-level
   `rootFontPx` cache with resize/settings invalidation (`labelStyle.ts` rides
   the same cache). Smallest change, largest interaction-thread win.
2. SGR-005's two cheap wins (pointer-delta gate + loop-invariant hoisting) in
   the same change; defer the screen-space grid until document-scale hover is
   a measured complaint.
3. SGR-006 theme-epoch caching of overlay CSS strings/styles — pairs naturally
   with SGR-004's cache.
4. SGR-007 total-teardown hardening in `destroy()` — small, removes a
   bookkeeping trap.
5. The stable-selectors structural guard (SGR-009 note) stays on the backlog
   as the durable answer to the recurring class.
