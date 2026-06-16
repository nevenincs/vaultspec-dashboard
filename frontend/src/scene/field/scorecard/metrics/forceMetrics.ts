// Force / Free layout-quality metrics (graph-viz-scorecard ADR, W01.P02.S08).
//
// The generic graph-drawing-aesthetics suite is fully valid for a force layout
// (research F2): the drawing CLAIMS that geometric distance reflects graph
// distance and that neighbours stay neighbours, so we measure exactly that. Every
// metric returns a quality in [0,1], 1 = best. The O(N^2) terms (stress over all
// pairs, k-NN, min-pair distance) are bounded at the call site here — stress from a
// fixed-seed capped pair sample, neighbourhood/overlap over a node-bounded slice.

import type { Prng } from "../prng";
import type { SceneEdgeData, SceneNodeData } from "../../../sceneController";
import { greadability } from "./greadability";
import {
  type Position,
  buildAdjacency,
  bfsDistances,
  clamp01,
  coefficientOfVariation,
  euclidean,
  jaccard,
  kNearestNeighbours,
  sampleNodePairs,
  scaleNormalizedStressQuality,
} from "./shared";

/** The default cap on sampled node pairs for the stress estimator (bounded-by-
 *  default): the O(N^2) all-pairs stress is estimated from at most this many
 *  fixed-seed pairs. */
export const STRESS_PAIR_CAP = 2000;

export interface ForceMetrics {
  /** Scale-normalized stress quality vs graph shortest-path distance, in [0,1]. */
  stress: number;
  /** Neighbourhood preservation: mean Jaccard of geometric k-NN vs graph
   *  adjacency (k = node degree), in [0,1]. */
  neighborhoodPreservation: number;
  /** Node resolution: fraction of the min pair distance vs the median, mapped so
   *  1 = no two nodes are pathologically close (no overlap). */
  nodeResolution: number;
  /** Edge-length uniformity: 1 - clamp(CV of edge lengths), in [0,1]; 1 = all
   *  edges equal length. */
  edgeLengthUniformity: number;
  /** Crossings quality 1 - c/c_max (via the vendored greadability), in [0,1]. */
  crossings: number;
  /** Mean crossing-angle quality (ideal 70deg), in [0,1]. */
  crossingAngle: number;
}

/**
 * Score a force/Free drawing. `positions` are the drawn coordinates keyed by node
 * id; `nodes`/`edges` are the real scene arrays the layout consumed. `prng` seeds
 * the bounded stress pair sample. Pure and deterministic for a fixed `prng` state.
 */
export function scoreForceLayout(
  positions: ReadonlyMap<string, Position>,
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
  prng: Prng,
): ForceMetrics {
  const ids = nodes.map((n) => n.id).filter((id) => positions.has(id));
  const n = ids.length;
  const indexOf = new Map<string, number>();
  ids.forEach((id, i) => indexOf.set(id, i));
  const pos: Position[] = ids.map((id) => positions.get(id)!);

  // --- Scale-normalized stress vs graph shortest-path distance ---------------
  const adj = buildAdjacency(ids, edges);
  const stress = stressQuality(ids, pos, adj, prng);

  // --- Neighbourhood preservation: geometric k-NN vs graph adjacency ---------
  const neighborhoodPreservation = neighborhoodScore(ids, pos, adj, indexOf);

  // --- Node resolution / overlap (min pair distance) -------------------------
  const nodeResolution = nodeResolutionScore(pos, prng);

  // --- Edge-length CV --------------------------------------------------------
  const edgeLengthUniformity = edgeLengthScore(positions, edges);

  // --- Crossings + crossing angle (vendored greadability) --------------------
  const g = greadability(positions, edges);

  // Reference n so the unused-binding lint never fires on a degenerate slice.
  void n;

  return {
    stress,
    neighborhoodPreservation,
    nodeResolution,
    edgeLengthUniformity,
    crossings: g.crossingsQuality,
    crossingAngle: g.crossingAngleQuality,
  };
}

/** Scale-normalized stress quality: match SAMPLED geometric pair distances to the
 *  graph shortest-path distance between the same pair; disconnected pairs are
 *  skipped (no graph distance to match). */
