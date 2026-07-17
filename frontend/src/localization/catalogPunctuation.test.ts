// Catalog punctuation guard (W06.P18): every shipped and alternate locale
// resource must use the single ellipsis character and never an em dash or a run
// of ASCII periods. The design system prohibits em dashes outright, and the
// catalogs standardize on "…" (U+2026) for elision, so "..." and an ellipsis
// glued to a period are both defects. The check runs the same punctuation
// predicate over the real production corpus and over crafted adverse inputs, so
// it cannot pass vacuously.

import { describe, expect, it } from "vitest";

import {
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "./testing";
import { resources, sourceLocale } from "../locales/en";

const EM_DASH = "—";
const ELLIPSIS = "…";
// Two or more consecutive ASCII periods are the hand-typed ellipsis that must be
// the single "…" character instead. A single period (abbreviations, sentence
// ends) is untouched.
const ASCII_ELLIPSIS = /\.{2,}/u;
// The ellipsis character directly adjacent to a period reads as four dots.
const DEGENERATE_ELLIPSIS = /\.…|…\./u;

type PunctuationIssue = "em-dash" | "ascii-ellipsis" | "degenerate-ellipsis";

/** The punctuation invariant, shared by the corpus sweep and the adverse cases. */
function punctuationIssues(value: string): PunctuationIssue[] {
  const issues: PunctuationIssue[] = [];
  if (value.includes(EM_DASH)) issues.push("em-dash");
  if (ASCII_ELLIPSIS.test(value)) issues.push("ascii-ellipsis");
  if (DEGENERATE_ELLIPSIS.test(value)) issues.push("degenerate-ellipsis");
  return issues;
}

interface CatalogValue {
  readonly identity: string;
  readonly value: string;
}

function collectValues(
  locale: string,
  node: unknown,
  path: readonly string[],
  out: CatalogValue[],
): void {
  if (typeof node === "string") {
    out.push({ identity: `${locale}:${path.join(".")}`, value: node });
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [segment, child] of Object.entries(node)) {
      collectValues(locale, child, [...path, segment], out);
    }
  }
}

const LOCALE_RESOURCES: readonly (readonly [string, unknown])[] = [
  [sourceLocale, resources[sourceLocale]],
  [ltrTestLocale, ltrTestResources],
  [rtlTestLocale, rtlTestResources],
];

function allCatalogValues(): readonly CatalogValue[] {
  const out: CatalogValue[] = [];
  for (const [locale, resource] of LOCALE_RESOURCES) {
    collectValues(locale, resource, [], out);
  }
  return out;
}

describe("catalog punctuation", () => {
  it("collects a non-empty corpus from every shipped and alternate locale", () => {
    const perLocale = LOCALE_RESOURCES.map(([locale, resource]) => {
      const out: CatalogValue[] = [];
      collectValues(locale, resource, [], out);
      return { locale, count: out.length };
    });

    for (const { locale, count } of perLocale) {
      expect(count, `${locale} must contribute catalog values`).toBeGreaterThan(0);
    }
  });

  it("contains no em dash in any locale resource", () => {
    const offenders = allCatalogValues()
      .filter(({ value }) => value.includes(EM_DASH))
      .map(({ identity }) => identity);

    expect(offenders).toEqual([]);
  });

  it("uses the ellipsis character, never consecutive ASCII periods", () => {
    const offenders = allCatalogValues()
      .filter(
        ({ value }) => ASCII_ELLIPSIS.test(value) || DEGENERATE_ELLIPSIS.test(value),
      )
      .map(({ identity }) => identity);

    expect(offenders).toEqual([]);
  });

  it("actually exercises the ellipsis character in the production corpus", () => {
    // Non-vacuity: the source catalog genuinely uses "…", so the ellipsis
    // assertions distinguish the valid character from the prohibited "..." form
    // rather than passing over an ellipsis-free corpus.
    const withEllipsis = allCatalogValues().filter(({ value }) =>
      value.includes(ELLIPSIS),
    );

    expect(withEllipsis.length).toBeGreaterThan(0);
    for (const { value } of withEllipsis) {
      expect(punctuationIssues(value)).toEqual([]);
    }
  });

  it("flags the prohibited punctuation forms and accepts the canonical ones", () => {
    expect(punctuationIssues(`Reload the page${EM_DASH}the app recovered`)).toContain(
      "em-dash",
    );
    expect(punctuationIssues("Loading data...")).toContain("ascii-ellipsis");
    expect(punctuationIssues("Loading..")).toContain("ascii-ellipsis");
    expect(punctuationIssues(`Loading${ELLIPSIS}.`)).toContain("degenerate-ellipsis");

    expect(punctuationIssues(`Loading data${ELLIPSIS}`)).toEqual([]);
    expect(punctuationIssues("Open the file, e.g. a plan.")).toEqual([]);
    expect(punctuationIssues("Version 1.2.3 is available.")).toEqual([]);
  });
});
