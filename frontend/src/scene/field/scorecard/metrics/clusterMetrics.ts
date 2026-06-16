// Cluster / Louvain layout-quality metrics (graph-viz-scorecard ADR, W01.P02.S11).
//
// The decisive measure for a community layout is Meidiana et al. (research F2):
// cluster the DRAWN POSITIONS by k-means *ignoring edges* into K = |partition|
// clusters, then compare that purely-geometric partition to the ground-truth
// partition by Adjusted Rand Index and Adjusted Mutual Information — 1 means the
// spatial groups recover the planted communities. We complement that with
// within-cluster compactness, between-cluster silhouette over positions labelled by
// the partition, and the modularity Q of the partition over the graph edges. Every
// metric returns a quality in [0,1], 1 = best.
//
// ARI and AMI are CHANCE-CORRECTED (the whole point of "adjusted"): a random
// geometric partition scores ~0, identical partitions score 1. Implemented from the
// contingency table per Hubert-Arabie (ARI) and Vinh et al. (AMI), so the metric
// cannot be gamed by a trivial all-one-cluster assignment.

import type { SceneEdgeData } from "../../../sceneController";
import type { Prng } from "../prng";
import { type Position, clamp01, euclidean } from "./shared";

/** Max k-means iterations (bounded accumulator: the loop cannot run away). */
export const KMEANS_MAX_ITERS = 50;

export interface ClusterMetrics {
  /** Adjusted Rand Index of the geometric k-means partition vs ground truth,
   *  mapped to [0,1] (ARI is in [-1,1]; we clamp the negative tail to 0). */
  ari: number;
  /** Adjusted Mutual Information of the geometric partition vs ground truth,
   *  mapped to [0,1]. */
  ami: number;
  /** Within-cluster compactness: tight ground-truth clusters score high, in [0,1]. */
  compactness: number;
  /** Between-cluster silhouette over positions labelled by the partition, mapped
   *  from [-1,1] to [0,1]. */
  silhouette: number;
  /** Modularity Q of the partition over the graph edges, mapped to [0,1]. */
  modularity: number;
}

/**
 * Score a community drawing against a planted partition. `positions` are drawn
 * coordinates keyed by node id; `partition` is the ground-truth community per node
 * (`GraphFixture.partition`); `edges` the real scene edges. `prng` seeds the
 * deterministic k-means initialization. Pure and deterministic for a fixed `prng`.
 */
export function scoreClusterLayout(
  positions: ReadonlyMap<string, Position>,
  partition: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
  prng: Prng,
): ClusterMetrics {
  const ids = Array.from(partition.keys()).filter((id) => positions.has(id));
  const pos = ids.map((id) => positions.get(id)!);
  const truth = ids.map((id) => partition.get(id)!);
  const k = new Set(truth).size;

  // Geometric k-means over the DRAWN positions, ignoring edges (Meidiana).
  const geo = kmeans(pos, k, prng);

  return {
    ari: clamp01(adjustedRandIndex(truth, geo)),
    ami: clamp01(adjustedMutualInformation(truth, geo)),
    compactness: compactnessScore(ids, pos, partition),
    silhouette: silhouetteScore(pos, truth),
    modularity: modularityScore(ids, partition, edges),
  };
}

// ---------------------------------------------------------------------------
// k-means over 2D positions (deterministic, bounded).
// ---------------------------------------------------------------------------

/** Lloyd's k-means with deterministic k-means++ seeding from `prng`. Returns a
 *  label per point. Bounded by `KMEANS_MAX_ITERS`. */
