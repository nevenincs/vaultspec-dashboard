// Synthetic layered-tree and layered-DAG generators (graph-viz-scorecard ADR,
// W01.P01.S04).
//
// Hierarchy, radial, and lineage layouts all CLAIM to place a node at a depth that
// reflects its true layer (a tree's distance from the root, a DAG's longest path
// from a source). To score that claim we need fixtures whose TRUE layer is known by
// construction. These generators build:
//   - a layered TREE: a branching tree of given depth and fan-out; every node's
//     layer is its distance from the single root, and every edge runs parent->child
//     (layer strictly increases by 1), giving a clean planted layering for radial
//     and tidy-tree scoring.
//   - a layered DAG: nodes partitioned into ordered layers; every edge runs from a
//     lower layer to a strictly higher one (downward), with extra cross-edges that
//     may SKIP layers (a true layered DAG, not just a tree) for Sugiyama/lineage
//     scoring.
//
// Both record `layerOf` (node id -> true layer) and the `root`. The DAG's root is
// the first layer-0 node. Edges are backbone-tier scene edges so a layout can
// consume them directly.
//
// Determinism (ADR): branching factors and cross-edge targets are drawn from the
// seeded mulberry32 PRNG — no `Math.random`. Same params/seed reproduce the graph.

import type { SceneEdgeData, SceneNodeData } from "../../../sceneController";
import { makePrng, type Prng } from "../prng";
import { type LayeredFixture, makeEdge, makeNode } from "./fixture";

export interface LayeredTreeParams {
  /** Number of layers below the root (tree depth); depth 0 is the root alone. */
  depth: number;
  /** Minimum children per internal node. */
  minFanout: number;
  /** Maximum children per internal node. */
  maxFanout: number;
  /** PRNG seed. */
  seed: number;
}

export interface LayeredDagParams {
  /** Number of layers (>= 1); layer 0 holds the source nodes. */
  layers: number;
  /** Nodes per layer. */
  nodesPerLayer: number;
  /** Probability of a downward edge between a node and a candidate in a deeper
   *  layer (drives DAG density and layer-skipping). */
  edgeProb: number;
  /** Maximum number of layers an edge may span (1 = adjacent only). */
  maxSpan: number;
  /** PRNG seed. */
  seed: number;
}

/**
 * Build a branching layered tree. Every node's layer is its depth from the root;
 * every edge runs parent->child with depth increasing by exactly 1. Nodes are
 * named `tree-<index>` in creation (breadth-first) order; the root is `tree-0`.
 */
export function generateLayeredTree(params: LayeredTreeParams): LayeredFixture {
  const { depth, minFanout, maxFanout, seed } = params;
  const prng = makePrng(seed);

  const layerOf = new Map<string, number>();
  const nodes: SceneNodeData[] = [];
  const edges: SceneEdgeData[] = [];

  let counter = 0;
  const mint = (layer: number): string => {
    const id = `tree-${counter++}`;
    layerOf.set(id, layer);
    nodes.push(makeNode(id));
    return id;
  };

  const root = mint(0);
  let frontier: string[] = [root];
  for (let layer = 1; layer <= depth; layer++) {
    const nextFrontier: string[] = [];
    for (const parent of frontier) {
      const fanout = prng.nextInt(minFanout, maxFanout);
      for (let c = 0; c < fanout; c++) {
        const child = mint(layer);
        edges.push(makeEdge(parent, child));
        nextFrontier.push(child);
      }
    }
    frontier = nextFrontier;
  }

  return { nodes, edges, layerOf, root };
}

/**
 * Build a layered DAG. Nodes are partitioned into `layers` ordered layers of
 * `nodesPerLayer` each; every edge runs from a node in some layer to a node in a
 * strictly deeper layer (span 1..`maxSpan`), so the planted `layerOf` is a valid
 * topological layering. Nodes are named `dag-<layer>-<index>`; the root is the
 * first layer-0 node. A guard pass guarantees every non-source node has at least
 * one incoming edge, so the DAG is connected downward.
 */
export function generateLayeredDag(params: LayeredDagParams): LayeredFixture {
  const { layers, nodesPerLayer, edgeProb, maxSpan, seed } = params;
  const prng = makePrng(seed);

  const layerOf = new Map<string, number>();
  const nodes: SceneNodeData[] = [];
  const byLayer: string[][] = [];

  for (let l = 0; l < layers; l++) {
    const row: string[] = [];
    for (let i = 0; i < nodesPerLayer; i++) {
      const id = `dag-${l}-${i}`;
      layerOf.set(id, l);
      nodes.push(makeNode(id));
      row.push(id);
    }
    byLayer.push(row);
  }

  const edges: SceneEdgeData[] = [];
  const edgeKeys = new Set<string>();
  const connect = (src: string, dst: string): void => {
    const k = `${src}->${dst}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push(makeEdge(src, dst));
  };

  // Probabilistic downward edges spanning 1..maxSpan layers.
  for (let l = 0; l < layers; l++) {
    for (const src of byLayer[l]) {
      for (let target = l + 1; target <= l + maxSpan && target < layers; target++) {
        for (const dst of byLayer[target]) {
          if (prng.next() < edgeProb) connect(src, dst);
        }
      }
    }
  }

  // Guard: every node below layer 0 gets at least one parent from the layer
  // directly above, so no non-source node is orphaned and the layering stays a
  // connected DAG. The parent is chosen deterministically from the PRNG.
  ensureIncoming(byLayer, prng, connect);

  const root = byLayer[0][0];
  return { nodes, edges, layerOf, root };
}

/** Give every node in layers 1..end at least one incoming edge from the layer
 *  immediately above. */
function ensureIncoming(
  byLayer: string[][],
  prng: Prng,
  connect: (src: string, dst: string) => void,
): void {
  for (let l = 1; l < byLayer.length; l++) {
    const above = byLayer[l - 1];
    if (above.length === 0) continue;
    for (const dst of byLayer[l]) {
      const parent = above[prng.nextInt(0, above.length - 1)];
      connect(parent, dst);
    }
  }
}
