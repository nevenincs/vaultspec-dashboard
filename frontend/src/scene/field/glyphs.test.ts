import { describe, expect, it } from "vitest";

import {
  GLYPH_KINDS,
  STATE_GLYPH_MARKS,
  TIER_GLYPH_MARKS,
  glyphPolygon,
  pointInPolygon,
  polygonSdf,
} from "./glyphs";

describe("glyphPolygon", () => {
  it("gives every known kind a distinct silhouette", () => {
    const shapes = GLYPH_KINDS.map((k) => JSON.stringify(glyphPolygon(k)));
    expect(new Set(shapes).size).toBe(GLYPH_KINDS.length);
  });

  it("falls back to a default silhouette for unknown kinds", () => {
    expect(glyphPolygon("mystery")).toEqual(glyphPolygon("never-seen"));
    expect(glyphPolygon("mystery").length).toBeGreaterThan(5);
  });

  it("keeps silhouettes within the unit box", () => {
    for (const kind of GLYPH_KINDS) {
      for (const v of glyphPolygon(kind)) {
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("glyph marks", () => {
  it("covers the four tiers and the state vocabulary", () => {
    expect(Object.keys(TIER_GLYPH_MARKS)).toEqual([
      "declared",
      "structural",
      "temporal",
      "semantic",
    ]);
    expect(new Set(Object.values(STATE_GLYPH_MARKS)).size).toBe(5);
  });
});

describe("pointInPolygon", () => {
  const square = [-1, -1, 1, -1, 1, 1, -1, 1];

  it("classifies inside and outside", () => {
    expect(pointInPolygon(0, 0, square)).toBe(true);
    expect(pointInPolygon(2, 0, square)).toBe(false);
  });
});

describe("polygonSdf", () => {
  it("is bright inside, dark outside, near 128 on the contour", () => {
    const square = [-1, -1, 1, -1, 1, 1, -1, 1];
    const size = 32;
    const sdf = polygonSdf(square, size);
    const at = (fx: number, fy: number) => {
      const x = Math.round(((fx + 1.2) / 2.4) * size - 0.5);
      const y = Math.round(((fy + 1.2) / 2.4) * size - 0.5);
      return sdf[y * size + x];
    };
    expect(at(0, 0)).toBeGreaterThan(200);
    expect(at(1.15, 1.15)).toBeLessThan(100);
    expect(Math.abs(at(1, 0) - 128)).toBeLessThanOrEqual(20);
  });
});
