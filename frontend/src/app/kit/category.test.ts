import { describe, expect, it } from "vitest";

import { categoryColorVar, categoryToken } from "./category";

describe("kit category vocabulary", () => {
  it("resolves the canonical reference category to its bound scene token (ADR D3)", () => {
    // `reference` now has its own bound scene/category color and must resolve to the
    // CSS custom property — not fall back to another category or a literal hex.
    expect(categoryColorVar("reference")).toBe("var(--color-scene-category-reference)");
  });

  it("resolves every canonical category token to its own scene variable", () => {
    // `index` is deliberately NOT a category token (index documents are the
    // strictly-ignored metanodes the index-node-exclusion ADR drops at ingest).
    for (const token of [
      "adr",
      "audit",
      "code",
      "exec",
      "feature",
      "plan",
      "reference",
      "research",
    ] as const) {
      expect(categoryColorVar(token)).toBe(`var(--color-scene-category-${token})`);
    }
  });

  it("aliases the human Figma labels onto their canonical tokens", () => {
    expect(categoryToken("decision")).toBe("adr");
    expect(categoryToken("step")).toBe("exec");
    expect(categoryToken("summary")).toBe("exec");
    expect(categoryToken("reference")).toBe("reference");
  });
});
