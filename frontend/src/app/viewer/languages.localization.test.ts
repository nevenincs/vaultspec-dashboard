import { describe, expect, it } from "vitest";
import { bundledLanguagesInfo } from "shiki/langs";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  BUNDLED_LANGUAGE_ALIAS_IDS,
  CANONICAL_LANGUAGE_IDS,
  LANGUAGE_DISPLAY_MESSAGES,
  type CanonicalLanguageId,
  languageDisplayDescriptor,
  resolveGrammar,
} from "./languages";

describe("localized language display", () => {
  it("classifies every bundled grammar and maps every canonical id", () => {
    expect(CANONICAL_LANGUAGE_IDS).toEqual(bundledLanguagesInfo.map((info) => info.id));
    expect(BUNDLED_LANGUAGE_ALIAS_IDS).toEqual(
      bundledLanguagesInfo.flatMap((info) => info.aliases ?? []),
    );
    expect(Object.keys(LANGUAGE_DISPLAY_MESSAGES.names)).toEqual(
      CANONICAL_LANGUAGE_IDS,
    );
  });

  it("normalizes every alias before choosing its static descriptor", () => {
    for (const info of bundledLanguagesInfo) {
      const canonicalId = info.id as CanonicalLanguageId;
      expect(languageDisplayDescriptor(canonicalId, "text")).toEqual(
        LANGUAGE_DISPLAY_MESSAGES.names[canonicalId],
      );
      for (const alias of info.aliases ?? []) {
        expect(resolveGrammar(alias)?.id).toBe(info.id);
        expect(languageDisplayDescriptor(alias, "text")).toEqual(
          LANGUAGE_DISPLAY_MESSAGES.names[canonicalId],
        );
      }
    }
  });

  it("resolves established language names in English, French, and Arabic", async () => {
    const runtime = createTestLocalizationRuntime();
    const shell = languageDisplayDescriptor("sh", "text");
    expect(resolveMessageResult(runtime, shell)).toMatchObject({
      message: "Shell",
      usedFallback: false,
    });

    await runtime.changeLanguage(ltrTestLocale);
    expect(resolveMessageResult(runtime, shell)).toMatchObject({
      message: "Interpréteur de commandes",
      usedFallback: false,
    });

    await runtime.changeLanguage(rtlTestLocale);
    expect(resolveMessageResult(runtime, shell)).toMatchObject({
      message: "واجهة الأوامر",
      usedFallback: false,
    });
  });

  it("uses localized generic labels for absent and hostile hints", async () => {
    const runtime = createTestLocalizationRuntime();
    const hostile = "private_tokenizer_state";
    const code = languageDisplayDescriptor(hostile, "code");
    const plainText = languageDisplayDescriptor(null, "text");
    expect(code).toEqual(LANGUAGE_DISPLAY_MESSAGES.code);
    expect(plainText).toEqual(LANGUAGE_DISPLAY_MESSAGES.text);
    expect(JSON.stringify({ code, plainText })).not.toContain(hostile);
    expect(resolveMessageResult(runtime, code).message).toBe("Code");
    expect(resolveMessageResult(runtime, plainText).message).toBe("Text");

    await runtime.changeLanguage(ltrTestLocale);
    expect(resolveMessageResult(runtime, code).message).toBe("Code");
    expect(resolveMessageResult(runtime, plainText).message).toBe("Texte");

    await runtime.changeLanguage(rtlTestLocale);
    expect(resolveMessageResult(runtime, code).message).toBe("تعليمات برمجية");
    expect(resolveMessageResult(runtime, plainText).message).toBe("نص");
  });
});
