// Selection-reveal signal (GS-003): a stores-owned, view-local request that the
// projection surfaces (today the left-rail tree) SCROLL the selected node's row into
// view. It is fired ONLY by the off-canvas activation path (activateEntity `frame:true`
// — a rail row, activity-rail row, search/palette hit, or menu "Open"), never by an
// on-canvas graph click (`frame:false`): a canvas click must not fight the user by
// yanking side surfaces, exactly like the camera focus bounce is gated. The reveal is a
// transient nudge, not persisted state — a monotonic nonce lets the same node be
// re-revealed (re-opening the same search hit) and lets consumers dedupe.

import { create } from "zustand";

export interface SelectionRevealTarget {
  /** The canonical node id whose row should be scrolled into view. */
  nodeId: string;
  /** Monotonic request counter — bumps on every request so a repeat reveal of the
   *  same node still fires, and a consumer can dedupe against the last it handled. */
  nonce: number;
}

interface SelectionRevealState {
  target: SelectionRevealTarget | null;
  request: (nodeId: string) => void;
}

export const useSelectionRevealStore = create<SelectionRevealState>((set) => ({
  target: null,
  request: (nodeId) =>
    set((state) => ({
      target: { nodeId, nonce: (state.target?.nonce ?? 0) + 1 },
    })),
}));

/**
 * Request that projection surfaces reveal (scroll into view) the given node's row.
 * Called from the off-canvas activation path only (activateEntity `frame:true`). No-op
 * for a blank id.
 */
export function requestSelectionReveal(nodeId: string): void {
  if (typeof nodeId !== "string" || nodeId.length === 0) return;
  useSelectionRevealStore.getState().request(nodeId);
}

/**
 * Subscribe to the current reveal request (stable-selectors: returns the RAW `target`
 * reference, which is stable until the next request — no fresh object is minted in the
 * selector). Consumers dedupe on `nonce`.
 */
export function useSelectionRevealTarget(): SelectionRevealTarget | null {
  return useSelectionRevealStore((state) => state.target);
}
