// @vitest-environment happy-dom

import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { LIVE_SNAP_PX, dragToPlayhead, keyboardStep } from "./Playhead";
import { TIMELINE_ORIGIN_MS, timeToX } from "./scrollStrip";
import { useTimelineStore } from "../../stores/view/timeline";
import { movePlayhead } from "../../stores/view/timelineIntent";
import { createLiveClient, liveScope } from "../../testing/liveClient";

const DAY = 24 * 3600_000;
const px = 100 / DAY; // 100px per day
const scrollOffset = 0; // viewport left edge at the strip origin (epoch)

describe("dragToPlayhead (scroll-strip model)", () => {
  // The live dock is now's viewport x; a drag within LIVE_SNAP_PX of it snaps LIVE.
  const now = 100 * DAY;
  const liveDockX = timeToX(now, TIMELINE_ORIGIN_MS, px, scrollOffset);

  it("snaps to LIVE within the right-edge snap zone of the live dock", () => {
    expect(
      dragToPlayhead(liveDockX - LIVE_SNAP_PX + 1, px, scrollOffset, liveDockX, now),
    ).toBe("live");
  });

  it("maps a viewport x to its instant otherwise, clamped to now", () => {
    // A drag one day's-worth of pixels left of the live dock lands one day back.
    const x = liveDockX - 100;
    expect(dragToPlayhead(x, px, scrollOffset, liveDockX, now)).toBeCloseTo(now - DAY);
    // Never past now even from a viewport x to the right of the live dock (but
    // outside the snap zone is impossible since the dock is the rightmost; a
    // beyond-now instant still clamps to now).
    expect(
      dragToPlayhead(liveDockX + 1000, px, scrollOffset, liveDockX + 5000, now),
    ).toBe(now);
  });
});

describe("keyboardStep (keyboard scrub is an instant pure projection)", () => {
  const now = 100 * DAY;

  it("steps backward from LIVE into a concrete time anchored at now", () => {
    // [ / ArrowLeft from LIVE lands at now - delta (anchored at the present).
    expect(keyboardStep("live", -2 * DAY, now)).toBe(now - 2 * DAY);
  });

  it("steps a concrete time backward and forward", () => {
    expect(keyboardStep(now - 3 * DAY, -DAY, now)).toBe(now - 4 * DAY);
    expect(keyboardStep(now - 4 * DAY, DAY, now)).toBe(now - 3 * DAY);
  });

  it("snaps back to LIVE when a forward step reaches or passes now", () => {
    // ] from a time near now reaches the live dock rather than overscrubbing.
    expect(keyboardStep(now - DAY / 2, DAY, now)).toBe("live");
    expect(keyboardStep("live", DAY, now)).toBe("live");
  });
});

describe("movePlayhead (local playhead projection)", () => {
  beforeEach(() => movePlayhead("live", null));

  it("moves the local playhead off LIVE and exits when docked back", () => {
    movePlayhead(1500, null);
    expect(useTimelineStore.getState().playheadT).toBe(1500);
    movePlayhead("not-a-playhead", null);
    expect(useTimelineStore.getState().playheadT).toBe("live");
    movePlayhead(1500, null);
    movePlayhead("live", null);
    expect(useTimelineStore.getState().playheadT).toBe("live");
  });

  it("mirrors accepted dashboard timeline mode for explicit scopes", async () => {
    const scope = await liveScope();
    await createLiveClient().patchDashboardState({
      scope,
      timeline_mode: { kind: "live" },
    });
    useTimelineStore.getState().setPlayhead("live");

    movePlayhead(1500, scope);

    expect(useTimelineStore.getState().playheadT).toBe("live");
    await waitFor(() => expect(useTimelineStore.getState().playheadT).toBe(1500));
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      timeline_mode: { kind: "time-travel", at: 1500 },
    });
  });

  it("normalizes runtime scope before writing dashboard timeline mode", async () => {
    const scope = await liveScope();
    await createLiveClient().patchDashboardState({
      scope,
      timeline_mode: { kind: "live" },
    });
    useTimelineStore.getState().setPlayhead("live");

    movePlayhead(1600, ` ${scope} `);

    await waitFor(() => expect(useTimelineStore.getState().playheadT).toBe(1600));
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      timeline_mode: { kind: "time-travel", at: 1600 },
    });
  });

  it("does not create local playhead state for malformed runtime scope", async () => {
    const scope = await liveScope();
    await createLiveClient().patchDashboardState({
      scope,
      timeline_mode: { kind: "live" },
    });
    useTimelineStore.getState().setPlayhead("live");

    movePlayhead(1700, { scope });

    expect(useTimelineStore.getState().playheadT).toBe("live");
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      timeline_mode: { kind: "live" },
    });
  });
});