export function kmeans(points: readonly Position[], k: number, prng: Prng): number[] {
  const n = points.length;
  if (n === 0) return [];
  const kk = Math.max(1, Math.min(k, n));
  // k-means++ seeding: first center random, subsequent centers proportional to
  // squared distance from the nearest chosen center (drawn via the seeded PRNG).
  const centers: Position[] = [];
  centers.push({ ...points[prng.nextInt(0, n - 1)] });
  while (centers.length < kk) {
    const d2 = points.map((p) => {
      let best = Infinity;
      for (const c of centers) best = Math.min(best, sq(euclidean(p, c)));
      return best;
    });
    const total = d2.reduce((s, x) => s + x, 0);
    if (total <= 1e-12) {
      centers.push({ ...points[prng.nextInt(0, n - 1)] });
      continue;
    }
    let target = prng.next() * total;
    let idx = 0;
    for (; idx < n; idx++) {
      target -= d2[idx];
      if (target <= 0) break;
    }
    centers.push({ ...points[Math.min(idx, n - 1)] });
  }

  const labels = new Array<number>(n).fill(0);
  for (let iter = 0; iter < KMEANS_MAX_ITERS; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const d = sq(euclidean(points[i], centers[c]));
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    // Recompute centers; an empty cluster keeps its previous center.
    const sumX = new Array<number>(kk).fill(0);
    const sumY = new Array<number>(kk).fill(0);
    const cnt = new Array<number>(kk).fill(0);
    for (let i = 0; i < n; i++) {
      sumX[labels[i]] += points[i].x;
      sumY[labels[i]] += points[i].y;
      cnt[labels[i]]++;
    }
    for (let c = 0; c < kk; c++) {
      if (cnt[c] > 0) centers[c] = { x: sumX[c] / cnt[c], y: sumY[c] / cnt[c] };
    }
    if (!changed) break;
  }
  return labels;
}

function sq(x: number): number {
  return x * x;
}

// ---------------------------------------------------------------------------
// Contingency table shared by ARI and AMI.
// ---------------------------------------------------------------------------

interface Contingency {
  /** table[a][b] = count of points with truth label a and pred label b. */
  table: number[][];
  /** Row sums (per truth label). */
  a: number[];
  /** Column sums (per pred label). */
  b: number[];
  n: number;
}

function contingency(truth: readonly number[], pred: readonly number[]): Contingency {
  const tLabels = Array.from(new Set(truth)).sort((x, y) => x - y);
  const pLabels = Array.from(new Set(pred)).sort((x, y) => x - y);
  const tIdx = new Map(tLabels.map((l, i) => [l, i]));
  const pIdx = new Map(pLabels.map((l, i) => [l, i]));
  const table = tLabels.map(() => new Array<number>(pLabels.length).fill(0));
  for (let i = 0; i < truth.length; i++) {
    table[tIdx.get(truth[i])!][pIdx.get(pred[i])!]++;
  }
  const a = table.map((row) => row.reduce((s, x) => s + x, 0));
  const b = pLabels.map((_, j) => table.reduce((s, row) => s + row[j], 0));
  return { table, a, b, n: truth.length };
}

/** n choose 2. */
function choose2(n: number): number {
  return (n * (n - 1)) / 2;
}

/**
 * Adjusted Rand Index (Hubert-Arabie), in [-1,1]. 1 = identical partitions, ~0 =
 * random agreement. Computed from the contingency table:
 *   ARI = (sum_ij C(n_ij,2) - [sum_i C(a_i,2) sum_j C(b_j,2)] / C(n,2))
 *       / (0.5[sum_i C(a_i,2) + sum_j C(b_j,2)] - [sum_i C(a_i,2) sum_j C(b_j,2)]/C(n,2))
 */
export function adjustedRandIndex(
  truth: readonly number[],
  pred: readonly number[],
): number {
  const n = truth.length;
  if (n < 2) return 1;
  const { table, a, b } = contingency(truth, pred);
  let sumIj = 0;
  for (const row of table) for (const c of row) sumIj += choose2(c);
  const sumA = a.reduce((s, x) => s + choose2(x), 0);
  const sumB = b.reduce((s, x) => s + choose2(x), 0);
  const totalPairs = choose2(n);
  const expected = (sumA * sumB) / totalPairs;
  const maxIndex = 0.5 * (sumA + sumB);
  const denom = maxIndex - expected;
  if (Math.abs(denom) < 1e-12) {
    // Both partitions are trivial (all in one cluster, or all singletons): perfect
    // agreement by convention.
    return 1;
  }
  return (sumIj - expected) / denom;
}

