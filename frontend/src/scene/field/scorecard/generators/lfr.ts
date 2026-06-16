// LFR-style community benchmark generator (graph-viz-scorecard ADR, W01.P01.S03).
//
// The LFR benchmark (Lancichinetti-Fortunato-Radicchi) is the realistic community
// benchmark: unlike the flat SBM it plants POWER-LAW degree and POWER-LAW community
// sizes, with a mixing parameter `mu` controlling the fraction of each node's edges
// that leave its community. Low `mu` is an easy benchmark (communities almost
// edge-separable); high `mu` is hard. The generator returns the planted partition
// so a community scorer (ARI/AMI, modularity) has a ground truth.
//
// SIMPLIFICATION (documented per the Step contract): this is a FAITHFUL
// APPROXIMATION of LFR, not the exact Lancichinetti et al. construction. The exact
// algorithm runs an iterative rewiring to make every node's realized internal/
// external split match `mu` precisely; that loop is non-deterministic in its
// original form and overkill for a fixture. Instead we:
//   - draw each node's target degree from a bounded power-law (exponent `degExp`),
//   - draw community sizes from a bounded power-law (exponent `commExp`) summing to
//     the node count,
//   - split each node's degree into ceil((1-mu)*k) internal + the rest external
//     stubs, and connect stubs by deterministic seeded matching (internal stubs to
//     same-community partners, external stubs to other-community partners),
// which reproduces LFR's two defining properties (power-law degree, power-law
// community sizes, `mu`-controlled mixing) deterministically. The realized mixing
// approximates the target `mu` to within the granularity of integer stub counts.
//
// Determinism (ADR): every draw and every stub match is from the seeded mulberry32
// PRNG and a stable shuffle — no `Math.random`. The same params/seed reproduce the
// graph byte-for-byte.

import type { SceneEdgeData } from "../../../sceneController";
import { makePrng, shuffle, type Prng } from "../prng";
import { type GraphFixture, makeEdge, makeNode } from "./fixture";

export interface LfrParams {
  /** Total node count. */
  n: number;
  /** Mixing parameter in [0, 1]: fraction of each node's edges leaving its
   *  community. 0 = perfectly separable, 1 = no community signal. */
  mu: number;
  /** Power-law exponent for the degree distribution (typical 2..3). */
  degExp: number;
  /** Minimum node degree (bounds the power-law tail at the low end). */
  minDegree: number;
  /** Maximum node degree (bounds the power-law tail at the high end). */
  maxDegree: number;
  /** Power-law exponent for the community-size distribution (typical 1..2). */
  commExp: number;
  /** Minimum community size. */
  minCommunity: number;
  /** Maximum community size. */
  maxCommunity: number;
  /** PRNG seed; the same seed reproduces the graph byte-for-byte. */
  seed: number;
}

/** Draw an integer from a bounded power-law p(k) ~ k^-exp on [min, max] via
 *  inverse-transform sampling. Deterministic given `prng`. */
function powerLawInt(prng: Prng, exp: number, min: number, max: number): number {
  if (max <= min) return min;
  // Inverse CDF of a continuous power law on [min, max+1) with exponent `exp`.
  const u = prng.next();
  const a = 1 - exp;
  const lo = Math.pow(min, a);
  const hi = Math.pow(max + 1, a);
  const x = Math.pow(lo + u * (hi - lo), 1 / a);
  const k = Math.floor(x);
  return Math.min(max, Math.max(min, k));
}

/**
 * Generate an LFR-style graph plus its ground-truth partition. Nodes are named
 * `lfr-<index>`; `partition` maps each node id to its community index. Edges are
 * backbone-tier and undirected (de-duplicated, no self-loops).
 */
export function generateLfr(params: LfrParams): GraphFixture {
  const {
    n,
    mu,
    degExp,
    minDegree,
    maxDegree,
    commExp,
    minCommunity,
    maxCommunity,
    seed,
  } = params;
  if (n <= 0) {
    return { nodes: [], edges: [], partition: new Map() };
  }
  const prng = makePrng(seed);

  // 1. Power-law community sizes summing to n.
  const communitySizes: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    let size = powerLawInt(prng, commExp, minCommunity, maxCommunity);
    size = Math.min(size, remaining);
    communitySizes.push(size);
    remaining -= size;
  }

  // 2. Assign nodes to communities in order.
  const ids: string[] = [];
  const communityOf: number[] = [];
  const partition = new Map<string, number>();
  const membersByCommunity: string[][] = communitySizes.map(() => []);
  let gi = 0;
  for (let c = 0; c < communitySizes.length; c++) {
    for (let m = 0; m < communitySizes[c]; m++) {
      const id = `lfr-${gi}`;
      ids.push(id);
      communityOf.push(c);
      partition.set(id, c);
      membersByCommunity[c].push(id);
      gi++;
    }
  }
  const nodes = ids.map((id) => makeNode(id));
  const indexOf = new Map(ids.map((id, i) => [id, i]));

  // 3. Power-law degree per node, split into internal + external stub counts.
  const internalStubs: string[][] = membersByCommunity.map(() => []);
  const externalStubs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const degree = powerLawInt(prng, degExp, minDegree, maxDegree);
    const internal = Math.max(0, Math.round((1 - mu) * degree));
    const external = Math.max(0, degree - internal);
    const c = communityOf[i];
    for (let s = 0; s < internal; s++) internalStubs[c].push(ids[i]);
    for (let s = 0; s < external; s++) externalStubs.push(ids[i]);
  }

  // 4. Match stubs into edges, de-duplicating and skipping self-loops. A Set of
  //    canonical "minIdx-maxIdx" keys keeps the graph simple.
  const edgeKeys = new Set<string>();
  const edges: SceneEdgeData[] = [];

  const key = (a: string, b: string): string => {
    const ia = indexOf.get(a)!;
    const ib = indexOf.get(b)!;
    return ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
  };
  const tryConnect = (a: string, b: string): void => {
    if (a === b) return;
    const k = key(a, b);
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push(makeEdge(a, b));
  };

  // 4a. Internal edges: shuffle each community's stub list and pair adjacent stubs.
  for (let c = 0; c < internalStubs.length; c++) {
    const stubs = shuffle(internalStubs[c], prng);
    for (let s = 0; s + 1 < stubs.length; s += 2) {
      tryConnect(stubs[s], stubs[s + 1]);
    }
  }

  // 4b. External edges: shuffle the global external stub list and pair adjacent
  //     stubs; pairs landing in the same community are skipped (they would not be
  //     external mixing), keeping the realized mixing honest to `mu`.
  const ext = shuffle(externalStubs, prng);
  for (let s = 0; s + 1 < ext.length; s += 2) {
    const a = ext[s];
    const b = ext[s + 1];
    if (communityOf[indexOf.get(a)!] === communityOf[indexOf.get(b)!]) continue;
    tryConnect(a, b);
  }

  return { nodes, edges, partition };
}
