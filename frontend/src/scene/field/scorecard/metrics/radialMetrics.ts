// Radial / tree layout-quality metrics (graph-viz-scorecard ADR, W01.P02.S10).
//
// A radial (concentric-tree) drawing claims the tidy-tree invariants (research
// F2): every node sits on a ring whose radius reflects its depth, sibling subtrees
// occupy DISJOINT angular wedges, rings and wedges are uniform, and a true tree
// draws with ~zero crossings. We score those against the planted tree
// (`LayeredFixture`: `layerOf` as depth, `root`, and the parent->child edges).
// Every metric returns a quality in [0,1], 1 = best. Angles are measured from the
// drawn centroid of the layout (the radial center), so the metrics are invariant to
// the layout's absolute placement.

import type { SceneEdgeData } from "../../../sceneController";
import { greadability } from "./greadability";
import { type Position, clamp01, coefficientOfVariation, spearman } from "./shared";

export interface RadialMetrics {
  /** Subtree disjointness: fraction of sibling pairs whose angular wedges do not
   *  overlap, in [0,1]. */
  subtreeDisjointness: number;
  /** Wedge + ring uniformity: 1 - clamp(mean CV of per-depth ring radius and of
   *  sibling angular spans), in [0,1]. */
  uniformity: number;
  /** Depth-to-radius Spearman rank correlation, mapped to [0,1] (1 = monotone). */
  depthRadius: number;
  /** Node overlap: 1 = no two nodes share a position (ideal), in [0,1]. */
  nodeOverlap: number;
  /** Crossings quality (~1 for a true tree drawn radially), in [0,1]. */
  crossings: number;
}

interface TreeStructure {
  parent: Map<string, string>;
  children: Map<string, string[]>;
}

/**
 * Score a radial/tree drawing against a planted tree. `positions` are drawn
 * coordinates keyed by node id; `layerOf` is depth per node; `root` the tree root;
 * `edges` the real scene edges (parent->child). Pure and deterministic.
 */
export function scoreRadialLayout(
  positions: ReadonlyMap<string, Position>,
  layerOf: ReadonlyMap<string, number>,
  root: string,
  edges: readonly SceneEdgeData[],
): RadialMetrics {
  const drawnEdges = edges.filter(
    (e) => positions.has(e.src) && positions.has(e.dst) && e.src !== e.dst,
  );
  const center = layoutCentroid(positions);
  const tree = buildTree(layerOf, root, drawnEdges);

  return {
    subtreeDisjointness: subtreeDisjointnessScore(positions, center, tree),
    uniformity: uniformityScore(positions, center, layerOf, tree),
    depthRadius: depthRadiusScore(positions, center, layerOf),
    nodeOverlap: nodeOverlapScore(positions),
    crossings: greadability(positions, drawnEdges).crossingsQuality,
  };
}

/** Centroid of all drawn positions — the radial center the angles are measured
 *  from. */
function layoutCentroid(positions: ReadonlyMap<string, Position>): Position {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of positions.values()) {
    sx += p.x;
    sy += p.y;
    n++;
  }
  return n === 0 ? { x: 0, y: 0 } : { x: sx / n, y: sy / n };
}

/** Build the parent/children maps from the planted depth and the drawn edges: an
 *  edge runs from the shallower to the deeper endpoint (parent->child). */
function buildTree(
  layerOf: ReadonlyMap<string, number>,
  root: string,
  edges: readonly SceneEdgeData[],
): TreeStructure {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const ls = layerOf.get(e.src);
    const ld = layerOf.get(e.dst);
    if (ls === undefined || ld === undefined) continue;
    // Orient parent (shallower) -> child (deeper).
    let p = e.src;
    let c = e.dst;
    if (ld < ls) {
      p = e.dst;
      c = e.src;
    }
    if (p === c) continue;
    parent.set(c, p);
    const arr = children.get(p) ?? [];
    arr.push(c);
    children.set(p, arr);
  }
  void root;
  return { parent, children };
}

/** The angular extent (min angle, max angle) a node's whole subtree spans around
 *  the center, measured by collecting every descendant's angle. */
function subtreeWedge(
  node: string,
  positions: ReadonlyMap<string, Position>,
  center: Position,
  children: Map<string, string[]>,
): { min: number; max: number; count: number } | null {
  const angles: number[] = [];
  const stack = [node];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const p = positions.get(u);
    if (p) angles.push(Math.atan2(p.y - center.y, p.x - center.x));
    for (const c of children.get(u) ?? []) stack.push(c);
  }
  if (angles.length === 0) return null;
  return { min: Math.min(...angles), max: Math.max(...angles), count: angles.length };
}

/** Subtree disjointness: for every internal node, the angular wedges of its child
 *  subtrees should be disjoint. Score = fraction of sibling pairs (across the whole
 *  tree) whose wedges do not overlap. */
