// Shared fixture types for the scorecard ground-truth generators (graph-viz-
// scorecard ADR, W01.P01).
//
// Every generator emits the REAL scene node/edge shapes (`SceneNodeData`,
// `SceneEdgeData` from the scene controller) so the downstream `*Gate.ts` modules
// can feed a fixture straight into the real layout modules with no adapter — the
// scorecard scores the same data structure the app draws. Alongside the graph it
// carries the GROUND TRUTH the metrics score against (the planted community
// partition, the true layer of each node, or the high-dimensional cluster labels),
// keyed by node id so a metric never depends on array order.

import type { SceneEdgeData, SceneNodeData } from "../../../sceneController";

/**
 * A generated graph fixture: the real scene node/edge arrays plus the planted
 * community partition that produced them. `partition` maps every node id to its
 * ground-truth community index (0-based); it covers every node in `nodes`. This is
 * the shape the SBM and LFR generators return — the community/cluster scorers read
 * `partition` as the known-correct answer.
 */
export interface GraphFixture {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
  /** node id -> ground-truth community index. Covers every node. */
  partition: Map<string, number>;
}

/**
 * A layered (tree or DAG) fixture: the real scene node/edge arrays plus each
 * node's TRUE layer (depth from the root, 0-based) for hierarchy/radial/lineage
 * scoring, and the root node id. `layerOf` covers every node; edges always run
 * from a lower layer to a higher one (strictly increasing depth) so a scorer can
 * assert monotonicity against the planted layering.
 */
export interface LayeredFixture {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
  /** node id -> true layer/depth (root = 0). Covers every node. */
  layerOf: Map<string, number>;
  /** The root node id (layer 0). */
  root: string;
}

/**
 * A high-dimensional Gaussian-mixture fixture for semantic scoring: one vector per
 * point with its known cluster label. `vectors[i]` has `labels[i]` as its planted
 * cluster, so trustworthiness/continuity/silhouette scorers have a ground truth.
 * This generalizes the `buildGateSlice` pattern in `semanticGate.ts` (deterministic
 * Gaussian clouds around distinct centers) onto the seeded PRNG.
 */
export interface BlobFixture {
  /** One row per point; every row has the same dimensionality. */
  vectors: number[][];
  /** Planted cluster label per point; `labels.length === vectors.length`. */
  labels: number[];
}

/** Build a minimal scene node carrying only the fields the layouts require. */
export function makeNode(id: string, extra?: Partial<SceneNodeData>): SceneNodeData {
  return { id, kind: "doc", ...extra };
}

/** Build a backbone (structural-tier) scene edge between two node ids. */
export function makeEdge(
  src: string,
  dst: string,
  tier: SceneEdgeData["tier"] = "structural",
): SceneEdgeData {
  return {
    id: `e:${src}->${dst}`,
    src,
    dst,
    relation: "rel",
    tier,
    confidence: 1,
  };
}
