---
tags:
  - '#research'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-16-graph-layout-catalog-adr]]'
  - '[[2026-06-16-graph-node-representation-adr]]'
---



# `node-graph-rework` research: cosmos space model + the dormant d3-force driver

This grounds a from-scratch, pipeline-driven rework of the dashboard's headline
node-graph canvas: a **stable, performant, non-overlapping, interactive, FREE
canvas** (content centered, with a **configurable bound whose default shape is a
CIRCLE**) of the actual vault (~3126 document nodes + ~2500 relationships at
document granularity). Three research strands ran in parallel — the current code,
the `@cosmos.gl/graph` v2.6.4 coordinate/simulation model, and force/edge/perf
best practice — and converge on one architecture. Every cosmos claim below is
verified against the **installed** `dist/*.d.ts` and `dist/index.js` (version
confirmed 2.6.4), not just the public docs.

**Headline conclusion:** the rework is mostly *reconnection*, not new
construction. A complete, reviewed d3-force driver (`FieldLayout` in
`forceLayout.ts`) and a rich command/data seam (`SceneController`) already exist
and already solve the seed-yank, refetch-bounce, idle-GPU, and non-overlap
problems — they were simply *abandoned* when the canvas migrated to cosmos's own
GPU simulation. The fix is to run cosmos as a **pure GPU renderer** driven by that
revived CPU driver, and to add the one thing neither has: a **configurable
circular containment**.

## Findings

### 1. Current state — a deliberate BRICK-1 WIP on cosmos's own GPU sim

The live renderer is `CosmosField` (`cosmosField.ts`), constructed by
`createDashboardScene()` behind the **unchanged** `SceneController` seam; the old
PixiJS field (`DashboardField`), its d3-force driver (`FieldLayout`), the
tier-encoded `EdgeMeshLayer`, and `NodeSpriteLayer` are all **dormant** (kept only
"until last consumers retire"). `CosmosField`'s own header documents it as built
"BRICK BY BRICK": BRICK 1 = all forces off (static phyllotaxis), later bricks turn
on one force at a time. It is mid-migration, not finished.

