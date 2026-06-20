import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode } from "../server/engine";
import { applyHiddenCategories } from "./categoryVisibilityMask";
import { DEFAULT_CHOICES, computeVisibility } from "./filters";
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

const edge = (id: string, src: string, dst: string): EngineEdge => ({
  id,
  src,
  dst,
  relation: "implements",
  tier: "declared",
  confidence: 1,
});

// Categories resolve from `doc_type ?? kind` via the shared nodeCategory map.
const catNodes: EngineNode[] = [
  node("a", { doc_type: "adr" }),
  node("p", { doc_type: "plan" }),
  node("r", { doc_type: "research" }),
];
const catEdges: EngineEdge[] = [edge("a-p", "a", "p"), edge("p-r", "p", "r")];
const fullyVisible = () => computeVisibility(catNodes, catEdges, choices());

describe("applyHiddenCategories (canvas-local legend mask)", () => {
  it("returns the input membership unchanged when nothing is hidden", () => {
    const membership = fullyVisible();
    expect(applyHiddenCategories(membership, catNodes, catEdges, new Set())).toBe(
      membership,
    );
  });

  it("drops nodes of a hidden category and edges that lose an endpoint", () => {
    const masked = applyHiddenCategories(
      fullyVisible(),
      catNodes,
      catEdges,
      new Set(["plan"]),
    );
    expect(masked.visibleNodeIds).toEqual(new Set(["a", "r"]));
    // Both edges touched the plan node, so both drop.
    expect(masked.visibleEdgeIds).toEqual(new Set());
    expect(masked.hiddenNodeCount).toBe(1);
    expect(masked.hiddenEdgeCount).toBe(2);
  });

  it("hides multiple categories at once", () => {
    const masked = applyHiddenCategories(
      fullyVisible(),
      catNodes,
      catEdges,
      new Set(["adr", "research"]),
    );
    expect(masked.visibleNodeIds).toEqual(new Set(["p"]));
    expect(masked.visibleEdgeIds).toEqual(new Set());
  });

  it("never RE-adds a node the canonical filter already hid (narrow-only)", () => {
    // Canonical filter keeps only adr+plan; the mask then hides plan. The adr
    // node is the only survivor — the mask narrows, never widens.
    const base = computeVisibility(
      catNodes,
      catEdges,
      choices({ docTypes: ["adr", "plan"] }),
    );
    const masked = applyHiddenCategories(base, catNodes, catEdges, new Set(["plan"]));
    expect(masked.visibleNodeIds).toEqual(new Set(["a"]));
  });
});
