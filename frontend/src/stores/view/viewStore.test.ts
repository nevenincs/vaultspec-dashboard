import { describe, expect, it } from "vitest";

import type { EngineEdge } from "../server/engine";
import { useLiveStatusStore } from "../server/liveStatus";
import {
  OPENED_IDS_CAP,
  PINNED_DISCOVERIES_CAP,
  WORKING_SET_CAP,
  useViewStore,
} from "./viewStore";

describe("view store", () => {
  it("shares one selection concept", () => {
    useViewStore.getState().select("feature:editor-demo");
    expect(useViewStore.getState().selectedId).toBe("feature:editor-demo");
    useViewStore.getState().select(null);
    expect(useViewStore.getState().selectedId).toBeNull();
  });

  it("descends into a feature: focuses it AND flips to the bounded document view", () => {
    const store = useViewStore.getState();
    store.setGranularity("feature"); // start at the constellation overview
    expect(useViewStore.getState().focusedFeature).toBeNull();
    store.descendIntoFeature("dashboard-optimization");
    expect(useViewStore.getState().focusedFeature).toBe("dashboard-optimization");
    // Descent is what bounds the document query (filter.feature_tags=[tag]).
    expect(useViewStore.getState().granularity).toBe("document");
  });

  it("a manual granularity toggle clears the feature descent (returns to overview)", () => {
    const store = useViewStore.getState();
    store.descendIntoFeature("dashboard-optimization");
    expect(useViewStore.getState().focusedFeature).toBe("dashboard-optimization");
    // Toggling back to the constellation clears the focus...
    store.setGranularity("feature");
    expect(useViewStore.getState().focusedFeature).toBeNull();
    // ...and a manual switch to the full document graph is also unfocused.
    store.descendIntoFeature("x");
    store.setGranularity("document");
    expect(useViewStore.getState().focusedFeature).toBeNull();
  });

  it("clears the feature descent on a scope swap (no cross-corpus focus bleed)", () => {
    const store = useViewStore.getState();
    store.descendIntoFeature("dashboard-optimization");
    expect(useViewStore.getState().focusedFeature).toBe("dashboard-optimization");
    store.setScope("Y:/code/some-other-worktree");
    expect(useViewStore.getState().focusedFeature).toBeNull();
    // and back to the unfocused overview
    expect(useViewStore.getState().granularity).toBe("feature");
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

  it("caps opened islands to the most-recent entries (B3, resource-hardening)", () => {
    const store = useViewStore.getState();
    for (let i = 0; i < OPENED_IDS_CAP + 8; i += 1) store.openNode(`open${i}`);
    const opened = useViewStore.getState().openedIds;
    // bounded — each opened island holds live node/neighbor query observers, so
    // an uncapped list would retain payloads + prevent GC for the whole session
    expect(opened).toHaveLength(OPENED_IDS_CAP);
    // oldest evicted (LRU), newest retained
    expect(opened).not.toContain("open0");
    expect(opened[opened.length - 1]).toBe(`open${OPENED_IDS_CAP + 7}`);
    // re-opening keeps the cap and does not duplicate
    const before = useViewStore.getState().openedIds.length;
    const oldest = opened[0];
    store.openNode(oldest);
    const after = useViewStore.getState().openedIds;
    expect(after).toHaveLength(before);
    expect(after.filter((id) => id === oldest)).toHaveLength(1);
    // move-to-end LRU: re-opening the oldest refreshes it to the most-recent slot
    expect(after[after.length - 1]).toBe(oldest);
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
