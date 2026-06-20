// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { movePlayhead } from "../../stores/view/timelineIntent";
import {
  PLAY_DURATION_MS,
  playPosition,
  rangeFromDrag,
  startRangePlay,
  stopRangePlay,
} from "./RangeSelect";
import { TIMELINE_ORIGIN_MS, xToTime } from "./scrollStrip";
import { useTimelineStore } from "../../stores/view/timeline";

const DAY = 24 * 3600_000;
const px = 100 / DAY; // 100px per day
const scrollOffset = 0; // viewport left edge at the strip origin (epoch)

describe("rangeFromDrag (scroll-strip model)", () => {
  it("maps two viewport x to an ordered time range over the shared scale + offset", () => {
    // Each viewport x maps through the same `xToTime` the scroll-strip model uses;
    // the helper just orders the pair.
    const tLow = xToTime(200, TIMELINE_ORIGIN_MS, px, scrollOffset);
    const tHigh = xToTime(600, TIMELINE_ORIGIN_MS, px, scrollOffset);
    // Dragging right-to-left still yields an ordered [from, to] range.
    expect(rangeFromDrag(600, 200, px, scrollOffset)).toEqual({
      fromMs: tLow,
      toMs: tHigh,
    });
    expect(rangeFromDrag(200, 600, px, scrollOffset)).toEqual({
      fromMs: tLow,
      toMs: tHigh,
    });
  });

  it("tracks the scroll offset: a later offset selects a later range", () => {
    const at0 = rangeFromDrag(100, 300, px, 0);
    const at500 = rangeFromDrag(100, 300, px, 500);
    expect(at500.fromMs).toBeGreaterThan(at0.fromMs);
    expect(at500.toMs).toBeGreaterThan(at0.toMs);
  });
});

describe("playPosition (play-the-range growth)", () => {
  it("moves the playhead linearly across the range and clamps at the end", () => {
    expect(playPosition(1000, 2000, 0)).toBe(1000);
    expect(playPosition(1000, 2000, PLAY_DURATION_MS / 2)).toBe(1500);
    expect(playPosition(1000, 2000, PLAY_DURATION_MS * 2)).toBe(2000);
  });
});

describe("reduced-motion floor (base motion law)", () => {
  afterEach(() => {
    stopRangePlay();
    movePlayhead("live", null);
  });

  it("swaps the animated sweep for an instant jump to the range end when reduced", () => {
    // Under reduced motion, starting a play must NOT schedule an animation — it
    // jumps the playhead straight to the range end (the network shown grown).
    startRangePlay(1200, 1800, 0, null, true);
    // The playhead is at the END instantly, with no active play state to tick.
    expect(useTimelineStore.getState().playheadT).toBe(1800);
  });

  it("does not create local playhead state for malformed runtime scope", () => {
    movePlayhead("live", null);

    startRangePlay(1200, 1800, 0, { scope: "scope-a" }, true);

    expect(useTimelineStore.getState().playheadT).toBe("live");
  });
});
