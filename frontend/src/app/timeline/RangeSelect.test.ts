// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { useViewStore } from "../../stores/view/viewStore";
import { movePlayhead } from "./Playhead";
import {
  PLAY_DURATION_MS,
  playPosition,
  prefersReducedMotion,
  rangeFromDrag,
  startRangePlay,
  stopRangePlay,
} from "./RangeSelect";
import { TIMELINE_ORIGIN_MS, xToTime } from "./scrollStrip";
import { useTimelineStore } from "./Timeline";

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
      from: tLow,
      to: tHigh,
    });
    expect(rangeFromDrag(200, 600, px, scrollOffset)).toEqual({
      from: tLow,
      to: tHigh,
    });
  });

  it("tracks the scroll offset: a later offset selects a later range", () => {
    const at0 = rangeFromDrag(100, 300, px, 0);
    const at500 = rangeFromDrag(100, 300, px, 500);
    expect(at500.from).toBeGreaterThan(at0.from);
    expect(at500.to).toBeGreaterThan(at0.to);
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
    movePlayhead("live");
    vi.unstubAllGlobals();
  });

  function stubReducedMotion(reduced: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  it("reads the prefers-reduced-motion media query", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("swaps the animated sweep for an instant jump to the range end when reduced", () => {
    // Under reduced motion, starting a play must NOT schedule an animation — it
    // jumps the playhead straight to the range end (the network shown grown).
    stubReducedMotion(true);
    startRangePlay(1200, 1800, 0);
    // The playhead is at the END instantly, with no active play state to tick.
    expect(useTimelineStore.getState().playheadT).toBe(1800);
    expect(useViewStore.getState().timelineMode).toEqual({
      kind: "time-travel",
      at: 1800,
    });
  });
});
