import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { DOC_TYPE_PRESENTATION } from "../../stores/server/docTypeVocabulary";
import {
  CATEGORY_PRESENTATION,
  CATEGORY_TOKENS,
  categoryColorVar,
  categoryPresentation,
  categoryToken,
} from "./category";

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

  it("preserves the exact frozen raw identity order", () => {
    expect(CATEGORY_TOKENS).toEqual([
      "adr",
      "audit",
      "code",
      "exec",
      "feature",
      "plan",
      "reference",
      "research",
    ]);
    expect(Object.isFrozen(CATEGORY_TOKENS)).toBe(true);
  });

  it("keeps exhaustive frozen presentation separate from raw identity", () => {
    expect(Object.keys(CATEGORY_PRESENTATION)).toEqual(CATEGORY_TOKENS);
    expect(Object.isFrozen(CATEGORY_PRESENTATION)).toBe(true);
    for (const id of CATEGORY_TOKENS) {
      const presentation = CATEGORY_PRESENTATION[id];
      expect(categoryPresentation(id)).toBe(presentation);
      expect(presentation.id).toBe(id);
      expect(Object.isFrozen(presentation)).toBe(true);
      expect(Object.isFrozen(presentation.label)).toBe(true);
    }
  });

  it("reuses the canonical document-type descriptors by identity", () => {
    for (const id of [
      "adr",
      "audit",
      "exec",
      "plan",
      "reference",
      "research",
    ] as const) {
      expect(CATEGORY_PRESENTATION[id].label).toBe(DOC_TYPE_PRESENTATION[id].label);
    }
  });

  it("rejects aliases and every inexact or excluded raw identity", () => {
    for (const value of [
      "decision",
      "step",
      "summary",
      "index",
      "ADR",
      " research ",
      "custom",
      "",
      null,
      undefined,
    ]) {
      expect(categoryPresentation(value)).toBeNull();
    }

    expect(categoryPresentation(categoryToken("decision"))).toBe(
      CATEGORY_PRESENTATION.adr,
    );
    expect(categoryPresentation(categoryToken("step"))).toBe(
      CATEGORY_PRESENTATION.exec,
    );
    expect(categoryPresentation(categoryToken("summary"))).toBe(
      CATEGORY_PRESENTATION.exec,
    );
  });

  it("resolves every label without fallback in English, French, and Arabic", () => {
    const english = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);
    const expected = [
      ["adr", "Decisions", "Décisions", "القرارات"],
      ["audit", "Audits", "Audits", "عمليات التدقيق"],
      ["code", "Code", "Code", "التعليمات البرمجية"],
      ["exec", "Steps", "Étapes", "الخطوات"],
      ["feature", "Features", "Fonctionnalités", "الميزات"],
      ["plan", "Plans", "Plans", "الخطط"],
      ["reference", "References", "Références", "المراجع"],
      ["research", "Research", "Recherche", "البحث"],
    ] as const;

    for (const [id, source, alternate, rtl] of expected) {
      const label = CATEGORY_PRESENTATION[id].label;
      expect(resolveMessageResult(english, label)).toEqual({
        message: source,
        usedFallback: false,
      });
      expect(resolveMessageResult(french, label)).toEqual({
        message: alternate,
        usedFallback: false,
      });
      expect(resolveMessageResult(arabic, label)).toEqual({
        message: rtl,
        usedFallback: false,
      });
    }
  });
});
