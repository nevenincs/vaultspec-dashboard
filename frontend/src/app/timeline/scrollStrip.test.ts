import { describe, expect, it } from "vitest";

import {
  MAX_PX_PER_MS,
  MAX_TIMELINE_ARCS,
  MAX_TIMELINE_MARKS,
  MIN_PX_PER_MS,
  TIMELINE_ORIGIN_MS,
  capItems,
  clampPxPerMs,
  isInVisibleRange,
  liveEdgeOffset,
  panScrollOffset,
  stripXToTime,
  timeToStripX,
  timeToX,
  viewportForTimeRange,
  visibleRange,
  xToTime,
  zoomAt,
} from "./scrollStrip";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("scale: pixels-per-time mapping (S28)", () => {
  it("round-trips time and strip x at a given scale and origin", () => {
    const origin = 1_000_000;
    const px = 100 / DAY; // 100px per day
    const x = timeToStripX(origin + 3 * DAY, origin, px);
    expect(x).toBeCloseTo(300);
    expect(stripXToTime(x, origin, px)).toBeCloseTo(origin + 3 * DAY);
  });

  it("clamps the zoom band and rejects a collapsed (non-positive) scale", () => {
    expect(clampPxPerMs(MIN_PX_PER_MS / 10)).toBe(MIN_PX_PER_MS);
    expect(clampPxPerMs(MAX_PX_PER_MS * 10)).toBe(MAX_PX_PER_MS);
    expect(clampPxPerMs(0)).toBe(MIN_PX_PER_MS);
    expect(clampPxPerMs(-5)).toBe(MIN_PX_PER_MS);
    expect(clampPxPerMs(Number.NaN)).toBe(MIN_PX_PER_MS);
    // A non-finite scale collapses the strip, so it falls back to the safe MIN
    // floor rather than the MAX ceiling.
    expect(clampPxPerMs(Number.POSITIVE_INFINITY)).toBe(MIN_PX_PER_MS);
    // A scale inside the band passes through untouched.
    const mid = 100 / DAY;
    expect(clampPxPerMs(mid)).toBe(mid);
  });
});

describe("scroll offset: viewport-x mapping (S28)", () => {
  it("subtracts the scroll offset so the viewport shows a window of the strip", () => {
    const origin = 0;
    const px = 100 / DAY;
    const t = 10 * DAY;
    // Strip x is 1000; with the viewport left edge 600px into the strip, the
    // mark sits at viewport x = 400.
    expect(timeToStripX(t, origin, px)).toBeCloseTo(1000);
    expect(timeToX(t, origin, px, 600)).toBeCloseTo(400);
    expect(xToTime(400, origin, px, 600)).toBeCloseTo(t);
  });

  it("round-trips viewport x and time at any scroll offset", () => {
    const origin = 500_000;
    const px = 100 / DAY;
    for (const offset of [0, 250, 1000, 12_345]) {
      const t = xToTime(321, origin, px, offset);
      expect(timeToX(t, origin, px, offset)).toBeCloseTo(321);
    }
  });
});

describe("live-edge docking: LIVE docks at the right, scroll-left walks back (S28)", () => {
  it("places now exactly at the right edge of the viewport", () => {
    const origin = 0;
    const px = 100 / DAY;
    const width = 800;
    const now = 100 * DAY;
    const offset = liveEdgeOffset(now, width, px, origin);
    // At the live-edge offset, now lands at viewport x === width.
    expect(timeToX(now, origin, px, offset)).toBeCloseTo(width);
  });

  it("scrolling LEFT (a smaller offset than the live edge) walks back in time", () => {
    const origin = 0;
    const px = 100 / DAY;
    const width = 800;
    const now = 100 * DAY;
    const liveOffset = liveEdgeOffset(now, width, px, origin);
    // A smaller offset moves the right edge to an EARLIER instant than now.
    const earlierOffset = liveOffset - 200;
    const tAtRightEdge = xToTime(width, origin, px, earlierOffset);
    expect(tAtRightEdge).toBeLessThan(now);
  });
});

describe("zoom-anchor invariance: the instant under the cursor stays put (S28)", () => {
  it("keeps the anchored instant under the cursor across a zoom in and out", () => {
    const origin = 0;
    const px = 100 / DAY;
    const offset = 1000;
    const cursorX = 250;
    const anchorBefore = xToTime(cursorX, origin, px, offset);

    const zin = zoomAt(px, offset, cursorX, 1.5, origin);
    expect(zin.pxPerMs).toBeCloseTo(px * 1.5);
    expect(xToTime(cursorX, origin, zin.pxPerMs, zin.scrollOffset)).toBeCloseTo(
      anchorBefore,
    );

    const zout = zoomAt(px, offset, cursorX, 0.5, origin);
    expect(zout.pxPerMs).toBeCloseTo(px * 0.5);
    expect(xToTime(cursorX, origin, zout.pxPerMs, zout.scrollOffset)).toBeCloseTo(
      anchorBefore,
    );
  });

  it("clamps the zoomed scale to the band (anchor preserved at the clamped scale)", () => {
    const origin = 0;
    const cursorX = 100;
    const offset = 0;
    // A huge zoom-in factor saturates at MAX_PX_PER_MS.
    const z = zoomAt(MAX_PX_PER_MS, offset, cursorX, 1e6, origin);
    expect(z.pxPerMs).toBe(MAX_PX_PER_MS);
    // Even clamped, the instant under the cursor is preserved at the new scale.
    const anchorBefore = xToTime(cursorX, origin, MAX_PX_PER_MS, offset);
    expect(xToTime(cursorX, origin, z.pxPerMs, z.scrollOffset)).toBeCloseTo(
      anchorBefore,
    );
  });
});

