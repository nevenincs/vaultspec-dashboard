// Sugiyama (lineage + hierarchy) layout-quality metrics (graph-viz-scorecard ADR,
// W01.P02.S09).
//
// A layered DAG drawing is scored with LAYERED-specific measures, not the generic
// angular suite (research F2): the drawing claims each node sits at a y-band that
// reflects its true layer and that edges flow one way with few crossings. We score
// that against the PLANTED layering (`LayeredFixture.layerOf`). Every metric returns
// a quality in [0,1], 1 = best.
//
// Crossing counting is done PER ADJACENT-LAYER PAIR using the planted layer (the
// standard Sugiyama crossing count), which is O(E^2) within a layer pair but bounded
// by the layer sizes; the slice is node-ceiling-bounded upstream so the accumulator
// is bounded at the call site.

import type { SceneEdgeData } from "../../../sceneController";
import { type Position, clamp01 } from "./shared";

export interface SugiyamaMetrics {
  /** Per-adjacent-layer crossing quality 1 - c/c_max over the planted layering. */
  crossings: number;
  /** Dummy/bend proxy: 1 - (fraction of edges spanning more than one layer). */
  bendProxy: number;
  /** Edge monotonicity: fraction of edges drawn pointing downward (src above dst). */
  monotonicity: number;
  /** Total edge length quality: shorter total edge length scores higher (vs a
   *  baseline of one layer-gap per edge). */
  edgeLength: number;
  /** Layer-assignment correctness: fraction of nodes whose drawn y-band rank
   *  matches the planted layer rank. */
  layerAssignment: number;
}

/**
 * Score a Sugiyama (lineage/hierarchy) drawing against a planted layering.
 * `positions` are drawn coordinates keyed by node id; `layerOf` is the planted
 * layer per node id (`LayeredFixture.layerOf`); `edges` the real scene edges. Pure
 * and deterministic.
 *
 * Y-axis convention: the layouts draw deeper layers at LARGER y (downward), so a
 * "downward" edge has `dst.y > src.y`. `layerOf` increases with depth, so a higher
 * planted layer index should map to a larger drawn y.
 */
export function scoreSugiyamaLayout(
  positions: ReadonlyMap<string, Position>,
  layerOf: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
): SugiyamaMetrics {
  const drawnEdges = edges.filter(
    (e) => positions.has(e.src) && positions.has(e.dst) && e.src !== e.dst,
  );

  return {
    crossings: perLayerCrossingQuality(positions, layerOf, drawnEdges),
    bendProxy: bendProxyScore(layerOf, drawnEdges),
    monotonicity: monotonicityScore(positions, drawnEdges),
    edgeLength: edgeLengthScore(layerOf, drawnEdges),
    layerAssignment: layerAssignmentScore(positions, layerOf),
  };
}

/**
 * Per-adjacent-layer crossing quality. For each planted layer L, take the edges
 * that START at layer L (by the src node's planted layer) and count how many pairs
 * cross when ordered by the drawn x of their endpoints — the standard layered
 * crossing count. Quality = 1 - c / c_max, c_max = total candidate edge pairs.
 */
function perLayerCrossingQuality(
  positions: ReadonlyMap<string, Position>,
  layerOf: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
): number {
  // Group edges by the planted layer of their source.
  const byLayer = new Map<number, SceneEdgeData[]>();
  for (const e of edges) {
    const ls = layerOf.get(e.src);
    if (ls === undefined) continue;
    const arr = byLayer.get(ls) ?? [];
    arr.push(e);
    byLayer.set(ls, arr);
  }
  let crossings = 0;
  let maxCrossings = 0;
  for (const group of byLayer.values()) {
    // Two edges (a->b) and (c->d) in the same layer pair cross iff the order of
    // their src x and dst x disagree. Count all unordered edge pairs in the group.
    for (let i = 0; i < group.length; i++) {
      const ai = positions.get(group[i].src)!;
      const bi = positions.get(group[i].dst)!;
      for (let j = i + 1; j < group.length; j++) {
        const aj = positions.get(group[j].src)!;
        const bj = positions.get(group[j].dst)!;
        maxCrossings++;
        const srcOrder = Math.sign(ai.x - aj.x);
        const dstOrder = Math.sign(bi.x - bj.x);
        // A crossing: the src order and dst order are opposite (and neither tied).
        if (srcOrder !== 0 && dstOrder !== 0 && srcOrder !== dstOrder) {
          crossings++;
        }
      }
    }
  }
  if (maxCrossings === 0) return 1;
  return clamp01(1 - crossings / maxCrossings);
}

