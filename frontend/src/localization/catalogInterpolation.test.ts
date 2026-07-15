import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "./testing";
import { resources, sourceLocale } from "../locales/en";
import { resolveMessage } from "../platform/localization/fallback";
import {
  createCountMessageDescriptor,
  createMessageDescriptor,
  MESSAGE_VALUE_COUNT_MAX,
  MESSAGE_VALUE_NAME_MAX_CHARS,
  ORDINARY_MESSAGE_KEYS,
  PHYSICAL_MESSAGE_KEYS,
  type PhysicalMessageKey,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  supportedLocales,
} from "../platform/localization/runtime";

const INTERPOLATION_TOKEN = /\{\{\s*([a-z][a-zA-Z0-9]*)(?:\s*,\s*number)?\s*\}\}/gu;
const INTERPOLATION_DELIMITER = /\{\{|\}\}/u;
const NESTED_MESSAGE = /\$t\(/u;

interface CatalogTemplate {
  readonly template: string;
  readonly tokenNames: readonly string[];
}

function interpolationTokenNames(
  identity: string,
  template: string,
): readonly string[] {
  expect(template, `${identity} must not use nested catalog messages`).not.toMatch(
    NESTED_MESSAGE,
  );

  const matches = [...template.matchAll(INTERPOLATION_TOKEN)];
  const unmatched = template.replace(INTERPOLATION_TOKEN, "");
  expect(
    unmatched,
    `${identity} has an incomplete or malformed interpolation token`,
  ).not.toMatch(INTERPOLATION_DELIMITER);

  const tokenNames = [...new Set(matches.map((match) => match[1]!))];
  expect(
    tokenNames.length,
    `${identity} exceeds the distinct descriptor value bound`,
  ).toBeLessThanOrEqual(MESSAGE_VALUE_COUNT_MAX);

  for (const tokenName of tokenNames) {
    expect(
      tokenName.length,
      `${identity} has an overlong interpolation name`,
    ).toBeLessThanOrEqual(MESSAGE_VALUE_NAME_MAX_CHARS);
  }

  return tokenNames;
}

function catalogTemplate(locale: string, key: PhysicalMessageKey): CatalogTemplate {
  const namespaceEnd = key.indexOf(":");
  const namespace = key.slice(0, namespaceEnd);
  const path = key.slice(namespaceEnd + 1);
  const resource = resources[locale as keyof typeof resources];
  const namespaceResource = resource?.[namespace as keyof typeof resource];

  let value: unknown = namespaceResource;
  for (const segment of path.split(".")) {
    value =
      value !== null && typeof value === "object"
        ? (value as Readonly<Record<string, unknown>>)[segment]
        : undefined;
  }

  expect(value, `${locale}:${key} must be a string resource`).toEqual(
    expect.any(String),
  );
  const template = value as string;

  return {
    template,
    tokenNames: interpolationTokenNames(`${locale}:${key}`, template),
  };
}

describe("production catalog interpolation", () => {
  it("checks production syntax and preserves shipped-locale token parity", () => {
    expect(supportedLocales.length).toBeGreaterThan(0);
    expect(PHYSICAL_MESSAGE_KEYS.length).toBeGreaterThan(0);

    for (const key of PHYSICAL_MESSAGE_KEYS) {
      const sourceTokens = new Set(catalogTemplate(sourceLocale, key).tokenNames);

      for (const locale of supportedLocales) {
        if (locale === sourceLocale) continue;

        const localeTokens = new Set(catalogTemplate(locale, key).tokenNames);
        expect(
          localeTokens,
          `${locale}:${key} must preserve the source interpolation parameters`,
        ).toEqual(sourceTokens);
      }
    }
  });

  it("resolves production templates without parameters to their source copy", async () => {
    let checkedTemplates = 0;

    for (const locale of supportedLocales) {
      const runtime = createLocalizationRuntime();
      await runtime.changeLanguage(locale);

      for (const key of ORDINARY_MESSAGE_KEYS) {
        const { template, tokenNames } = catalogTemplate(locale, key);
        if (tokenNames.length > 0) continue;

        const descriptor = createMessageDescriptor(key);
        expect(
          descriptor,
          `${locale}:${key} must fit the descriptor contract`,
        ).not.toBeNull();

        const resolved = resolveMessage(runtime, descriptor);
        expect(
          resolved,
          `${locale}:${key} must resolve through the safe boundary`,
        ).toBe(template);
        expect(
          resolved,
          `${locale}:${key} must not expose unresolved interpolation`,
        ).not.toMatch(INTERPOLATION_DELIMITER);
        expect(
          resolved,
          `${locale}:${key} must not expose nested message syntax`,
        ).not.toMatch(NESTED_MESSAGE);
        checkedTemplates += 1;
      }
    }

    expect(checkedTemplates).toBeGreaterThan(0);
  });

  it("keeps tokenless LTR and RTL recovery messages aligned and rejects extra values", () => {
    const key = "errors:unexpectedSection.message";
    const ltrTemplate = ltrTestResources.errors.unexpectedSection.message;
    const rtlTemplate = rtlTestResources.errors.unexpectedSection.message;
    const ltrTokens = interpolationTokenNames(`${ltrTestLocale}:${key}`, ltrTemplate);
    const rtlTokens = interpolationTokenNames(`${rtlTestLocale}:${key}`, rtlTemplate);
    const descriptor = createMessageDescriptor(key);
    const extraValues = createMessageDescriptor(key, { section: "history" });
    const ltrRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const rtlRuntime = createTestLocalizationRuntime(rtlTestLocale);

    expect(ltrTokens).toEqual([]);
    expect(rtlTokens).toEqual(ltrTokens);
    expect(descriptor).not.toBeNull();
    expect(extraValues).not.toBeNull();

    const ltrResolved = resolveMessage(ltrRuntime, descriptor);
    const rtlResolved = resolveMessage(rtlRuntime, descriptor);
    expect(ltrResolved).toBe(ltrTemplate);
    expect(rtlResolved).toBe(rtlTemplate);
    expect(ltrResolved).not.toMatch(INTERPOLATION_DELIMITER);
    expect(rtlResolved).not.toMatch(INTERPOLATION_DELIMITER);

    expect(resolveMessage(ltrRuntime, extraValues)).toBe(
      ltrTestResources.errors.fallback.contentUnavailable,
    );
    expect(resolveMessage(rtlRuntime, extraValues)).toBe(
      rtlTestResources.errors.fallback.contentUnavailable,
    );
  });

  it("preserves the authored document query in every localized no-match message", () => {
    const query = "Authored / مستند";
    const descriptor = createMessageDescriptor(
      "documents:documentSearch.states.noMatches",
      { query },
    );

    expect(descriptor).not.toBeNull();
    expect(resolveMessage(createTestLocalizationRuntime(), descriptor)).toBe(
      `No documents match “${query}”.`,
    );
    expect(
      resolveMessage(createTestLocalizationRuntime(ltrTestLocale), descriptor),
    ).toBe(`Aucun document ne correspond à « ${query} ».`);
    expect(
      resolveMessage(createTestLocalizationRuntime(rtlTestLocale), descriptor),
    ).toBe(`لا يوجد مستند يطابق «${query}».`);
  });

  it("preserves comment count values across English, French, and Arabic", () => {
    const descriptor = createCountMessageDescriptor(
      "documents:viewer.comments.counts.commentsToReview",
      2,
    );
    expect(descriptor).not.toBeNull();

    const messages = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ].map((runtime) => resolveMessage(runtime, descriptor));

    expect(messages).toEqual([
      "2 comments to review",
      "2 commentaires à examiner",
      "2 تعليقان للمراجعة",
    ]);
    expect(messages.every((message) => !INTERPOLATION_DELIMITER.test(message))).toBe(
      true,
    );
  });
});
