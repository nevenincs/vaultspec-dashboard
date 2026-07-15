import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  CODE_TREE_MESSAGES,
  codeTreeRowActionsMessage,
  codeTreeTruncationMessage,
} from "./CodeTree";

describe("CodeTree localization", () => {
  it("resolves genuine English, French, and Arabic messages without fallback", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    const messages = [
      ...Object.values(CODE_TREE_MESSAGES),
      codeTreeRowActionsMessage("APIClient.ts"),
      codeTreeTruncationMessage({
        returned_children: 1_250,
        total_children: 2_500,
        reason: "private ceiling token",
      }),
    ] as const;

    for (const descriptor of messages) {
      const results = runtimes.map((runtime) =>
        resolveMessageResult(runtime, descriptor),
      );
      expect(
        results.every((result) => result.usedFallback === false),
        JSON.stringify({ descriptor, results }),
      ).toBe(true);
      expect(results.every((result) => result.message.length > 0)).toBe(true);
      expect(results.map((result) => result.message).join(" ")).not.toMatch(
        /private ceiling token|documents:|common:|—/,
      );
    }
  });

  it("formats counts by active locale and preserves authored file names", () => {
    const filename = "APIClient-v2.Été.ts";
    const cases = [
      ["en", createTestLocalizationRuntime()],
      [ltrTestLocale, createTestLocalizationRuntime(ltrTestLocale)],
      [rtlTestLocale, createTestLocalizationRuntime(rtlTestLocale)],
    ] as const;
    const countMessages = cases.map(([locale, runtime]) => {
      const result = resolveMessageResult(
        runtime,
        codeTreeTruncationMessage({
          returned_children: 1_250,
          total_children: 2_500,
          reason: "private",
        }),
      );
      expect(result.usedFallback).toBe(false);
      expect(result.message).toContain(new Intl.NumberFormat(locale).format(1_250));
      expect(result.message).toContain(new Intl.NumberFormat(locale).format(2_500));

      const actions = resolveMessageResult(
        runtime,
        codeTreeRowActionsMessage(filename),
      );
      expect(actions.usedFallback).toBe(false);
      expect(actions.message).toContain(filename);
      return result.message;
    });
    expect(new Set(countMessages).size).toBe(3);
  });

  it("uses safe counts and hides invalid truncation metadata", () => {
    const runtime = createTestLocalizationRuntime();
    const valid = resolveMessageResult(
      runtime,
      codeTreeTruncationMessage({
        returned_children: 5,
        total_children: 20,
        reason: "do not expose this reason",
      }),
    );
    expect(valid.message).toBe("Loaded 5 of 20 files and folders.");
    expect(valid.message).not.toContain("do not expose this reason");

    for (const truncated of [
      { returned_children: -1, total_children: 20, reason: "negative" },
      { returned_children: 21, total_children: 20, reason: "reversed" },
      { returned_children: Number.NaN, total_children: 20, reason: "not a number" },
    ]) {
      const result = resolveMessageResult(
        runtime,
        codeTreeTruncationMessage(truncated),
      );
      expect(result.usedFallback).toBe(false);
      expect(result.message).toBe("More files and folders are available here.");
      expect(result.message).not.toMatch(/negative|reversed|not a number/);
    }
  });
});
