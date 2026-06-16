// Semantic / Meaning projection layout-quality metrics (graph-viz-scorecard ADR,
// W01.P02.S12).
//
// For a "nearby = similar" projection, RANK / neighbourhood fidelity is what the
// user perceives, so it is the primary metric family (research F3). We score a 2D
// projection of high-dimensional vectors against the originals:
//   - trustworthiness T(k): penalizes FALSE neighbours the 2D map invents.
//   - continuity C(k): penalizes TRUE neighbours the 2D map tears apart.
//     (Venna & Kaski rank formulas.)
//   - Q_NX(K): the co-k-NN preserved fraction, with K chosen by LCMC =
//     Q_NX(K) - K/(N-1) argmax (Lee & Verleysen) — a data-driven k.
//   - NH(k): neighbourhood hit, fraction of 2D k-NN sharing the point's label.
//   - mean silhouette by label over the 2D coords.
//   - nearest-centroid accuracy by label.
// Every metric returns a quality in [0,1], 1 = best.
//
// Bounding (research F5 / bounded-by-default): the rank metrics are computed over a
// fixed small k via the K x K co-ranking CORNER (shared.corankingCorner), never the
// full N x N matrix; the caller passes a node-ceiling-bounded slice.

import { type Position, clamp01, corankingCorner, euclidean } from "./shared";

/** The fixed neighbourhood size for the rank metrics (research F5: ~10-20). */
export const SEMANTIC_K = 10;
/** The maximum K swept for the LCMC-chosen Q_NX. */
export const SEMANTIC_K_MAX = 20;

export interface SemanticMetrics {
  /** Trustworthiness T(k) in [0,1]; 1 = no false neighbours invented. */
  trustworthiness: number;
  /** Continuity C(k) in [0,1]; 1 = no true neighbours torn apart. */
  continuity: number;
  /** Q_NX at the LCMC-chosen K, in [0,1]; the preserved co-k-NN fraction. */
  qnx: number;
  /** The K that maximized LCMC (reported for diagnostics). */
  qnxK: number;
  /** Neighbourhood hit NH(k): fraction of 2D k-NN sharing the label, in [0,1]. */
  neighborhoodHit: number;
  /** Mean silhouette by label over the 2D coords, mapped to [0,1]. */
  silhouette: number;
  /** Nearest-centroid accuracy by label, in [0,1]. */
  nearestCentroid: number;
}

/**
 * Score a semantic 2D projection against its high-dimensional source. `vectors[i]`
 * is the original high-dim vector of point `i`; `positions[i]` its drawn 2D
 * coordinate; `labels[i]` its known cluster label. (The gate projects the vectors
 * to 2D before calling this — per the Step contract this module accepts positions +
 * labels as input, not the projection itself.) Pure and deterministic.
 *
 * `positions` is an array aligned to `vectors` by index (the gate builds it from the
 * projection); a Map form is also accepted via `positionsFromMap`.
 */
export function scoreSemanticLayout(
  vectors: readonly number[][],
  positions: readonly Position[],
  labels: readonly number[],
): SemanticMetrics {
  const n = vectors.length;
  if (n < 3 || positions.length !== n || labels.length !== n) {
    return {
      trustworthiness: 1,
      continuity: 1,
      qnx: 1,
      qnxK: 0,
      neighborhoodHit: 1,
      silhouette: 1,
      nearestCentroid: 1,
    };
  }

  const highDist = (a: number, b: number): number =>
    euclideanVec(vectors[a], vectors[b]);
  const lowDist = (a: number, b: number): number =>
    euclidean(positions[a], positions[b]);

  // Build the fixed-k co-ranking corner once (bounded primitive).
  const corner = corankingCorner(n, SEMANTIC_K_MAX, highDist, lowDist);

  const trustworthiness = trustworthinessScore(corner, n, SEMANTIC_K);
  const continuity = continuityScore(corner, n, SEMANTIC_K);
  const { qnx, qnxK } = qnxLcmc(corner, n, SEMANTIC_K_MAX);
  const neighborhoodHit = neighborhoodHitScore(corner, labels, SEMANTIC_K);
  const silhouette = silhouetteByLabel(positions, labels);
  const nearestCentroid = nearestCentroidAccuracy(positions, labels);

  return {
    trustworthiness,
    continuity,
    qnx,
    qnxK,
    neighborhoodHit,
    silhouette,
    nearestCentroid,
  };
}

