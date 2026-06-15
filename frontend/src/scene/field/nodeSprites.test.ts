import { describe, expect, it } from "vitest";

import {
  FRESHNESS_FLOOR,
  FRESHNESS_WINDOW_MS,
  NEAR_ZOOM_THRESHOLD,
  coarseStamp,
  fineStampMarkId,
  freshnessAlpha,
  lodFor,
  nodeRadius,
  progressFraction,
  stateColor,
  tierBadgeText,
} from "./nodeSprites";
import { stampFor } from "./statusStamp";

describe("lodFor", () => {
  it("draws silhouette-only below the near threshold", () => {
    expect(lodFor(NEAR_ZOOM_THRESHOLD - 0.1, false)).toBe("far");
    expect(lodFor(NEAR_ZOOM_THRESHOLD, false)).toBe("near");
  });

  it("keeps full anatomy for focused nodes at any zoom (§3.1)", () => {
    expect(lodFor(0.1, true)).toBe("near");
  });
});

describe("stateColor", () => {
  it("maps lifecycle states to distinct hues and defaults otherwise", () => {
    const active = stateColor({ state: "active" });
    const complete = stateColor({ state: "complete" });
    const fallback = stateColor({ state: "unmapped" });
    expect(active).not.toBe(complete);
    expect(fallback).toBe(stateColor(undefined));
  });
});

describe("freshnessAlpha", () => {
  const now = Date.parse("2026-06-12T00:00:00Z");

  it("runs hot at modification time and cools to the floor", () => {
    expect(freshnessAlpha("2026-06-12T00:00:00Z", now)).toBeCloseTo(1);
    const old = new Date(now - FRESHNESS_WINDOW_MS * 2).toISOString();
    expect(freshnessAlpha(old, now)).toBe(FRESHNESS_FLOOR);
  });

  it("treats missing or invalid dates as cooled, never as errors", () => {
    expect(freshnessAlpha(undefined, now)).toBe(FRESHNESS_FLOOR);
    expect(freshnessAlpha("not-a-date", now)).toBe(FRESHNESS_FLOOR);
  });
});

describe("progressFraction", () => {
  it("returns the clamped done/total ring fraction", () => {
    expect(
      progressFraction({ state: "active", progress: { done: 7, total: 12 } }),
    ).toBeCloseTo(7 / 12);
    expect(progressFraction({ state: "active", progress: { done: 5, total: 4 } })).toBe(
      1,
    );
  });

  it("is ringless without progress data", () => {
    expect(progressFraction({ state: "active" })).toBeNull();
    expect(progressFraction(undefined)).toBeNull();
    expect(
      progressFraction({ state: "active", progress: { done: 0, total: 0 } }),
    ).toBeNull();
  });
});

describe("nodeRadius", () => {
  it("keeps the base radius for non-feature nodes (shape carries type)", () => {
    const base = nodeRadius({ id: "doc:x", kind: "adr" });
    expect(nodeRadius({ id: "doc:y", kind: "plan", memberCount: 99 })).toBe(base);
  });

  it("grows feature nodes with their convergence weight (centers of gravity)", () => {
    const small = nodeRadius({ id: "feature:a", kind: "feature", memberCount: 5 });
    const large = nodeRadius({ id: "feature:b", kind: "feature", memberCount: 80 });
    const base = nodeRadius({ id: "doc:x", kind: "adr" });
    expect(small).toBeGreaterThan(base);
    expect(large).toBeGreaterThan(small);
  });

  it("falls back to the base radius for a feature with no member_count", () => {
    const base = nodeRadius({ id: "doc:x", kind: "adr" });
    expect(nodeRadius({ id: "feature:a", kind: "feature" })).toBe(base);
    expect(nodeRadius({ id: "feature:b", kind: "feature", memberCount: 0 })).toBe(base);
  });
});

