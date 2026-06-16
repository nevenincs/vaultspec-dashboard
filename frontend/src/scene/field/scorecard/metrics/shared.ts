// Shared metric primitives for the layout-quality scorecard (graph-viz-scorecard
// ADR, W01.P02.S07).
//
// Every per-family metric module composes from these primitives so the subtle,
// load-bearing computations (scale-normalized stress with its closed-form optimal
// scale, the bounded sampled-pair estimator, the fixed-k co-ranking corner) live
// in ONE place and are tested ONCE. Each helper is a pure deterministic function;
// any sampling threads an explicit `Prng` (never `Math.random`), and every O(N^2)
// computation is bounded at the call site by an explicit cap, per
// `bounded-by-default-for-every-accumulator`.

import type { Prng } from "../prng";

/** A 2D drawn coordinate — the scene `NodePosition` shape, kept local so the
 *  metrics modules carry no scene-controller import. */
export interface Position {
  x: number;
  y: number;
}

/** Clamp a raw score into the [0,1] band every metric reports in (1 = best). NaN
 *  collapses to 0 (a degenerate computation is a failed, not a perfect, drawing). */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Euclidean distance between two drawn positions. */
export function euclidean(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mean and standard deviation (population) of a sample. Returns std 0 for an
 *  empty or singleton sample. */
export function meanStd(values: readonly number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  if (n === 1) return { mean, std: 0 };
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(sq / n) };
}

/** The coefficient of variation (std / mean) of a non-negative sample, guarded
 *  against a zero mean. */
export function coefficientOfVariation(values: readonly number[]): number {
  const { mean, std } = meanStd(values);
  if (mean <= 1e-12) return 0;
  return std / mean;
}

// ---------------------------------------------------------------------------
// Graph shortest-path distance (BFS over an unweighted adjacency).
// ---------------------------------------------------------------------------

/** An undirected adjacency list keyed by node id. */
export type Adjacency = Map<string, string[]>;

/** Build an undirected adjacency list from an id list and an endpoint-pair edge
 *  list. Every id appears as a key (isolated nodes included). */
export function buildAdjacency(
  ids: readonly string[],
  edges: readonly { src: string; dst: string }[],
): Adjacency {
  const adj: Adjacency = new Map();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (e.src === e.dst) continue;
    const a = adj.get(e.src);
    const b = adj.get(e.dst);
    if (a && b) {
      a.push(e.dst);
      b.push(e.src);
    }
  }
  return adj;
}

/**
 * Unweighted BFS shortest-path distances from `source` to every reachable node.
 * Unreachable nodes are absent from the returned map (the caller decides how to
 * treat a disconnected pair). O(V + E) per source.
 */
