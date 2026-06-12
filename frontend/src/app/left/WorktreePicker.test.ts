import { beforeEach, describe, expect, it } from "vitest";

import type { MapWorktree } from "../../stores/server/engine";
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

describe("scope switching", () => {
  beforeEach(() => useViewStore.getState().setScope(null));

  it("swaps the scope wholesale: stage-scoped state resets", () => {
    const store = useViewStore.getState();
    store.select("feature:a");
    store.addToWorkingSet("feature:a");
    store.openNode("feature:a");
    useViewStore.getState().setScope("wt-other");
    const next = useViewStore.getState();
    expect(next.scope).toBe("wt-other");
    expect(next.selection).toBeNull();
    expect(next.workingSet).toEqual([]);
    expect(next.openedIds).toEqual([]);
  });
});
