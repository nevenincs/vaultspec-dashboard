import { beforeEach, describe, expect, it } from "vitest";

import { useViewStore } from "../../stores/view/viewStore";

describe("scope switching (ADR §2.1 wholesale swap; finding 022)", () => {
  beforeEach(() => useViewStore.getState().setScope(null));

  it("swaps the scope wholesale: the FULL stage-scoped contract resets", () => {
    const store = useViewStore.getState();
    store.addToWorkingSet("feature:a");
    store.openNode("feature:a");
    store.pinDiscovery({
      id: "cand-1",
      src: "a",
      dst: "b",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.5,
    });

    useViewStore.getState().setScope("wt-other");

    const next = useViewStore.getState();
    expect(next.scope).toBe("wt-other");
    expect(next.selection).toBeNull();
    expect(next.workingSet).toEqual([]);
    expect(next.openedIds).toEqual([]);
    // Old-corpus semantic candidates never ride into the new slice.
    expect(next.pinnedDiscoveries).toEqual([]);
  });
});
