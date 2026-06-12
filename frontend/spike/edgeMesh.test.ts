import { describe, expect, it } from "vitest";

import type { CorpusEdge } from "./corpus";
import { partitionEdgesByTier, writeSegmentPositions } from "./edgeMesh";

const nodeIndex = new Map([
  ["n0", 0],
  ["n1", 1],
  ["n2", 2],
]);

describe("partitionEdgesByTier", () => {
  it("groups edge endpoints as node-index pairs per tier", () => {
    const edges: CorpusEdge[] = [
      { source: "n0", target: "n1", tier: 0 },
      { source: "n1", target: "n2", tier: 1 },
      { source: "n2", target: "n0", tier: 1 },
    ];
    const perTier = partitionEdgesByTier(edges, nodeIndex, 4);
    expect(perTier).toHaveLength(4);
    expect(Array.from(perTier[0])).toEqual([0, 1]);
    expect(Array.from(perTier[1])).toEqual([1, 2, 2, 0]);
    expect(perTier[2]).toHaveLength(0);
    expect(perTier[3]).toHaveLength(0);
  });

  it("wraps out-of-range tiers and skips unknown node ids", () => {
    const edges: CorpusEdge[] = [
      { source: "n0", target: "n2", tier: 5 },
      { source: "n0", target: "missing", tier: 0 },
    ];
    const perTier = partitionEdgesByTier(edges, nodeIndex, 4);
    expect(Array.from(perTier[1])).toEqual([0, 2]);
    expect(perTier[0]).toHaveLength(0);
  });
});

describe("writeSegmentPositions", () => {
  it("writes 4 floats per segment from the node-position array", () => {
    const endpoints = Uint32Array.from([0, 2, 2, 1]);
    const nodePositions = Float32Array.from([10, 11, 20, 21, 30, 31]);
    const out = new Float32Array(8);
    writeSegmentPositions(endpoints, nodePositions, out);
    expect(Array.from(out)).toEqual([10, 11, 30, 31, 30, 31, 20, 21]);
  });
});
