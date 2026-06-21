import { describe, expect, it } from "vitest";

import { DOC_TYPE_LABEL, DOC_TYPE_ORDER, docTypeLabel } from "./docTypeVocabulary";

describe("canonical doc-type vocabulary (terminology-standardization ADR D1/D2)", () => {
  it("maps every vault doc type to its canonical user-facing word", () => {
    // The exact schema settled in ADR D1: plural, pipeline vocabulary.
    expect(DOC_TYPE_LABEL).toMatchObject({
      research: "Research",
      adr: "Decisions",
      plan: "Plans",
      exec: "Steps",
      audit: "Audits",
      reference: "References",
      index: "Index",
    });
  });

  it("resolves known doc types through docTypeLabel", () => {
    expect(docTypeLabel("research")).toBe("Research");
    expect(docTypeLabel("adr")).toBe("Decisions");
    expect(docTypeLabel("plan")).toBe("Plans");
    expect(docTypeLabel("exec")).toBe("Steps");
    expect(docTypeLabel("audit")).toBe("Audits");
    expect(docTypeLabel("reference")).toBe("References");
  });

  it("Title-cases an unknown doc type as a graceful fallback (never a raw slug)", () => {
    expect(docTypeLabel("summary")).toBe("Summary");
    expect(docTypeLabel("custom")).toBe("Custom");
  });

  it("orders doc types by the pipeline reading order and excludes index (D2/D5)", () => {
    expect([...DOC_TYPE_ORDER]).toEqual([
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "reference",
    ]);
    // index is never a displayed group, so it is absent from the display order.
    expect(DOC_TYPE_ORDER).not.toContain("index");
  });
});