describe("tierBadgeText", () => {
  it("renders per-tier degree marks for populated tiers only", () => {
    expect(
      tierBadgeText({ declared: 3, structural: 5, temporal: 2, semantic: 14 }),
    ).toBe("◆3 ▣5 ◷2 ≈14");
    expect(tierBadgeText({ declared: 3, semantic: 0 })).toBe("◆3");
    expect(tierBadgeText(undefined)).toBe("");
  });
});

// The status-stamp render split (node-visual-richness P03): the COARSE treatment
// (ring / slash / ghost) shows at far LOD; the FINE treatment (exact severity
// dot, tier notch) unfolds only at near LOD. These pure selectors are what the
// render layer maps onto Pixi, so the class→treatment mapping is asserted here
// GPU-free — exactly the field discipline (nodeRadius/stateColor are tested the
// same way).
describe("coarseStamp — the far-LOD status treatment (ring / slash / ghost)", () => {
  it("affirmed → solid ring, no slash, no ghost", () => {
    expect(coarseStamp(stampFor({ class: "affirmed" }))).toEqual({
      ring: "solid",
      slash: false,
      ghost: false,
    });
  });

  it("provisional → dashed ring", () => {
    expect(coarseStamp(stampFor({ class: "provisional" })).ring).toBe("dashed");
  });

  it("negated → slash, no ring (ring:'none' normalizes to undefined)", () => {
    const c = coarseStamp(stampFor({ class: "negated" }));
    expect(c.ring).toBeUndefined();
    expect(c.slash).toBe(true);
    expect(c.ghost).toBe(false);
  });

  it("retired → ghost, no ring, no slash", () => {
    const c = coarseStamp(stampFor({ class: "retired", value: "deprecated" }));
    expect(c.ghost).toBe(true);
    expect(c.ring).toBeUndefined();
    expect(c.slash).toBe(false);
  });

  it("superseded rule → ghost AND slash (the compound coarse treatment)", () => {
    const c = coarseStamp(stampFor({ class: "retired", value: "superseded" }));
    expect(c.ghost).toBe(true);
    expect(c.slash).toBe(true);
  });

  it("graded / tiered carry NO coarse mark (their treatment is the fine stamp)", () => {
    expect(coarseStamp(stampFor({ class: "graded", ordinal: 3 }))).toEqual({
      ring: undefined,
      slash: false,
      ghost: false,
    });
    expect(coarseStamp(stampFor({ class: "tiered", ordinal: 2 }))).toEqual({
      ring: undefined,
      slash: false,
      ghost: false,
    });
  });
});

describe("fineStampMarkId — the near-LOD magnitude mark (dot / notch)", () => {
  it("graded → the severity-dot mark at the exact ordinal", () => {
    expect(fineStampMarkId(stampFor({ class: "graded", ordinal: 1 }))).toBe(
      "status-severity-1",
    );
    expect(fineStampMarkId(stampFor({ class: "graded", ordinal: 4 }))).toBe(
      "status-severity-4",
    );
  });

  it("tiered → the tier-notch mark at the exact ordinal", () => {
    expect(fineStampMarkId(stampFor({ class: "tiered", ordinal: 2 }))).toBe(
      "status-tier-2",
    );
    expect(fineStampMarkId(stampFor({ class: "tiered", ordinal: 4 }))).toBe(
      "status-tier-4",
    );
  });

  it("ring / slash / ghost classes carry NO fine mark (the rule of one)", () => {
    expect(fineStampMarkId(stampFor({ class: "affirmed" }))).toBeNull();
    expect(fineStampMarkId(stampFor({ class: "negated" }))).toBeNull();
    expect(
      fineStampMarkId(stampFor({ class: "retired", value: "archived" })),
    ).toBeNull();
  });

  it("a graded node with no magnitude (severityDot 0) carries no fine mark", () => {
    expect(fineStampMarkId(stampFor({ class: "graded" }))).toBeNull();
  });
});
