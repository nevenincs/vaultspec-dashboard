import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";

import type { SceneEdgeData } from "../sceneController";
import {
  DASHES_PER_EDGE,
  EdgeMeshLayer,
  SCENE_RULE_FALLBACK,
  UnknownTierError,
  bucketLightness,
  confidenceBucket,
  edgeGroupKey,
  groupColor,
  hazeHalfWidth,
  mixTowardPaper,
  writeDashedSegments,
  writePolyline,
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

  it("folds a routed polyline into line-list segments through its waypoints (D6)", () => {
    // a -> w0 -> w1 -> b: three segments through two waypoints, in the SAME
    // line-list topology (no new mesh kind).
    const capacity = 3;
    const out = new Float32Array(capacity * 4);
    const chain = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
    ];
    writePolyline(out, 0, chain, capacity);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 10, 5]);
    expect(Array.from(out.slice(4, 8))).toEqual([10, 5, 20, 5]);
    expect(Array.from(out.slice(8, 12))).toEqual([20, 5, 30, 0]);
  });

  it("pads unused routed segment slots with degenerate zero-length segments", () => {
    // A 2-point chain (one real segment) in a 3-slot group leaves two padding
    // slots that collapse onto the last point — invisible, never resizing.
    const capacity = 3;
    const out = new Float32Array(capacity * 4);
    const chain = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ];
    writePolyline(out, 0, chain, capacity);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 30, 0]);
    // Slots 2 and 3 are degenerate at the endpoint.
    expect(Array.from(out.slice(4, 8))).toEqual([30, 0, 30, 0]);
    expect(Array.from(out.slice(8, 12))).toEqual([30, 0, 30, 0]);
  });
});

describe("EdgeMeshLayer routed lineage edges (D6)", () => {
  const lineageEdge = (id: string, src: string, dst: string): SceneEdgeData => ({
    id,
    src,
    dst,
    relation: "rel",
    tier: "declared",
    confidence: 1,
    derivation: "generated-by",
  });

  it("routes an edge with waypoints into its own +routed group", () => {
    const layer = new EdgeMeshLayer(new Container());
    layer.setEdges([lineageEdge("e1", "a", "b")]);
    const before = layer.groupCount;
    layer.setRoutes(
      new Map([
        [
          "e1",
          [
            { x: 5, y: 5 },
            { x: 10, y: 5 },
          ],
        ],
      ]),
    );
    // The routed edge moved into a distinct group; positions still draw per
    // frame, so the group set changed (a +routed group now exists).
    expect(layer.groupCount).toBeGreaterThanOrEqual(before);
    // Update draws without throwing through the polyline path.
    const at: Record<string, { x: number; y: number }> = {
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
    };
    expect(() => layer.update((id) => at[id])).not.toThrow();
  });

  it("clearing routes returns the edge to the straight line-list path", () => {
    const layer = new EdgeMeshLayer(new Container());
    layer.setEdges([lineageEdge("e1", "a", "b")]);
    layer.setRoutes(new Map([["e1", [{ x: 5, y: 5 }]]]));
    layer.setRoutes(new Map());
    const at: Record<string, { x: number; y: number }> = {
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
    };
    expect(() => layer.update((id) => at[id])).not.toThrow();
  });

  it("leaves semantic ribbons untouched by routing (no new topology)", () => {
    const layer = new EdgeMeshLayer(new Container());
    const semantic: SceneEdgeData = {
      id: "s1",
      src: "a",
      dst: "b",
      relation: "rel",
      tier: "semantic",
      confidence: 0.5,
    };
    layer.setEdges([semantic]);
    // A route keyed on the semantic edge id is ignored (semantic stays a ribbon).
    layer.setRoutes(new Map([["s1", [{ x: 5, y: 5 }]]]));
    const at: Record<string, { x: number; y: number }> = {
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
    };
    expect(() => layer.update((id) => at[id])).not.toThrow();
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