// ---------------------------------------------------------------------------
// Adjusted Mutual Information (Vinh et al. 2010).
// ---------------------------------------------------------------------------

/** Natural-log entropy of a label set from its cluster sizes. */
function entropy(sizes: readonly number[], n: number): number {
  let h = 0;
  for (const s of sizes) {
    if (s > 0) {
      const p = s / n;
      h -= p * Math.log(p);
    }
  }
  return h;
}

/** Mutual information (nats) from the contingency table. */
function mutualInformation(c: Contingency): number {
  const { table, a, b, n } = c;
  let mi = 0;
  for (let i = 0; i < table.length; i++) {
    for (let j = 0; j < table[i].length; j++) {
      const nij = table[i][j];
      if (nij === 0) continue;
      mi += (nij / n) * Math.log((nij * n) / (a[i] * b[j]));
    }
  }
  return mi;
}

/** ln n! via lgamma(n+1); used for the expected-MI combinatorial term. */
function lgamma(x: number): number {
  // Lanczos approximation (g=7), accurate to ~1e-13 for x > 0.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logFactorial(n: number): number {
  return lgamma(n + 1);
}

/**
 * Expected mutual information E[MI] under the permutation model (Vinh et al. 2010),
 * the chance term AMI subtracts. Sum over every cell value the hypergeometric
 * probability times the per-cell MI contribution. Bounded by the label cardinality.
 */
function expectedMutualInformation(c: Contingency): number {
  const { a, b, n } = c;
  let emi = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const ai = a[i];
      const bj = b[j];
      const start = Math.max(1, ai + bj - n);
      const end = Math.min(ai, bj);
      for (let nij = start; nij <= end; nij++) {
        const term1 = (nij / n) * Math.log((n * nij) / (ai * bj));
        // log of the hypergeometric probability weight.
        const logProb =
          logFactorial(ai) +
          logFactorial(bj) +
          logFactorial(n - ai) +
          logFactorial(n - bj) -
          logFactorial(n) -
          logFactorial(nij) -
          logFactorial(ai - nij) -
          logFactorial(bj - nij) -
          logFactorial(n - ai - bj + nij);
        emi += term1 * Math.exp(logProb);
      }
    }
  }
  return emi;
}

/**
 * Adjusted Mutual Information (max normalization, Vinh et al. 2010), in [-1,1] but
 * typically [0,1]. AMI = (MI - E[MI]) / (max(H(U), H(V)) - E[MI]); 1 = identical,
 * ~0 = random.
 */
export function adjustedMutualInformation(
  truth: readonly number[],
  pred: readonly number[],
): number {
  const n = truth.length;
  if (n < 2) return 1;
  const c = contingency(truth, pred);
  // Degenerate: a single cluster in either partition -> MI and entropies are 0;
  // by convention identical trivial partitions agree perfectly.
  if (c.a.length <= 1 && c.b.length <= 1) return 1;
  const mi = mutualInformation(c);
  const hU = entropy(c.a, n);
  const hV = entropy(c.b, n);
  const emi = expectedMutualInformation(c);
  const denom = Math.max(hU, hV) - emi;
  if (Math.abs(denom) < 1e-12) {
    // Both partitions identical and trivial -> perfect.
    return 1;
  }
  return (mi - emi) / denom;
}

// ---------------------------------------------------------------------------
// Compactness, silhouette, modularity.
// ---------------------------------------------------------------------------

/** Within-cluster compactness: mean within-cluster spread relative to the overall
 *  spread. Tight ground-truth clusters (small within vs overall) score ~1. */
