import { describe, expect, it } from "vitest";

import type { EngineEdge } from "../server/engine";
import { useLiveStatusStore } from "../server/liveStatus";
import { PINNED_DISCOVERIES_CAP, WORKING_SET_CAP, useViewStore } from "./viewStore";

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

  it("caps the working set to the most-recent entries (P-MED-4)", () => {
    const store = useViewStore.getState();
    store.clearWorkingSet();
    for (let i = 0; i < WORKING_SET_CAP + 10; i += 1) store.addToWorkingSet(`n${i}`);
    const ws = useViewStore.getState().workingSet;
    // bounded — the ego-query fan-out cannot grow without limit
    expect(ws).toHaveLength(WORKING_SET_CAP);
    // oldest evicted, newest retained
    expect(ws).not.toContain("n0");
    expect(ws[ws.length - 1]).toBe(`n${WORKING_SET_CAP + 9}`);
  });

  it("caps session-pinned discoveries to the most-recent entries (P-LOW-10)", () => {
    const edge = (id: string): EngineEdge => ({
      id,
      src: "a",
      dst: "b",
      relation: "declares",
      tier: "semantic",
      confidence: 0.5,
    });
    const store = useViewStore.getState();
    for (let i = 0; i < PINNED_DISCOVERIES_CAP + 5; i += 1)
      store.pinDiscovery(edge(`p${i}`));
    const pins = useViewStore.getState().pinnedDiscoveries;
    expect(pins).toHaveLength(PINNED_DISCOVERIES_CAP);
    expect(pins.some((e) => e.id === "p0")).toBe(false);
  });

  it("defaults to LIVE timeline mode with all tiers on", () => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
    const { timelineMode, tierFilter } = useViewStore.getState();
    expect(timelineMode).toEqual({ kind: "live" });
    expect(tierFilter.declared && tierFilter.semantic).toBe(true);
  });

  it("defaults to feature granularity and resets it on scope swap", () => {
    // Switch to document granularity.
    useViewStore.getState().setGranularity("document");
    expect(useViewStore.getState().granularity).toBe("document");
    // A scope swap must revert to the constellation default so a new corpus
    // doesn't immediately load its full document graph (~200 nodes).
    useViewStore.getState().setScope("worktree-c");
    expect(useViewStore.getState().granularity).toBe("feature");
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
