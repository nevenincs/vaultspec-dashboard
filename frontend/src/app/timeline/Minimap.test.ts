import { describe, expect, it } from "vitest";

import {
  brushDragMode,
  brushOnRibbon,
  clampBrushWindow,
  corpusSpan,
  corpusSpanUsesFallback,
  corpusToRibbonX,
  monthTickXs,
  overviewTickXs,
  overviewMarkers,
  ribbonXToCorpus,
  scrollOffsetCenteringOn,
} from "./Minimap";
import { TIMELINE_ORIGIN_MS, timeToStripX } from "./scrollStrip";

const DAY = 24 * 3600_000;
const NOW = Date.parse("2026-06-30T00:00:00Z");

describe("corpusSpan (the whole-corpus extent the ribbon maps)", () => {
  it("uses wide engine-enumerated bounds when present", () => {
    const span = corpusSpan({ from: "2025-01-01", to: "2026-06-01" }, NOW);
    expect(span.fromMs).toBe(Date.parse("2025-01-01"));
    expect(span.toMs).toBe(Date.parse("2026-06-01"));
    expect(corpusSpanUsesFallback({ from: "2025-01-01", to: "2026-06-01" })).toBe(
      false,
    );
  });

  it("uses narrow engine bounds exactly instead of inventing a wider window", () => {
    const span = corpusSpan({ from: "2026-06-12", to: "2026-06-18" }, NOW);
    expect(span.fromMs).toBe(Date.parse("2026-06-12"));
    expect(span.toMs).toBe(Date.parse("2026-06-18"));
    expect(corpusSpanUsesFallback({ from: "2026-06-12", to: "2026-06-18" })).toBe(
      false,
    );
  });

  it("falls back to a fixed recent span when bounds are absent (never zero-width)", () => {
    const span = corpusSpan(undefined, NOW);
    expect(span.toMs).toBe(NOW);
    expect(span.toMs).toBeGreaterThan(span.fromMs);
    expect(corpusSpanUsesFallback(undefined)).toBe(true);
  });

  it("guards a degenerate (from >= to) bound so the linear map never divides by zero", () => {
    const span = corpusSpan({ from: "2026-06-01", to: "2026-01-01" }, NOW);
    expect(span.toMs).toBeGreaterThan(span.fromMs);
  });
});

describe("ribbon <-> corpus mapping (the scrubber's coordinate space)", () => {
  const span = { fromMs: 0, toMs: 100 * DAY };
  const W = 200;

  it("maps the span endpoints to the ribbon edges", () => {
    expect(corpusToRibbonX(span.fromMs, span, W)).toBeCloseTo(0);
    expect(corpusToRibbonX(span.toMs, span, W)).toBeCloseTo(W);
    expect(corpusToRibbonX(50 * DAY, span, W)).toBeCloseTo(W / 2);
  });

  it("round-trips ribbon x and corpus instant", () => {
    for (const x of [0, 37, 100, 199]) {
      expect(corpusToRibbonX(ribbonXToCorpus(x, span, W), span, W)).toBeCloseTo(x);
    }
  });

  it("clamps an out-of-range x into the span", () => {
    expect(ribbonXToCorpus(-50, span, W)).toBe(span.fromMs);
    expect(ribbonXToCorpus(W + 50, span, W)).toBe(span.toMs);
  });
});

describe("brushOnRibbon (the visible window drawn over the corpus)", () => {
  const span = { fromMs: 0, toMs: 100 * DAY };
  const W = 200;
  const px = 100 / DAY; // 1 day per 100px viewport scale

  it("projects the visible window onto the ribbon as a sub-span brush", () => {
    const viewportWidth = 800; // 8 days visible
    // Scroll so the viewport's left edge sits at day 10.
    const scrollOffset = timeToStripX(10 * DAY, TIMELINE_ORIGIN_MS, px);
    const brush = brushOnRibbon(scrollOffset, px, viewportWidth, span, W);
    // Left edge at day 10 -> 10/100 of the ribbon; width = 8 days -> 8/100.
    expect(brush.x).toBeCloseTo((10 / 100) * W);
    expect(brush.width).toBeCloseTo((8 / 100) * W);
  });

  it("keeps a minimum visible brush width even when zoomed far out", () => {
    // A tiny viewport span maps to a sub-pixel brush; the floor keeps it grabbable.
    const brush = brushOnRibbon(0, px, 1, span, W);
    expect(brush.width).toBeGreaterThanOrEqual(6);
  });
});

describe("brushDragMode (minimap viewport handles)", () => {
  const brush = { x: 40, width: 60 };

  it("detects left and right handle hits before interior movement", () => {
    expect(brushDragMode(42, brush)).toBe("left");
    expect(brushDragMode(98, brush)).toBe("right");
  });

  it("classifies the brush body as move and outside clicks as center", () => {
    expect(brushDragMode(70, brush)).toBe("move");
    expect(brushDragMode(10, brush)).toBe("center");
    expect(brushDragMode(140, brush)).toBe("center");
  });
});

