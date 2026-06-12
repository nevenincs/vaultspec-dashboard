// Hover ego-highlight (W02.P06.S22, ADR G3.b): the hovered node and its
// 1-hop neighborhood lift; the rest of the field recedes — dims, doesn't
// hide. DOI label culling rides the same set: lifted nodes show their
// labels at any zoom. Scene-layer module: framework-free.

import type { SceneGraphModel } from "../graphModel";

export interface EgoSet {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

/** Alpha multiplier for the receded field while an ego is lifted. */
export const RECEDE_ALPHA = 0.22;

/** The hovered node, its 1-hop neighbors, and the incident edges. */
export function computeEgo(model: SceneGraphModel, id: string): EgoSet {
  const nodeIds = new Set<string>([id]);
  for (const neighbor of model.neighborsOf(id)) {
    nodeIds.add(neighbor);
  }
  return { nodeIds, edgeIds: new Set(model.edgesOf(id)) };
}
