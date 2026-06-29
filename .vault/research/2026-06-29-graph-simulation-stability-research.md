---
tags:
  - '#research'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
related: []
---

# `graph-simulation-stability` research: `graph stays static unless dragged: decoupling selection and additive set-data from the force solver`

The headline node-graph reshapes itself in situations where the user expects it to be
still. The reported symptom: the layout is throttled to avoid jitter, but "internal
tension causes shape change", and selection highlighting plus navigation flares feel
"tethered to simulation change". The user's stated requirement is precise: **the graph
must be static unless a node is explicitly dragged**; selecting, highlighting, flaring,
and focusing must be pure visual + camera operations that never move a node.

This document grounds the actual coupling in the live code path, establishes why the
intuitive "make the rest state a true fixed point by alpha-annealing collide" fix is the
wrong lever, and weighs the architecturally correct alternative (treat the settled layout
as authoritative, pin survivors, and never re-simulate existing nodes).

## Findings

### F1 — The data path, and where the solver re-runs

The graph is a four-layer projection: the `vaultspec` engine serves the slice;
`frontend/src/stores/` holds the query cache and dashboard-state; `frontend/src/app/stage/Stage.tsx`
turns store state into `SceneController` commands; `frontend/src/scene/sceneController.ts`
forwards them to the renderer `frontend/src/scene/three/threeField.ts`; and
`frontend/src/scene/three/d3ForceSolver.ts` is the CPU force simulation.

The renderer is render-on-demand: `frame()` ticks the solver only while `running` is
true, mirrors positions into the GPU position texture, and sets `running = false` the
instant `solver.isSettled()` — so a settled graph does zero CPU/GPU work. `running` is
set true in exactly these places: a fresh `set-data` (`setData`), a node drag
(`startNodeDrag`/`endNodeDrag`), a live force/size retune (`setForceParams`/`setAppearanceParams`),
and an explicit resume/reheat. Crucially, **selection does not set `running`**.

### F2 — Selection highlight and flares are already decoupled at the field level

A canvas click emits `select`; the stores path (`selectFromScene` ->
`patchDashboardState` -> `projectDashboardSelectionToScene`) issues `set-selected`, which
runs `applyEmphasis()` (a per-node `aDim` attribute rewrite) and a single
`requestRender()` — one frame, no solver tick. The selection rings, hover ring, pin
ring, and the transient pulse "flare" are all drawn in `drawLabels()`, which runs inside
that single `renderFrame()`. So the highlight/flare visuals do **not** ride the
simulation; they repaint on the one requested frame. The user's framing is right in
spirit but the field-level select path is clean.

`focus-node` (issued for a non-scene-originated selection, e.g. from the rail or search)
moves the camera only — it never wakes the solver. `frame-nodes` and `set-meta-highlight`
(feature follow-mode) are likewise camera + emphasis only.

### F3 — The real coupling: every additive `set-data` re-runs the WHOLE solver

The reshape the user sees comes from `set-data`, not from selection per se. The
`Stage.tsx` effect re-issues `set-data` whenever `displaySlice` changes, and `displaySlice`
is derived from `merged = mergeSlices(slice.data, expansionData)`. The expansions come
from `useNodeNeighborsBulk(workingSet, ...)`. So **opening or expanding a node** (the
working set grows via `expandWorkingSet` on dbl-click / Enter-walk / expand) fetches that
node's ego network, which recomputes `merged` -> `displaySlice` -> a new `set-data`.
Live deltas take the same destination (`apply-deltas` -> `applyDeltas` -> `setData`), as
does any re-fetch that returns content for the same scope.

`setData()` always rebuilds the solver and runs it. Its warm-start path
(`carried >= 0.5 * nodes.length`) seeds persisting nodes from their prior positions, then
calls `solver.prewarm(undefined, undefined, WARM_START_ALPHA)`. `prewarm` begins with
`wakeAllFree()`, which **unpins every node** (clears `fx`/`fy`) and ticks at alpha 0.3.
Because the settled graph was *frozen, not converged* (F4), unpinning releases the stored
tension and the entire existing layout drifts to a new configuration — not just the new
ego nodes. This is the architectural misfire: an additive change re-simulates the whole
graph.

The fix pattern already exists but is wired only to the FILTER reflow path:
`prewarmReflow(isNew, ...)` pins every carried survivor at its current position and
relaxes ONLY genuinely-new nodes; a pure removal does zero ticks and moves nothing. The
plain warm-start path does not pin survivors, so it reshapes them.

### F4 — d3-force is an annealer, not a minimizer: "true fixed point via collide annealing" is the wrong lever

