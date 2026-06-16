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

/**
 * Keyboard graph-walk focus: select the walked node AND instantly re-center the
 * camera on it. The selection is marked scene-originated so the store→scene
 * binding does NOT also issue an animated focus (double-follow); this path owns
 * the camera move and issues it as `focus-node {animate:false}` so the walked
 * node is re-centered INSTANTLY (base motion law: keyboard actions never
 * animate) and never strays off-screen. Clearing (id === null) just deselects.
 */
export function focusFromWalk(scene: SceneController, id: string | null): void {
  sceneOriginated = true;
  useViewStore.getState().select(id);
  if (id !== null) scene.command({ kind: "focus-node", id, animate: false });
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
  /** The node ids currently ringed on the canvas (graph/Node-items "selected").
   *  Issued on EVERY selection change — including scene-originated ones — so a
   *  canvas click rings its node and a cross-region select rings it too. */
  const pushSelected = (selection: Selection): void => {
    let ids: ReadonlySet<string>;
    if (!selection) {
      ids = new Set();
    } else if (selection.kind === "node") {
      ids = new Set([selection.id]);
    } else if (selection.kind === "event") {
      ids = new Set(selection.nodeIds);
    } else {
      ids = new Set();
    }
    scene.command({ kind: "set-selected", ids });
  };
  return useViewStore.subscribe((state) => {
    if (state.selection === last) {
      // A no-op selection (e.g. a stage deselect while already cleared) still
      // consumes a pending scene-origin suppression, so it cannot leak onto
      // the next genuine cross-region selection and swallow its focus (G2.b).
      sceneOriginated = false;
      return;
    }
    last = state.selection;
    // The SELECTED ring follows every selection change regardless of origin —
    // it is the canvas mirror of the one shared selection, not a camera move.
    pushSelected(last);
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
