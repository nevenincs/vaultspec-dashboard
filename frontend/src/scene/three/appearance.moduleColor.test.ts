// CGR-002 module-identity colouring + module-rollup sizing (P02.S06 / P02.S07).
//
// Node test env (no `document`): the token seam returns the light-theme fallbacks
// pinned in categoryColor.ts (CATEGORY_FALLBACK) and canvasBackground's fallback
// (0xfdfaf6), so the mapping is deterministic here.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import {
  categoryPaletteHue,
  mixHexToward,
  nodeColorNumber,
  nodeWorldRadius,
} from "./appearance";

const node = (over: Partial<SceneNodeData>): SceneNodeData => ({
  id: over.id ?? "code:x",
  kind: over.kind ?? "code-artifact",
  ...over,
});

// Fallback hues (mirror categoryColor.ts CATEGORY_FALLBACK / canvasBackground).
const FEATURE = 0xb3823c;
const REFERENCE = 0x9d5e86;
const CODE = 0xb05a6b;
const ADR = 0x8a72b5;
const BG = 0xfdfaf6;

describe("mixHexToward", () => {
  it("t=0 returns the source, t=1 returns the target", () => {
    expect(mixHexToward(0x112233, 0xffffff, 0)).toBe(0x112233);
    expect(mixHexToward(0x112233, 0xffffff, 1)).toBe(0xffffff);
  });
  it("mixes per channel at t=0.5", () => {
    expect(mixHexToward(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it("clamps t out of [0,1]", () => {
    expect(mixHexToward(0x112233, 0xffffff, -1)).toBe(0x112233);
    expect(mixHexToward(0x112233, 0xffffff, 2)).toBe(0xffffff);
  });
});

describe("categoryPaletteHue (module-hue ordered palette)", () => {
  it("index 0 is the first palette hue (feature swatch)", () => {
    expect(categoryPaletteHue(0)).toBe(FEATURE);
  });
  it("index 6 is the last palette hue (reference swatch)", () => {
    expect(categoryPaletteHue(6)).toBe(REFERENCE);
  });
  it("wraps an out-of-range index into the 7-hue palette", () => {
    expect(categoryPaletteHue(7)).toBe(FEATURE);
  });
});

describe("nodeColorNumber (CGR-002 module colouring)", () => {
  it("paints the module palette hue for a code node with a hue index (depth 0)", () => {
    expect(nodeColorNumber(node({ moduleHue: 0 }))).toBe(FEATURE);
    expect(nodeColorNumber(node({ moduleHue: 6 }))).toBe(REFERENCE);
  });

  it("mixes toward the canvas ground by DEPTH (deeper = more recede)", () => {
    // depth 3 → t = min(0.55, 3*0.12) = 0.36; feature 0xb3823c → bg 0xfdfaf6.
    expect(nodeColorNumber(node({ moduleHue: 0, depth: 3 }))).toBe(0xcead7f);
    // A depth-mixed leaf is distinct from its saturated top-of-module hue.
    expect(nodeColorNumber(node({ moduleHue: 0, depth: 3 }))).not.toBe(FEATURE);
  });

  it("clamps the depth mix to a legibility floor (never reaches the ground)", () => {
    expect(nodeColorNumber(node({ moduleHue: 0, depth: 100 }))).not.toBe(BG);
  });

  it("a long-tail code module (moduleHue null) paints the neutral code hue", () => {
    expect(nodeColorNumber(node({ kind: "code-artifact", moduleHue: null }))).toBe(
      CODE,
    );
  });

  it("a vault node (no moduleHue) keeps its category hue", () => {
    expect(nodeColorNumber(node({ kind: "adr", docType: "adr" }))).toBe(ADR);
  });
});

describe("nodeWorldRadius (CGR-002 module-rollup sizing, P02.S07)", () => {
  it("sizes a code-module rollup by member count, like a feature node", () => {
    const feature = nodeWorldRadius(node({ kind: "feature", memberCount: 8 }));
    const codeMod = nodeWorldRadius(node({ kind: "code-module", memberCount: 8 }));
    expect(codeMod).toBe(feature);
    expect(codeMod).toBeGreaterThan(nodeWorldRadius(node({ kind: "code-module" })));
  });
});