function subtreeDisjointnessScore(
  positions: ReadonlyMap<string, Position>,
  center: Position,
  tree: TreeStructure,
): number {
  let disjoint = 0;
  let pairs = 0;
  for (const kids of tree.children.values()) {
    if (kids.length < 2) continue;
    const wedges = kids
      .map((k) => subtreeWedge(k, positions, center, tree.children))
      .filter((w): w is { min: number; max: number; count: number } => w !== null);
    for (let i = 0; i < wedges.length; i++) {
      for (let j = i + 1; j < wedges.length; j++) {
        pairs++;
        // Disjoint if one wedge ends before the other begins (no interval overlap).
        const a = wedges[i];
        const b = wedges[j];
        if (a.max <= b.min || b.max <= a.min) disjoint++;
      }
    }
  }
  if (pairs === 0) return 1; // no sibling pairs to conflict
  return clamp01(disjoint / pairs);
}

/** Ring + wedge uniformity: rings should be evenly spaced (low CV of per-depth mean
 *  radius) and sibling angular spans even (low CV of per-parent child-angle gaps).
 *  Score = 1 - mean of the two clamped CVs. */
function uniformityScore(
  positions: ReadonlyMap<string, Position>,
  center: Position,
  layerOf: ReadonlyMap<string, number>,
  tree: TreeStructure,
): number {
  // Ring uniformity: mean radius per depth, then CV across consecutive ring gaps.
  const radiiByDepth = new Map<number, number[]>();
  for (const [id, depth] of layerOf) {
    const p = positions.get(id);
    if (!p) continue;
    const r = Math.hypot(p.x - center.x, p.y - center.y);
    const arr = radiiByDepth.get(depth) ?? [];
    arr.push(r);
    radiiByDepth.set(depth, arr);
  }
  const depths = Array.from(radiiByDepth.keys()).sort((a, b) => a - b);
  const meanRadii = depths.map((d) => {
    const arr = radiiByDepth.get(d)!;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  });
  const ringGaps: number[] = [];
  for (let i = 1; i < meanRadii.length; i++) {
    ringGaps.push(Math.max(0, meanRadii[i] - meanRadii[i - 1]));
  }
  const ringCv = ringGaps.length >= 2 ? coefficientOfVariation(ringGaps) : 0;

  // Wedge uniformity: for each parent, the angular gaps between consecutive
  // children should be even.
  const wedgeCvs: number[] = [];
  for (const kids of tree.children.values()) {
    if (kids.length < 3) continue;
    const angles = kids
      .map((k) => positions.get(k))
      .filter((p): p is Position => !!p)
      .map((p) => Math.atan2(p.y - center.y, p.x - center.x))
      .sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < angles.length; i++) gaps.push(angles[i] - angles[i - 1]);
    if (gaps.length >= 2) wedgeCvs.push(coefficientOfVariation(gaps));
  }
  const wedgeCv =
    wedgeCvs.length > 0 ? wedgeCvs.reduce((s, x) => s + x, 0) / wedgeCvs.length : 0;

  return clamp01(1 - (clamp01(ringCv) + clamp01(wedgeCv)) / 2);
}

/** Depth-to-radius Spearman: the drawn radius from center should increase
 *  monotonically with planted depth. Map the [-1,1] correlation to [0,1]. */
function depthRadiusScore(
  positions: ReadonlyMap<string, Position>,
  center: Position,
  layerOf: ReadonlyMap<string, number>,
): number {
  const depths: number[] = [];
  const radii: number[] = [];
  for (const [id, depth] of layerOf) {
    const p = positions.get(id);
    if (!p) continue;
    depths.push(depth);
    radii.push(Math.hypot(p.x - center.x, p.y - center.y));
  }
  if (depths.length < 2) return 1;
  const rho = spearman(depths, radii);
  return clamp01((rho + 1) / 2);
}

/** Node overlap: 1 when no two nodes share (nearly) the same position. We count
 *  pairs closer than an epsilon relative to the layout extent; score = 1 - overlap
 *  fraction. Bounded by quantizing positions into a grid (O(N)), not O(N^2). */
function nodeOverlapScore(positions: ReadonlyMap<string, Position>): number {
  const pts = Array.from(positions.values());
  const n = pts.length;
  if (n < 2) return 1;
  // Layout extent for a scale-relative epsilon.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent <= 1e-12) return 0; // all collapsed to a point: total overlap
  const eps = extent / 1000;
  // Grid-bucket by an eps-sized cell; nodes sharing a cell (or an adjacent cell)
  // are an overlap. This bounds the check to O(N) buckets.
  const cell = Math.max(eps, 1e-9);
  const buckets = new Map<string, number>();
  let overlaps = 0;
  for (const p of pts) {
    const gx = Math.round(p.x / cell);
    const gy = Math.round(p.y / cell);
    const key = `${gx}:${gy}`;
    const prev = buckets.get(key) ?? 0;
    if (prev > 0) overlaps++;
    buckets.set(key, prev + 1);
  }
  return clamp01(1 - overlaps / n);
}
