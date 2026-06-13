import { describe, expect, it } from "vitest";

import { assertBounded, storm, syntheticGraphDeltas } from "./adverse";

describe("adverse harness", () => {
  it("generates monotonic-seq graph deltas", () => {
    const deltas = syntheticGraphDeltas(4, 10);
    expect(deltas).toHaveLength(4);
    expect(deltas.map((d) => d.seq)).toEqual([10, 11, 12, 13]);
    expect(deltas.every((d) => d.node?.id.startsWith("doc:storm-"))).toBe(true);
    // mixes ops so dedup + apply paths are exercised
    expect(new Set(deltas.map((d) => d.op)).size).toBeGreaterThan(1);
  });

  it("storm runs the op exactly count times", () => {
    let n = 0;
    storm(50, () => (n += 1));
    expect(n).toBe(50);
  });

  it("assertBounded passes within the cap and throws past it", () => {
    expect(() => assertBounded(256, 256, "accumulator")).not.toThrow();
    expect(() => assertBounded(257, 256, "accumulator")).toThrowError(
      /bounded-growth violation: accumulator = 257 exceeds cap 256/,
    );
  });
});
