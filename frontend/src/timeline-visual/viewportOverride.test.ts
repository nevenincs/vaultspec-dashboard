import { beforeEach, describe, expect, it } from "vitest";

import { timelineViewSnapshot, resetTimelineViewState } from "../stores/view/timeline";
import {
  TIMELINE_ORIGIN_MS,
  timeToStripX,
  visibleRange,
} from "../app/timeline/scrollStrip";
import {
  applyTimelineViewportOverrideFromUrl,
  hasTimelineViewportOverrideParams,
  timelineViewportOverrideFromParams,
} from "./viewportOverride";

describe("timeline visual viewport override", () => {
  beforeEach(() => resetTimelineViewState());

  it("maps timelineFrom/timelineTo onto the scroll-strip viewport exactly", () => {
    const params = new URLSearchParams({
      timelineFrom: "2026-04-03",
      timelineTo: "2026-06-18",
    });
    const viewport = timelineViewportOverrideFromParams(params, 844);
    expect(viewport).not.toBeNull();

    const fromMs = Date.parse("2026-04-03");
    const toMs = Date.parse("2026-06-18");
    expect(viewport?.fromMs).toBe(fromMs);
    expect(viewport?.toMs).toBe(toMs);
    expect(viewport?.scrollOffset).toBe(
      timeToStripX(fromMs, TIMELINE_ORIGIN_MS, viewport!.pxPerMs),
    );

    const visible = visibleRange(viewport!.scrollOffset, 844, viewport!.pxPerMs, 0);
    expect(visible.fromMs).toBeCloseTo(fromMs, 0);
    expect(visible.toMs).toBeCloseTo(toMs, 0);
  });

  it("rejects incomplete, inverted, or zero-width overrides", () => {
    expect(
      timelineViewportOverrideFromParams(
        new URLSearchParams({ timelineFrom: "2026-04-03" }),
        844,
      ),
    ).toBeNull();
    expect(
      timelineViewportOverrideFromParams(
        new URLSearchParams({
          timelineFrom: "2026-06-18",
          timelineTo: "2026-04-03",
        }),
        844,
      ),
    ).toBeNull();
    expect(
      timelineViewportOverrideFromParams(
        new URLSearchParams({
          timelineFrom: "2026-04-03",
          timelineTo: "2026-06-18",
        }),
        0,
      ),
    ).toBeNull();
  });

  it("detects when the visual harness should prefer viewport date labels", () => {
    expect(
      hasTimelineViewportOverrideParams(
        new URLSearchParams({ timelineFrom: "2026-04-03" }),
      ),
    ).toBe(true);
    expect(
      hasTimelineViewportOverrideParams(new URLSearchParams({ scope: "default" })),
    ).toBe(false);
  });

  it("writes the override through the scoped fit seam so product auto-fit does not win", () => {
    const applied = applyTimelineViewportOverrideFromUrl(
      "?timelineFrom=2026-04-03&timelineTo=2026-06-18",
      "visual-scope",
      844,
    );
    expect(applied).not.toBeNull();
    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: "visual-scope",
      pxPerMs: applied?.pxPerMs,
      scrollOffset: applied?.scrollOffset,
    });
  });
});
