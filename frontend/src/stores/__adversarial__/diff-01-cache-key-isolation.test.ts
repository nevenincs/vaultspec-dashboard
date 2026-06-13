// Adversarial — live data plane: /graph/diff cache key isolation.
//
// Target: src/stores/server/queries.ts — engineKeys.diff + useGraphDiff.
//
// STATED CONTRACT (queries.ts header): "cache keys carry (scope, filter, as-of)
// because the contract makes scope fully stateless — responses are cacheable by
// exactly that triple and two scopes never interfere." The graph key proves the
// discipline by folding `asOf` (engineKeys.graph). The diff key MUST fold both
// `from` AND `to` for the same reason: two different time windows carry different
// change sets, and a single-cache collision would serve stale diff data as current.
//
// DEFECT CLASS: if engineKeys.diff omits `from` or `to` from the key tuple, a
// "last 24 h changes" query and a "last 1 h changes" query share one cache entry —
// the narrower window's result silently replaces (or is served instead of) the
// wider window. The GUI diff panel would display wrong changed-doc sets. This
// mirrors the stream-01 `since`-omission defect; the fix is identical (fold the
// discriminating parameter into the key).

import { describe, expect, it } from "vitest";

import { engineKeys } from "../server/queries";

describe("graph diff cache key isolation (live data plane)", () => {
  it("different `from` timestamps produce different cache keys", () => {
    const key1 = engineKeys.diff("wt-main", 1_000_000, 2_000_000);
    const key2 = engineKeys.diff("wt-main", 1_500_000, 2_000_000);
    expect(JSON.stringify(key1)).not.toBe(JSON.stringify(key2));
  });

  it("different `to` timestamps produce different cache keys", () => {
    const key1 = engineKeys.diff("wt-main", 1_000_000, 2_000_000);
    const key2 = engineKeys.diff("wt-main", 1_000_000, 2_500_000);
    expect(JSON.stringify(key1)).not.toBe(JSON.stringify(key2));
  });

  it("different scopes do not collide even with identical windows", () => {
    const keyA = engineKeys.diff("wt-main", 1_000_000, 2_000_000);
    const keyB = engineKeys.diff("wt-feature", 1_000_000, 2_000_000);
    expect(JSON.stringify(keyA)).not.toBe(JSON.stringify(keyB));
  });

  it("string and numeric representations of the same timestamp produce identical keys", () => {
    // The hook coerces both to String(); consumers passing Date.now() (number)
    // or a pre-stringified timestamp must land on the same cache entry.
    const keyNum = engineKeys.diff("wt-main", 1_000_000, 2_000_000);
    const keyStr = engineKeys.diff("wt-main", "1000000", "2000000");
    expect(JSON.stringify(keyNum)).toBe(JSON.stringify(keyStr));
  });
});