function compactnessScore(
  ids: readonly string[],
  pos: readonly Position[],
  partition: ReadonlyMap<string, number>,
): number {
  if (pos.length < 2) return 1;
  const groups = new Map<number, Position[]>();
  for (let i = 0; i < ids.length; i++) {
    const label = partition.get(ids[i])!;
    const g = groups.get(label) ?? [];
    g.push(pos[i]);
    groups.set(label, g);
  }
  const spread = (pts: Position[]): number => {
    if (pts.length < 2) return 0;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let s = 0;
    for (const p of pts) s += Math.hypot(p.x - cx, p.y - cy);
    return s / pts.length;
  };
  let withinSum = 0;
  let withinCount = 0;
  for (const pts of groups.values()) {
    withinSum += spread(pts);
    withinCount++;
  }
  const within = withinCount ? withinSum / withinCount : 0;
  const overall = spread(pos.slice());
  if (overall <= 1e-12) return 0; // everything collapsed
  // The within spread should be a fraction of the overall spread; score = 1 minus
  // that fraction, so tight clusters in a wide layout score high.
  return clamp01(1 - within / overall);
}

/** Mean silhouette over positions labelled by `truth`, mapped from [-1,1] to [0,1].
 *  Bounded O(N^2) over the slice (node-ceiling-bounded upstream). */
function silhouetteScore(pos: readonly Position[], truth: readonly number[]): number {
  const n = pos.length;
  if (n < 2 || new Set(truth).size < 2) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    // a(i): mean intra-cluster distance.
    let aSum = 0;
    let aCount = 0;
    const bByLabel = new Map<number, { sum: number; count: number }>();
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = euclidean(pos[i], pos[j]);
      if (truth[j] === truth[i]) {
        aSum += d;
        aCount++;
      } else {
        const e = bByLabel.get(truth[j]) ?? { sum: 0, count: 0 };
        e.sum += d;
        e.count++;
        bByLabel.set(truth[j], e);
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;
    let b = Infinity;
    for (const e of bByLabel.values()) {
      if (e.count > 0) b = Math.min(b, e.sum / e.count);
    }
    if (!Number.isFinite(b)) continue;
    const s = (b - a) / Math.max(a, b, 1e-12);
    sum += s;
  }
  const meanS = sum / n;
  return clamp01((meanS + 1) / 2);
}

/**
 * Modularity Q of the partition over the (undirected) graph edges, mapped to [0,1].
 * Q = (1/2m) sum_ij [A_ij - k_i k_j / 2m] delta(c_i, c_j). Q is in roughly
 * [-0.5, 1]; we clamp the negative tail to 0. A partition whose communities match
 * the graph's dense blocks scores high.
 */
function modularityScore(
  ids: readonly string[],
  partition: ReadonlyMap<string, number>,
  edges: readonly SceneEdgeData[],
): number {
  const idSet = new Set(ids);
  const degree = new Map<string, number>();
  let m = 0;
  // intra-community edge weight and per-community total degree.
  const intra = new Map<number, number>();
  const degByComm = new Map<number, number>();
  for (const e of edges) {
    if (e.src === e.dst) continue;
    if (!idSet.has(e.src) || !idSet.has(e.dst)) continue;
    m++;
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
    const cs = partition.get(e.src)!;
    const cd = partition.get(e.dst)!;
    if (cs === cd) intra.set(cs, (intra.get(cs) ?? 0) + 1);
  }
  if (m === 0) return 0; // no edges: modularity undefined -> worst
  for (const id of ids) {
    const c = partition.get(id)!;
    degByComm.set(c, (degByComm.get(c) ?? 0) + (degree.get(id) ?? 0));
  }
  const twoM = 2 * m;
  let q = 0;
  for (const [c, internalEdges] of intra) {
    const dc = degByComm.get(c) ?? 0;
    q += internalEdges / m - (dc / twoM) * (dc / twoM);
  }
  // Communities with no internal edges still contribute the -(dc/2m)^2 term.
  for (const [c, dc] of degByComm) {
    if (!intra.has(c)) q -= (dc / twoM) * (dc / twoM);
  }
  return clamp01(q);
}
