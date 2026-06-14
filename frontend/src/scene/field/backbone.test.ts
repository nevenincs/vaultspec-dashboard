// graph-representation W02.P07.S31: the anti-hairball backbone — disparity-filter
// thinning of the noisy tiers, the declared+structural layout backbone, and
// hierarchical edge bundling with un-bundle-on-hover.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData } from "../sceneController";
import { DISPARITY_ALPHA, disparityFilter } from "./disparityFilter";
import { LAYOUT_BACKBONE_TIERS, backboneEdgeIds, splitBackbone } from "./backbone";
import {
  BUNDLE_BETA,
  UNBUNDLE_BETA,
  betaForEdge,
  bundleControlPoint,
  centroid,
  sampleBundle,
} from "./edgeBundling";

const edge = (over: Partial<SceneEdgeData> & { id: string }): SceneEdgeData => ({
  src: "a",
  dst: "b",
  relation: "rel",
  tier: "declared",
  confidence: 1,
  ...over,
});

describe("disparityFilter", () => {
  it("never thins declared or structural backbone edges", () => {
    const edges = [
      edge({ id: "d", tier: "declared", confidence: 0.01 }),
      edge({ id: "s", tier: "structural", confidence: 0.01 }),
    ];
    const kept = disparityFilter(edges);
    expect(kept.map((e) => e.id).sort()).toEqual(["d", "s"]);
  });

  it("drops insignificant noisy edges between two hubs and keeps the dominant one", () => {
    // Two hubs 'h' and 'g' each carry one strong edge and many weak ones, so the
    // OR rule cannot trivially preserve a weak edge via a degree-1 leaf endpoint.
    const edges: SceneEdgeData[] = [
      edge({ id: "strongH", src: "h", dst: "g", tier: "semantic", confidence: 0.95 }),
    ];
    for (let i = 0; i < 12; i++) {
      // Weak edges between two hubs (both 'h' and 'g' get many incident edges),
      // so neither endpoint is a degree-1 trivial-backbone node.
      const a = `h${i % 2 === 0 ? "" : "2"}`;
      const b = `g${i % 2 === 0 ? "" : "2"}`;
      edges.push(
        edge({ id: `weak${i}`, src: "h", dst: b, tier: "semantic", confidence: 0.02 }),
        edge({ id: `weak${i}b`, src: a, dst: "g", tier: "semantic", confidence: 0.02 }),
      );
    }
    const kept = disparityFilter(edges, DISPARITY_ALPHA);
    const keptIds = new Set(kept.map((e) => e.id));
    // The dominant edge survives; the field is thinned below its raw size.
    expect(keptIds.has("strongH")).toBe(true);
    expect(kept.length).toBeLessThan(edges.length);
  });

  it("keeps a node's single noisy edge (trivially its backbone)", () => {
    const edges = [
      edge({ id: "lonely", src: "p", dst: "q", tier: "temporal", confidence: 0.1 }),
    ];
    expect(disparityFilter(edges).map((e) => e.id)).toEqual(["lonely"]);
  });
});

describe("splitBackbone", () => {
  it("puts declared/structural/meta in the backbone and thins the rest into context", () => {
    const edges: SceneEdgeData[] = [
      edge({ id: "d", tier: "declared" }),
      edge({ id: "s", tier: "structural" }),
      edge({ id: "t", src: "n", dst: "m", tier: "temporal", confidence: 0.8 }),
      edge({
        id: "meta",
        tier: "semantic",
        meta: { count: 3, breakdownByTier: { semantic: 3 } },
      }),
    ];
    const { backbone, context } = splitBackbone(edges);
    const backboneIds = backbone.map((e) => e.id).sort();
    expect(backboneIds).toContain("d");
    expect(backboneIds).toContain("s");
    expect(backboneIds).toContain("meta");
    // The temporal edge is layered context, not layout input.
    expect(context.map((e) => e.id)).toContain("t");
    expect(backboneIds).not.toContain("t");
  });

  it("the layout backbone tiers are exactly declared + structural", () => {
    expect([...LAYOUT_BACKBONE_TIERS].sort()).toEqual(["declared", "structural"]);
  });

  it("backboneEdgeIds returns only the layout-backbone ids", () => {
    const ids = backboneEdgeIds([
      edge({ id: "d", tier: "declared" }),
      edge({ id: "t", src: "n", dst: "m", tier: "temporal", confidence: 0.1 }),
    ]);
    expect(ids.has("d")).toBe(true);
    expect(ids.has("t")).toBe(false);
  });
});

describe("edge bundling and un-bundle-on-hover", () => {
  it("routes a bundled edge toward the cluster centroids", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const srcC = { x: 0, y: 100 };
    const dstC = { x: 100, y: 100 };
    const bundled = bundleControlPoint(from, to, srcC, dstC, BUNDLE_BETA);
    // The bundled control point bows toward the centroids (y > 0).
    expect(bundled.y).toBeGreaterThan(0);
  });

  it("un-bundles (straightens) a hovered edge to the straight midpoint", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const srcC = { x: 0, y: 100 };
    const dstC = { x: 100, y: 100 };
    const straight = bundleControlPoint(from, to, srcC, dstC, UNBUNDLE_BETA);
    expect(straight).toEqual({ x: 50, y: 0 });
  });

  it("selects the un-bundled beta for a lifted edge and bundled for the rest", () => {
    expect(betaForEdge(true)).toBe(UNBUNDLE_BETA);
    expect(betaForEdge(false)).toBe(BUNDLE_BETA);
  });

  it("samples a bezier with both endpoints included", () => {
    const pts = sampleBundle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, 4);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
    expect(pts).toHaveLength(5);
  });

  it("computes a cluster centroid", () => {
    expect(
      centroid([
        { x: 0, y: 0 },
        { x: 2, y: 4 },
      ]),
    ).toEqual({ x: 1, y: 2 });
  });
});
