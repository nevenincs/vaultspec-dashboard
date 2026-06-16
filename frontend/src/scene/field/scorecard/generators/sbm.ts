// Stochastic Block Model ground-truth generator (graph-viz-scorecard ADR,
// W01.P01.S02).
//
// The SBM is the canonical community-detection benchmark with a KNOWN partition:
// nodes are split into blocks (communities) of given sizes, and an undirected edge
// between two nodes is sampled independently with probability `pIntra` if they
// share a block and `pInter` otherwise. With `pIntra > pInter` the blocks are the
// ground-truth communities, and a community scorer (ARI/AMI against the partition,
// modularity Q) has a defensible target. The generated graph uses the real scene
// node/edge shapes so a gate can layout it directly; the planted partition is
// returned as `partition` (node id -> block index).
//
// Determinism (ADR): all edge sampling is drawn from the seeded mulberry32 PRNG —
// no `Math.random`. The same `sizes`/`pIntra`/`pInter`/`seed` always yields the
// same graph.

import { makePrng } from "../prng";
import type { SceneEdgeData } from "../../../sceneController";
import { type GraphFixture, makeEdge, makeNode } from "./fixture";

export interface SbmParams {
  /** Per-block node counts; `sizes[k]` is the size of community `k`. */
  sizes: readonly number[];
  /** Edge probability within a block (the planted community signal). */
  pIntra: number;
  /** Edge probability between blocks (the inter-community noise). */
  pInter: number;
  /** PRNG seed; the same seed reproduces the graph byte-for-byte. */
  seed: number;
}

/**
 * Generate a Stochastic Block Model graph plus its ground-truth partition. Nodes
 * are named `sbm-<global-index>`; `partition` maps each node id to its block
 * index. Edges are backbone-tier (the subset the layouts consume) and undirected
 * (one edge per unordered pair, src/dst in index order).
 */
export function generateSbm(params: SbmParams): GraphFixture {
  const { sizes, pIntra, pInter, seed } = params;
  if (sizes.some((s) => s < 0)) {
    throw new Error("generateSbm: block sizes must be non-negative");
  }
  const prng = makePrng(seed);

  // Assign every node a global index and a block. Iterate blocks then members so
  // the ordering is a deterministic function of `sizes` alone.
  const partition = new Map<string, number>();
  const ids: string[] = [];
  const blockOf: number[] = [];
  let gi = 0;
  for (let block = 0; block < sizes.length; block++) {
    for (let m = 0; m < sizes[block]; m++) {
      const id = `sbm-${gi}`;
      ids.push(id);
      blockOf.push(block);
      partition.set(id, block);
      gi++;
    }
  }

  const nodes = ids.map((id) => makeNode(id));

  // Sample each unordered pair once, in increasing (i, j) order, so the PRNG draw
  // sequence is fixed by node count alone.
  const edges: SceneEdgeData[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = blockOf[i] === blockOf[j] ? pIntra : pInter;
      if (prng.next() < p) {
        edges.push(makeEdge(ids[i], ids[j]));
      }
    }
  }

  return { nodes, edges, partition };
}
