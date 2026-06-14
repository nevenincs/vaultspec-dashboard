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
import { useTimelineStore } from "./Timeline";

const window_ = { from: 1000, to: 2000 };

describe("rangeFromDrag", () => {
  it("orders and clamps the dragged span", () => {
    expect(rangeFromDrag(600, 200, window_, 800)).toEqual({ from: 1250, to: 1750 });
    expect(rangeFromDrag(-100, 900, window_, 800)).toEqual({ from: 1000, to: 2000 });
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
