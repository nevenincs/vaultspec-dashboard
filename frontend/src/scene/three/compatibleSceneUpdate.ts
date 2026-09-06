import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import type { BuiltEdge } from "./threeField/state";

/** Preserve numeric indices, sequential spring order, orientation, and multiplicity.
 * Invalid/self edges are discarded exactly as at initial ingestion. No unordered
 * edge set or caller-owned object identity is evidence of physical compatibility. */
export function compatibleSceneEdges(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
  index: ReadonlyMap<string, number>,
  built: readonly BuiltEdge[],
): SceneEdgeData[] | null {
  if (nodes.length === 0 || nodes.length !== index.size) return null;
  for (let i = 0; i < nodes.length; i++) {
    if (index.get(nodes[i].id) !== i) return null;
  }
  const valid: SceneEdgeData[] = [];
  for (const edge of edges) {
    const a = index.get(edge.src);
    const b = index.get(edge.dst);
    if (a === undefined || b === undefined || a === b) continue;
    const prior = built[valid.length];
    if (!prior || prior.a !== a || prior.b !== b) return null;
    valid.push(edge);
  }
  return valid.length === built.length ? valid : null;
}
