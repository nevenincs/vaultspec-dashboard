import { beforeEach, describe, expect, it } from "vitest";

import type { MapWorktree } from "../../stores/server/engine";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { orderWorktrees } from "./WorktreePicker";

const wt = (id: string, extra?: Partial<MapWorktree>): MapWorktree => ({
  id,
  path: `/repo/${id}`,
  branch: id,
  has_vault: false,
  ...extra,
});

describe("orderWorktrees (G2.a)", () => {
  it("puts corpus-bearing worktrees first, defaults leading, bare refs last", () => {
    const ordered = orderWorktrees([
      wt("bare-z"),
      wt("vault-b", { has_vault: true }),
      wt("vault-a", { has_vault: true, is_default: true }),
      wt("bare-a", { degraded: ["structural"] }),
    ]);
    expect(ordered.map((w) => w.id)).toEqual([
      "vault-a",
      "vault-b",
      "bare-a",
      "bare-z",
    ]);
  });
});

describe("scope switching (ADR §2.1 wholesale swap; finding 022)", () => {
  beforeEach(() => useViewStore.getState().setScope(null));

  it("swaps the scope wholesale: the FULL stage-scoped contract resets", () => {
    const store = useViewStore.getState();
    store.select("feature:a");
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
    store.setTimelineMode({ kind: "time-travel", at: 123 });
    useFilterStore.getState().setTextMatch("old-scope-term");
    useFilterStore.getState().setFacet("featureTags", ["old-feature"]);

    useViewStore.getState().setScope("wt-other");

    const next = useViewStore.getState();
    expect(next.scope).toBe("wt-other");
    expect(next.selection).toBeNull();
    expect(next.workingSet).toEqual([]);
    expect(next.openedIds).toEqual([]);
    // Old-corpus semantic candidates never ride into the new slice.
    expect(next.pinnedDiscoveries).toEqual([]);
    // The new scope never arrives pre-scrubbed to a foreign timestamp.
    expect(next.timelineMode).toEqual({ kind: "live" });
    // Prior-scope vocabulary cannot filter the new constellation to empty.
    const filters = useFilterStore.getState();
    expect(filters.textMatch).toBe("");
    expect(filters.featureTags).toEqual([]);
  });
});
