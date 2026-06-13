// The shared selection concept (W02.P06.S23, ADR G2.b): selecting anywhere
// focuses everywhere. The view store holds the one selection; this module
// binds it outward — store changes drive the scene (focus + cross-
// highlight pulse hooks), and region components (browser S39, timeline
// S36, inspector S42) read the same store slice. Stage events already flow
// in through the seam (S21).

import type { SceneController } from "../../scene/sceneController";
import type { Selection } from "./viewStore";
import { useViewStore } from "./viewStore";

export type { Selection };

/** Select a node from any region (browser row, search hit, palette). */
export function selectNode(id: string | null): void {
  useViewStore.getState().select(id);
}

// Selections originating on the stage must not re-focus the camera the
// user is already pointing at — only cross-region selections focus.
let sceneOriginated = false;

/** The stage's own event path: select without bouncing focus back. */
export function selectFromScene(id: string | null): void {
  sceneOriginated = true;
  useViewStore.getState().select(id);
}

/** Select a timeline event; its node ids drive the stage cross-highlight. */
export function selectEvent(
  id: string,
  nodeIds: string[],
  truncatedNodeIds?: number,
): void {
  useViewStore
    .getState()
    .selectEntity({ kind: "event", id, nodeIds, truncatedNodeIds });
}

/** Select an edge (inspector's per-tier edge list). */
export function selectEdge(id: string): void {
  useViewStore.getState().selectEntity({ kind: "edge", id });
}

/**
 * Bind the store's selection to the scene: node selections focus the
 * field; event selections focus their first carried node (the
 * cross-highlight pulse lands with S36). Returns an unsubscribe.
 */
export function bindSelectionToScene(scene: SceneController): () => void {
  let last: Selection = useViewStore.getState().selection;
  return useViewStore.subscribe((state) => {
    if (state.selection === last) return;
    last = state.selection;
    if (sceneOriginated) {
      sceneOriginated = false;
      return;
    }
    if (!last) return;
    if (last.kind === "node") {
      scene.command({ kind: "focus-node", id: last.id });
    } else if (last.kind === "event" && last.nodeIds.length > 0) {
      scene.command({ kind: "focus-node", id: last.nodeIds[0] });
    }
  });
}
