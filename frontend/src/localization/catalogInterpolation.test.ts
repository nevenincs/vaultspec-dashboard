import type { TOptions } from "i18next";
import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
} from "./testing";
import { resources } from "../locales/en";
import { resolveMessage } from "../platform/localization/fallback";
import {
  createMessageDescriptor,
  MESSAGE_KEYS,
  MESSAGE_VALUE_COUNT_MAX,
  MESSAGE_VALUE_NAME_MAX_CHARS,
  type MessageKey,
  type MessageValues,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  supportedLocales,
} from "../platform/localization/runtime";

const INTERPOLATION_TOKEN = /\{\{\s*-?\s*([a-z][a-zA-Z0-9]*)\s*\}\}/gu;
const INTERPOLATION_DELIMITER = /\{\{|\}\}/u;
const NESTED_MESSAGE = /\$t\(/u;

interface CatalogTemplate {
  readonly key: MessageKey;
  readonly locale: string;
  readonly template: string;
  readonly tokenNames: readonly string[];
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
  expect(template, `${locale}:${key} must not use nested catalog messages`).not.toMatch(
    NESTED_MESSAGE,
  );

  const matches = [...template.matchAll(INTERPOLATION_TOKEN)];
  const unmatched = template.replace(INTERPOLATION_TOKEN, "");
  expect(
    unmatched,
    `${locale}:${key} has an incomplete or malformed interpolation token`,
  ).not.toMatch(INTERPOLATION_DELIMITER);
  expect(
    matches.length,
    `${locale}:${key} exceeds the descriptor value bound`,
  ).toBeLessThanOrEqual(MESSAGE_VALUE_COUNT_MAX);

  const tokenNames = matches.map((match) => match[1]!);
  for (const tokenName of tokenNames) {
    expect(
      tokenName.length,
      `${locale}:${key} has an overlong interpolation name`,
    ).toBeLessThanOrEqual(MESSAGE_VALUE_NAME_MAX_CHARS);
  }

  return { key, locale, template, tokenNames };
}

function descriptorValues(tokenNames: readonly string[]): MessageValues | undefined {
  const uniqueNames = [...new Set(tokenNames)];
  if (uniqueNames.length === 0) return undefined;

  return Object.freeze(
    Object.fromEntries(
      uniqueNames.map((name) => [name, name === "count" ? 2 : `value-${name}`]),
    ),
  );
}

function translationOptions(values?: MessageValues): TOptions {
  if (values === undefined) return { returnObjects: false };

  return {
    count: typeof values.count === "number" ? values.count : undefined,
    context: typeof values.context === "string" ? values.context : undefined,
    replace: values,
    returnObjects: false,
  };
}

describe("production catalog interpolation", () => {
  it("keeps interpolation parameters compatible across every shipped locale", () => {
    expect(supportedLocales.length).toBeGreaterThan(0);
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0);

    for (const key of MESSAGE_KEYS) {
      const sourceTokens = new Set(catalogTemplate("en", key).tokenNames);

      for (const locale of supportedLocales) {
        const localeTokens = new Set(catalogTemplate(locale, key).tokenNames);
        expect(
          localeTokens,
          `${locale}:${key} must use the source-locale interpolation parameters`,
        ).toEqual(sourceTokens);
      }
    }
  });

  it("resolves every shipped template through bounded production descriptors", async () => {
    for (const locale of supportedLocales) {
      const runtime = createLocalizationRuntime();
      await runtime.changeLanguage(locale);

      for (const key of MESSAGE_KEYS) {
        const { template, tokenNames } = catalogTemplate(locale, key);
        const values = descriptorValues(tokenNames);
        const descriptor = createMessageDescriptor(key, values);

        expect(
          descriptor,
          `${locale}:${key} must fit the descriptor contract`,
        ).not.toBeNull();
        const resolved = resolveMessage(runtime, descriptor);
        expect(
          resolved,
          `${locale}:${key} must resolve through the safe boundary`,
        ).toBe(runtime.t(key, translationOptions(values)));
        expect(
          resolved,
          `${locale}:${key} must not expose unresolved interpolation`,
        ).not.toMatch(INTERPOLATION_DELIMITER);
        expect(
          resolved,
          `${locale}:${key} must not expose nested message syntax`,
        ).not.toMatch(NESTED_MESSAGE);
        expect(template.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses safe localized fallback copy when a real interpolation value is absent", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    const key = "errors:unexpectedSection.message";
    const complete = createMessageDescriptor(key, { section: "history" });

    expect(resolveMessage(runtime, complete)).toBe("Réessayez history.");
    expect(resolveMessage(runtime, { key })).toBe(
      ltrTestResources.errors.fallback.contentUnavailable,
    );
  });
});
