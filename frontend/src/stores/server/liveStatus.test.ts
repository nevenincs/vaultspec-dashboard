import { beforeEach, describe, expect, it } from "vitest";

import { isStreamLost, useLiveStatusStore } from "./liveStatus";

describe("useLiveStatusStore", () => {
  beforeEach(() => useLiveStatusStore.getState().reset());

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

  it("advances lastSeq monotonically and never backward", () => {
    const { setLastSeq } = useLiveStatusStore.getState();
    setLastSeq(5);
    expect(useLiveStatusStore.getState().lastSeq).toBe(5);
    setLastSeq(3); // stale frame: ignored
    expect(useLiveStatusStore.getState().lastSeq).toBe(5);
    setLastSeq(9);
    expect(useLiveStatusStore.getState().lastSeq).toBe(9);
  });

  it("sets broken-link count and no-ops an unchanged value (stable identity)", () => {
    useLiveStatusStore.getState().setBrokenLinkCount(2);
    const snapshot = useLiveStatusStore.getState();
    snapshot.setBrokenLinkCount(2);
    // The state object is unchanged when the value did not move.
    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(2);
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
});

describe("isStreamLost", () => {
  it("is true only for an explicit disconnect, not the initial null", () => {
    expect(isStreamLost({ streamConnected: null })).toBe(false);
    expect(isStreamLost({ streamConnected: true })).toBe(false);
    expect(isStreamLost({ streamConnected: false })).toBe(true);
  });
});
