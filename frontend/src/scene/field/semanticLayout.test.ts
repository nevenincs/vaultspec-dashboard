// graph-representation W02.P06.S24: the semantic UMAP projection, its
// connectivity fallback for embeddingless nodes, and the MEASURED promotion gate
// verdict (the v1-gated decision). The gate is run, not hand-asserted.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import {
  SEMANTIC_GATE_NODE_CEILING,
  SEMANTIC_GATE_SEPARATION_MIN,
  buildGateSlice,
  clusterSeparation,
  runSemanticGate,
} from "./semanticGate";
import {
  SEMANTIC_FALLBACK_RADIUS,
  projectTo2D,
  semanticProjection,
} from "./semanticLayout";

const embedded = (id: string, embedding: number[]): SceneNodeData => ({
  id,
  kind: "adr",
  embedding,
});

describe("semanticProjection", () => {
  it("projects embedded nodes into the 2D meaning cloud", () => {
    const nodes = [
      embedded("a", [1, 0, 0, 0]),
      embedded("b", [0, 1, 0, 0]),
      embedded("c", [0, 0, 1, 0]),
      embedded("d", [0, 0, 0, 1]),
    ];
    const { positions, fallbackIds } = semanticProjection(nodes);
    expect(fallbackIds).toHaveLength(0);
    for (const n of nodes) {
      const p = positions.get(n.id)!;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("places embeddingless nodes in the connectivity-fallback ring, honestly", () => {
    const nodes: SceneNodeData[] = [
      embedded("a", [1, 0]),
      { id: "noemb", kind: "code" },
    ];
    const { positions, fallbackIds } = semanticProjection(nodes);
    expect(fallbackIds).toEqual(["noemb"]);
    const p = positions.get("noemb")!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(SEMANTIC_FALLBACK_RADIUS, 5);
  });

  it("is deterministic across re-runs", () => {
    const nodes = [embedded("a", [1, 2, 3]), embedded("b", [3, 2, 1])];
    const first = semanticProjection(nodes).positions;
    const second = semanticProjection(nodes).positions;
    expect(second.get("a")).toEqual(first.get("a"));
    expect(second.get("b")).toEqual(first.get("b"));
  });

  it("separates well-separated embedding clusters in the projection", () => {
    const { nodes, labelOf } = buildGateSlice(120, 4);
    const { positions } = semanticProjection(nodes);
    const sep = clusterSeparation(positions, labelOf);
    expect(sep).toBeGreaterThan(SEMANTIC_GATE_SEPARATION_MIN);
  });
});

describe("projectTo2D", () => {
  it("returns one 2D point per input vector", () => {
    const out = projectTo2D([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(projectTo2D([])).toEqual([]);
  });
});

describe("semantic-mode promotion gate (measured)", () => {
  it("runs the gate over a ceiling-sized slice and produces both criteria", () => {
    const verdict = runSemanticGate();
    expect(verdict.projectionMs).toBeGreaterThanOrEqual(0);
    expect(verdict.separation).toBeGreaterThan(0);
    // The verdict reason names the outcome and the measured numbers.
    expect(verdict.reason).toMatch(/semantic mode (SHIPPED|HELD)/);
  });

  it("measures projection time over the documented node ceiling", () => {
    const { nodes } = buildGateSlice(SEMANTIC_GATE_NODE_CEILING, 8);
    expect(nodes).toHaveLength(SEMANTIC_GATE_NODE_CEILING);
    // The projection completes (does not throw / hang) over the ceiling slice.
    const { positions } = semanticProjection(nodes);
    expect(positions.size).toBe(SEMANTIC_GATE_NODE_CEILING);
  });

  it("ships the semantic mode when both criteria pass (the v1 verdict)", () => {
    // The fixture clusters are well-separated and the linear projection over
    // 1500 nodes is fast, so the gate is expected to SHIP. If a future change
    // regresses either criterion, this test surfaces the held verdict.
    const verdict = runSemanticGate();
    expect(verdict.shipped).toBe(true);
  });
});