The solver freezes rather than converges. `D3ForceSolver.tick()` calls `sleepAll()` — which
pins every node at its current spot — the instant `alpha < alphaMin`. The code's own
comments state this directly: `forceCollide` is not alpha-scaled, so "a dense graph
'settles' only because the loop freezes it at alphaMin; a true fixed point would require
scaling collide by alpha (a known refinement)." So at rest the forces are not balanced;
the graph is merely pinned.

The d3-force model (the authoritative source for both this solver and Obsidian's graph —
verified against the d3-force simulation docs): `alpha` starts at 1; each tick applies
`alpha += (alphaTarget - alpha) * alphaDecay`, with default `alphaDecay ~= 0.0228`
(`= 1 - 0.001^(1/300)`) and `alphaMin = 0.001`, so the timer stops after ~300 ticks.
Drag reheats via `alphaTarget = 0.3` + `restart()`, returning to 0 on release. The key
fact: **d3-force is simulated annealing.** When alpha reaches `alphaMin`, the layout is
wherever motion happened to be when temperature hit zero — NOT a force equilibrium. Most
forces (link, charge, x/y) are alpha-scaled, so velocity contributions fade; collide is
the position-based exception.

Therefore alpha-annealing collide would only stop collide from contributing residual
jitter as alpha -> 0; it would NOT make the rest state a stable fixed point, because the
integrator never seeks a minimum — it cools on a fixed 300-tick schedule regardless of
whether forces have balanced. Chasing a "true fixed point" inside d3-force is structurally
unsound. This corroborates the user's own doubt that the alpha-annealing strategy "is not
successful".

### F5 — Obsidian's model: warm jiggle, no pinning, lives with drift

Obsidian's graph engine is closed/minified, so its alpha internals are not published, but
its force vocabulary is d3-force's (community-documented tuned defaults: center strength
~0.48, repel ~16.41, link ~0.44, link distance ~198). The salient architectural fact:
Obsidian does NOT pin nodes or seek a fixed point — it keeps the simulation warm while the
graph is open (the gentle continuous "jiggle") and lets it cool when idle, accepting
drift as the cost. Our project's pin-on-settle (`sleepAll`) is already MORE static than
Obsidian. So "how does Obsidian keep it still" has no answer to copy — Obsidian doesn't
keep it still. The user's stricter requirement (static unless dragged) must be met by a
different mechanism than tuning alpha.

### F6 — The architecturally correct direction: authoritative positions, pin-and-don't-re-simulate

The requirement "static unless dragged" is a position-authority decision, not a force-tuning
one. Once a layout has settled, its positions should be treated as authoritative and frozen;
the solver should run again only to place genuinely-NEW nodes, relaxing them against pinned
survivors, never re-integrating the survivors. Concretely:

- Generalize the `prewarmReflow` discipline (pin survivors, relax only new) to EVERY
  additive `set-data` (ego expansion, live delta, re-fetch), not just the filter-reflow
  path. New nodes seed next to a persisting neighbour and settle into the gaps; existing
  nodes hold their exact positions.
- A `set-data` whose id set is UNCHANGED (a content-only re-fetch) must do ZERO ticks and
  leave the layout untouched — today it warm-reheats the whole graph.
- The cold full-energy layout stays only for a genuinely new corpus (first load, scope or
  lens switch — a disjoint id set), where there is no prior layout to preserve.

A related observation: `frontend/src/scene/positionCache.ts` (a per-scope localStorage
position cache) EXISTS but ThreeField does not consume it — `setPersistenceScope` is a
no-op and warm-start relies only on the live in-memory `prevPos` from the previous
`idToIndex`. Persisting authoritative positions across reloads is a possible extension but
is NOT required for the core fix; the in-session pin-survivors change addresses the
reported symptom.

This direction leaves the renderer's existing render-on-demand and the already-decoupled
selection/highlight/flare/focus paths (F2) untouched. The drag path is the one sanctioned
mover and is preserved exactly: a grab enters local mode, pins everything else, and wakes
only the dragged neighbourhood.

### F7 — Open questions for the ADR

- **Scope of "new node settle":** when an ego expansion adds N nodes near a pinned hub,
  should ONLY the new nodes move, or should a bounded one-hop neighbourhood be allowed to
  relax to absorb them (a middle ground between "nothing moves" and "everything moves")?
  The user's requirement reads as the strict form (only new nodes move); the ADR should
  confirm.
- **Collide on pinned survivors:** pinned survivors are fixed obstacles; new nodes must
  not be placed overlapping them. Confirm `forceCollide` still resolves new-vs-survivor
  overlap with survivors held fixed (it does, since pinned nodes remain in the quadtree).
- **Whether to drop the collide-annealing follow-up entirely** (F4 says yes) or keep it as
  a minor jitter-reduction unrelated to the fixed-point goal.
- **Persisted positions (`positionCache`) wiring** — defer as a separate enhancement or
  fold in now?
