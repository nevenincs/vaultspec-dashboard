// @vitest-environment happy-dom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveScope, liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import type { FeatureCoverage, TiersBlock } from "../engine";
import { adaptFeatureCoverage, adaptFeatureRoster } from "../liveAdapters";
import {
  deriveFeatureCoverageView,
  deriveFeatureRosterView,
  normalizeFeatureCoverageRequestIdentity,
  useFeatureCoverage,
  useFeatureCoverageView,
  useFeatureRosterView,
} from "./index";
import { ENGINE_WAIT } from "../../../testing/timing";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

const ALL_TYPES = ["research", "reference", "adr", "plan", "exec", "audit"];
const UP_TIERS: TiersBlock = { structural: { available: true } } as TiersBlock;
const DOWN_TIERS: TiersBlock = {
  structural: { available: false, reason: "core unreachable" },
} as TiersBlock;

describe("adaptFeatureCoverage (tolerant wire parse)", () => {
  it("maps a full served coverage in canonical pipeline order, preserving eligibility", () => {
    const body = {
      coverage: {
        feature: "x",
        types: [
          {
            doc_type: "research",
            present: true,
            count: 2,
            newest_stem: "2026-07-14-x-research",
            eligible: true,
          },
          {
            doc_type: "adr",
            present: false,
            count: 0,
            eligible: false,
            note: "requires-research-or-reference",
          },
        ],
        missing: ["reference", "adr", "plan", "exec", "audit"],
        next_step: "adr",
      },
      tiers: UP_TIERS,
    };
    const { coverage, tiers } = adaptFeatureCoverage(body, "x");
    expect(coverage.feature).toBe("x");
    expect(coverage.types.map((t) => t.doc_type)).toEqual(ALL_TYPES);
    const research = coverage.types.find((t) => t.doc_type === "research")!;
    expect(research).toMatchObject({
      present: true,
      count: 2,
      newest_stem: "2026-07-14-x-research",
      eligible: true,
    });
    const adr = coverage.types.find((t) => t.doc_type === "adr")!;
    // Served eligibility passes through faithfully (never recomputed).
    expect(adr).toMatchObject({
      eligible: false,
      note: "requires-research-or-reference",
    });
    // A type absent from the sparse served array still renders, ineligible.
    const plan = coverage.types.find((t) => t.doc_type === "plan")!;
    expect(plan).toMatchObject({ present: false, eligible: false });
    expect(coverage.missing).toEqual(["reference", "adr", "plan", "exec", "audit"]);
    expect(coverage.next_step).toBe("adr");
    expect(tiers).toEqual(UP_TIERS);
  });

  it("synthesizes an all-missing floor for an absent/malformed coverage", () => {
    const { coverage, tiers } = adaptFeatureCoverage(
      { tiers: DOWN_TIERS },
      "brand-new",
    );
    expect(coverage.feature).toBe("brand-new");
    expect(coverage.types.map((t) => t.doc_type)).toEqual(ALL_TYPES);
    expect(coverage.types.every((t) => !t.present && t.count === 0)).toBe(true);
    expect(coverage.missing).toEqual(ALL_TYPES);
    expect(coverage.next_step).toBe("research");
    expect(tiers).toEqual(DOWN_TIERS);
  });

  it("defaults a wholly-empty body to a safe empty-tiers all-missing shape", () => {
    const { coverage, tiers } = adaptFeatureCoverage(undefined, "x");
    expect(coverage.types).toHaveLength(6);
    expect(tiers).toEqual({});
  });
});

describe("adaptFeatureRoster (tolerant wire parse)", () => {
  it("maps roster entries and drops malformed ones", () => {
    const body = {
      roster: [
        { feature: "a", doc_count: 2, types_present: 2, next_step: "plan" },
        { feature: "b", doc_count: 1, types_present: 1 },
        { doc_count: 9 }, // no feature → dropped
        "garbage",
      ],
      tiers: UP_TIERS,
    };
    const { roster, tiers } = adaptFeatureRoster(body);
    expect(roster).toEqual([
      { feature: "a", doc_count: 2, types_present: 2, next_step: "plan" },
      { feature: "b", doc_count: 1, types_present: 1, next_step: undefined },
    ]);
    expect(tiers).toEqual(UP_TIERS);
  });

  it("defaults an absent roster to an empty list", () => {
    expect(adaptFeatureRoster({}).roster).toEqual([]);
  });
});

