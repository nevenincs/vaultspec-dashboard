// Pure unit tests for the vault-tree delta reconcile logic (vault-tree-delta ADR
// D4): the stem-keyed merge and the patch/full-drain/noop decision. Both are pure
// functions — no wire, no DOM — so every branch is deterministic. The live
// end-to-end delta path is exercised by the queries/listings live suite.

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  VaultTreeDeltaResponse,
  VaultTreeEntry,
  VaultTreeResponse,
} from "../engine";
import {
  applyVaultTreeReconcile,
  mergeVaultTreeDelta,
  planVaultTreeReconcile,
} from "./index";

function entry(stem: string): VaultTreeEntry {
  return {
    path: `.vault/plan/${stem}.md`,
    doc_type: "plan",
    feature_tags: [],
    dates: {},
  };
}

const TIERS = {} as VaultTreeResponse["tiers"];

function held(stems: string[], generation: number): VaultTreeResponse {
  return { entries: stems.map(entry), tiers: TIERS, complete: true, generation };
}

function stems(listing: VaultTreeResponse): string[] {
  return listing.entries.map((e) => e.path.replace(/^.*\//, "").replace(/\.md$/, ""));
}

describe("mergeVaultTreeDelta (stem-keyed merge)", () => {
  it("replaces a changed row in place, keeping stem-sorted order", () => {
    const base = held(["a-plan", "b-plan", "c-plan"], 4);
    const changedB = { ...entry("b-plan"), doc_type: "research" };
    const merged = mergeVaultTreeDelta(base, [changedB], [], 5, TIERS);
    expect(stems(merged)).toEqual(["a-plan", "b-plan", "c-plan"]);
    // The b row is the replacement, not the original.
    expect(merged.entries[1].doc_type).toBe("research");
    expect(merged.generation).toBe(5);
    expect(merged.complete).toBe(true);
  });

  it("inserts an added row at its stem-sorted position", () => {
    const base = held(["a-plan", "c-plan"], 4);
    const merged = mergeVaultTreeDelta(base, [entry("b-plan")], [], 5, TIERS);
    expect(stems(merged)).toEqual(["a-plan", "b-plan", "c-plan"]);
  });

  it("drops a removed stem", () => {
    const base = held(["a-plan", "b-plan", "c-plan"], 4);
    const merged = mergeVaultTreeDelta(base, [], ["b-plan"], 5, TIERS);
    expect(stems(merged)).toEqual(["a-plan", "c-plan"]);
  });

  it("applies changed + removed together and re-sorts", () => {
    const base = held(["b-plan", "d-plan"], 4);
    // add a-plan and c-plan, remove d-plan, keep b-plan.
    const merged = mergeVaultTreeDelta(
      base,
      [entry("a-plan"), entry("c-plan")],
      ["d-plan"],
      6,
      TIERS,
    );
    expect(stems(merged)).toEqual(["a-plan", "b-plan", "c-plan"]);
  });
});

describe("planVaultTreeReconcile (patch / full-drain / noop decision)", () => {
  const delta = (over: Partial<VaultTreeDeltaResponse>): VaultTreeDeltaResponse => ({
    generation: 5,
    tiers: TIERS,
    ...over,
  });

  it("patches a complete baseline from a small delta", () => {
    const action = planVaultTreeReconcile(
      held(["a-plan", "b-plan", "c-plan"], 4),
      delta({ generation: 5, changed: [entry("d-plan")], removed: [] }),
    );
    expect(action.kind).toBe("patch");
    if (action.kind === "patch") {
      expect(stems(action.value)).toEqual(["a-plan", "b-plan", "c-plan", "d-plan"]);
      expect(action.value.generation).toBe(5);
    }
  });

  it("full-drains when there is no complete baseline at a known generation", () => {
    // No held listing at all.
    expect(planVaultTreeReconcile(undefined, delta({})).kind).toBe("full-drain");
    // A partial (mid-drain) listing has no baseline.
    expect(
      planVaultTreeReconcile(
        { entries: [entry("a-plan")], tiers: TIERS, complete: false, generation: 4 },
        delta({}),
      ).kind,
    ).toBe("full-drain");
    // A complete listing with no known generation.
    expect(
      planVaultTreeReconcile(
        { entries: [entry("a-plan")], tiers: TIERS, complete: true },
        delta({}),
      ).kind,
    ).toBe("full-drain");
  });

  it("full-drains on a full_required instruction", () => {
    expect(
      planVaultTreeReconcile(
        held(["a-plan"], 4),
        delta({ generation: 9, full_required: true }),
      ).kind,
    ).toBe("full-drain");
  });

  it("full-drains when the delta touches more than half the set", () => {
    // Held set of 4; a delta of 3 changes is > half → not worth patching.
    const action = planVaultTreeReconcile(
      held(["a-plan", "b-plan", "c-plan", "d-plan"], 4),
      delta({
        generation: 5,
        changed: [entry("e-plan"), entry("f-plan")],
        removed: ["a-plan"],
      }),
    );
    expect(action.kind).toBe("full-drain");
  });

  it("is a noop when nothing changed since the baseline", () => {
    // The engine short-circuits since==current: generation unchanged, empty diff.
    const action = planVaultTreeReconcile(
      held(["a-plan"], 4),
      delta({ generation: 4, changed: [], removed: [] }),
    );
    expect(action.kind).toBe("noop");
  });
});

describe("applyVaultTreeReconcile (review HIGH: overlapping reconciles)", () => {
  const key = ["engine", "vault-tree", "scope-x"] as const;
  const delta = (over: Partial<VaultTreeDeltaResponse>): VaultTreeDeltaResponse => ({
    generation: 5,
    tiers: TIERS,
    ...over,
  });

  it("never regresses the cache when two reconciles resolve out of order", () => {
    // Generation bumps arrive in bursts: reconcile A (G4→G5) and reconcile B
    // (G4→G6) both read the SAME held baseline; B's write lands first, then A
    // resolves. A's stale patch must not overwrite B's newer listing.
    const queryClient = new QueryClient();
    const base = held(["a-plan", "b-plan"], 4);
    queryClient.setQueryData(key, base);

    const actionA = planVaultTreeReconcile(
      base,
      delta({ generation: 5, changed: [entry("c-plan")], removed: [] }),
    );
    const actionB = planVaultTreeReconcile(
      base,
      delta({ generation: 6, changed: [], removed: ["b-plan"] }),
    );

    // B lands first: baseline identity holds, the patch applies.
    let drains = 0;
    applyVaultTreeReconcile(queryClient, key, base, actionB, () => (drains += 1));
    const afterB = queryClient.getQueryData<VaultTreeResponse>(key);
    expect(afterB?.generation).toBe(6);
    expect(drains).toBe(0);

    // A resolves late against the moved baseline: the write is refused and the
    // full drain runs instead — the cache never regresses to generation 5.
    applyVaultTreeReconcile(queryClient, key, base, actionA, () => (drains += 1));
    expect(queryClient.getQueryData<VaultTreeResponse>(key)).toBe(afterB);
    expect(drains).toBe(1);
  });

  it("applies cleanly when the baseline is untouched, and honors full-drain", () => {
    const queryClient = new QueryClient();
    const base = held(["a-plan"], 4);
    queryClient.setQueryData(key, base);

    let drains = 0;
    const patch = planVaultTreeReconcile(
      base,
      delta({ generation: 5, changed: [], removed: ["a-plan"] }),
    );
    // removed ("a-plan") is the whole 1-entry set → the >50% guard full-drains.
    applyVaultTreeReconcile(queryClient, key, base, patch, () => (drains += 1));
    expect(drains).toBe(1);
    expect(queryClient.getQueryData<VaultTreeResponse>(key)).toBe(base);
  });
});
