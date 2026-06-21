// Render-capability seam: the scene's WebGL render-capability is view-local chrome
// state. The scene DETECTS + REPORTS it (the `render-capability` SceneEvent); the
// chrome reads it through this named boundary (never the broad view store directly),
// and `resolveCanvasState` surfaces the designed degraded canvas state.

import {
  DEFAULT_RENDER_CAPABILITY,
  normalizeRenderCapability,
  useViewStore,
  type RenderCapability,
  type RenderCapabilityStatus,
} from "./viewStore";

export { DEFAULT_RENDER_CAPABILITY, normalizeRenderCapability };
export type { RenderCapability, RenderCapabilityStatus };

export function useRenderCapability(): RenderCapability {
  // The stored object is stable until setRenderCapability replaces it — select it raw
  // (no in-selector derivation → no "getSnapshot should be cached" loop).
  return useViewStore((state) => state.renderCapability);
}

export function setRenderCapability(signal: unknown): void {
  useViewStore.getState().setRenderCapability(signal);
}
