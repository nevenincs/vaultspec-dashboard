import { describe, expect, it } from "vitest";

import {
  MAX_SPAN_MS,
  MIN_SPAN_MS,
  bucketForSpan,
  eventKindLabel,
  humanInstant,
  timeToX,
  xToTime,
  zoomWindow,
} from "./Timeline";

const DAY = 24 * 3600 * 1000;

describe("eventKindLabel (accessible event-kind prose)", () => {
  it("names each kind in human prose for the accessible label", () => {
    expect(eventKindLabel("commit")).toBe("commit");
    expect(eventKindLabel("doc-created")).toBe("document created");
    expect(eventKindLabel("doc-modified")).toBe("document modified");
    expect(eventKindLabel("plan-approved")).toBe("plan approved");
  });
});

describe("humanInstant (tabular time label)", () => {
  it("renders a date + minute label from an ISO instant", () => {
    expect(humanInstant("2026-02-01T09:30:45Z")).toBe("2026-02-01 09:30");
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
