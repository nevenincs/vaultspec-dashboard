// Hierarchical / layered (Sugiyama) layout (graph-layout-catalog ADR D1, D2, D3,
// D6, D7; W02.P06).
//
// A deterministic-seed mode (D1): returns a populated positions Map the assembly
// seeds the solver from and holds stopped. Pure CPU compute over the served slice
// (graph-compute-is-CPU), framework-free — it reuses the shared, tested Sugiyama
// primitives in `layered.ts` (the extraction decision the lineage rebuild settled
// in W03.P10, recorded again here for W02.P06.S22: the longest-path layering,
// cycle removal, dummy insertion, crossing reduction, and coordinate assignment
// are SHARED, not duplicated; this module owns only the hierarchical-specific
// policy — backbone edge input, root-at-top orientation, world spacing).
//
// DISTINCT from lineage (D3): lineage is a single-axis, derivation-edge-only
// provenance spine with onSpine/dangling honest-degradation semantics that are a
// product commitment and must not be diluted. Hierarchical is a GENERAL 2-D
// layered layout over the structural backbone (D7) for ANY DAG-shaped subgraph —
// "show this subgraph's layered flow", not "trace this decision's provenance". It
// carries none of lineage's spine/dangling honesty fields; it lays every served
// node, connected or not.
//
// Edge input (D7): the layout backbone (declared + structural), via
// splitBackbone().backbone — the same anti-hairball subset every non-lineage
// layout feeds on. Cycles are removed by the shared deterministic back-edge
// reversal (no fabricated direction; the routing direction is restored for draw).
//
// Bounded (D6): only the near-linear heuristics are imported — longest-path
// layering, iterated barycenter/median crossing reduction (fixed sweep count),
// and median-alignment coordinate assignment. The exponential strategies
// (decrossOpt / coordSimplex / coordQuad-optimal) are NOT importable from
// layered.ts and a hard guard below asserts none ever sneaks in.
//
// Determinism is a hard contract (mental-map preservation): every tie-break in
// layered.ts is by id and the sweep count is fixed, so same inputs -> same
// positions.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { splitBackbone } from "./backbone";
import { type LayeredEdge, layeredLayout } from "./layered";

/** Base spacing between layers (world units, the depth/y axis: roots at top). */
export const HIER_LAYER_SPACING = 130;
/** Base spacing between sibling slots within a layer (the cross/x axis). */
export const HIER_NODE_SPACING = 90;

/**
 * Hard guard (D6): the forbidden exponential Sugiyama strategy names. The
 * hierarchical pipeline must use ONLY the near-linear heuristics; this list is
 * asserted to be absent from the imported surface so a future agent reaching for
 * d3-dag's optimal strategies "for prettier crossings" trips the guard rather
 * than silently shipping a denial-of-service layout (graph-queries-are-bounded).
 */
export const FORBIDDEN_LAYOUT_STRATEGIES = [
  "decrossOpt",
  "coordSimplex",
  "coordQuad",
] as const;

/**
 * Lay the served slice out as a layered (Sugiyama) graph over the structural
 * backbone. Pure: same inputs -> same positions.
 */
export function hierarchicalLayout(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): Map<string, { x: number; y: number }> {
  // D6 guard: none of the imported layered.ts surface exposes an exponential
  // strategy. This is a structural assertion — layeredLayout composes only the
  // heuristic phases — and a tripwire if the import surface ever changes.
  for (const banned of FORBIDDEN_LAYOUT_STRATEGIES) {
    if (banned in (layeredLayout as unknown as Record<string, unknown>)) {
      throw new Error(
        `hierarchicalLayout: forbidden exponential strategy "${banned}" (D6)`,
      );
    }
  }

  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;

  const nodeIds = nodes.map((n) => n.id);
  const idSet = new Set(nodeIds);

  // D7: build the DAG structure from the layout backbone (declared + structural),
  // directed src -> dst. Parallel/duplicate edges are deduped so the layering math
  // sees one parent->child relation per logical pair.
  const { backbone } = splitBackbone(edges);
  const layerEdges: LayeredEdge[] = [];
  const seen = new Set<string>();
  for (const e of backbone) {
    if (!idSet.has(e.src) || !idSet.has(e.dst) || e.src === e.dst) continue;
    const key = `${e.src} ${e.dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    layerEdges.push({ from: e.src, to: e.dst });
  }

  // The shared Sugiyama pipeline (cycle removal, longest-path layering with dummy
  // nodes, fixed-count median crossing reduction, median-alignment coordinates).
  const { layerOf, crossOf } = layeredLayout(nodeIds, layerEdges);

  // Map (layer, cross-coordinate) to world (x = cross, y = layer): roots sit at
  // the top (layer 0) and the layered flow descends, the conventional Sugiyama
  // reading. Only REAL served nodes get a position (dummies are routing-only).
  for (const id of nodeIds) {
    const layer = layerOf.get(id) ?? 0;
    const cross = crossOf.get(id) ?? 0;
    out.set(id, {
      x: cross * HIER_NODE_SPACING,
      y: layer * HIER_LAYER_SPACING,
    });
  }

  // Bound the cross extent (mental-map / on-screen guarantee). Hierarchical is a
  // DAG layout; on a DENSE subgraph — e.g. the feature constellation, ~1100
  // backbone edges over ~68 nodes — the longest-path layering threads long dummy
  // CHAINS that inflate a layer to hundreds of slots and push REAL nodes to
  // extreme cross coordinates (x in the tens of thousands, observed ~26500 live),
  // which fly off-screen and blow up the camera fit. Normal sparse, DAG-shaped
  // inputs stay far under this bound, so the rescale is a NO-OP for them (the
  // layout-quality scorecard's synthetic cases included); only the pathological
  // dense case is scaled to a bounded width, preserving layer order and the
  // relative cross-position of every node.
  const xs = [...out.values()].map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const extent = maxX - minX;
  const bound = nodeIds.length * HIER_NODE_SPACING;
  if (extent > bound) {
    const scale = bound / extent;
    const mid = (minX + maxX) / 2;
    for (const [id, p] of out) {
      out.set(id, { x: (p.x - mid) * scale, y: p.y });
    }
  }

  return out;
}