describe("clampBrushWindow (viewport range stays inside the corpus)", () => {
  const span = { fromMs: 10 * DAY, toMs: 20 * DAY };

  it("keeps a moved brush within the corpus span", () => {
    expect(clampBrushWindow(5 * DAY, 8 * DAY, span, DAY)).toEqual({
      fromMs: 10 * DAY,
      toMs: 13 * DAY,
    });
    expect(clampBrushWindow(18 * DAY, 23 * DAY, span, DAY)).toEqual({
      fromMs: 15 * DAY,
      toMs: 20 * DAY,
    });
  });

  it("enforces a minimum visible duration for edge drags", () => {
    expect(clampBrushWindow(12 * DAY, 12.1 * DAY, span, 2 * DAY)).toEqual({
      fromMs: 12 * DAY,
      toMs: 14 * DAY,
    });
  });

  it("uses the full corpus when the requested range exceeds it", () => {
    expect(clampBrushWindow(0, 50 * DAY, span, DAY)).toEqual(span);
  });
});

describe("scrollOffsetCenteringOn (click-to-scrub centres the window)", () => {
  const px = 100 / DAY;

  it("returns the offset that centres the window on the clicked instant", () => {
    const viewportWidth = 800;
    const t = 30 * DAY;
    const offset = scrollOffsetCenteringOn(t, px, viewportWidth);
    // The instant lands at the viewport centre: stripX(t) - offset == width/2.
    const stripX = timeToStripX(t, TIMELINE_ORIGIN_MS, px);
    expect(stripX - offset).toBeCloseTo(viewportWidth / 2);
  });

  it("clamps to >= 0 so the strip never scrolls before its origin", () => {
    expect(scrollOffsetCenteringOn(0, px, 800)).toBe(0);
  });
});

describe("monthTickXs (the overview gridline)", () => {
  it("places a tick at each first-of-month within the span", () => {
    const span = {
      fromMs: Date.parse("2026-01-15"),
      toMs: Date.parse("2026-04-10"),
    };
    const xs = monthTickXs(span, 300);
    // Feb 1, Mar 1, Apr 1 fall inside [Jan 15, Apr 10].
    expect(xs).toHaveLength(3);
    expect(xs.every((x) => x >= 0 && x <= 300)).toBe(true);
    // Ticks are ascending.
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("returns no ticks for a degenerate span or zero width", () => {
    expect(monthTickXs({ fromMs: 100, toMs: 100 }, 300)).toEqual([]);
    expect(monthTickXs({ fromMs: 0, toMs: 100 * DAY }, 0)).toEqual([]);
  });
});

describe("overviewTickXs (mini-map interval ticks)", () => {
  it("uses raw day intervals when a narrow corpus is expanded for orientation", () => {
    const span = corpusSpan({ from: "2026-06-12", to: "2026-06-18" }, NOW);

    expect(overviewTickXs({ from: "2026-06-12", to: "2026-06-18" }, span, 820)).toEqual(
      [820 / 6, (820 / 6) * 2, (820 / 6) * 3, (820 / 6) * 4, (820 / 6) * 5],
    );
  });

  it("uses month ticks for wide corpus spans", () => {
    const span = corpusSpan({ from: "2026-01-15", to: "2026-04-10" }, NOW);

    expect(overviewTickXs({ from: "2026-01-15", to: "2026-04-10" }, span, 300)).toEqual(
      monthTickXs(span, 300),
    );
  });
});

describe("overviewMarkers (mini-map content signals)", () => {
  it("buckets dated documents into stable ribbon markers", () => {
    const span = {
      fromMs: Date.parse("2026-06-01T00:00:00Z"),
      toMs: Date.parse("2026-06-11T00:00:00Z"),
    };
    const markers = overviewMarkers(
      [
        { tMs: Date.parse("2026-06-02T00:00:00Z"), category: "research" },
        { tMs: Date.parse("2026-06-02T00:00:00Z"), category: "research" },
        { tMs: Date.parse("2026-06-02T12:00:00Z"), category: "adr" },
        { tMs: Date.parse("2026-06-08T00:00:00Z"), category: "plan" },
        { tMs: Date.parse("2026-07-01T00:00:00Z"), category: "audit" },
      ],
      span,
      100,
    );

    expect(markers).toEqual([
      { x: 12, count: 3, category: "research" },
      { x: 70, count: 1, category: "plan" },
    ]);
  });

  it("returns no markers for unusable spans", () => {
    expect(overviewMarkers([1, 2], { fromMs: 10, toMs: 10 }, 100)).toEqual([]);
    expect(overviewMarkers([1, 2], { fromMs: 0, toMs: 10 }, 0)).toEqual([]);
  });
});
