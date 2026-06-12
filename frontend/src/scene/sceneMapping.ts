// Wire → scene mapping (W02.P06.S21). The engine serves snake_case
// contract shapes; the scene speaks the locked seam types. This is the
// only place the two vocabularies meet. Scene-layer module: framework-free.

import type { EngineEdge, EngineNode } from "../stores/server/engine";
import type { SceneEdgeData, SceneNodeData } from "./sceneController";

export function engineNodeToScene(node: EngineNode): SceneNodeData {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    lifecycle: node.lifecycle,
    degreeByTier: node.degree_by_tier,
    dates: node.dates,
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