describe("viewportForTimeRange + panScrollOffset", () => {
  it("resolves a time range to the scale and offset that shows it in the viewport", () => {
    const viewport = viewportForTimeRange(10 * DAY, 18 * DAY, 800);
    expect(viewport.pxPerMs).toBeCloseTo(100 / DAY);
    expect(
      stripXToTime(viewport.scrollOffset, TIMELINE_ORIGIN_MS, viewport.pxPerMs),
    ).toBeCloseTo(10 * DAY);
    expect(
      stripXToTime(viewport.scrollOffset + 800, TIMELINE_ORIGIN_MS, viewport.pxPerMs),
    ).toBeCloseTo(18 * DAY);
  });

  it("orders reversed ranges and clamps panning at the strip origin", () => {
    const viewport = viewportForTimeRange(18 * DAY, 10 * DAY, 800);
    expect(
      stripXToTime(viewport.scrollOffset, TIMELINE_ORIGIN_MS, viewport.pxPerMs),
    ).toBeCloseTo(10 * DAY);
    expect(panScrollOffset(20, -50)).toBe(0);
    expect(panScrollOffset(20, 50)).toBe(70);
  });
});

describe("visibleRange + margin: virtualization stays bounded (S29)", () => {
  it("returns the viewport span padded by the margin on each side", () => {
    const origin = 0;
    const px = 100 / DAY; // 1 day per 100px
    const width = 800; // 8 days visible
    const offset = 0; // viewport left edge at the origin
    const margin = 100; // 1 day of margin each side
    const range = visibleRange(offset, width, px, margin, origin);
    // Left edge: -margin px => -1 day; right edge: width+margin => 9 days.
    expect(range.fromMs).toBeCloseTo(-1 * DAY);
    expect(range.toMs).toBeCloseTo(9 * DAY);
    // The padded span is the viewport span plus 2x the margin in time.
    const span = range.toMs - range.fromMs;
    expect(span).toBeCloseTo((width + 2 * margin) / px);
  });

  it("the range tracks the scroll offset (later offset => later range)", () => {
    const origin = 0;
    const px = 100 / DAY;
    const a = visibleRange(0, 800, px, 100, origin);
    const b = visibleRange(800, 800, px, 100, origin);
    expect(b.fromMs).toBeGreaterThan(a.fromMs);
    expect(b.toMs).toBeGreaterThan(a.toMs);
  });

  it("isInVisibleRange is inclusive of both bounds and excludes outside", () => {
    const range = { fromMs: 100, toMs: 200 };
    expect(isInVisibleRange(100, range)).toBe(true);
    expect(isInVisibleRange(150, range)).toBe(true);
    expect(isInVisibleRange(200, range)).toBe(true);
    expect(isInVisibleRange(99, range)).toBe(false);
    expect(isInVisibleRange(201, range)).toBe(false);
  });
});

describe("belt-and-suspenders cap (S30)", () => {
  it("exposes positive mark and arc ceilings", () => {
    expect(MAX_TIMELINE_MARKS).toBeGreaterThan(0);
    expect(MAX_TIMELINE_ARCS).toBeGreaterThan(0);
  });

  it("passes a collection at or under the cap through untouched with zero dropped", () => {
    const items = [1, 2, 3];
    const capped = capItems(items, 3);
    expect(capped.items).toEqual([1, 2, 3]);
    expect(capped.dropped).toBe(0);
    // Returns a copy, not the same reference (no aliasing of caller state).
    expect(capped.items).not.toBe(items);
  });

  it("truncates an over-cap collection and reports the dropped count", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const capped = capItems(items, 4);
    expect(capped.items).toEqual([0, 1, 2, 3]);
    expect(capped.dropped).toBe(6);
  });

  it("treats a non-positive or non-finite cap as drop-everything", () => {
    expect(capItems([1, 2], 0)).toEqual({ items: [], dropped: 2 });
    expect(capItems([1, 2], -5)).toEqual({ items: [], dropped: 2 });
    expect(capItems([1, 2], Number.NaN)).toEqual({ items: [], dropped: 2 });
  });
});
