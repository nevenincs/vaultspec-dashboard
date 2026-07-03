import { describe, expect, it } from "vitest";

import { categoryColor, nodeCategory } from "./categoryColor";

describe("nodeCategory — kind -> a scene category (index-node-exclusion ADR)", () => {
  it("passes the sanctioned categories through unchanged", () => {
    for (const cat of [
      "feature",
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "reference",
      "code",
    ] as const) {
      expect(nodeCategory(cat)).toBe(cat);
    }
  });

  it("maps the CODE corpus species onto the code category (codebase-graphing ADR D7)", () => {
    // A source file paints the one `code` colour — files are the corpus's ONLY
    // node kind (code-graph-files-only). This category is reachable ONLY on
    // the disconnected code corpus — the vault graph never emits a code node.
    expect(nodeCategory("code-artifact")).toBe("code");
    expect(nodeCategory("code")).toBe("code");
  });

  it("is not aware of an index category at all", () => {
    // `.vault/index` feature-index documents are metanodes dropped at engine
    // ingest (index-node-exclusion ADR); `index` is not a node category, so the
    // literal kind folds to the defensive default rather than passing through.
    expect(nodeCategory("index")).not.toBe("index");
  });

  it("maps reference onto its own bound category (ADR D3)", () => {
    // reference now has its own scene/category-reference colour and no longer folds
    // onto research.
    expect(nodeCategory("reference")).toBe("reference");
  });

  it("folds out-of-vocabulary doc types onto the nearest in-family category", () => {
    // summary -> exec (a summary IS an exec document — a Phase Summary of execution
    // records; the prior summary->index mapping was the metanode confusion the
    // index-node-exclusion ADR corrects); rule -> adr (codified decisions).
    expect(nodeCategory("summary")).toBe("exec");
    expect(nodeCategory("rule")).toBe("adr");
  });

  it("maps the wire node SPECIES (no doc_type) onto its category", () => {
    // The wire `kind` is the species, not the doc type: callers pass
    // `docType ?? kind`, so a species value must still land on a category.
    // plan-container (a plan's wave/phase/step rows) -> plan.
    expect(nodeCategory("plan-container")).toBe("plan");
  });

  it("falls an unknown kind back to the reference swatch (defensive only)", () => {
    // `index` is not a scene category; an unmapped kind resolves the `reference`
    // colour so a stray/diagnostic node still paints rather than crashing. `index`
    // never reaches a displayed node (dropped at ingest).
    expect(nodeCategory("index")).toBe("reference");
    expect(nodeCategory("totally-unknown")).toBe("reference");
    expect(nodeCategory("")).toBe("reference");
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
      "reference",
      "code",
    ].map((k) => categoryColor(k));
    // All eight are distinct (the legend reads as separable hues).
    expect(new Set(colors).size).toBe(8);
    // Spot-check against the Figma variable values (83:2), the reference token
    // (terminology-standardization ADR D3, light #9d5e86), and the code token
    // (codebase-graphing ADR D7, light #b05a6b — the existing Files/search colour).
    expect(categoryColor("feature")).toBe(0xb3823c);
    expect(categoryColor("reference")).toBe(0x9d5e86);
    expect(categoryColor("code")).toBe(0xb05a6b);
    expect(categoryColor("code-artifact")).toBe(0xb05a6b);
  });

  it("colours a folded kind with its mapped category hue", () => {
    // summary is an exec document; it paints the exec hue, never a removed index hue.
    expect(categoryColor("summary")).toBe(categoryColor("exec"));
    expect(categoryColor("rule")).toBe(categoryColor("adr"));
  });
});
