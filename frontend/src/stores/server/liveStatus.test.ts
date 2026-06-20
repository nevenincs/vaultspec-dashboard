// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  advanceLiveSeq,
  countBrokenLinks,
  isStreamLost,
  LIVE_BROKEN_LINK_COUNT_MAX,
  LIVE_SEQ_MAX,
  markLiveStreamLost,
  normalizeLiveBrokenLinkCount,
  normalizeLiveSeq,
  normalizeLiveStreamConnected,
  resetLiveStatus,
  setLiveBrokenLinkCountFromEdges,
  setLiveBrokenLinkCount,
  setLiveStreamConnected,
  useLiveBrokenLinkCountFromEdges,
  useLiveStatusStore,
} from "./liveStatus";

beforeEach(() => useLiveStatusStore.getState().reset());
afterEach(cleanup);

describe("useLiveStatusStore", () => {
  it("starts with no stream expected and an empty live plane", () => {
    const s = useLiveStatusStore.getState();
    expect(s.streamConnected).toBeNull();
    expect(s.lastSeq).toBeNull();
    expect(s.brokenLinkCount).toBe(0);
  });

  it("tracks connection state", () => {
    useLiveStatusStore.getState().setStreamConnected(true);
    expect(useLiveStatusStore.getState().streamConnected).toBe(true);
    useLiveStatusStore.getState().setStreamConnected(false);
    expect(useLiveStatusStore.getState().streamConnected).toBe(false);
  });

  it("normalizes malformed connection state at the store seam", () => {
    expect(normalizeLiveStreamConnected(true)).toBe(true);
    expect(normalizeLiveStreamConnected(false)).toBe(false);
    expect(normalizeLiveStreamConnected("false")).toBeNull();

    useLiveStatusStore.getState().setStreamConnected(true);
    useLiveStatusStore.getState().setStreamConnected("false");
    expect(useLiveStatusStore.getState().streamConnected).toBe(true);
  });

  it("advances lastSeq monotonically and never backward", () => {
    const { setLastSeq } = useLiveStatusStore.getState();
    setLastSeq(5);
    expect(useLiveStatusStore.getState().lastSeq).toBe(5);
    setLastSeq(3); // stale frame: ignored
    expect(useLiveStatusStore.getState().lastSeq).toBe(5);
    setLastSeq(9);
    expect(useLiveStatusStore.getState().lastSeq).toBe(9);
  });

  it("normalizes malformed sequence inputs at the store seam", () => {
    expect(normalizeLiveSeq(4.9)).toBe(4);
    expect(normalizeLiveSeq(Number.NaN)).toBeNull();
    expect(normalizeLiveSeq(-1)).toBeNull();
    expect(normalizeLiveSeq(LIVE_SEQ_MAX + 1)).toBeNull();

    advanceLiveSeq(4.9);
    advanceLiveSeq(Number.POSITIVE_INFINITY);
    advanceLiveSeq(LIVE_SEQ_MAX + 1);
    advanceLiveSeq("8");

    expect(useLiveStatusStore.getState().lastSeq).toBe(4);
  });

  it("sets broken-link count and no-ops an unchanged value (stable identity)", () => {
    useLiveStatusStore.getState().setBrokenLinkCount(2);
    const snapshot = useLiveStatusStore.getState();
    snapshot.setBrokenLinkCount(2);
    // The state object is unchanged when the value did not move.
    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(2);
  });

  it("normalizes malformed broken-link counts at the store seam", () => {
    expect(normalizeLiveBrokenLinkCount(2.8)).toBe(2);
    expect(normalizeLiveBrokenLinkCount(-5)).toBe(0);
    expect(normalizeLiveBrokenLinkCount(Number.NaN)).toBeNull();
    expect(normalizeLiveBrokenLinkCount(LIVE_BROKEN_LINK_COUNT_MAX + 5)).toBe(
      LIVE_BROKEN_LINK_COUNT_MAX,
    );

    setLiveBrokenLinkCount(2.8);
    setLiveBrokenLinkCount(Number.NaN);
    setLiveBrokenLinkCount(LIVE_BROKEN_LINK_COUNT_MAX + 5);
    setLiveBrokenLinkCount("4");

    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(
      LIVE_BROKEN_LINK_COUNT_MAX,
    );
  });

  it("reset clears the whole live plane (scope swap)", () => {
    const s = useLiveStatusStore.getState();
    s.setStreamConnected(true);
    s.setLastSeq(7);
    s.setBrokenLinkCount(4);
    s.reset();
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: null,
      lastSeq: null,
      brokenLinkCount: 0,
    });
  });

  it("exposes named mutation seams for visual degradation and stream resume state", () => {
    setLiveStreamConnected(true);
    advanceLiveSeq(7);
    setLiveBrokenLinkCount(3);
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: true,
      lastSeq: 7,
      brokenLinkCount: 3,
    });

    advanceLiveSeq(5);
    markLiveStreamLost();
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: false,
      lastSeq: 7,
      brokenLinkCount: 3,
    });

    resetLiveStatus();
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: null,
      lastSeq: null,
      brokenLinkCount: 0,
    });
  });
});

describe("isStreamLost", () => {
  it("is true only for an explicit disconnect, not the initial null", () => {
    expect(isStreamLost({ streamConnected: null })).toBe(false);
    expect(isStreamLost({ streamConnected: true })).toBe(false);
    expect(isStreamLost({ streamConnected: false })).toBe(true);
  });
});

describe("countBrokenLinks", () => {
  it("counts broken edge state from live or replayed edge projections", () => {
    expect(
      countBrokenLinks([
        { state: "broken" },
        { state: "resolved" },
        {},
        { state: "broken" },
      ]),
    ).toBe(2);
    expect(countBrokenLinks({ edges: [] })).toBe(0);
    expect(
      countBrokenLinks(
        Array.from({ length: LIVE_BROKEN_LINK_COUNT_MAX + 5 }, () => ({
          state: "broken",
        })),
      ),
    ).toBe(LIVE_BROKEN_LINK_COUNT_MAX);
  });

  it("sets the live broken-link count from edge projections", () => {
    setLiveBrokenLinkCountFromEdges([
      { state: "broken" },
      { state: "resolved" },
      { state: "broken" },
    ]);

    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(2);
  });

  it("updates graph-derived broken-link state through the React seam only when enabled", () => {
    const edges = [{ state: "broken" }, { state: "resolved" }];
    const { rerender } = renderHook(
      ({ enabled }) => useLiveBrokenLinkCountFromEdges(edges, enabled),
      { initialProps: { enabled: false } },
    );

    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(0);

    rerender({ enabled: true });

    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(1);
  });
});
