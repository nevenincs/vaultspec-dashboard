// Feature-row presentation: served token → mark, date span, composition line.
//
// Copy resolves through the REAL localization runtime (no stubbed resolver), so
// these assertions are on the strings a user actually reads. Nothing here feeds
// the module a derived value: every input is the shape the roster wire carries.

import { describe, expect, it } from "vitest";

import {
  FEATURE_PLAN_STATUS_MESSAGES,
  featureCompositionLabel,
  featureDateSpanAccessibleLabel,
  featureDateSpanLabel,
  featureMetaLine,
  featurePlanStatus,
  featureTooltipLabel,
} from "./featureRowPresentation";
import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";

const LOCALE = "en";
const runtime = createTestLocalizationRuntime();
const resolve = (descriptor: unknown) => resolveMessageResult(runtime, descriptor);

describe("featurePlanStatus (served rollup → the sanctioned plan mark)", () => {
  it("maps the engine's three plan-completion tokens", () => {
    expect(featurePlanStatus("finished")).toBe("complete");
    expect(featurePlanStatus("in-progress")).toBe("in-progress");
    expect(featurePlanStatus("not-started")).toBe("not-started");
  });

  it("is null for an absent or unknown token, so the row keeps its glyph", () => {
    // Absent is "this feature has no readable plan", NOT "not started" — drawing
    // an empty ring here would state a status the engine refused to state.
    expect(featurePlanStatus(undefined)).toBeNull();
    expect(featurePlanStatus("planned")).toBeNull();
    expect(featurePlanStatus("")).toBeNull();
  });

  it("names every status in plain language", () => {
    expect(resolve(FEATURE_PLAN_STATUS_MESSAGES.complete).message).toBe(
      "Plans finished",
    );
    expect(resolve(FEATURE_PLAN_STATUS_MESSAGES["in-progress"]).message).toBe(
      "Plans in progress",
    );
    expect(resolve(FEATURE_PLAN_STATUS_MESSAGES["not-started"]).message).toBe(
      "Plans not started",
    );
  });
});

describe("featureCompositionLabel (served per-type counts)", () => {
  it("renders present types in canonical pipeline order, plural-correct", () => {
    expect(
      featureCompositionLabel(
        LOCALE,
        { plan: 2, research: 1, adr: 3, audit: 1 },
        resolve,
      ),
    ).toBe("1 research note, 3 decisions, 2 plans, 1 audit");
  });

  it("omits types the wire did not carry and any zero it did", () => {
    expect(featureCompositionLabel(LOCALE, { research: 1, plan: 0 }, resolve)).toBe(
      "1 research note",
    );
  });

  it("is empty when the engine served no composition at all", () => {
    // An older engine carries no map. Absent is unknown — never "holds nothing".
    expect(featureCompositionLabel(LOCALE, undefined, resolve)).toBe("");
    expect(featureCompositionLabel(LOCALE, {}, resolve)).toBe("");
  });
});

describe("featureDateSpanLabel (the binding-decision span, ADR D2)", () => {
  it("shows ONE date when the ends coincide", () => {
    expect(
      featureDateSpanLabel(
        LOCALE,
        { first: "2026-08-01", last: "2026-08-01" },
        resolve,
      ),
    ).toBe("Aug 1");
  });

  it("shows a range when they differ", () => {
    expect(
      featureDateSpanLabel(
        LOCALE,
        { first: "2026-06-14", last: "2026-08-01" },
        resolve,
      ),
    ).toBe("Jun 14 – Aug 1");
  });

  it("prints the years when the span crosses one", () => {
    // "Dec 20 – Jan 5" would hide WHICH December and which January.
    expect(
      featureDateSpanLabel(
        LOCALE,
        { first: "2025-12-20", last: "2026-01-05" },
        resolve,
      ),
    ).toBe("Dec 20, 2025 – Jan 5, 2026");
  });

  it("is empty for an absent or unparseable span", () => {
    expect(featureDateSpanLabel(LOCALE, undefined, resolve)).toBe("");
    expect(
      featureDateSpanLabel(LOCALE, { first: "soon", last: "later" }, resolve),
    ).toBe("");
  });

  it("spells the meaning out for assistive tech", () => {
    expect(
      featureDateSpanAccessibleLabel(
        LOCALE,
        { first: "2026-06-14", last: "2026-08-01" },
        resolve,
      ),
    ).toBe("Decisions from Jun 14, 2026 to Aug 1, 2026");
    expect(
      featureDateSpanAccessibleLabel(
        LOCALE,
        { first: "2026-08-01", last: "2026-08-01" },
        resolve,
      ),
    ).toBe("Decisions dated Aug 1, 2026");
  });
});

describe("featureMetaLine (the suggestion second line)", () => {
  it("joins composition and decision span", () => {
    expect(
      featureMetaLine(
        LOCALE,
        {
          feature: "a",
          doc_count: 4,
          types_present: 2,
          type_counts: { research: 1, adr: 2 },
          adr_dates: { first: "2026-06-14", last: "2026-08-01" },
        },
        resolve,
      ),
    ).toBe("1 research note, 2 decisions, Jun 14 – Aug 1");
  });

  it("renders whichever half the wire carried", () => {
    expect(
      featureMetaLine(
        LOCALE,
        {
          feature: "a",
          doc_count: 1,
          types_present: 1,
          type_counts: { plan: 1 },
        },
        resolve,
      ),
    ).toBe("1 plan");
  });

  it("is empty for a feature the roster does not describe", () => {
    // The row then shows its name alone — never a zero standing in for unknown.
    expect(featureMetaLine(LOCALE, undefined, resolve)).toBe("");
    expect(
      featureMetaLine(
        LOCALE,
        { feature: "a", doc_count: 3, types_present: 2 },
        resolve,
      ),
    ).toBe("");
  });
});

describe("featureTooltipLabel (the rail row's full metadata)", () => {
  it("stacks the name, the status word, the spelled-out span, and the composition", () => {
    expect(
      featureTooltipLabel(
        LOCALE,
        "Gamma Migration",
        {
          feature: "gamma-migration",
          doc_count: 3,
          types_present: 2,
          type_counts: { adr: 2, plan: 1 },
          plan_state: "finished",
          adr_dates: { first: "2026-06-14", last: "2026-07-30" },
        },
        resolve,
      ),
    ).toBe(
      [
        "Gamma Migration",
        "Plans finished",
        "Decisions from Jun 14, 2026 to Jul 30, 2026",
        "2 decisions, 1 plan",
      ].join("\n"),
    );
  });

  it("falls back to the bare name when the roster describes nothing", () => {
    expect(featureTooltipLabel(LOCALE, "Beta Rollout", undefined, resolve)).toBe(
      "Beta Rollout",
    );
  });
});
