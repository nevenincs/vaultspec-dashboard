import { describe, expect, it } from "vitest";

import {
  BODY_RIM_DARKEN,
  FRESHNESS_FLOOR,
  FRESHNESS_WINDOW_MS,
  NEAR_ZOOM_THRESHOLD,
  SELECTED_RING_GAP,
  SELECTED_RING_WIDTH,
  bodyColor,
  bodyRimColor,
  darkenColor,
  freshnessAlpha,
  lodFor,
  nodeRadius,
  progressFraction,
  selectedRingColor,
  selectedRingRadius,
  stateColor,
  tierBadgeText,
} from "./nodeAppearance";
import { categoryColor } from "./categoryColor";

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

describe("bodyColor — the category-coloured node body (graph/Hero 85:2)", () => {
  it("colours a node by its category hue (colour is the type channel)", () => {
    expect(bodyColor({ id: "a", kind: "adr" })).toBe(categoryColor("adr"));
    expect(bodyColor({ id: "f", kind: "feature" })).toBe(categoryColor("feature"));
    // Distinct categories read as distinct body fills.
    expect(bodyColor({ id: "a", kind: "adr" })).not.toBe(
      bodyColor({ id: "p", kind: "plan" }),
    );
  });

  it("desaturates a ghosted (retired/archived) node to the archived neutral", () => {
    // A retired-archived node drops its category hue for the single retired-
    // family status treatment, so the corpus's retirement is never hidden behind
    // a live category colour.
    const ghosted = bodyColor({
      id: "g",
      kind: "adr",
      status: { class: "retired", value: "archived" },
    });
    expect(ghosted).not.toBe(categoryColor("adr"));
    // Node test env: archived fallback hex.
    expect(ghosted).toBe(0x9a938a);
  });
});

describe("default-state body rim (graph/Node-items 83:2 'default')", () => {
  it("darkens a colour toward black per channel, clamped", () => {
    // Half-darken a mid grey: every channel halves.
    expect(darkenColor(0x808080, 0.5)).toBe(0x404040);
    // 0 leaves the colour untouched; 1 takes it to black.
    expect(darkenColor(0xabcdef, 0)).toBe(0xabcdef);
    expect(darkenColor(0xabcdef, 1)).toBe(0x000000);
    // Out-of-range amounts clamp rather than overshoot.
    expect(darkenColor(0xffffff, 2)).toBe(0x000000);
  });

  it("rims the body with an in-family darkened shade of its OWN hue", () => {
    const fill = categoryColor("adr");
    const rim = bodyRimColor(fill);
    // The rim is darker than the fill (it reads as a hairline edge), and it is
    // the SAME hue darkened — not a second accent, not a borrowed neutral.
    expect(rim).toBe(darkenColor(fill, BODY_RIM_DARKEN));
    expect(rim).not.toBe(fill);
    // Strictly darker on the dominant channel (a darken never brightens).
    expect((rim >> 16) & 0xff).toBeLessThanOrEqual((fill >> 16) & 0xff);
  });
});

describe("selected ring (graph/Node-items 83:2 'selected')", () => {
  it("sits OUTSIDE the body with a clear gap, scaling with the body radius", () => {
    const r = nodeRadius({ id: "n", kind: "adr", salience: 0.5 });
    const ring = selectedRingRadius(r);
    // The ring centre is beyond the body edge by the gap + half its stroke, so
    // there is clear air between the disc and the ring.
    expect(ring).toBeGreaterThan(r);
    expect(ring).toBeCloseTo(r + SELECTED_RING_GAP + SELECTED_RING_WIDTH / 2, 5);
    // A larger (higher-salience) body pushes the ring out proportionally.
    const big = nodeRadius({ id: "m", kind: "adr", salience: 1 });
    expect(selectedRingRadius(big)).toBeGreaterThan(ring);
  });

  it("uses the single muted accent (state-active) for the ring colour", () => {
    // Node test env: the state-active light fallback hex.
    expect(selectedRingColor()).toBe(0x3f774d);
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

// Canvas status STAMPS were removed in the Hero redesign (graph/Hero 85:2): the
// node body is a clean category circle with three states (default / selected /
// filtered-out), no ring/slash/severity/tier overlay. The status DATA still flows
// to the hover-card + inspector — that descriptor mapping (`stampFor`) is asserted
// in `statusStamp.test.ts` and the HoverCard render tests, not on the canvas. The
// one surviving canvas status treatment is circle-level (the ghost desaturation in
// `bodyColor`, asserted above).
