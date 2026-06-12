import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode } from "../server/engine";
import { DEFAULT_CHOICES, computeVisibility, toGraphFilter } from "./filters";
import type { FilterChoices } from "./filters";

const choices = (over: Partial<FilterChoices> = {}): FilterChoices => ({
  ...structuredClone(DEFAULT_CHOICES),
  ...over,
});

const node = (id: string, extra?: Partial<EngineNode>): EngineNode => ({
  id,
  kind: "plan",
  ...extra,
});

const edge = (
  id: string,
  src: string,
  dst: string,
  extra?: Partial<EngineEdge>,
): EngineEdge => ({
  id,
  src,
  dst,
  relation: "implements",
  tier: "declared",
  confidence: 1,
  ...extra,
});

describe("toGraphFilter (R3 wire compile)", () => {
  it("compiles an empty default to an empty wire object", () => {
    expect(toGraphFilter(choices())).toEqual({});
  });

  it("carries per-tier confidence as 0..1 floats and facet lists", () => {
    const wire = toGraphFilter(
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
        minConfidence: { semantic: 0.7 },
        structuralStates: ["broken"],
        textMatch: "auth",
      }),
    );
    expect(wire.tiers?.semantic).toBe(false);
    expect(wire.min_confidence).toEqual({ semantic: 0.7 });
    expect(wire.structural_state).toEqual(["broken"]);
    expect(wire.text).toBe("auth");
  });
});

describe("computeVisibility (RL-5a membership)", () => {
  const nodes = [
    node("a", { doc_type: "plan", feature_tags: ["auth"], title: "auth plan" }),
    node("b", { doc_type: "adr", feature_tags: ["auth"] }),
    node("c", { doc_type: "plan", feature_tags: ["sync"] }),
  ];
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "a", "c", { tier: "semantic", confidence: 0.4 }),
    edge("e3", "b", "c", { tier: "structural", state: "broken" }),
  ];

  it("hides edges whose tier is off and counts the cost", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
      }),
    );
    expect(v.visibleEdgeIds.has("e2")).toBe(false);
    expect(v.visibleEdgeIds.has("e1")).toBe(true);
    expect(v.hiddenEdgeCount).toBe(1);
  });

  it("applies per-tier confidence floors", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({ minConfidence: { semantic: 0.5 } }),
    );
    expect(v.visibleEdgeIds.has("e2")).toBe(false);
  });

  it("filters nodes by facets and drops edges with hidden endpoints", () => {
    const v = computeVisibility(nodes, edges, choices({ featureTags: ["auth"] }));
    expect(v.visibleNodeIds).toEqual(new Set(["a", "b"]));
    expect(v.visibleEdgeIds).toEqual(new Set(["e1"]));
    expect(v.hiddenNodeCount).toBe(1);
  });

  it("powers the show-broken lens via structural state", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({ structuralStates: ["broken"] }),
    );
    expect(v.visibleEdgeIds.has("e3")).toBe(true);
    expect(v.visibleEdgeIds.has("e1")).toBe(true); // declared unaffected
  });

  it("text-matches against title or id", () => {
    const v = computeVisibility(nodes, edges, choices({ textMatch: "auth plan" }));
    expect(v.visibleNodeIds).toEqual(new Set(["a"]));
  });

  it("keeps meta-edges while any constituent tier is on", () => {
    const meta = edge("m1", "a", "b", {
      tier: "semantic",
      meta: { count: 3, breakdown_by_tier: { declared: 2, semantic: 1 } },
    });
    const v = computeVisibility(
      nodes,
      [meta],
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
      }),
    );
    expect(v.visibleEdgeIds.has("m1")).toBe(true);
  });
});
