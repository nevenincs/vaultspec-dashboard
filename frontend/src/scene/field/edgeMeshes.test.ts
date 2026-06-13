import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";

import type { SceneEdgeData } from "../sceneController";
import {
  DASHES_PER_EDGE,
  EdgeMeshLayer,
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

  it("optional paper arg mixes toward the supplied ground (FG1-02 — dark-mode path)", () => {
    // At amount=1.0 the result equals the paper colour exactly.
    const darkPaper = { r: 0x21, g: 0x1e, b: 0x1a };
    expect(mixTowardPaper(0x000000, 1.0, darkPaper)).toBe(0x211e1a);
    // At amount=0.0 the colour is unchanged regardless of paper.
    expect(mixTowardPaper(0x4a4137, 0.0, darkPaper)).toBe(0x4a4137);
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

// ---------------------------------------------------------------------------
// EdgeMeshLayer.updateEdge — incremental fast-path (FP3-01)
//
// updateEdge() only reads/writes lastEdges and groups (plain arrays + Map)
// and calls the pure edgeGroupKey(). No WebGL methods are invoked in the
// fast path, so we can test it headlessly by bypassing rebuild() via direct
// state injection on the private fields.
// ---------------------------------------------------------------------------

/** Build a minimal SceneEdgeData fixture. */
function mkEdge(
  id: string,
  tier: string,
  extra?: Partial<SceneEdgeData>,
): SceneEdgeData {
  return {
    id,
    src: "a",
    dst: "b",
    relation: "r",
    tier,
    confidence: 1,
    ...extra,
  } as SceneEdgeData;
}

/**
 * Seed an EdgeMeshLayer's internal state directly (bypasses GPU-bound rebuild).
 * groups is keyed by the base group key; each holds just enough structure for
 * updateEdge to find and patch the edge.
 */
function seedLayer(layer: EdgeMeshLayer, edges: SceneEdgeData[]): void {
  const priv = layer as unknown as {
    lastEdges: SceneEdgeData[];
    groups: Map<string, { edges: SceneEdgeData[] }>;
  };
  priv.lastEdges = [...edges];
  const groups = new Map<string, { edges: SceneEdgeData[] }>();
  for (const e of edges) {
    const key = edgeGroupKey(e);
    if (!groups.has(key)) groups.set(key, { edges: [] });
    groups.get(key)!.edges.push(e);
  }
  priv.groups = groups;
}

describe("EdgeMeshLayer.updateEdge", () => {
  function makeLayer() {
    return new EdgeMeshLayer(new Container());
  }

  it("fast path: op:change on same group key returns true", () => {
    const layer = makeLayer();
    const e = mkEdge("e1", "declared");
    seedLayer(layer, [e]);
    // Same tier — same group key — in-place patch
    expect(layer.updateEdge(mkEdge("e1", "declared"), "change")).toBe(true);
  });

  it("op:add returns false — caller must fall back to full rebuild", () => {
    const layer = makeLayer();
    const e = mkEdge("e1", "declared");
    seedLayer(layer, [e]);
    expect(layer.updateEdge(mkEdge("e1", "declared"), "add")).toBe(false);
  });

  it("op:remove returns false — caller must fall back to full rebuild", () => {
    const layer = makeLayer();
    const e = mkEdge("e1", "declared");
    seedLayer(layer, [e]);
    expect(layer.updateEdge(mkEdge("e1", "declared"), "remove")).toBe(false);
  });

  it("unknown id returns false — treated as add, caller falls back", () => {
    const layer = makeLayer();
    seedLayer(layer, [mkEdge("e1", "declared")]);
    expect(layer.updateEdge(mkEdge("e_unknown", "declared"), "change")).toBe(false);
  });

  it("group-key shift returns false — tier change requires topology rebuild", () => {
    const layer = makeLayer();
    const e = mkEdge("e1", "declared");
    seedLayer(layer, [e]);
    // Same id, different tier → different group key → must rebuild
    expect(layer.updateEdge(mkEdge("e1", "structural"), "change")).toBe(false);
  });

  it("fast path patches the edge in-place (lastEdges reflects the new data)", () => {
    const layer = makeLayer();
    const orig = mkEdge("e1", "declared");
    seedLayer(layer, [orig]);
    const updated = mkEdge("e1", "declared", { relation: "updated" });
    const handled = layer.updateEdge(updated, "change");
    expect(handled).toBe(true);
    // Confirm the internal array was patched
    const priv = layer as unknown as { lastEdges: SceneEdgeData[] };
    expect(priv.lastEdges[0].relation).toBe("updated");
  });
});
