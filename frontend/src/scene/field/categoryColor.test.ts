import { describe, expect, it } from "vitest";

import { categoryColor, nodeCategory } from "./categoryColor";

describe("nodeCategory — kind -> one of the eight Figma categories (83:2)", () => {
  it("passes the eight sanctioned categories through unchanged", () => {
    for (const cat of [
      "feature",
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "index",
      "code",
    ] as const) {
      expect(nodeCategory(cat)).toBe(cat);
    }
  });

  it("folds out-of-vocabulary doc types onto the nearest in-family category", () => {
    // reference -> research (grounding docs), summary -> index (roll-ups),
    // rule -> adr (codified decisions).
    expect(nodeCategory("reference")).toBe("research");
    expect(nodeCategory("summary")).toBe("index");
    expect(nodeCategory("rule")).toBe("adr");
  });

  it("maps the wire node SPECIES (no doc_type) onto its category", () => {
    // The wire `kind` is the species, not the doc type: callers pass
    // `docType ?? kind`, so a species value must still land on a category.
    // plan-container (a plan's wave/phase/step rows) -> plan; code-artifact ->
    // code. This is the regression guard for the bug where ~all `document` and
    // `plan-container` nodes collapsed onto the single `code` swatch because the
    // colour was resolved from `kind` instead of `doc_type`.
    expect(nodeCategory("plan-container")).toBe("plan");
    expect(nodeCategory("code-artifact")).toBe("code");
  });

  it("falls back an unknown kind to a category hue (code), never an uncoloured node", () => {
    expect(nodeCategory("totally-unknown")).toBe("code");
    expect(nodeCategory("")).toBe("code");
  });
});

describe("categoryColor — node body fill from the scene-category token seam", () => {
  // In the node test env `document` is undefined, so cssColorNumber returns the
  // light-mode fallbacks declared in categoryColor.ts (mirroring styles.css :root).
  it("resolves each category to its distinct light-mode fallback hex", () => {
    const colors = [
      "feature",
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "index",
      "code",
    ].map((k) => categoryColor(k));
    // All eight are distinct (the legend reads as eight separable hues).
    expect(new Set(colors).size).toBe(8);
    // Spot-check two against the Figma variable values (83:2).
    expect(categoryColor("feature")).toBe(0xb3823c);
    expect(categoryColor("code")).toBe(0xb05a6b);
  });

  it("colours a folded kind with its mapped category hue", () => {
    expect(categoryColor("reference")).toBe(categoryColor("research"));
    expect(categoryColor("summary")).toBe(categoryColor("index"));
  });
});
