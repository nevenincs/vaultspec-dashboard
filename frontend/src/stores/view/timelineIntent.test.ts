import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../server/queryClient";
import {
  DEFAULT_PX_PER_MS,
  resetTimelineViewState,
  timelineViewSnapshot,
} from "./timeline";
import {
  fitTimelineScopeToCorpus,
  TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH,
  timelineNavigationViewportWidth,
} from "./timelineIntent";

// The Issue-#14 scroll-strip navigation intents (zoom/pan/fit-nav/jump/playhead-scrub)
// were retired with the timeline teardown; their tests went with them. Only the live
// seams remain: the viewport-width clamp and the per-scope corpus auto-fit.
describe("timeline intent seam", () => {
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

  it("rejects malformed runtime scope and corpus-fit identity before auto-fit writes", () => {
    expect(
      fitTimelineScopeToCorpus(
        { scope: "timeline-scope" },
        { from: "2026-06-01T00:00:00.000Z", to: "2026-06-11T00:00:00.000Z" },
        800,
        "timeline-corpus-fit:scope:value:timeline-scope:from:value:2026-06-01:to:value:2026-06-11",
      ),
    ).toBeNull();
    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: null,
      autoFittedCorpusKey: null,
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
    });

    expect(
      fitTimelineScopeToCorpus(
        "timeline-scope",
        { from: "2026-06-01T00:00:00.000Z", to: "2026-06-11T00:00:00.000Z" },
        800,
        { key: "timeline-corpus-fit" },
      ),
    ).toBeNull();
    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: null,
      autoFittedCorpusKey: null,
    });
  });
});