Live cosmos config (`mount()`): `spaceSize: 4096`, `simulationRepulsion: 2.0`,
`simulationGravity: 0`, `simulationLinkSpring: 0`, `simulationLinkDistance: 120`,
`simulationFriction: 0.85`, `simulationDecay: 2000`, `enableSimulation` left
**default-true** (so `graph.start()` runs cosmos's GPU sim), `fitViewOnInit: true`,
`scalePointsOnZoom: true`, `pointSizeScale: 2`, `renderLinks: true` (flat grey,
width 1, no arrows). Node **size** = `nodeRadius(node)*2` (salience-driven), node
**color** = `categoryColor(node.docType ?? node.kind)` (doc-type first — correct,
since `kind` alone collapses most nodes onto one swatch).

A new, untracked **SDF crisp layer** (`crispNodeLayer.ts`, owned by a concurrent
agent) paints the visible node bodies as instanced SDF discs by sampling cosmos's
own position texture (no readback); cosmos's own point bodies are set alpha-0 but
still own picking, hover, and selection rings. This composes correctly with
externally-driven positions (it samples whatever texture cosmos holds).

`CosmosField.command()` handles only `set-data`, `set-selected`, `focus-node`,
`zoom-in/out`, `fit-to-view`, `reset-view`. It **silently drops** every other seam
command — `set-layout-params`, `set-frozen`, `begin/end-interaction`,
`set-layout-mode`, `set-visibility`, `set-pinned`, `set-representation-mode`,
`set-overlays`, `apply-deltas`, `set-time`, `pulse`. This is why the Tune sliders,
Freeze, filters, and pins are all no-ops against the live canvas.

### 2. cosmos.gl v2.6.4 — the coordinate model is the root of the bounding bugs

`spaceSize` is a **square** world side length (max 8192, default 8192); positions
live in `[0, spaceSize]` on both axes. The origin `(0,0)` is the **top-left of a
viewport-centered square** and **Y is flipped**; space `(spaceSize/2, spaceSize/2)`
maps to viewport center (so the code's `SPACE_SIZE/2` centering is correct). Two
**independent** mechanisms confine positions:

- **(A) Per-tick hard clamp.** The GPU integration shader runs
  `clamp(pos, 0, spaceSize)` every tick — but it is **compiled only when
  `enableSimulation` is true**. With cosmos's sim ON (today's state), every node is
  hard-clamped into the box each frame → the **"bounded rectangle."** Disabling the
  sim never builds this shader, so external positions are *not* clamped.
- **(B) Upload-time rescale squeeze.** `rescalePositions` defaults `undefined`;
  `Points.updatePositions` does `if (rescalePositions===undefined && !enableSimulation) rescale=true`
  — i.e. **turning the sim off without setting `rescalePositions:false` FORCES a
  rescale** that squeezes sparse content (`<spaceSize²·0.001` points) into a
  **10%-of-space sub-box** → the **"corner cluster."** This is a trap that bites the
  instant the sim is flipped off naively.

`enableSimulation` is **init-only** (cannot be changed via `setConfig`), so the
sim-vs-renderer choice is made at construction. To run cosmos as a pure renderer:
`enableSimulation:false` + `rescalePositions:false`, then per frame
`setPointPositions(flat, /*dontRescale*/ true)` followed by `render()` (which does
*not* step any sim). Zoom `scaleExtent` is `[1e-3, ∞]` → effectively infinite
zoom-out, so the **free/infinite canvas is supported at the camera layer**; the
*only* bounding is the two defeatable mechanisms above. `fitView(duration, padding)`
fits all points through `scaleX/scaleY`, so once the squeeze is gone it behaves
intuitively.

**Circular bound:** cosmos cannot express one — `spaceSize` is square and its force
modules are Gravity/Center/ManyBody/Link/Mouse/Clusters/Drag only (**no collision,
no radial bound**). With cosmos as a renderer, a circular (or rect, or free) bound
is enforced **in the layout** (clamp/force positions to a disc of radius R each
tick), which is exactly the configurable-bound requirement's natural home.

Per-link styling is fully available: `setLinkColors` (RGBA), `setLinkWidths`,
`setLinkArrows(bool[])`, `setLinkStrength`, plus `curvedLinks`, `linkOpacity`,
`hoveredLinkColor`. Note `linkVisibilityDistanceRange` (default `[50,150]` px)
**fades links by on-screen length** — a likely contributor to "edges vanish when
zoomed out"; widen it or raise `linkVisibilityMinTransparency`.

### 3. The dormant `FieldLayout` already implements the hard parts

`FieldLayout` (`forceLayout.ts`) is a mature, reviewed main-thread d3-force driver
(from the node-graph-stability cycle). It composes `forceManyBody` (repel),
`forceLink` (radius-aware rest length), `forceX`/`forceY` (center gravity), and
**`forceCollide` with a per-node `radiusOf(id)` callback — the guaranteed
non-overlap mechanism cosmos lacks.** Its knobs are `LayoutParams {repel,
linkForce, linkDistance, center}`, mapped one-to-one to the binding Tune sliders
(Spacing→`repel`, Connection reach→`linkDistance`, Clustering→`linkForce`).

Crucially it already ships the exact lifecycle the observed bugs need:

- **`settleOffline()`** — ticks to convergence synchronously and emits **once**, so
  the chaotic spread is computed offline and never animated → **no cold-start
  seed-yank.**
- **`applyChanges()` with object constancy** — a content delta that changes no
  topology (a refetch / live keyframe restating the same nodes) returns a **no-op**
  → **no refetch bounce**; a real add reheats to a *low* alpha with survivors held
  fixed so only new nodes settle (the "expand a node" feel).
- **Alpha-ceiling + dwell early-freeze** — stops the **sim** (not just the draw)
  once motion is negligible → **idle CPU/GPU** (render-on-demand falls out of this:
  draw only while `onPositions` fires).
- **`beginInteraction`/`endInteraction`** held-warmth, **`dragNode`/`releaseNode`**
  drag-without-pin (couples neighbours via links), **`setPinned`** solver-level
  pins, and **NaN-repair** in the snapshot.

This **corrects the handover's framing**: `settleOffline`/freeze are not faulty
"kill-switch band-aids" — they are the *correct* d3 lifecycle (offline-settle is
the documented force-graph pattern; early-freeze idles the GPU) and they directly
fix the very bugs in scope. The defect was never `FieldLayout`; it was that
`CosmosField` abandoned it for cosmos's own box-clamped, re-seed-every-frame GPU
sim. The single capability `FieldLayout` is **missing** for this spec: a
**configurable circular/rect containment** (it has centering gravity but no radial
bound) — a small, well-understood addition (a custom force, or a per-tick clamp,
projecting `(x,y)` back inside radius R; soft `forceRadial`-style centering blended
with `forceCollide` so the disc fills evenly rather than crushing to center).

### 4. The seam already speaks the full vocabulary; the wire already carries edge semantics

`SceneController`'s command union already defines `set-layout-params` (carrying
`LayoutParams`), `set-layout-mode` (`force`|`circular`), `begin/end-interaction`,
`set-frozen`, `set-pinned`, `set-visibility`, `set-representation-mode`,
`set-overlays`, plus camera commands — all additive and already routed through the
controller; only `CosmosField` fails to implement them. `SceneEdgeData` already
carries `relation`, `tier` (`declared`|`structural`|`temporal`|`semantic`),
`confidence`, `state` (`resolved`|`stale`|`broken`), `meta.count`, and
`derivation` — **the full edge semantics are already on the wire**; the live canvas
just renders one uniform grey line. The dormant `EdgeMeshLayer` holds the existing
tier-treatment design (dashes/haze/meta-ribbon/lineage routes) as a visual
reference. So **Tier 3 = map existing edge fields to cosmos per-link channels**
(`setLinkColors` by tier, `setLinkWidths` by confidence, arrows by direction),
**Tier 4 = implement the layout commands the seam already defines.** Any new bound
command (`set-bounds {shape, size}`) is a deliberate **ADR-flagged additive seam
redline**, consistent with the seam's lock discipline and the
view-rewrite-preserves-the-contract rule.