function stressQuality(
  ids: readonly string[],
  pos: readonly Position[],
  adj: Map<string, string[]>,
  prng: Prng,
): number {
  const n = ids.length;
  if (n < 2) return 1;
  const sampled = sampleNodePairs(n, STRESS_PAIR_CAP, prng);
  // Cache BFS results per source so repeated samples from the same node reuse the
  // distance map (bounded: at most n BFS runs).
  const bfsCache = new Map<string, Map<string, number>>();
  const distFrom = (i: number): Map<string, number> => {
    const id = ids[i];
    let d = bfsCache.get(id);
    if (!d) {
      d = bfsDistances(adj, id);
      bfsCache.set(id, d);
    }
    return d;
  };
  const matched: { dHi: number; dLo: number }[] = [];
  for (const { i, j } of sampled) {
    const dHi = distFrom(i).get(ids[j]);
    if (dHi === undefined) continue; // disconnected pair
    const dLo = euclidean(pos[i], pos[j]);
    matched.push({ dHi, dLo });
  }
  if (matched.length === 0) return 1; // fully disconnected slice: vacuously faithful
  return scaleNormalizedStressQuality(matched);
}

/** Mean Jaccard overlap of each node's geometric k-NN (k = its graph degree) with
 *  its graph adjacency set. 1 = the drawing's near neighbours are exactly the
 *  graph neighbours. */
function neighborhoodScore(
  ids: readonly string[],
  pos: readonly Position[],
  adj: Map<string, string[]>,
  indexOf: Map<string, number>,
): number {
  const n = ids.length;
  if (n < 2) return 1;
  // The k for node i is its degree (the research-specified k = degree); cap at
  // n-1. Build a single k-NN table at the max degree, then slice per node.
  let maxDeg = 1;
  for (const id of ids) maxDeg = Math.max(maxDeg, (adj.get(id) ?? []).length);
  const kCap = Math.min(maxDeg, n - 1);
  const knn = kNearestNeighbours(n, kCap, (a, b) => euclidean(pos[a], pos[b]));
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    const neighbours = adj.get(ids[i]) ?? [];
    const deg = neighbours.length;
    if (deg === 0) continue; // isolated node has no neighbourhood claim
    const geomK = knn[i].slice(0, Math.min(deg, n - 1));
    const graphIdx = neighbours
      .map((nb) => indexOf.get(nb))
      .filter((x): x is number => x !== undefined);
    sum += jaccard(geomK, graphIdx);
    counted++;
  }
  return counted === 0 ? 1 : clamp01(sum / counted);
}

/** Node resolution: the minimum pairwise distance relative to the median pairwise
 *  distance, mapped so a min distance near the median (well spread) scores ~1 and a
 *  near-zero min (overlap) scores ~0. Bounded by a fixed-seed pair sample. */
function nodeResolutionScore(pos: readonly Position[], prng: Prng): number {
  const n = pos.length;
  if (n < 2) return 1;
  const sampled = sampleNodePairs(n, STRESS_PAIR_CAP, prng);
  const dists: number[] = [];
  for (const { i, j } of sampled) dists.push(euclidean(pos[i], pos[j]));
  if (dists.length === 0) return 1;
  dists.sort((a, b) => a - b);
  const min = dists[0];
  const median = dists[Math.floor(dists.length / 2)];
  if (median <= 1e-12) return 0; // everything collapsed to one point
  // Ratio of min to median, capped at 1: a min distance at or above the median is
  // perfect resolution; a min near zero (overlap) collapses to ~0.
  return clamp01(min / median);
}

/** Edge-length uniformity: 1 - clamp(CV of edge lengths). */
function edgeLengthScore(
  positions: ReadonlyMap<string, Position>,
  edges: readonly SceneEdgeData[],
): number {
  const lengths: number[] = [];
  for (const e of edges) {
    const a = positions.get(e.src);
    const b = positions.get(e.dst);
    if (!a || !b) continue;
    lengths.push(euclidean(a, b));
  }
  if (lengths.length < 2) return 1;
  return clamp01(1 - coefficientOfVariation(lengths));
}
