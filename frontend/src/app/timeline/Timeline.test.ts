import { describe, expect, it } from "vitest";

import {
  LANES,
  MAX_SPAN_MS,
  MIN_SPAN_MS,
  bucketForSpan,
  eventGlyph,
  laneOf,
  timeToX,
  xToTime,
  zoomWindow,
} from "./Timeline";

const DAY = 24 * 3600 * 1000;

describe("lanes (G4.a)", () => {
  it("keeps at most four fixed lanes with per-event glyph heterogeneity", () => {
    expect(LANES.length).toBeLessThanOrEqual(4);
    expect(laneOf("commit")).toBe(0);
    expect(laneOf("doc-created")).toBe(1);
    expect(laneOf("doc-modified")).toBe(1);
    expect(laneOf("step-checked")).toBe(2);
    expect(laneOf("feature-archived")).toBe(2);
    expect(eventGlyph("commit")).not.toBe(eventGlyph("doc-created"));
    expect(eventGlyph("unknown-kind")).toBe("○");
  });
});

describe("zoom = aggregation (G4.a)", () => {
  it("buckets coarse spans engine-side and resolves raw marks at fine zoom", () => {
    expect(bucketForSpan(2 * DAY)).toBe("raw");
    expect(bucketForSpan(30 * DAY)).toBe("1h");
    expect(bucketForSpan(200 * DAY)).toBe("1d");
  });
});

describe("window math", () => {
  const window_ = { from: 1000, to: 2000 };

  it("round-trips time and x", () => {
    const x = timeToX(1500, window_, 800);
    expect(x).toBe(400);
    expect(xToTime(x, window_, 800)).toBe(1500);
  });

  it("zooms anchored: the time under the cursor stays put", () => {
    const wide = { from: 0, to: 100 * DAY };
    const anchorT = 30 * DAY;
    const zoomed = zoomWindow(wide, anchorT, 0.8, 1000 * DAY);
    const xBefore = timeToX(anchorT, wide, 800);
    const xAfter = timeToX(anchorT, zoomed, 800);
    expect(xAfter).toBeCloseTo(xBefore);
    expect(zoomed.to - zoomed.from).toBeCloseTo(80 * DAY);
  });

  it("clamps the span band and never scrolls past now", () => {
    const tiny = zoomWindow(window_, 1500, 0.001, 10_000);
    expect(tiny.to - tiny.from).toBe(MIN_SPAN_MS);
    const wide = zoomWindow({ from: 0, to: DAY }, 1500, 1e12, 5000);
    expect(wide.to - wide.from).toBe(MAX_SPAN_MS);
    expect(wide.to).toBeLessThanOrEqual(5000);
  });
});
