import { beforeEach, describe, expect, it } from "vitest";

import { useViewStore } from "../../stores/view/viewStore";
import { LIVE_SNAP_PX, dragToPlayhead, movePlayhead } from "./Playhead";
import { useTimelineStore } from "./Timeline";

const window_ = { from: 1000, to: 2000 };

describe("dragToPlayhead", () => {
  it("snaps to LIVE at the right edge", () => {
    expect(dragToPlayhead(800 - LIVE_SNAP_PX + 1, window_, 800, 5000)).toBe("live");
  });

  it("maps x to a clamped time otherwise", () => {
    expect(dragToPlayhead(400, window_, 800, 5000)).toBe(1500);
    expect(dragToPlayhead(-50, window_, 800, 5000)).toBe(1000);
    // Never past now even if the window extends beyond it.
    expect(dragToPlayhead(600, window_, 800, 1600)).toBe(1600);
  });
});

describe("movePlayhead (the playhead IS the mode, G4.b)", () => {
  beforeEach(() => movePlayhead("live"));

  it("enters time-travel mode off LIVE and exits when docked back", () => {
    movePlayhead(1500);
    expect(useTimelineStore.getState().playheadT).toBe(1500);
    expect(useViewStore.getState().timelineMode).toEqual({
      kind: "time-travel",
      at: 1500,
    });
    movePlayhead("live");
    expect(useTimelineStore.getState().playheadT).toBe("live");
    expect(useViewStore.getState().timelineMode).toEqual({ kind: "live" });
  });
});
