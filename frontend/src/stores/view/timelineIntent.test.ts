import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../server/queryClient";
import {
  DEFAULT_PX_PER_MS,
  orderedTimelineDateInputRange,
  resetTimelineViewState,
  timelineViewSnapshot,
} from "./timeline";
import {
  fitTimelineScopeToCorpus,
  fitTimelineNavigationToCorpus,
  fitTimelineNavigationToDateRange,
  jumpTimelineNavigationToCorpusEdge,
  jumpTimelineNavigationToLive,
  panTimelineNavigation,
  TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH,
  TIMELINE_NAV_EVENT_SPAN_MS,
  timelineNavigationViewportWidth,
  zoomTimelineNavigationAt,
  zoomTimelineNavigationToInstant,
  zoomTimelineNavigation,
} from "./timelineIntent";

describe("timeline navigation intent seam", () => {
  beforeEach(() => {
    queryClient.clear();
    resetTimelineViewState();
  });

  it("bounds empty navigation viewport widths to the shared default", () => {
    expect(timelineNavigationViewportWidth(0)).toBe(
      TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH,
    );
    expect(timelineNavigationViewportWidth(960)).toBe(960);
  });

  it("zooms the timeline viewport through one write seam", () => {
    const next = zoomTimelineNavigation(DEFAULT_PX_PER_MS, 100, 800, 1.6);

    expect(timelineViewSnapshot()).toMatchObject(next);
    expect(next.pxPerMs).toBe(DEFAULT_PX_PER_MS * 1.6);
    expect(next.scrollOffset).toBeGreaterThan(100);
  });

  it("zooms around an interaction cursor through the timeline intent seam", () => {
    const next = zoomTimelineNavigationAt(DEFAULT_PX_PER_MS, 100, 80, 1.6);

    expect(timelineViewSnapshot()).toMatchObject(next);
    expect(next.pxPerMs).toBe(DEFAULT_PX_PER_MS * 1.6);
    expect((80 + next.scrollOffset) / next.pxPerMs).toBeCloseTo(
      (80 + 100) / DEFAULT_PX_PER_MS,
      0,
    );
  });

  it("pans through the timeline intent seam", () => {
    expect(panTimelineNavigation(20, -50)).toBe(0);
    expect(timelineViewSnapshot().scrollOffset).toBe(0);

    expect(panTimelineNavigation(20, 50)).toBe(70);
    expect(timelineViewSnapshot().scrollOffset).toBe(70);
  });

  it("fits served corpus bounds through one write seam", () => {
    const fitted = fitTimelineNavigationToCorpus(
      { from: "2026-06-01T00:00:00.000Z", to: "2026-06-11T00:00:00.000Z" },
      800,
    );

    expect(fitted).not.toBeNull();
    expect(timelineViewSnapshot()).toMatchObject(fitted!);
  });

  it("fits a date-picker range through one timeline viewport seam", () => {
    const range = orderedTimelineDateInputRange("2026-06-01", "2026-06-11");
    expect(range).not.toBeNull();

    const fitted = fitTimelineNavigationToDateRange(range!, 800);

    expect(timelineViewSnapshot()).toMatchObject(fitted);
    expect(fitted.pxPerMs).toBeGreaterThan(0);
    expect(fitted.scrollOffset).toBeGreaterThan(0);
  });

  it("auto-fits served corpus bounds for a scope through one provenance seam", () => {
    const fitted = fitTimelineScopeToCorpus(
      "timeline-scope",
      { from: "2026-06-01T00:00:00.000Z", to: "2026-06-11T00:00:00.000Z" },
      800,
      "timeline-corpus-fit:scope:value:timeline-scope:from:value:2026-06-01:to:value:2026-06-11",
    );

    expect(fitted).not.toBeNull();
    expect(timelineViewSnapshot()).toMatchObject({
      ...fitted!,
      autoFittedScope: "timeline-scope",
      autoFittedCorpusKey:
        "timeline-corpus-fit:scope:value:timeline-scope:from:value:2026-06-01:to:value:2026-06-11",
    });
  });

  it("ignores corpus fit when the served start bound is missing or invalid", () => {
    expect(fitTimelineNavigationToCorpus({ to: "2026-06-11" }, 800)).toBeNull();
    expect(timelineViewSnapshot()).toMatchObject({
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
    });
  });

  it("jumps to either corpus edge through the timeline intent seam", () => {
    const start = jumpTimelineNavigationToCorpusEdge(
      "start",
      { from: "1970-01-01T00:00:10.000Z", to: "1970-01-01T00:00:30.000Z" },
      2,
      800,
    );
    expect(start).toBe(19_976);
    expect(timelineViewSnapshot().scrollOffset).toBe(start);

    const end = jumpTimelineNavigationToCorpusEdge(
      "end",
      { from: "1970-01-01T00:00:10.000Z", to: "1970-01-01T00:00:30.000Z" },
      2,
      800,
    );
    expect(end).toBe(59_224);
    expect(timelineViewSnapshot().scrollOffset).toBe(end);
  });

  it("jumps to the corpus end and returns the local playhead to live", () => {
    const offset = jumpTimelineNavigationToLive(
      { to: "2026-06-11T00:00:00.000Z" },
      DEFAULT_PX_PER_MS,
      800,
      null,
    );

    expect(timelineViewSnapshot()).toMatchObject({
      playheadT: "live",
      scrollOffset: offset,
    });
    expect(offset).toBeGreaterThan(0);
  });

  it("zooms the timeline viewport to a centered event instant through one intent", () => {
    const tMs = 1_700_000_000_000;
    const next = zoomTimelineNavigationToInstant(
      tMs,
      800,
      TIMELINE_NAV_EVENT_SPAN_MS,
      tMs + 10 * 24 * 3600_000,
    );

    expect(timelineViewSnapshot()).toMatchObject(next);
    expect(next.pxPerMs).toBeGreaterThan(0);
    expect(next.scrollOffset + 400).toBeCloseTo(tMs * next.pxPerMs, 0);
  });
});
