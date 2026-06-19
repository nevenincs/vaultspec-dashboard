// Graph overlay visibility seam. Overlay flags are view-local graph chrome state,
// but Stage and controls consume them through this named boundary so overlay
// projection does not leak the broad view store surface into app code.

import { useMemo } from "react";

import {
  DEFAULT_GRAPH_OVERLAYS,
  normalizeGraphOverlays,
  useViewStore,
  type GraphOverlayState,
} from "./viewStore";

export { DEFAULT_GRAPH_OVERLAYS, normalizeGraphOverlays };
export type { GraphOverlayState };

export function useGraphOverlays(): GraphOverlayState {
  // Select the stable raw overlays (stable until setOverlays) and memoize the
  // normalization — normalizing inside the selector returned a fresh object every
  // getSnapshot, the "getSnapshot should be cached" infinite loop that crashed Stage.
  const raw = useViewStore((state) => state.overlays);
  return useMemo(() => normalizeGraphOverlays(raw), [raw]);
}

export function setGraphOverlays(overlays: unknown): void {
  useViewStore.getState().setOverlays(overlays);
}
