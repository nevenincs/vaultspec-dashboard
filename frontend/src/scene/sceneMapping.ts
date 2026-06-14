// Wire → scene mapping (W02.P06.S21). The engine serves snake_case
// contract shapes; the scene speaks the locked seam types. This is the
// only place the two vocabularies meet. Scene-layer module: framework-free.

import type { EngineEdge, EngineNode, GraphDeltaEntry } from "../stores/server/engine";
import type { SceneDelta, SceneEdgeData, SceneNodeData } from "./sceneController";

export function engineNodeToScene(node: EngineNode): SceneNodeData {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    // Feature membership -> the feature overlays (countries, hulls).
    featureTags: node.feature_tags,
    lifecycle: node.lifecycle,
    degreeByTier: node.degree_by_tier,
    dates: node.dates,
    // Feature-convergence sizing input (S02 / ADR D4.1); absent on documents.
    memberCount: node.member_count,
    // Per-lens salience (graph-node-salience) -> size + label priority; the
    // embedding feeds the semantic UMAP worker (graph-representation §4).
    salience: node.salience,
    embedding: node.embedding,
  };
}

export function engineEdgeToScene(edge: EngineEdge): SceneEdgeData {
  return {
    id: edge.id,
    src: edge.src,
    dst: edge.dst,
    relation: edge.relation,
    tier: edge.tier,
    confidence: edge.confidence,
    state: edge.state,
    meta: edge.meta
      ? { count: edge.meta.count, breakdownByTier: edge.meta.breakdown_by_tier }
      : undefined,
    // Pipeline-derivation label (graph-node-semantics) -> lineage axis. The
    // wire carries `null` for "no pipeline relationship"; the scene treats that
    // as absent (undefined) so the lineage axis only sees real labels.
    derivation: edge.derivation ?? undefined,
  };
}

export function sliceToScene(slice: { nodes: EngineNode[]; edges: EngineEdge[] }): {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
} {
  return {
    nodes: slice.nodes.map(engineNodeToScene),
    edges: slice.edges.map(engineEdgeToScene),
  };
}

/**
 * Map one engine delta entry to a SceneDelta for `apply-deltas`.
 * Returns null for entries that carry neither a node nor an edge — the
 * caller filters nulls before routing to SceneController.
 *
 * Used by the spliceLive path (constellation-live-delta S05): Stage maps
 * feature-granularity delta entries to SceneDeltas and pushes them via
 * `SceneController.command({ kind: "apply-deltas", ... })`.
 */
export function graphDeltaToScene(delta: GraphDeltaEntry): SceneDelta | null {
  if (!delta.node && !delta.edge) return null;
  return {
    op: delta.op,
    node: delta.node ? engineNodeToScene(delta.node) : undefined,
    edge: delta.edge ? engineEdgeToScene(delta.edge) : undefined,
    t: delta.t,
    seq: delta.seq,
  };
}
