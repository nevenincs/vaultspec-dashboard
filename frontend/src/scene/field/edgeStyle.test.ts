import { describe, expect, it } from "vitest";

import type { SceneEdgeData } from "../sceneController";
import {
  SCENE_RULE_FALLBACK,
  UnknownTierError,
  bucketLightness,
  confidenceBucket,
  edgeGroupKey,
  groupColor,
  hazeHalfWidth,
  metaHalfWidth,
  mixTowardPaper,
} from "./edgeStyle";

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

  it("carries confidence as lightness toward paper (pure helpers, still data-bearing)", () => {
    // The confidence→lightness MATH is preserved (the timeline arcs reuse it and
    // the data still carries confidence), even though the canvas edge stroke no
    // longer paints it — the Hero redesign flattened the stroke to one grey.
    expect(bucketLightness(3)).toBe(0);
    expect(bucketLightness(0)).toBeCloseTo(0.6);
    const ink = 0x000000;
    const faint = mixTowardPaper(ink, 0.6);
    expect(faint).not.toBe(ink);
    // Faint is lighter (closer to paper) on every channel.
    expect((faint >> 16) & 0xff).toBeGreaterThan(0);
  });

  it("flattens EVERY edge group to the uniform scene-rule grey (Hero redesign)", () => {
    // The stroke colour no longer varies by tier/state/confidence — only the
    // geometry partition survives. In the node test env the scene seam returns
    // the SCENE_RULE_FALLBACK light grey for every key.
    expect(groupColor("declared")).toBe(SCENE_RULE_FALLBACK);
    expect(groupColor("temporal:3")).toBe(SCENE_RULE_FALLBACK);
    expect(groupColor("temporal:0")).toBe(SCENE_RULE_FALLBACK);
    expect(groupColor("structural:broken")).toBe(SCENE_RULE_FALLBACK);
    expect(groupColor("semantic:2")).toBe(SCENE_RULE_FALLBACK);
    expect(groupColor("meta")).toBe(SCENE_RULE_FALLBACK);
  });

  it("optional paper arg mixes toward the supplied ground (FG1-02 — dark-mode path)", () => {
    // At amount=1.0 the result equals the paper colour exactly.
    const darkPaper = { r: 0x21, g: 0x1e, b: 0x1a };
    expect(mixTowardPaper(0x000000, 1.0, darkPaper)).toBe(0x211e1a);
    // At amount=0.0 the colour is unchanged regardless of paper.
    expect(mixTowardPaper(0x4a4137, 0.0, darkPaper)).toBe(0x4a4137);
  });
});

describe("edge treatment widths", () => {
  it("semantic haze half-width grows with score (width by score, G3.c)", () => {
    expect(hazeHalfWidth(1)).toBeGreaterThan(hazeHalfWidth(0));
    expect(hazeHalfWidth(-1)).toBeCloseTo(hazeHalfWidth(0));
  });

  it("meta-ribbon half-width grows with count and caps (G3.d)", () => {
    expect(metaHalfWidth(8)).toBeGreaterThan(metaHalfWidth(1));
    expect(metaHalfWidth(1_000_000)).toBeLessThanOrEqual(6);
  });
});
