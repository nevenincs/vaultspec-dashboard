import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  DOC_TYPE_ORDER,
  DOC_TYPE_PRESENTATION,
  DOCUMENT_TYPE_MESSAGES,
  docTypeLabel,
  docTypePresentation,
} from "./docTypeVocabulary";

describe("canonical doc-type vocabulary (terminology-standardization ADR D1/D2)", () => {
  it("preserves the exact frozen raw identity order and presentation map", () => {
    expect(DOC_TYPE_ORDER).toEqual([
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "reference",
    ]);
    expect(Object.isFrozen(DOC_TYPE_ORDER)).toBe(true);
    expect(Object.isFrozen(DOC_TYPE_PRESENTATION)).toBe(true);
    for (const id of DOC_TYPE_ORDER) {
      expect(Object.isFrozen(DOC_TYPE_PRESENTATION[id])).toBe(true);
      expect(Object.isFrozen(DOC_TYPE_PRESENTATION[id].label)).toBe(true);
      expect(docTypePresentation(id)).toBe(DOC_TYPE_PRESENTATION[id]);
    }
  });

  it("rejects every non-displayable or inexact raw identity", () => {
    expect(docTypePresentation("index")).toBeNull();
    expect(docTypePresentation("code")).toBeNull();
    expect(docTypePresentation("summary")).toBeNull();
    expect(docTypePresentation("custom")).toBeNull();
    expect(docTypePresentation(" research ")).toBeNull();
    expect(docTypePresentation(null)).toBeNull();
  });

  it("resolves the six labels and separate generic label in English, French, and Arabic", () => {
    const english = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);
    const expected = [
      ["research", "Research", "Recherche", "البحث"],
      ["adr", "Decisions", "Décisions", "القرارات"],
      ["plan", "Plans", "Plans", "الخطط"],
      ["exec", "Steps", "Étapes", "الخطوات"],
      ["audit", "Audits", "Audits", "عمليات التدقيق"],
      ["reference", "References", "Références", "المراجع"],
    ] as const;

    for (const [id, source, alternate, rtl] of expected) {
      const presentation = docTypePresentation(id);
      expect(presentation).not.toBeNull();
      expect(resolveMessageResult(english, presentation!.label)).toEqual({
        message: source,
        usedFallback: false,
      });
      expect(resolveMessageResult(french, presentation!.label)).toEqual({
        message: alternate,
        usedFallback: false,
      });
      expect(resolveMessageResult(arabic, presentation!.label)).toEqual({
        message: rtl,
        usedFallback: false,
      });
    }
    expect(resolveMessageResult(english, DOCUMENT_TYPE_MESSAGES.document)).toEqual({
      message: "Document",
      usedFallback: false,
    });
    expect(resolveMessageResult(french, DOCUMENT_TYPE_MESSAGES.document)).toEqual({
      message: "Document",
      usedFallback: false,
    });
    expect(resolveMessageResult(arabic, DOCUMENT_TYPE_MESSAGES.document)).toEqual({
      message: "مستند",
      usedFallback: false,
    });
  });

  it("keeps the temporary source-locale bridge safe for legacy consumers", () => {
    expect(DOC_TYPE_ORDER.map((id) => docTypeLabel(id))).toEqual([
      "Research",
      "Decisions",
      "Plans",
      "Steps",
      "Audits",
      "References",
    ]);
    expect(
      ["index", "code", "summary", "arbitrary-internal-type", "   "].map((id) =>
        docTypeLabel(id),
      ),
    ).toEqual(["Document", "Document", "Document", "Document", "Document"]);
  });
});
