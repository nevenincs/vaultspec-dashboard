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
  createMessageDescriptor,
  MESSAGE_KEYS,
  MESSAGE_VALUE_COUNT_MAX,
  MESSAGE_VALUE_NAME_MAX_CHARS,
  type MessageKey,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  supportedLocales,
} from "../platform/localization/runtime";

const INTERPOLATION_TOKEN = /\{\{\s*-?\s*([a-z][a-zA-Z0-9]*)\s*\}\}/gu;
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

function catalogTemplate(locale: string, key: MessageKey): CatalogTemplate {
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
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0);

    for (const key of MESSAGE_KEYS) {
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

      for (const key of MESSAGE_KEYS) {
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

  it("resolves matching LTR and RTL parameters and safely handles missing values", () => {
    const key = "errors:unexpectedSection.message";
    const ltrTemplate = ltrTestResources.errors.unexpectedSection.message;
    const rtlTemplate = rtlTestResources.errors.unexpectedSection.message;
    const ltrTokens = interpolationTokenNames(`${ltrTestLocale}:${key}`, ltrTemplate);
    const rtlTokens = interpolationTokenNames(`${rtlTestLocale}:${key}`, rtlTemplate);
    const complete = createMessageDescriptor(key, { section: "history" });
    const ltrRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const rtlRuntime = createTestLocalizationRuntime(rtlTestLocale);

    expect(ltrTokens).toEqual(["section"]);
    expect(rtlTokens).toEqual(ltrTokens);
    expect(complete).not.toBeNull();

    const ltrResolved = resolveMessage(ltrRuntime, complete);
    const rtlResolved = resolveMessage(rtlRuntime, complete);
    expect(ltrResolved).toBe("Réessayez history.");
    expect(rtlResolved).toBe("حاول فتح history مرة أخرى.");
    expect(ltrResolved).not.toMatch(INTERPOLATION_DELIMITER);
    expect(rtlResolved).not.toMatch(INTERPOLATION_DELIMITER);

    expect(resolveMessage(ltrRuntime, { key })).toBe(
      ltrTestResources.errors.fallback.contentUnavailable,
    );
    expect(resolveMessage(rtlRuntime, { key })).toBe(
      rtlTestResources.errors.fallback.contentUnavailable,
    );
  });
});
