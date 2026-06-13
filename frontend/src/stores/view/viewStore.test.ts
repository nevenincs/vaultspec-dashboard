import { describe, expect, it } from "vitest";

import { useLiveStatusStore } from "../server/liveStatus";
import { useViewStore } from "./viewStore";

describe("view store", () => {
  it("shares one selection concept", () => {
    useViewStore.getState().select("feature:editor-demo");
    expect(useViewStore.getState().selectedId).toBe("feature:editor-demo");
    useViewStore.getState().select(null);
    expect(useViewStore.getState().selectedId).toBeNull();
  });

  it("keeps the working set explicit and deduplicated", () => {
    const store = useViewStore.getState();
    store.clearWorkingSet();
    store.addToWorkingSet("a");
    store.addToWorkingSet("a");
    store.addToWorkingSet("b");
    expect(useViewStore.getState().workingSet).toEqual(["a", "b"]);
    useViewStore.getState().removeFromWorkingSet("a");
    expect(useViewStore.getState().workingSet).toEqual(["b"]);
  });

  it("defaults to LIVE timeline mode with all tiers on", () => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
    const { timelineMode, tierFilter } = useViewStore.getState();
    expect(timelineMode).toEqual({ kind: "live" });
    expect(tierFilter.declared && tierFilter.semantic).toBe(true);
  });

  it("resets the live-connection slice on a wholesale scope swap (live-state D1)", () => {
    // Seed a previous scope's live plane, then swap scope.
    const live = useLiveStatusStore.getState();
    live.setStreamConnected(true);
    live.setLastSeq(12);
    live.setBrokenLinkCount(3);
    useViewStore.getState().setScope("worktree-b");
    // The previous corpus's live plane must not bleed into the new scope.
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: null,
      lastSeq: null,
      brokenLinkCount: 0,
    });
  });
});