/** Convenience: project a positions Map (keyed by an id array) into the index-
 *  aligned array this module scores. */
export function positionsFromMap(
  ids: readonly string[],
  positions: ReadonlyMap<string, Position>,
): Position[] {
  return ids.map((id) => positions.get(id) ?? { x: 0, y: 0 });
}

function euclideanVec(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  const d = Math.min(a.length, b.length);
  for (let i = 0; i < d; i++) {
    const r = a[i] - b[i];
    s += r * r;
  }
  return Math.sqrt(s);
}

/**
 * Trustworthiness T(k) (Venna & Kaski): penalizes points that are among the k
 * nearest in the LOW-dim map but NOT in the high-dim space, weighted by how far
 * they were in the high-dim rank.
 *   T(k) = 1 - (2 / (Nk(2N-3k-1))) * sum_i sum_{j in U_k(i)} (r_hi(i,j) - k)
 * where U_k(i) are the false low-dim neighbours and r_hi is the high-dim rank.
 */
function trustworthinessScore(
  corner: ReturnType<typeof corankingCorner>,
  n: number,
  k: number,
): number {
  const kk = Math.min(k, corner.k);
  let penalty = 0;
  for (let i = 0; i < n; i++) {
    const lowK = corner.lowNeighbours[i].slice(0, kk);
    const highSet = new Set(corner.highNeighbours[i].slice(0, kk));
    for (const j of lowK) {
      if (!highSet.has(j)) {
        const rHi = corner.highRank[i].get(j) ?? n; // its high-dim rank
        penalty += rHi - kk;
      }
    }
  }
  const norm = 2 / (n * kk * (2 * n - 3 * kk - 1));
  if (!Number.isFinite(norm) || norm <= 0) return 1;
  return clamp01(1 - norm * penalty);
}

/**
 * Continuity C(k) (Venna & Kaski): the dual — penalizes points among the k nearest
 * in HIGH-dim that the low-dim map pushed OUT, weighted by their low-dim rank.
 *   C(k) = 1 - (2 / (Nk(2N-3k-1))) * sum_i sum_{j in V_k(i)} (r_lo(i,j) - k)
 */
function continuityScore(
  corner: ReturnType<typeof corankingCorner>,
  n: number,
  k: number,
): number {
  const kk = Math.min(k, corner.k);
  let penalty = 0;
  for (let i = 0; i < n; i++) {
    const highK = corner.highNeighbours[i].slice(0, kk);
    const lowSet = new Set(corner.lowNeighbours[i].slice(0, kk));
    for (const j of highK) {
      if (!lowSet.has(j)) {
        const rLo = corner.lowRank[i].get(j) ?? n;
        penalty += rLo - kk;
      }
    }
  }
  const norm = 2 / (n * kk * (2 * n - 3 * kk - 1));
  if (!Number.isFinite(norm) || norm <= 0) return 1;
  return clamp01(1 - norm * penalty);
}

/**
 * Q_NX(K) is the mean fraction of each point's K high-dim neighbours preserved in
 * its K low-dim neighbours. LCMC(K) = Q_NX(K) - K/(N-1) chooses K by argmax; we
 * report Q_NX at that K (research F3). Swept over 1..kMax (bounded by the corner).
 */
