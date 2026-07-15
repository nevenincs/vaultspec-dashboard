import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  TREE_BROWSER_MESSAGES,
  docTooltipLabel,
  formatTreeWeight,
  formatTreeDate,
  treeDecisionStatusMessage,
  treeDecisionStatusLabelMessage,
  treePartialCountMessage,
  treePlanProgressMessage,
  treeRowActionsMessage,
  treeSizeSummaryMessage,
  treeWordCountMessage,
} from "./TreeBrowser";
import {
  docDateTimestamp,
  docDisplayTitle,
  docGroupMessage,
} from "./vaultRowPresentation";

describe("TreeBrowser localization", () => {
  it("resolves genuine English, French, and Arabic presentation without fallback", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    const messages = [
      ...Object.values(TREE_BROWSER_MESSAGES),
      treePartialCountMessage(1),
      treePartialCountMessage(24),
      treeRowActionsMessage("Author title"),
      treePlanProgressMessage(3, 12),
      treeWordCountMessage(1),
      treeWordCountMessage(1_250),
      treeSizeSummaryMessage(12, "4 KB"),
      treeDecisionStatusMessage("accepted"),
      treeDecisionStatusLabelMessage("accepted"),
      docGroupMessage("adr"),
      docGroupMessage("future-wire-token"),
    ] as const;

    for (const message of messages) {
      expect(message).not.toBeNull();
      if (!message) continue;
      const results = runtimes.map((runtime) => resolveMessageResult(runtime, message));
      expect(
        results.every((result) => result.usedFallback === false),
        JSON.stringify({ message, results }),
      ).toBe(true);
      expect(results.every((result) => result.message.length > 0)).toBe(true);
      expect(results.map((result) => result.message).join(" ")).not.toMatch(
        /future-wire-token|documents:|common:/,
      );
    }
  });

  it("parses only real date-only values at UTC midnight", () => {
    expect(docDateTimestamp("2026-01-05")).toBe(Date.UTC(2026, 0, 5));
    expect(docDateTimestamp("2026-02-29")).toBeNull();
    expect(docDateTimestamp("2026-01-05T12:00:00Z")).toBeNull();
    expect(docDateTimestamp("private-token")).toBeNull();
  });

  it("fails closed for invalid facts and formats valid weights by locale", () => {
    const runtime = createTestLocalizationRuntime();
    const resolve = (message: Parameters<typeof resolveMessageResult>[1]) =>
      resolveMessageResult(runtime, message);
    expect(treePlanProgressMessage(-1, 2)).toBeNull();
    expect(treePlanProgressMessage(3, 2)).toBeNull();
    expect(treeWordCountMessage(Number.NaN)).toBeNull();
    expect(treeSizeSummaryMessage(Number.POSITIVE_INFINITY, "4 KB")).toBeNull();
    expect(treeDecisionStatusMessage("future-wire-token")).toBeNull();
    expect(treeDecisionStatusLabelMessage("future-wire-token")).toBeNull();
    expect(formatTreeWeight("en", 1, 1_000, resolve)).toBe("Less than 1%");
    expect(formatTreeWeight("fr", 125, 1_000, resolve)).toContain("12,5");
    expect(formatTreeWeight("ar", 2_000, 1_000, resolve)).toBe("");
  });

  it("formats dates, bytes, percentages, and tooltip labels for each supported locale", () => {
    const entry = {
      path: ".vault/reference/API.md",
      doc_type: "reference",
      feature_tags: [],
      dates: { created: "2026-01-05", modified: "2026-01-06" },
      size: { bytes: 4096, words: 1250 },
    };
    const cases = [
      ["en", createTestLocalizationRuntime(), /Created Jan 5, 2026[\s\S]*1,250 words/],
      [
        ltrTestLocale,
        createTestLocalizationRuntime(ltrTestLocale),
        /Créé le 5 janv\. 2026[\s\S]*1[\s\u202f]250 mots/,
      ],
      [
        rtlTestLocale,
        createTestLocalizationRuntime(rtlTestLocale),
        /تم الإنشاء[\s\S]*كلمة/,
      ],
    ] as const;
    for (const [locale, runtime, expected] of cases) {
      const tooltip = docTooltipLabel(
        entry,
        (message) => resolveMessageResult(runtime, message),
        locale,
      );
      expect(formatTreeDate(locale, "2026-01-05", "full")).not.toBe("");
      expect(tooltip).toMatch(expected);
      expect(tooltip).toMatch(/4|٤/);
      expect(tooltip).not.toMatch(/documents:tree|Authored|Edited/);
    }
  });

  it("preserves authored casing and non-Latin titles without rewriting fallback stems", () => {
    expect(docDisplayTitle(".vault/plan/API-v2-plan.md", "API v2 Plan")).toBe(
      "API v2 Plan",
    );
    expect(docDisplayTitle(".vault/research/x.md", "مرحبا بالعالم")).toBe(
      "مرحبا بالعالم",
    );
    expect(docDisplayTitle(".vault/plan/API-v2-plan.md")).toBe("API-v2-plan");
    expect(docDisplayTitle(".vault/plan/fallback.md", "   ")).toBe("fallback");
  });
});
