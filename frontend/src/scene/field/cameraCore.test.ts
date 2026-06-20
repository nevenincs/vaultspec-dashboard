import { describe, expect, it } from "vitest";

import { DOCUMENT_LEVEL_SCALE, FEATURE_LEVEL_SCALE, semanticLevel } from "./cameraCore";

// The retired Camera-class machinery (camera math, SpatialHitTester, PointerGestures)
// was removed in the Phase B dead-code prune — it had no live consumers (threeField
// owns those inline). Only the semantic-zoom level mapping survives and is tested here.
describe("semanticLevel", () => {
  it("maps geometric scale onto the three discrete levels", () => {
    expect(semanticLevel(FEATURE_LEVEL_SCALE - 0.01)).toBe("constellation");
    expect(semanticLevel(FEATURE_LEVEL_SCALE)).toBe("feature");
    expect(semanticLevel(DOCUMENT_LEVEL_SCALE)).toBe("document");
  });
});
