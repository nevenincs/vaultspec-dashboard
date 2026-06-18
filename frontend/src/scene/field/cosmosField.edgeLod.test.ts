// Bounded-by-default edge ceiling (graph-queries-are-bounded-by-default). cosmos
// couples the rendered and simulated link sets, so the field caps the edges fed to
// it: the declared/structural backbone is always kept; excess noisy-tier edges are
// dropped by ascending confidence and counted honestly.

import { describe, expect, it } from "vitest";

import { boundEdgesForSim } from "./cosmosField";
import type { SceneEdgeData } from "../sceneController";

function edge(
  id: string,
  tier: SceneEdgeData["tier"],
  confidence: number,
): SceneEdgeData {
  return { id, src: `${id}-s`, dst: `${id}-t`, relation: "mentions", tier, confidence };
}

describe("boundEdgesForSim", () => {
  it("returns all edges unchanged when under the cap", () => {
    const edges = [edge("a", "temporal", 0.2), edge("b", "semantic", 0.9)];
    const { kept, lodDropped } = boundEdgesForSim(edges, 10);
    expect(kept).toBe(edges); // same reference, no copy
    expect(lodDropped).toBe(0);
  });

  it("always keeps the declared/structural backbone even past the cap", () => {
    const edges = [
      edge("d1", "declared", 0.1),
      edge("s1", "structural", 0.1),
      edge("t1", "temporal", 0.9),
      edge("t2", "temporal", 0.8),
    ];
    // cap below the backbone count: backbone is still fully kept.
    const { kept } = boundEdgesForSim(edges, 1);
    const ids = kept.map((e) => e.id);
    expect(ids).toContain("d1");
    expect(ids).toContain("s1");
  });

  it("fills the remaining budget with the highest-confidence noisy edges", () => {
    const edges = [
      edge("d1", "declared", 0.1), // backbone, always kept
      edge("lo", "temporal", 0.2),
      edge("hi", "semantic", 0.95),
      edge("mid", "temporal", 0.5),
    ];
    // cap 2 => keep backbone (1) + 1 highest-confidence noisy ("hi").
    const { kept, lodDropped } = boundEdgesForSim(edges, 2);
    const ids = kept.map((e) => e.id);
    expect(ids).toEqual(["d1", "hi"]); // original order preserved
    expect(lodDropped).toBe(2);
  });

  it("preserves original order in the kept subset", () => {
    const edges = [
      edge("t1", "temporal", 0.9),
      edge("d1", "declared", 0.1),
      edge("t2", "temporal", 0.95),
    ];
    const { kept } = boundEdgesForSim(edges, 2);
    const ids = kept.map((e) => e.id);
    // d1 (backbone) + t2 (higher conf) kept, in original positions.
    expect(ids).toEqual(["d1", "t2"]);
  });
});
