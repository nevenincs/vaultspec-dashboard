import { describe, expect, it } from "vitest";

import {
  FRESHNESS_FLOOR,
  FRESHNESS_WINDOW_MS,
  NEAR_ZOOM_THRESHOLD,
  freshnessAlpha,
  lodFor,
  progressFraction,
  stateColor,
  tierBadgeText,
} from "./nodeSprites";

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

describe("tierBadgeText", () => {
  it("renders per-tier degree marks for populated tiers only", () => {
    expect(
      tierBadgeText({ declared: 3, structural: 5, temporal: 2, semantic: 14 }),
    ).toBe("◆3 ▣5 ◷2 ≈14");
    expect(tierBadgeText({ declared: 3, semantic: 0 })).toBe("◆3");
    expect(tierBadgeText(undefined)).toBe("");
  });
});
