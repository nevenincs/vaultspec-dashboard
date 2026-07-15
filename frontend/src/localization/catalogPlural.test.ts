import { describe, expect, it } from "vitest";

import { resolveMessageResult } from "../platform/localization/fallback";
import { formatNumber } from "../platform/localization/formatters";
import {
  createCountMessageDescriptor,
  PLURAL_CATEGORIES,
  PLURAL_MESSAGE_KEYS,
  type AdditionalCountMessageValues,
  type PluralCategory,
  type PluralMessageKey,
} from "../platform/localization/message";
import {
  createTestLocalizationRuntime,
  testResources,
  type TestLocale,
} from "./testing";

const INTEGER_CATEGORY_CANDIDATES = Object.freeze([
  ...Array.from({ length: 201 }, (_, count) => count),
  1_000,
  10_000,
  100_000,
  1_000_000,
  2_000_000,
]);

function pluralCategories(locale: TestLocale): readonly PluralCategory[] {
  return new Intl.PluralRules(locale).resolvedOptions()
    .pluralCategories as PluralCategory[];
}

function countForCategory(locale: TestLocale, category: PluralCategory): number {
  const rules = new Intl.PluralRules(locale);
  const count = INTEGER_CATEGORY_CANDIDATES.find(
    (candidate) => rules.select(candidate) === category,
  );
  expect(count, `${locale} needs an integer sample for ${category}`).toEqual(
    expect.any(Number),
  );
  return count!;
}

function physicalTemplate(
  locale: TestLocale,
  key: PluralMessageKey,
  category: PluralCategory,
): string {
  const namespaceEnd = key.indexOf(":");
  const namespace = key.slice(0, namespaceEnd);
  const path = `${key.slice(namespaceEnd + 1)}_${category}`;
  const resource = testResources[locale] as Readonly<Record<string, unknown>>;
  let value: unknown = resource[namespace];
  for (const segment of path.split(".")) {
    value =
      value !== null && typeof value === "object"
        ? (value as Readonly<Record<string, unknown>>)[segment]
        : undefined;
  }
  expect(value, `${locale}:${path} must be a physical plural leaf`).toEqual(
    expect.any(String),
  );
  return value as string;
}

function physicalCategories(
  locale: TestLocale,
  key: PluralMessageKey,
): readonly string[] {
  const namespaceEnd = key.indexOf(":");
  const namespace = key.slice(0, namespaceEnd);
  const path = key.slice(namespaceEnd + 1).split(".");
  const base = path.pop()!;
  let value: unknown = (testResources[locale] as Readonly<Record<string, unknown>>)[
    namespace
  ];
  for (const segment of path) {
    value =
      value !== null && typeof value === "object"
        ? (value as Readonly<Record<string, unknown>>)[segment]
        : undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((leaf) => leaf.startsWith(`${base}_`))
    .map((leaf) => leaf.slice(base.length + 1));
}

describe("plural catalog manifest", () => {
  it("provides every locale's complete cardinal category family", () => {
    expect(PLURAL_MESSAGE_KEYS).toEqual([
      "common:commandPalette.selectionAnnouncement",
      "common:palette.commandCount",
      "documents:tree.partialCount",
      "documents:tree.sizeSummary",
      "documents:tree.wordCount",
      "graph:accessibility.workingSetCount",
      "projects:provisioning.result.itemCount",
    ]);

    for (const locale of Object.keys(testResources) as TestLocale[]) {
      const required = pluralCategories(locale);
      for (const key of PLURAL_MESSAGE_KEYS) {
        expect([...physicalCategories(locale, key)].sort(), `${locale}:${key}`).toEqual(
          [...required].sort(),
        );
        for (const category of required) {
          physicalTemplate(locale, key, category);
        }
      }
    }
  });

  it("selects every English, French, and Arabic category and formats its count", () => {
    for (const locale of Object.keys(testResources) as TestLocale[]) {
      const runtime = createTestLocalizationRuntime(locale);
      for (const key of PLURAL_MESSAGE_KEYS) {
        for (const category of pluralCategories(locale)) {
          const count = countForCategory(locale, category);
          let additionalValues: AdditionalCountMessageValues | undefined;
          if (key === "common:commandPalette.selectionAnnouncement") {
            additionalValues = { command: "Open settings" };
          } else if (key === "documents:tree.sizeSummary") {
            additionalValues = { size: "4 KB" };
          }
          const descriptor = createCountMessageDescriptor(key, count, additionalValues);
          expect(descriptor).not.toBeNull();

          const resolution = resolveMessageResult(runtime, descriptor);
          const formatted = formatNumber(locale, count);
          const expected = physicalTemplate(locale, key, category)
            .replace(/\{\{\s*count\s*,\s*number\s*\}\}/gu, formatted!)
            .replace(/\{\{\s*command\s*\}\}/gu, "Open settings")
            .replace(/\{\{\s*size\s*\}\}/gu, "4 KB");
          expect(formatted).not.toBeNull();
          expect(resolution, `${locale}:${key}:${category}`).toEqual({
            message: expected,
            usedFallback: false,
          });
        }
      }
    }
  });

  it("keeps the category vocabulary closed to CLDR cardinal suffixes", () => {
    expect(new Set(PLURAL_CATEGORIES)).toEqual(
      new Set(["zero", "one", "two", "few", "many", "other"]),
    );
  });
});
