import { describe, expect, it } from "vitest";

import { PLAY_DURATION_MS, playPosition, rangeFromDrag } from "./RangeSelect";

const window_ = { from: 1000, to: 2000 };

describe("rangeFromDrag", () => {
  it("orders and clamps the dragged span", () => {
    expect(rangeFromDrag(600, 200, window_, 800)).toEqual({ from: 1250, to: 1750 });
    expect(rangeFromDrag(-100, 900, window_, 800)).toEqual({ from: 1000, to: 2000 });
  });
});

describe("playPosition (play-the-range growth, G4.c)", () => {
  it("moves the playhead linearly across the range and clamps at the end", () => {
    expect(playPosition(1000, 2000, 0)).toBe(1000);
    expect(playPosition(1000, 2000, PLAY_DURATION_MS / 2)).toBe(1500);
    expect(playPosition(1000, 2000, PLAY_DURATION_MS * 2)).toBe(2000);
  });
});
