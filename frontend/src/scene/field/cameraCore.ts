// Framework-free semantic-zoom (LOD) core for the three.js field. The retired
// Camera-class machinery — pixi-era pan/zoom math (clampScale/zoomAt/screenToWorld/
// worldToScreen + MIN/MAX_SCALE), the SpatialHitTester, and the PointerGestures state
// machine — was removed in the Phase B dead-code prune: it had ZERO live consumers
// because the live three.js field (threeField) owns camera math, picking, and pointer
// handling inline and clamps zoom to the registry's zoomMin/zoomMax. Only the
// semantic-zoom level mapping survives, consumed by threeField (`semanticLevel`) and
// the sceneController camera-change event (`SemanticLevel`). Scene-layer module:
// framework-free by design — no pixi, no React.

import { controlNumber } from "../three/graphControlSchema";

/** Discrete semantic-zoom levels (§3.1 LOD discipline rides these). */
export type SemanticLevel = "constellation" | "feature" | "document";

// Semantic-zoom thresholds — read FROM the canonical control registry (one source).
export const FEATURE_LEVEL_SCALE = controlNumber("featureLevelScale");
export const DOCUMENT_LEVEL_SCALE = controlNumber("documentLevelScale");

export function semanticLevel(scale: number): SemanticLevel {
  if (scale >= DOCUMENT_LEVEL_SCALE) return "document";
  if (scale >= FEATURE_LEVEL_SCALE) return "feature";
  return "constellation";
}