/** Dummy/bend proxy: a long edge (spanning more than one planted layer) needs
 *  dummy nodes / bends in a real Sugiyama drawing. Quality = 1 - long-edge
 *  fraction; 1 = every edge spans exactly one layer. */
function bendProxyScore(
  layerOf: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
): number {
  let total = 0;
  let long = 0;
  for (const e of edges) {
    const ls = layerOf.get(e.src);
    const ld = layerOf.get(e.dst);
    if (ls === undefined || ld === undefined) continue;
    total++;
    if (Math.abs(ld - ls) > 1) long++;
  }
  if (total === 0) return 1;
  return clamp01(1 - long / total);
}

/** Edge monotonicity: fraction of edges drawn pointing downward (dst below src in
 *  drawn y). A clean layered drawing has every edge flowing one way. */
function monotonicityScore(
  positions: ReadonlyMap<string, Position>,
  edges: readonly SceneEdgeData[],
): number {
  let total = 0;
  let downward = 0;
  for (const e of edges) {
    const s = positions.get(e.src)!;
    const d = positions.get(e.dst)!;
    total++;
    if (d.y > s.y) downward++;
  }
  if (total === 0) return 1;
  return clamp01(downward / total);
}

/** Total edge length quality vs the ideal of one layer-gap per edge. We measure
 *  total spanned layers (sum of |layer(dst) - layer(src)|) against the minimum
 *  possible (one per edge): quality = edges / totalSpan, so an all-adjacent drawing
 *  scores 1 and long edges drag it down. */
function edgeLengthScore(
  layerOf: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
): number {
  let totalSpan = 0;
  let count = 0;
  for (const e of edges) {
    const ls = layerOf.get(e.src);
    const ld = layerOf.get(e.dst);
    if (ls === undefined || ld === undefined) continue;
    totalSpan += Math.max(1, Math.abs(ld - ls));
    count++;
  }
  if (count === 0) return 1;
  return clamp01(count / totalSpan);
}

/**
 * Layer-assignment correctness: bucket nodes into drawn y-bands by ranking their
 * drawn y, then check what fraction of nodes land in the same RANK order as their
 * planted layer. We compare the planted layer rank to the drawn-y rank via a
 * monotone-agreement count: for each node we check that its drawn y is consistent
 * with its planted layer (a node in a deeper planted layer is drawn no higher than
 * a node in a shallower one). Concretely: fraction of nodes whose drawn y-band index
 * (quantized by distinct planted layers) equals its planted layer.
 */
function layerAssignmentScore(
  positions: ReadonlyMap<string, Position>,
  layerOf: ReadonlyMap<string, number>,
): number {
  const entries: { id: string; y: number; layer: number }[] = [];
  for (const [id, layer] of layerOf) {
    const p = positions.get(id);
    if (!p) continue;
    entries.push({ id, y: p.y, layer });
  }
  if (entries.length === 0) return 1;

  // Distinct planted layers, sorted ascending: these are the expected bands.
  const distinctLayers = Array.from(new Set(entries.map((e) => e.layer))).sort(
    (a, b) => a - b,
  );
  const layerRank = new Map<number, number>();
  distinctLayers.forEach((l, i) => layerRank.set(l, i));
  const bandCount = distinctLayers.length;
  if (bandCount <= 1) return 1; // single layer: trivially correct

  // Quantize drawn y into `bandCount` bands by sorting nodes by y and slicing into
  // equal-population bands (the layout draws bands top-to-bottom). The band index a
  // node lands in should equal its planted layer rank.
  const byY = entries.slice().sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  // Assign each node a drawn band by its y-rank, splitting into bands at the
  // distinct planted-layer boundaries (population per band = nodes in that layer).
  const drawnBand = new Map<string, number>();
  // Count nodes per planted layer to size each band.
  const perLayerCount = new Map<number, number>();
  for (const e of entries) {
    perLayerCount.set(e.layer, (perLayerCount.get(e.layer) ?? 0) + 1);
  }
  let cursor = 0;
  for (let band = 0; band < bandCount; band++) {
    const layer = distinctLayers[band];
    const size = perLayerCount.get(layer) ?? 0;
    for (let k = 0; k < size && cursor < byY.length; k++, cursor++) {
      drawnBand.set(byY[cursor].id, band);
    }
  }

  let correct = 0;
  for (const e of entries) {
    const expected = layerRank.get(e.layer)!;
    if (drawnBand.get(e.id) === expected) correct++;
  }
  return clamp01(correct / entries.length);
}