export function bfsDistances(adj: Adjacency, source: string): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(source, 0);
  const queue: string[] = [source];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const du = dist.get(u)!;
    for (const v of adj.get(u) ?? []) {
      if (!dist.has(v)) {
        dist.set(v, du + 1);
        queue.push(v);
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Bounded sampled node-pair estimator.
// ---------------------------------------------------------------------------

/** A sampled unordered node-pair (indices into a node array). */
export interface NodePair {
  i: number;
  j: number;
}

/**
 * Draw up to `cap` distinct unordered node pairs from `[0, n)` using `prng`. When
 * the total pair count `n(n-1)/2 <= cap` ALL pairs are returned (deterministic,
 * exhaustive, in (i, j) order) so small graphs are scored exactly; above the cap a
 * fixed-seed sample of `cap` distinct pairs is drawn. This is THE call-site bound
 * for the otherwise-O(N^2) stress/distance metrics.
 */
export function sampleNodePairs(n: number, cap: number, prng: Prng): NodePair[] {
  if (n < 2) return [];
  const totalPairs = (n * (n - 1)) / 2;
  if (totalPairs <= cap) {
    const out: NodePair[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) out.push({ i, j });
    }
    return out;
  }
  const seen = new Set<number>();
  const out: NodePair[] = [];
  // Rejection-sample distinct unordered pairs; the cap is far below totalPairs so
  // the rejection rate stays low and the loop is bounded by a generous attempt
  // ceiling that cannot run away.
  const maxAttempts = cap * 8;
  let attempts = 0;
  while (out.length < cap && attempts < maxAttempts) {
    attempts++;
    let i = prng.nextInt(0, n - 1);
    let j = prng.nextInt(0, n - 1);
    if (i === j) continue;
    if (i > j) {
      const t = i;
      i = j;
      j = t;
    }
    const key = i * n + j;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ i, j });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scale-normalized stress (the load-bearing global-faithfulness primitive).
// ---------------------------------------------------------------------------

/**
 * Scale-normalized stress over paired (high-dim, low-dim) distances, returned as a
 * QUALITY in [0,1] (1 = best). Stress is scale-dependent, so we minimize over a
 * single uniform scale `alpha` applied to the LOW-dim distances BEFORE measuring,
 * using the closed-form optimum (research F3, "Normalized Stress Is Not
 * Normalized"):
 *
 *   alpha* = sum(d_hi * d_lo) / sum(d_lo^2)
 *
 * which minimizes  sum (d_hi - alpha * d_lo)^2 . The raw normalized stress is then
 *
 *   NS = sum (d_hi - alpha* * d_lo)^2 / sum d_hi^2
 *
 * (the denominator makes it scale-invariant in the HIGH-dim distances too). NS is
 * 0 for a perfect embedding and grows unbounded; we map it to a quality with the
 * bounded transform  1 / (1 + NS)  so the result is in (0,1], 1 = zero stress.
 *
 * `pairs` carries the matched distances for the SAMPLED node pairs only — the
 * caller bounds N^2 by passing a capped sample from `sampleNodePairs`.
 */
export function scaleNormalizedStressQuality(
  pairs: readonly { dHi: number; dLo: number }[],
): number {
  let num = 0; // sum d_hi * d_lo
  let den = 0; // sum d_lo^2
  let hiSq = 0; // sum d_hi^2
  for (const p of pairs) {
    num += p.dHi * p.dLo;
    den += p.dLo * p.dLo;
    hiSq += p.dHi * p.dHi;
  }
  if (hiSq <= 1e-12) return 1; // all high-dim distances zero -> trivially faithful
  // Closed-form optimal uniform scale; if all low-dim distances are zero the
  // drawing collapsed to a point (worst case).
  if (den <= 1e-12) return 0;
  const alpha = num / den;
  let stress = 0;
  for (const p of pairs) {
    const r = p.dHi - alpha * p.dLo;
    stress += r * r;
  }
  const ns = stress / hiSq;
  return clamp01(1 / (1 + ns));
}

// ---------------------------------------------------------------------------
// k-nearest-neighbour builder.
// ---------------------------------------------------------------------------

/**
 * For each point, the indices of its `k` nearest neighbours under `distance`,
 * excluding itself, ties broken by ascending index (stable). Naively O(N^2 * log)
 * in the point count; the caller bounds N at the call site (the slice is already
 * node-ceiling-bounded). Returns `knn[i]` = the `k` nearest indices to point `i`.
 */
export function kNearestNeighbours(
  count: number,
  k: number,
  distance: (a: number, b: number) => number,
): number[][] {
  const knn: number[][] = [];
  const kk = Math.max(0, Math.min(k, count - 1));
  for (let i = 0; i < count; i++) {
    const dists: { value: number; index: number }[] = [];
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      dists.push({ value: distance(i, j), index: j });
    }
    dists.sort((a, b) => a.value - b.value || a.index - b.index);
    knn.push(dists.slice(0, kk).map((d) => d.index));
  }
  return knn;
}

// ---------------------------------------------------------------------------
// Fixed-k co-ranking corner (the bounded primitive for trustworthiness etc.).
// ---------------------------------------------------------------------------

