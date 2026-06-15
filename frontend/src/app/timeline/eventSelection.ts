// Timeline selection (W03.P07.S45 lineage-node path).
//
// The relational timeline's PRIMARY marks are lineage nodes (the dated document
// marks). Clicking one selects it through the ONE shared `Selection` concept
// (`selectNode`, so the inspector shows the document and every region focuses the
// same node) and pulses the joined nodes on the stage via a BOUNDED `node_ids`
// set — the node plus its 1-hop lineage-arc neighbors, capped, with any drop
// surfaced as a truncation count rather than a silent partial pulse (ADR
// "Interaction": "the stage pulses the joined nodes via the bounded `node_ids`
// join, with any truncation count carried so it is stated, not silently dropped").
//
// Selection is EMITTED here, never owned — the view store holds the one selection;
// this module only fires intent into it and pushes a bounded cross-highlight pulse
// through the scene seam.

import type { LineageArc, LineageNode } from "../../stores/server/engine";
import { selectNode } from "../../stores/view/selection";
import type { SceneController } from "../../scene/sceneController";
import { getScene } from "../stage/Stage";

/** The bounded ceiling on the node_ids a node-click pulse carries to the stage —
 *  the same truthfulness bound the event join uses (contract §5, cap 20): pulse
 *  what's carried, surface the rest as a stated truncation count. */
export const MAX_PULSE_NODE_IDS = 20;

/**
 * The bounded join set for a lineage node: the node itself plus its 1-hop
 * lineage-arc neighbors (deduped, the node first), capped at `MAX_PULSE_NODE_IDS`.
 * Pure (unit-tested): the second element of the tuple is how many neighbors the
 * cap dropped, so the caller can carry the truncation count honestly.
 */
export function joinedNodeIds(
  nodeId: string,
  arcs: readonly Pick<LineageArc, "src" | "dst">[],
  max = MAX_PULSE_NODE_IDS,
): { ids: string[]; truncated: number } {
  const seen = new Set<string>([nodeId]);
  const ids: string[] = [nodeId];
  for (const arc of arcs) {
    const neighbor = arc.src === nodeId ? arc.dst : arc.dst === nodeId ? arc.src : null;
    if (neighbor !== null && !seen.has(neighbor)) {
      seen.add(neighbor);
      ids.push(neighbor);
    }
  }
  const limit = Math.max(1, max);
  if (ids.length <= limit) return { ids, truncated: 0 };
  return { ids: ids.slice(0, limit), truncated: ids.length - limit };
}

/**
 * Click a lineage (document) mark: select it through the ONE shared selection and
 * pulse its bounded join set on the stage. The node id (`doc:{stem}`) IS a graph
 * node id, so the selection focuses the same node everywhere; the pulse cross-
 * highlights the node + its lineage ego, bounded and truncation-honest.
 */
export function handleNodeClick(
  node: LineageNode,
  arcs: readonly Pick<LineageArc, "src" | "dst">[] = [],
  scene: SceneController = getScene().controller,
): void {
  selectNode(node.id);
  const { ids } = joinedNodeIds(node.id, arcs);
  if (ids.length > 0) {
    scene.command({ kind: "pulse", ids: new Set(ids) });
  }
}
