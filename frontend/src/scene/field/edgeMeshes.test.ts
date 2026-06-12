import { describe, expect, it } from "vitest";

import type { SceneEdgeData } from "../sceneController";
import {
  DASHES_PER_EDGE,
  UnknownTierError,
  bucketLightness,
  confidenceBucket,
  edgeGroupKey,
  groupColor,
  hazeHalfWidth,
  mixTowardPaper,
  writeDashedSegments,
  writeQuadCorners,
  writeSegment,
} from "./edgeMeshes";

const edge = (tier: string, extra?: Partial<SceneEdgeData>): SceneEdgeData =>
  ({
    id: "e1",
    src: "a",
    dst: "b",
    relation: "implements",
    tier,
    confidence: 1,
    ...extra,
  }) as SceneEdgeData;

describe("edgeGroupKey", () => {
  it("maps the four tiers to their fixed treatments", () => {
    expect(edgeGroupKey(edge("declared"))).toBe("declared");
    expect(edgeGroupKey(edge("structural", { state: "broken" }))).toBe(
      "structural:broken",
    );
    expect(edgeGroupKey(edge("structural"))).toBe("structural:resolved");
    expect(edgeGroupKey(edge("temporal", { confidence: 0.9 }))).toBe("temporal:3");
    expect(edgeGroupKey(edge("semantic", { confidence: 0.3 }))).toBe("semantic:1");
  });

  it("surfaces unknown tiers as data errors, never re-buckets (audit 003)", () => {
    expect(() => edgeGroupKey(edge("imaginary"))).toThrow(UnknownTierError);
    try {
      edgeGroupKey(edge("imaginary"));
    } catch (err) {
      expect((err as UnknownTierError).edgeId).toBe("e1");
      expect((err as UnknownTierError).tier).toBe("imaginary");
    }
  });
});

describe("confidence encoding", () => {
  it("quantizes confidence into 4 buckets and clamps", () => {
    expect(confidenceBucket(0)).toBe(0);
    expect(confidenceBucket(0.49)).toBe(1);
    expect(confidenceBucket(1)).toBe(3);
    expect(confidenceBucket(2)).toBe(3);
    expect(confidenceBucket(-1)).toBe(0);
  });

  it("carries confidence as lightness toward paper, not transparency", () => {
    expect(bucketLightness(3)).toBe(0);
    expect(bucketLightness(0)).toBeCloseTo(0.6);
    const ink = 0x000000;
    const faint = mixTowardPaper(ink, 0.6);
    expect(faint).not.toBe(ink);
    // Faint is lighter (closer to paper) on every channel.
    expect((faint >> 16) & 0xff).toBeGreaterThan(0);
    // Full-confidence groups stay at base colour.
    expect(groupColor("temporal:3")).toBe(0x4a4137);
    expect(groupColor("temporal:0")).not.toBe(0x4a4137);
  });
});

describe("geometry writers", () => {
  it("writes a solid segment", () => {
    const out = new Float32Array(4);
    writeSegment(out, 0, 1, 2, 3, 4);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it("writes a fixed dash count regardless of edge length", () => {
    const short = new Float32Array(DASHES_PER_EDGE * 4);
    const long = new Float32Array(DASHES_PER_EDGE * 4);
    writeDashedSegments(short, 0, 0, 0, 8, 0);
    writeDashedSegments(long, 0, 0, 0, 800, 0);
    // First dash spans 60% of its slot in both cases.
    expect(short[2]).toBeCloseTo(0.6);
    expect(long[2]).toBeCloseTo(60);
    // Last dash starts at the final slot boundary.
    const lastOffset = (DASHES_PER_EDGE - 1) * 4;
    expect(short[lastOffset]).toBeCloseTo(8 - 1);
    expect(long[lastOffset]).toBeCloseTo(800 - 100);
  });

  it("writes haze quads perpendicular to the segment, width by score", () => {
    const out = new Float32Array(8);
    writeQuadCorners(out, 0, 0, 0, 10, 0, 2);
    // Horizontal segment: normals point in y.
    expect(Array.from(out)).toEqual([0, 2, 0, -2, 10, -2, 10, 2]);
    expect(hazeHalfWidth(1)).toBeGreaterThan(hazeHalfWidth(0));
  });
});