/**
 * The high-dim and low-dim k-NN index sets for every point, plus the high-dim and
 * low-dim RANK of every (i, j) pair within the fixed-k neighbourhood corner only.
 * This is the bounded surrogate for the full N x N co-ranking matrix (research F5,
 * "compute only the KxK co-ranking corner"): we keep, per point, the ordered
 * neighbour lists up to a fixed `k`, from which trustworthiness, continuity, and
 * Q_NX are computed without ever materializing the full rank matrix.
 */
export interface CorankingCorner {
  k: number;
  /** Ordered high-dim k-NN indices per point (nearest first). */
  highNeighbours: number[][];
  /** Ordered low-dim k-NN indices per point (nearest first). */
  lowNeighbours: number[][];
  /** Full ordered high-dim neighbour ranks per point (for the rank lookups the
   *  trustworthiness/continuity penalties need); index -> rank (1-based). */
  highRank: Map<number, number>[];
  /** Full ordered low-dim neighbour ranks per point; index -> rank (1-based). */
  lowRank: Map<number, number>[];
}

/**
 * Build the fixed-k co-ranking corner from a high-dim and a low-dim distance
 * function over the same `count` points. We materialize the FULL ordered neighbour
 * ranking per point (needed for the rank-difference penalties in trustworthiness /
 * continuity, which reach OUTSIDE k by definition), but only the top-`k` corner is
 * iterated by the metric loops, keeping the hot path O(N * k). The full per-point
 * sort is O(N^2 log N); the caller bounds N at the call site.
 */
export function corankingCorner(
  count: number,
  k: number,
  highDistance: (a: number, b: number) => number,
  lowDistance: (a: number, b: number) => number,
): CorankingCorner {
  const kk = Math.max(1, Math.min(k, count - 1));
  const highNeighbours: number[][] = [];
  const lowNeighbours: number[][] = [];
  const highRank: Map<number, number>[] = [];
  const lowRank: Map<number, number>[] = [];

  const rankBy = (
    i: number,
    distance: (a: number, b: number) => number,
  ): { ordered: number[]; rank: Map<number, number> } => {
    const ds: { value: number; index: number }[] = [];
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      ds.push({ value: distance(i, j), index: j });
    }
    ds.sort((a, b) => a.value - b.value || a.index - b.index);
    const rank = new Map<number, number>();
    const ordered: number[] = [];
    for (let r = 0; r < ds.length; r++) {
      rank.set(ds[r].index, r + 1); // 1-based rank
      ordered.push(ds[r].index);
    }
    return { ordered, rank };
  };

  for (let i = 0; i < count; i++) {
    const hi = rankBy(i, highDistance);
    const lo = rankBy(i, lowDistance);
    highNeighbours.push(hi.ordered.slice(0, kk));
    lowNeighbours.push(lo.ordered.slice(0, kk));
    highRank.push(hi.rank);
    lowRank.push(lo.rank);
  }

  return { k: kk, highNeighbours, lowNeighbours, highRank, lowRank };
}

/** Jaccard overlap of two index sets in [0,1]. */
export function jaccard(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a);
  let inter = 0;
  for (const x of b) if (sa.has(x)) inter++;
  const union = sa.size + b.length - inter;
  return union === 0 ? 1 : inter / union;
}

/** Spearman rank correlation between two equal-length series, in [-1,1]. Ties are
 *  handled by average ranking. Returns 0 for fewer than 2 points. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const rank = (vals: readonly number[]): number[] => {
    const idx = vals.map((value, index) => ({ value, index }));
    idx.sort((a, b) => a.value - b.value || a.index - b.index);
    const ranks = new Array<number>(vals.length);
    let r = 0;
    while (r < idx.length) {
      let s = r;
      // Group exact ties and assign the average rank (1-based).
      while (s + 1 < idx.length && idx[s + 1].value === idx[r].value) s++;
      const avg = (r + s) / 2 + 1;
      for (let t = r; t <= s; t++) ranks[idx[t].index] = avg;
      r = s + 1;
    }
    return ranks;
  };
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx;
    const dy = ry[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 1e-12 || vy <= 1e-12) return 0;
  return cov / Math.sqrt(vx * vy);
}
