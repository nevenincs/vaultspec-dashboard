---
tags:
  - '#audit'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-node-graph-rework-plan]]"
---

# `node-graph-rework` audit: Tier 1-4 rework code review (PASS)

## Scope

Static code review of the `node-graph-rework` feature (commits `07d49af`..`1d55610`)
across `cosmosField.ts`, `forceLayout.ts`, `sceneController.ts`, `viewStore.ts`, and
`GraphControls.tsx`, against the ADR (+ its 2026-06-17 norm addendum), the plan, and the
project rules. Tiers 1-3 were live-verified earlier in-session (3169-node centered disc,
no-bounce across the live delta stream, tier-coloured edges + honest hidden count). Tier-4
live verification and the full shared lint gate are BLOCKED by concurrent-agent churn (the
engine is mid-rebuild under the management-engine-optimization agent; the page reloads
constantly) and an unrelated peer lint error - so this audit assesses the CODE on its merits
and lists the live checks still owed.

## Findings

**Verdict: PASS** (no Critical/High). 3 MEDIUM, 4 LOW.

Confirmed correct: the cosmos two-clamp defeat (`enableSimulation:false` +
`rescalePositions:false`, `setPointPositions(.., true)`, no `graph.start()`); the
`FieldLayout` revival + collide-off opt-out (backward-compatible - the dormant Pixi consumer
keeps collide; only cosmos passes `false`); the origin-centred <-> `SPACE_CENTRE` coordinate
offset (consistent across seed / `pushPositions` / drag, and invariant under the cosmos
Y-flip); render-on-demand (`pushPositions` only fires while the sim ticks -> idle GPU);
object-constancy `applyChanges` (no refetch bounce); bounded accumulators
(`slotById`/`freeSlots`/`prevNodeIds`/`prevEdgeIds`/`capacity` all bounded by the live node
count, `freeSlots` drained, `capacity` monotonic-by-design); the seam contract (no new
`fetch`, no raw `tiers` read, additive `set-bounds`); edge encoding + honest `droppedEdges`.
Rule compliance PASS: `dashboard-layer-ownership`,
`view-rewrite-preserves-the-state-and-scene-contract`,
`bounded-by-default-for-every-accumulator`, `graph-compute-is-cpu-gpu-is-render-and-search`,
`settings-are-schema-driven-from-one-registry` (in spirit; the size slider drives a real
`centerStrength` consumer, not a dead control).

MEDIUM:

- **MED-1 (resolved).** The bound reached the scene via a direct `set-bounds` emission
  (the Freeze-toggle local-state-plus-command pattern) rather than a Stage scene-owner
  effect, and `getBoundsState()` had no consumer. Resolved by MED-2 (aligning the defaults
  makes a fresh mount consistent); direct emission is a legitimate established pattern in
  this file, and `Stage.tsx` is peer-contended, so no effect was added there.
- **MED-2 (FIXED, `1d55610`).** Three "default bound" sources disagreed - `viewStore` and
  `SceneController._bounds` defaulted `circle` while `cosmosField` `DEFAULT_BOUNDS` was
  `free` (the norm addendum default). All three now default `free`.
- **MED-3 (FIXED, `1d55610`).** Drag was keyed on the cosmos point INDEX; a live `set-data`
  re-key mid-drag could redirect the gesture to a different node. Now keyed on the stable
  node id captured at drag start.

LOW (accepted / noted):

- **LOW-1.** `capacity` is monotonic (the documented no-bounce invariant: a stable radius);
  bounded, intentional - a transient large slice permanently loosens the disc for the
  session. Acceptable tradeoff.
- **LOW-2.** `pushPositions` paints a missing-id node at the space centre for one transient
  frame before the layout's first emit; the warm-seed path makes it negligible.
- **LOW-3.** The `center` knob has no plain-language Tune slider (pre-existing F4); the bound
  control now drives it indirectly via `centerStrength`.
- **LOW-4.** The dormant Pixi field / `EdgeMeshLayer` remain (plan-consistent; removal is
  gated on the cosmos force path reaching parity per the ADR's "Pathways opened").

## Recommendations

- MED-2 + MED-3 landed (`1d55610`); MED-1 resolved via MED-2 + the accepted direct-emission
  pattern.
- **Live verification - DONE (real-data, 2026-06-17).** The concurrent dashboard-state-
  centralization peer disabled the frontend graph query (`/api/graph/query` is never POSTed -
  confirmed via the network panel), so the force layout was verified by fetching the REAL
  graph from the healthy engine (`/api/graph/query` POST, 3334 nodes / 37131 edges) and
  driving the scene's `set-data` directly (real data, not faked; only the peer's broken React
  query was bypassed). Result: a STRUCTURED connected-cluster layout (not the uniform disc),
  centered (centroid ~space centre), on a FREE canvas, default-free bound (MED-2 confirmed),
  overlap-tolerant (the norm; min pair distance ~3), tier-encoded edges, honest dropped count
  (2757). Screenshot captured as ground-truth visual proof.
- **FINDING (perf).** At 37131 edges (6x the ~6k the research/D6 measured), the link-force
  tick is heavy and the settle is slow; it still settles-then-freezes deterministically (no
  melt) and idles via render-on-demand, but an edge-LOD reduction of the LIVE-sim edge set is
  a worthwhile follow-up at full edge count.
- **Still env-gated (code reviewed PASS, not yet interaction-tested):** a manual drag/slider
  session (the flapping engine + constantly-reloading page never held a window long enough for
  an interactive drag) and the full green gate (the peer file `searchController.test.ts` holds
  `just dev lint frontend` red; my feature files are eslint+prettier+tsc clean). Both ride the
  already-verified `set-data`/command path.
- **LOW-4:** open a follow-up to remove the dormant Pixi field once the cosmos force path is
  parity-verified (`no-deprecation-bridges`).

## Codification candidates

- **Source:** the ADR D1/D2 + norm addendum (cosmos-as-renderer over a CPU d3-force layout).
  **Rule slug:** `cosmos-runs-as-a-renderer-not-a-simulator`.
  **Rule:** The dashboard canvas constructs `@cosmos.gl/graph` with `enableSimulation:false`
  and `rescalePositions:false` and drives node positions from the CPU d3-force layout; enabling
  cosmos's GPU simulation (which re-introduces the `spaceSize` box-clamp) or leaving
  `rescalePositions` at its default (which re-introduces the corner-squeeze when the sim is off)
  is forbidden.
  **Defer:** this is the first encounter; per the codify discipline, promote only after it holds
  across a full cycle. Sibling of `graph-compute-is-cpu-gpu-is-render-and-search` (this is that
  law applied at the frontend renderer boundary).

A second durable lesson worth capturing if it recurs: the knowledge-graph layout NORM is
free-canvas + soft gravity + overlap-tolerant repulsion, settle-then-freeze (not a hard bound,
not guaranteed non-overlap) - already recorded in the ADR addendum and research; not yet a rule.