### 5. Edges & the "~2448 hidden" count

`CosmosField.setData` keeps a link only when **both** endpoints resolve in the
current slice's id→index map; cross-boundary edges (endpoint truncated by the
engine's node ceiling, or absent from the slice) are silently dropped. So "hidden
edges" is honest data loss at the slice boundary, not a render cap. The honest
treatment (best-practice strand + bounded-query rule): keep the both-endpoints
filter, but **state truncation** and prefer LOD/degree-threshold/incident-on-hover
edge reduction over silent drops, and surface counts rather than hiding them.

### 6. Force / edge / performance best practice (strand C, corroborated by `FieldLayout`)

- **Non-overlap:** `forceCollide(radius=bodyRadius+pad)` with 1–2 iterations is the
  standard guaranteed-separation mechanism; combine with `forceManyBody`
  (`theta≈0.9`, `distanceMax` cap to keep it near-linear) and radius-aware
  `forceLink` rest length so sized discs never collapse inside one another. The
  installed driver already encodes these (`CHARGE_THETA 0.9`, `CHARGE_DISTANCE_MAX
  500`, summed-endpoint-radius link distance).
- **Settle-then-freeze:** fixed `alphaDecay`/`velocityDecay` + an early-freeze on a
  velocity/dwell threshold reaches a stable layout fast then idles; reheat on
  interaction via `alphaTarget`. (Exactly `FieldLayout`'s schedule.)
- **Drag couples neighbours:** pin `fx/fy` during drag under a held `alphaTarget`
  floor, release on drop (no permanent pin unless deliberately pinned).
- **Circular containment:** a per-tick radial clamp (hard, projecting outliers to
  the rim) gives a crisp disc; a soft radial force gives a gentler fill; blend with
  `forceCollide` so the disc fills evenly. Make `{shape, size}` runtime-tunable.
- **No re-seed / no bounce:** retain positions by **stable id** across refetches,
  warm-start only new nodes, and skip re-layout when topology is unchanged — all
  already in `applyChanges`. Initial seed via phyllotaxis/neighbour-centroid (in
  `seedPositions`) avoids the spread→settled jump.
- **Render-on-demand:** draw only while the sim is hot or the camera moves; idle =
  0 GPU. With cosmos-as-renderer this means calling `setPointPositions`+`render`
  only on `onPositions` frames, and stopping when the driver freezes.

### 7. Recommended direction (for the ADR)

1. **Renderer:** keep `@cosmos.gl/graph` as a **pure GPU point/line renderer** —
   `enableSimulation:false` + `rescalePositions:false`; push d3 positions per frame
   via `setPointPositions(flat, true)` + `render()`; keep the SDF crisp layer
   (coordinate ownership with its agent) and cosmos picking/hover/rings; tune
   `linkVisibilityDistanceRange`. (Re-validate vs. a bespoke PixiJS/regl renderer,
   but cosmos sim-off is the lowest-risk fit and already wired.)
2. **Layout engine:** **revive `FieldLayout`** to drive cosmos — it already gives
   collision, settle-offline, object-constancy (no bounce), freeze (idle GPU),
   drag/pin, slider params. Do **not** reintroduce cosmos's own GPU sim.
3. **Canvas/bound model:** free, centered, infinite-zoom canvas; add a
   **configurable containment** (default **circle**, options free/rect, settable
   radius/size) enforced in the layout tick; surface it via an ADR-flagged additive
   seam command.
4. **Edges:** encode `tier`/`confidence`/`relation`/`state` onto cosmos per-link
   color/width/arrows; honest LOD/hover reduction instead of silent drops.
5. **Performance:** render-on-demand off the driver's freeze; position retention via
   `applyChanges`; content-signature dedup on `set-data`.
6. **Tier order (strict):** T1 basics (renderer-only cosmos + free/centered canvas +
   circular configurable bound + real data + crisp render) → T2 performance + centering
   → T3 edge semantics → T4 sim/forces (collision/drag/cluster) + wire Tune sliders.

### 8. Open questions for the ADR

- Bound model: hard radial clamp vs. soft radial force vs. clamp+soft blend as the
  default circle behaviour; default radius (fixed vs. node-count-scaled).
- Seam surface for the bound: new `set-bounds {shape,size}` command vs. extending
  `set-layout-mode`/`LayoutParams` (the seam already has `set-layout-mode
  force|circular`, but that names a layout *algorithm*, not a *containment shape* —
  likely a distinct concept).
- Whether to delete the dormant PixiJS field/`EdgeMeshLayer` now or after the cosmos
  path reaches parity (no-deprecation-bridges preference argues for prompt removal
  once superseded).
- Concurrency: a stable engine window + explicit ownership of `cosmosField.ts` /
  `crispNodeLayer.ts` with the SDF and live-engine agents before Execute.

### 9. Tier-4 layout grounding: how second-brain tools lay out graphs (and the decision)

Dedicated research (at the user's direction to FOLLOW the norm, not diverge) into Obsidian,
Logseq, Foam, Roam, Kumu, Cosmograph, and the vasturiano force-graph library:

- **The norm.** A FREE, infinite pan-zoom canvas centred by WEAK GRAVITY, with many-body
  repulsion + link springs, OVERLAP-TOLERANT, settled-then-frozen with render-on-demand
  (idle GPU). No surveyed tool enforces a hard bound or guarantees non-overlap - "centered"
  is gravity, not a clip; Obsidian's nodes visibly overlap; Kumu's "remove overlap" is a
  separate opt-in pass. Obsidian's four knobs (center / repel / link / link-distance) are
  d3-force-shaped; it renders via PixiJS (GPU) over a CPU sim.
- **Scale.** CPU d3-force is adequate to ~3k nodes; GPU (cosmos/Cosmograph) is for the
  ~100k-1M regime (no collision, square space). A web worker is the standard escape hatch
  when the main-thread sim stalls; force-graph (Foam/Reflect) runs main-thread with
  settle-then-freeze + autoPauseRedraw (idle GPU 0).
- **Measured (this corpus, 3239 nodes).** `forceCollide` is the bottleneck (~30 ms/tick;
  `distanceMax` did not help - collide dominates). WITHOUT collide the tick is ~16 ms,
  main-thread viable. So the overlap-tolerant norm is also the performant path.
- **Circle bound.** `forceRadial` is the WRONG tool (it hollows the centre - a ring spring);
  a hard radial clamp fights the layout (anti-pattern). The norm's "centering" is soft
  forceX/forceY gravity; "more circular/compact" = stronger center gravity (Obsidian's
  center force). No d3 plugin does a circular bound; the norm does not use one.
- **No-bounce on refetch.** d3 preserves a node's position when it already has x/y; keep a
  per-id position map and seed only new nodes (FieldLayout's `applyChanges` object constancy).
- **Drag.** pin `fx/fy` + reheat (`alphaTarget` 0.3) on dragstart; release `fx/fy` +
  `alphaTarget` 0 on dragend - float back, no auto-pin (the prior graph-stability lesson).

**Decision (user directive: follow the norm).** Revive `FieldLayout` on the MAIN thread
WITHOUT collide (overlap-tolerant), driving cosmos's renderer; free canvas + soft gravity
centering (default free; circle/rect are soft compactness presets, configurable per the
user's "must be an option"); settle-then-freeze + render-on-demand; object-constancy
`applyChanges` (no bounce); drag reheat-then-float-back. No worker (~16 ms/tick suffices);
the worker is the documented escape hatch. This SUPERSEDES the §7 hard-circle-bound +
guaranteed-non-overlap framing (recorded in the ADR addendum, 2026-06-17).

Sources: Obsidian graph help + forums, Logseq/Foam/Kumu docs, vasturiano force-graph,
cosmos.gl/Cosmograph docs + installed types, Nightingale "million nodes", d3-force docs.
