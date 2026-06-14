// graph-representation W03.P10.S39: the feature overlays — GMap country label
// placement, BubbleSets hull geometry, and the convex-hull primitive.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import { countryLabels } from "./overlays";
import { convexHull, featureHulls, paddedHull } from "./bubbleSets";

const node = (id: string, kind: string, featureTags?: string[]): SceneNodeData => ({
  id,
  kind,
  featureTags,
});

describe("countryLabels (GMap overview overlay)", () => {
  it("places one label per feature at the centroid of its members", () => {
    const nodes = [
      node("doc:a1", "adr", ["alpha"]),
      node("doc:a2", "plan", ["alpha"]),
      node("doc:b1", "adr", ["beta"]),
    ];
    const pos: Record<string, { x: number; y: number }> = {
      "doc:a1": { x: 0, y: 0 },
      "doc:a2": { x: 10, y: 0 },
      "doc:b1": { x: 100, y: 100 },
    };
    const labels = countryLabels(nodes, (id) => pos[id]);
    expect(labels.map((l) => l.feature)).toEqual(["alpha", "beta"]);
    const alpha = labels.find((l) => l.feature === "alpha")!;
    expect(alpha.x).toBe(5); // centroid of (0,0) and (10,0)
    expect(alpha.memberCount).toBe(2);
  });

  it("uses the feature-convergence node's own tag", () => {
    const nodes = [node("feature:gamma", "feature")];
    const labels = countryLabels(nodes, () => ({ x: 1, y: 2 }));
    expect(labels).toHaveLength(1);
    expect(labels[0].feature).toBe("gamma");
  });

  it("skips nodes with no position", () => {
    const nodes = [node("doc:x", "adr", ["alpha"])];
    expect(countryLabels(nodes, () => undefined)).toEqual([]);
  });
});

describe("featureHulls (BubbleSets document overlay)", () => {
  it("produces one hull per feature outlining its members", () => {
    const nodes = [
      node("a", "adr", ["alpha"]),
      node("b", "plan", ["alpha"]),
      node("c", "exec", ["alpha"]),
      node("d", "audit", ["alpha"]),
    ];
    const pos: Record<string, { x: number; y: number }> = {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      c: { x: 100, y: 100 },
      d: { x: 0, y: 100 },
    };
    const hulls = featureHulls(nodes, (id) => pos[id]);
    expect(hulls).toHaveLength(1);
    expect(hulls[0].feature).toBe("alpha");
    // A 4-corner square yields at least a 4-vertex hull (padding-expanded).
    expect(hulls[0].points.length).toBeGreaterThanOrEqual(4);
  });

  it("yields a degenerate bubble for a single-member feature", () => {
    const hull = paddedHull([{ x: 5, y: 5 }], 10);
    expect(hull.length).toBe(4); // padded square around the centroid
  });
});

describe("convexHull", () => {
  it("returns the outer hull of a point set", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 }, // interior point: must be excluded
    ]);
    expect(hull.find((p) => p.x === 1 && p.y === 1)).toBeUndefined();
    expect(hull.length).toBe(4);
  });

  it("handles fewer than 3 points", () => {
    expect(convexHull([{ x: 0, y: 0 }])).toHaveLength(1);
  });
});