function qnxLcmc(
  corner: ReturnType<typeof corankingCorner>,
  n: number,
  kMax: number,
): { qnx: number; qnxK: number } {
  const top = Math.min(kMax, corner.k);
  let bestLcmc = -Infinity;
  let bestQnx = 1;
  let bestK = 0;
  for (let k = 1; k <= top; k++) {
    let preserved = 0;
    for (let i = 0; i < n; i++) {
      const highSet = new Set(corner.highNeighbours[i].slice(0, k));
      const lowK = corner.lowNeighbours[i].slice(0, k);
      let inter = 0;
      for (const j of lowK) if (highSet.has(j)) inter++;
      preserved += inter / k;
    }
    const qnx = preserved / n;
    const lcmc = qnx - k / (n - 1);
    if (lcmc > bestLcmc) {
      bestLcmc = lcmc;
      bestQnx = qnx;
      bestK = k;
    }
  }
  return { qnx: clamp01(bestQnx), qnxK: bestK };
}

/** Neighbourhood hit NH(k): mean fraction of each point's 2D k-NN sharing its
 *  label. 1 = every near neighbour in the drawing has the same label. */
function neighborhoodHitScore(
  corner: ReturnType<typeof corankingCorner>,
  labels: readonly number[],
  k: number,
): number {
  const kk = Math.min(k, corner.k);
  const n = labels.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const lowK = corner.lowNeighbours[i].slice(0, kk);
    if (lowK.length === 0) continue;
    let hit = 0;
    for (const j of lowK) if (labels[j] === labels[i]) hit++;
    sum += hit / lowK.length;
  }
  return clamp01(sum / n);
}

/** Mean silhouette over the 2D positions labelled by `labels`, mapped from [-1,1]
 *  to [0,1]. Bounded O(N^2) over the node-bounded slice. */
function silhouetteByLabel(
  positions: readonly Position[],
  labels: readonly number[],
): number {
  const n = positions.length;
  if (n < 2 || new Set(labels).size < 2) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let aSum = 0;
    let aCount = 0;
    const bByLabel = new Map<number, { sum: number; count: number }>();
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = euclidean(positions[i], positions[j]);
      if (labels[j] === labels[i]) {
        aSum += d;
        aCount++;
      } else {
        const e = bByLabel.get(labels[j]) ?? { sum: 0, count: 0 };
        e.sum += d;
        e.count++;
        bByLabel.set(labels[j], e);
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;
    let b = Infinity;
    for (const e of bByLabel.values()) {
      if (e.count > 0) b = Math.min(b, e.sum / e.count);
    }
    if (!Number.isFinite(b)) continue;
    sum += (b - a) / Math.max(a, b, 1e-12);
  }
  return clamp01((sum / n + 1) / 2);
}

/** Nearest-centroid accuracy: assign each 2D point to the nearest label-centroid
 *  and report the fraction assigned to their true label. 1 = labels are linearly
 *  centroid-separable in the drawing. */
function nearestCentroidAccuracy(
  positions: readonly Position[],
  labels: readonly number[],
): number {
  const n = positions.length;
  if (n === 0) return 1;
  // Per-label centroid.
  const sums = new Map<number, { x: number; y: number; count: number }>();
  for (let i = 0; i < n; i++) {
    const e = sums.get(labels[i]) ?? { x: 0, y: 0, count: 0 };
    e.x += positions[i].x;
    e.y += positions[i].y;
    e.count++;
    sums.set(labels[i], e);
  }
  const centroids = new Map<number, Position>();
  for (const [label, e] of sums) {
    centroids.set(label, { x: e.x / e.count, y: e.y / e.count });
  }
  let correct = 0;
  for (let i = 0; i < n; i++) {
    let best = labels[i];
    let bestD = Infinity;
    for (const [label, c] of centroids) {
      const d = euclidean(positions[i], c);
      if (d < bestD) {
        bestD = d;
        best = label;
      }
    }
    if (best === labels[i]) correct++;
  }
  return clamp01(correct / n);
}
