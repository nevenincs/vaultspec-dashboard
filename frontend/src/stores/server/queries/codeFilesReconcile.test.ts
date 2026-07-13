// Pure unit tests for the code-files delta reconcile (vault-tree-delta ADR
// /code-files follow-on), exercising the SAME KEY-GENERIC reconcile core as the
// vault tree but through the code-files (path-keyed) spec: the merge, the
// patch/full-drain/noop decision (including the truncated-corpus baseline
// rejection), and the review-HIGH identity guard. Pure — no wire, no DOM.

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  CodeFileEntry,
  CodeFilesDeltaResponse,
  CodeFilesResponse,
} from "../engine";
import {
  applyRowReconcile,
  codeFilesReconcileSpec,
  mergeRowDelta,
  planRowReconcile,
} from "./index";

const spec = codeFilesReconcileSpec("scope-c");
const key = spec.queryKey;

function entry(path: string): CodeFileEntry {
  return { path, node_id: `code:${path}` };
}

const TIERS = {} as CodeFilesResponse["tiers"];

function held(paths: string[], generation: number): CodeFilesResponse {
  return {
    entries: paths.map(entry),
    tiers: TIERS,
    truncated: null,
    complete: true,
    generation,
  };
}

function paths(listing: CodeFilesResponse): string[] {
  return listing.entries.map((e) => e.path);
}

describe("mergeRowDelta (path-keyed code spec)", () => {
  it("replaces, inserts, drops, and re-sorts by path", () => {
    const base = held(["src/a.rs", "src/c.rs"], 4);
    // add src/b.rs, remove src/c.rs, keep src/a.rs.
    const merged = mergeRowDelta(
      base,
      [entry("src/b.rs")],
      ["src/c.rs"],
      5,
      TIERS,
      spec,
    );
    expect(paths(merged)).toEqual(["src/a.rs", "src/b.rs"]);
    expect(merged.generation).toBe(5);
    expect(merged.complete).toBe(true);
    // A patched code listing is complete and untruncated by construction.
    expect(merged.truncated).toBeNull();
  });

  it("replaces a changed row in place keeping path-sorted order", () => {
    const base = held(["src/a.rs", "src/b.rs", "src/z.rs"], 4);
    const changedB = { ...entry("src/b.rs"), lang: "rust" };
    const merged = mergeRowDelta(base, [changedB], [], 5, TIERS, spec);
    expect(paths(merged)).toEqual(["src/a.rs", "src/b.rs", "src/z.rs"]);
    expect(merged.entries[1].lang).toBe("rust");
  });
});

describe("planRowReconcile (code spec: truncation-aware baseline)", () => {
  const delta = (over: Partial<CodeFilesDeltaResponse>): CodeFilesDeltaResponse => ({
    generation: 5,
    tiers: TIERS,
    ...over,
  });

  it("patches a complete, untruncated baseline from a small delta", () => {
    const action = planRowReconcile(
      held(["src/a.rs", "src/b.rs", "src/c.rs"], 4),
      delta({ generation: 5, changed: [entry("src/d.rs")], removed: [] }),
      spec,
    );
    expect(action.kind).toBe("patch");
    if (action.kind === "patch") {
      expect(paths(action.value)).toEqual([
        "src/a.rs",
        "src/b.rs",
        "src/c.rs",
        "src/d.rs",
      ]);
    }
  });

  it("full-drains a TRUNCATED held listing (not a stable complete baseline)", () => {
    const truncatedHeld: CodeFilesResponse = {
      entries: [entry("src/a.rs")],
      tiers: TIERS,
      complete: true,
      generation: 4,
      truncated: { returned_files: 1, reason: "walk cap" },
    };
    expect(planRowReconcile(truncatedHeld, delta({ generation: 5 }), spec).kind).toBe(
      "full-drain",
    );
  });

  it("full-drains with no baseline / full_required / >50% churn, noops when unchanged", () => {
    expect(planRowReconcile(undefined, delta({}), spec).kind).toBe("full-drain");
    // No generation on the held listing → no baseline.
    expect(
      planRowReconcile(
        { entries: [entry("src/a.rs")], tiers: TIERS, truncated: null, complete: true },
        delta({}),
        spec,
      ).kind,
    ).toBe("full-drain");
    expect(
      planRowReconcile(
        held(["src/a.rs"], 4),
        delta({ generation: 9, full_required: true }),
        spec,
      ).kind,
    ).toBe("full-drain");
    // 3 touched of a 4-set is > half.
    expect(
      planRowReconcile(
        held(["src/a.rs", "src/b.rs", "src/c.rs", "src/d.rs"], 4),
        delta({
          generation: 5,
          changed: [entry("src/e.rs"), entry("src/f.rs")],
          removed: ["src/a.rs"],
        }),
        spec,
      ).kind,
    ).toBe("full-drain");
    expect(
      planRowReconcile(held(["src/a.rs"], 4), delta({ generation: 4 }), spec).kind,
    ).toBe("noop");
  });
});

describe("applyRowReconcile (review HIGH: overlapping code-files reconciles)", () => {
  const delta = (over: Partial<CodeFilesDeltaResponse>): CodeFilesDeltaResponse => ({
    generation: 5,
    tiers: TIERS,
    ...over,
  });

  it("never regresses the cache when two reconciles resolve out of order", () => {
    const queryClient = new QueryClient();
    const base = held(["src/a.rs", "src/b.rs"], 4);
    queryClient.setQueryData(key, base);

    const actionA = planRowReconcile(
      base,
      delta({ generation: 5, changed: [entry("src/c.rs")], removed: [] }),
      spec,
    );
    const actionB = planRowReconcile(
      base,
      delta({ generation: 6, changed: [], removed: ["src/b.rs"] }),
      spec,
    );

    let drains = 0;
    // B (G6) lands first.
    applyRowReconcile(queryClient, key, base, actionB, () => (drains += 1));
    const afterB = queryClient.getQueryData<CodeFilesResponse>(key);
    expect(afterB?.generation).toBe(6);
    expect(drains).toBe(0);

    // Stale A (G5) is refused against the moved baseline — no regression.
    applyRowReconcile(queryClient, key, base, actionA, () => (drains += 1));
    expect(queryClient.getQueryData<CodeFilesResponse>(key)).toBe(afterB);
    expect(drains).toBe(1);
  });
});
