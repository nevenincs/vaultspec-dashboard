// Regression (backend-hardening campaign, finding filters-01): the per-tier
// min-confidence floor must stay within the R3 0..1 wire grammar (M-G7). An
// out-of-range floor (a percent-shaped preset like 70) clamps; a non-finite
// floor never ships on the wire and never silently includes the sub-floor
// edges it claims to gate (no `confidence < NaN`).

import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode } from "../server/engine";
import { DEFAULT_CHOICES, computeVisibility, toGraphFilter } from "./filters";
import type { FilterChoices } from "./filters";

const choices = (over: Partial<FilterChoices> = {}): FilterChoices => ({
  ...structuredClone(DEFAULT_CHOICES),
  ...over,
});

const node = (id: string): EngineNode => ({ id, kind: "plan" });
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

describe("min-confidence floor stays within the R3 0..1 grammar", () => {
  it("clamps an out-of-range floor into 0..1 on the wire", () => {
    const wire = toGraphFilter(choices({ minConfidence: { semantic: 70 } }));
    const v = wire.min_confidence?.semantic;
    expect(v !== undefined && Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
  });

  it("drops a non-finite floor from the wire entirely", () => {
    const wire = toGraphFilter(choices({ minConfidence: { semantic: NaN } }));
    expect(wire.min_confidence?.semantic).toBeUndefined();
  });

  it("an engaged invalid floor does not silently include the sub-floor edge", () => {
    const v = computeVisibility(
      [node("a"), node("b")],
      [edge("low", "a", "b", { tier: "semantic", confidence: 0.05 })],
      choices({ minConfidence: { semantic: NaN } }),
    );
    expect(v.visibleEdgeIds.has("low")).toBe(false);
  });

  it("a valid floor hides sub-floor edges and keeps at-or-above edges", () => {
    const edges = [
      edge("lo", "a", "b", { tier: "semantic", confidence: 0.3 }),
      edge("hi", "a", "b", { tier: "semantic", confidence: 0.9 }),
    ];
    const v = computeVisibility(
      [node("a"), node("b")],
      edges,
      choices({ minConfidence: { semantic: 0.5 } }),
    );
    expect(v.visibleEdgeIds.has("lo")).toBe(false);
    expect(v.visibleEdgeIds.has("hi")).toBe(true);
  });
});