describe("feature-coverage request identity", () => {
  it("disables until both scope and a non-blank feature are present", () => {
    expect(normalizeFeatureCoverageRequestIdentity("wt-1", " x ")).toEqual({
      scope: "wt-1",
      feature: "x",
    });
    expect(normalizeFeatureCoverageRequestIdentity("wt-1", "   ")).toEqual({
      scope: "wt-1",
      feature: null,
    });
    expect(normalizeFeatureCoverageRequestIdentity(null, "x").scope).toBeNull();
  });
});

describe("deriveFeatureCoverageView (degradation is read from tiers)", () => {
  const coverage: FeatureCoverage = {
    feature: "x",
    types: ALL_TYPES.map((doc_type) => ({
      doc_type,
      present: false,
      count: 0,
      eligible: doc_type === "research" || doc_type === "reference",
    })),
    missing: ALL_TYPES,
    next_step: "research",
  };

  it("passes served coverage through when the structural tier is up", () => {
    const view = deriveFeatureCoverageView(UP_TIERS, coverage, false);
    expect(view.degraded).toBe(false);
    expect(view.coverage).toBe(coverage);
    expect(view.nextStep).toBe("research");
  });

  it("suppresses coverage when the structural tier is degraded", () => {
    const view = deriveFeatureCoverageView(DOWN_TIERS, coverage, false);
    expect(view.degraded).toBe(true);
    expect(view.coverage).toBeUndefined();
    expect(view.nextStep).toBeUndefined();
  });

  it("is not degraded on a wholly-absent tiers block (a transport fault, not down)", () => {
    const view = deriveFeatureCoverageView(undefined, coverage, false);
    expect(view.degraded).toBe(false);
    expect(view.coverage).toBe(coverage);
  });
});

describe("deriveFeatureRosterView", () => {
  it("empties a degraded roster and passes an up one through", () => {
    const roster = [{ feature: "a", doc_count: 1, types_present: 1 }];
    expect(deriveFeatureRosterView(UP_TIERS, roster, false).roster).toEqual(roster);
    expect(deriveFeatureRosterView(DOWN_TIERS, roster, false).roster).toEqual([]);
  });
});

describe("useFeatureCoverage against the live engine", () => {
  it("is disabled with no held data until scope and feature resolve", () => {
    const { result } = renderHook(() => useFeatureCoverage(null, "x"), {
      wrapper: wrapper(testQueryClient()),
    });
    expect(result.current.data).toBeUndefined();
  });

  it("serves an unknown feature as all-missing coverage, never a 404", async () => {
    const scope = await liveScope();
    const { result } = renderHook(
      // A feature the fixture vault does not contain: the engine serves the
      // "start a new feature" all-missing coverage rather than 404-ing.
      () => useFeatureCoverageView(scope, "definitely-not-a-real-feature-xyz"),
      { wrapper: wrapper(testQueryClient()) },
    );
    await waitFor(() => expect(result.current.coverage).toBeDefined(), ENGINE_WAIT);
    const view = result.current;
    expect(view.degraded).toBe(false);
    expect(view.coverage!.types.map((t) => t.doc_type)).toEqual(ALL_TYPES);
    expect(view.coverage!.types.every((t) => !t.present)).toBe(true);
    // Eligibility is served: the always-open entry points are eligible; adr/plan
    // are gated on absent upstream.
    const eligible = (dt: string) =>
      view.coverage!.types.find((t) => t.doc_type === dt)!.eligible;
    expect(eligible("research")).toBe(true);
    expect(eligible("reference")).toBe(true);
    expect(eligible("adr")).toBe(false);
    expect(eligible("plan")).toBe(false);
    expect(view.coverage!.next_step).toBe("research");
  });
});

describe("useFeatureRosterView against the live engine", () => {
  it("resolves the roster array for a healthy scope", async () => {
    const scope = await liveScope();
    const { result } = renderHook(() => useFeatureRosterView(scope), {
      wrapper: wrapper(testQueryClient()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false), ENGINE_WAIT);
    expect(result.current.degraded).toBe(false);
    expect(Array.isArray(result.current.roster)).toBe(true);
  });
});
