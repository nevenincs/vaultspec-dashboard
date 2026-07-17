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
      "common:kit.activity.rowsLoaded",
      "common:freshness.hours",
      "common:freshness.days",
      "common:freshness.weeks",
      "common:changes.filesChanged",
      "common:commandPalette.selectionAnnouncement",
      "common:searchPalette.counts.results",
      "common:agent.composer.commentBatch",
      "common:palette.commandCount",
      "common:finalWave.pipeline.statusCount",
      "common:finalWave.work.progress",
      "documents:localizationWave.plan.completion",
      "documents:localizationWave.plan.phaseCount",
      "documents:localizationWave.plan.stepCount",
      "documents:localizationWave.plan.waveCount",
      "documents:documentSearch.counts.documents",
      "documents:reviewStation.counts.acknowledgements",
      "documents:reviewStation.counts.changes",
      "documents:viewer.codeViewer.footer.summary",
      "documents:viewer.reader.metadata.readTime",
      "documents:viewer.reader.metadata.readTimeStatus",
      "documents:viewer.reader.metadata.createdReadTime",
      "documents:viewer.reader.metadata.createdReadTimeStatus",
      "documents:viewer.reader.metadata.updatedReadTime",
      "documents:viewer.reader.metadata.updatedReadTimeStatus",
      "documents:viewer.reader.metadata.createdUpdatedReadTime",
      "documents:viewer.reader.metadata.createdUpdatedReadTimeStatus",
      "documents:viewer.reader.truncation.bytes",
      "documents:viewer.comments.counts.commentsToReview",
      "documents:viewer.comments.counts.days",
      "documents:viewer.comments.counts.hours",
      "documents:viewer.comments.counts.minutes",
      "documents:viewer.comments.counts.months",
      "documents:viewer.comments.counts.years",
      "documents:tree.partialCount",
      "documents:tree.sizeSummary",
      "documents:tree.wordCount",
      "graph:accessibility.workingSetCount",
      "graph:islands.progress.stepsComplete",
      "graph:hover.evidence.codeLocations",
      "graph:hover.evidence.commits",
      "graph:hover.evidence.documents",
      "graph:lab.actions.loadGenerated",
      "operations:searchMaintenance.jobs.count",
      "operations:searchMaintenance.jobs.partial",
      "operations:searchMaintenance.projects.live",
      "operations:searchMaintenance.projects.summary",
      "operations:searchMaintenance.projects.partial",
      "projects:workspaceIdentity.counts.ahead",
      "projects:workspaceIdentity.counts.behind",
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
          } else if (
            key === "operations:searchMaintenance.jobs.partial" ||
            key === "operations:searchMaintenance.projects.partial"
          ) {
            additionalValues = { shown: 1 };
          } else if (key === "operations:searchMaintenance.projects.summary") {
            additionalValues = { live: 1 };
          } else if (key === "documents:tree.sizeSummary") {
            additionalValues = { size: "4 KB" };
          } else if (key === "documents:viewer.reader.truncation.bytes") {
            additionalValues = { returned: 1 };
          } else if (key === "documents:viewer.codeViewer.footer.summary") {
            additionalValues = { language: "Rust", encoding: "UTF-8" };
          } else if (
            key === "graph:islands.progress.stepsComplete" ||
            key === "common:finalWave.work.progress" ||
            key === "documents:localizationWave.plan.completion"
          ) {
            additionalValues = { done: 1 };
          } else if (key.startsWith("documents:viewer.reader.metadata.")) {
            const normalizedKey = key.toLocaleLowerCase("en");
            additionalValues = {
              ...(normalizedKey.includes("created") ? { created: "15 July 2026" } : {}),
              ...(normalizedKey.includes("updated") ? { updated: "16 July 2026" } : {}),
              ...(key.endsWith("Status") ? { status: "Accepted" } : {}),
            };
          }
          const descriptor = createCountMessageDescriptor(key, count, additionalValues);
          expect(descriptor).not.toBeNull();

          const resolution = resolveMessageResult(runtime, descriptor);
          const formatted = formatNumber(locale, count);
          const expected = physicalTemplate(locale, key, category)
            .replace(/\{\{\s*count\s*,\s*number\s*\}\}/gu, formatted!)
            .replace(/\{\{\s*command\s*\}\}/gu, "Open settings")
            .replace(/\{\{\s*size\s*\}\}/gu, "4 KB")
            .replace(/\{\{\s*returned\s*,\s*number\s*\}\}/gu, formatNumber(locale, 1)!)
            .replace(/\{\{\s*shown\s*,\s*number\s*\}\}/gu, formatNumber(locale, 1)!)
            .replace(/\{\{\s*live\s*,\s*number\s*\}\}/gu, formatNumber(locale, 1)!)
            .replace(/\{\{\s*done\s*,\s*number\s*\}\}/gu, formatNumber(locale, 1)!)
            .replace(/\{\{\s*total\s*,\s*number\s*\}\}/gu, formatted!)
            .replace(/\{\{\s*created\s*\}\}/gu, "15 July 2026")
            .replace(/\{\{\s*updated\s*\}\}/gu, "16 July 2026")
            .replace(/\{\{\s*status\s*\}\}/gu, "Accepted")
            .replace(/\{\{\s*language\s*\}\}/gu, "Rust")
            .replace(/\{\{\s*encoding\s*\}\}/gu, "UTF-8");
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
