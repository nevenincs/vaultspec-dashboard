import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode } from "../../stores/server/engine";
import { mergeSlices } from "./WorkingSet";

const node = (id: string): EngineNode => ({ id, kind: "feature" });
const edge = (id: string, src: string, dst: string): EngineEdge => ({
  id,
  src,
  dst,
  relation: "related",
  tier: "declared",
  confidence: 1,
});

describe("mergeSlices", () => {
  it("unions by stable id without duplicates", () => {
    const merged = mergeSlices(
      { nodes: [node("a"), node("b")], edges: [edge("e1", "a", "b")] },
      [
        {
          nodes: [node("b"), node("c")],
          edges: [edge("e1", "a", "b"), edge("e2", "b", "c")],
        },
        { nodes: [node("d")], edges: [] },
      ],
    );
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(merged.edges.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns the base unchanged with no expansions", () => {
    const base = { nodes: [node("a")], edges: [] };
    expect(mergeSlices(base, [])).toEqual(base);
  });
});
