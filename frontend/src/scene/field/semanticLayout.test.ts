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
  SEMANTIC_SPREAD,
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

// W04.P11.S52: degenerate-input hardening — the semantic projection must return
// finite, bounded positions (or the honest fallback ring) on EVERY degenerate
// input: a ragged/short vector, a non-finite component, a single embedded vector,
// an all-embeddingless slice, and a ceiling-sized slice. A ragged or poison vector
// was a real reachable NaN before this hardening (the covariance accumulation
// propagated an undefined/NaN component into NaN positions).
describe("semanticProjection — degenerate-input hardening (S52)", () => {
  const finite = (p: { x: number; y: number }) =>
    Number.isFinite(p.x) && Number.isFinite(p.y);

  it("never emits NaN on a ragged (shorter) embedding vector", () => {
    const nodes: SceneNodeData[] = [
      embedded("a", [1, 2, 3, 4]),
      embedded("b", [5, 6]), // shorter than a -> would poison the covariance
      embedded("c", [7, 8, 9, 10]),
    ];
    const { positions } = semanticProjection(nodes);
    expect(positions.size).toBe(3);
    for (const [, p] of positions) expect(finite(p)).toBe(true);
  });

  it("never emits NaN on a non-finite (NaN/Inf) embedding component", () => {
    const nodes: SceneNodeData[] = [
      embedded("a", [1, 2, NaN]),
      embedded("b", [3, Infinity, 1]),
      embedded("c", [0, 1, 2]),
    ];
    const { positions } = semanticProjection(nodes);
    expect(positions.size).toBe(3);
    for (const [, p] of positions) expect(finite(p)).toBe(true);
  });

  it("places a single embedded vector at a finite position (no throw)", () => {
    const { positions, fallbackIds } = semanticProjection([
      embedded("solo", [1, 2, 3]),
    ]);
    expect(fallbackIds).toHaveLength(0);
    expect(finite(positions.get("solo")!)).toBe(true);
  });

  it("rings every node honestly when the slice carries no embeddings (fallback ring)", () => {
    const nodes: SceneNodeData[] = [
      { id: "a", kind: "doc" },
      { id: "b", kind: "doc" },
      { id: "c", kind: "doc", embedding: [] }, // empty is NOT a real embedding
    ];
    const { positions, fallbackIds } = semanticProjection(nodes);
    expect(new Set(fallbackIds)).toEqual(new Set(["a", "b", "c"]));
    for (const [, p] of positions) {
      expect(finite(p)).toBe(true);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(SEMANTIC_FALLBACK_RADIUS, 5);
    }
  });

  it("bounds a ceiling-sized slice: every position finite and within the spread band", () => {
    const dim = 16;
    const count = 1500;
    const nodes: SceneNodeData[] = Array.from({ length: count }, (_, i) => {
      const v = Array.from({ length: dim }, (_, d) => Math.sin(i * 0.13 + d));
      return embedded(`n${i}`, v);
    });
    const { positions } = semanticProjection(nodes);
    expect(positions.size).toBe(count);
    for (const [, p] of positions) {
      expect(finite(p)).toBe(true);
      // The projection is normalized to SEMANTIC_SPREAD; a small slack guards the
      // rounding/normalization edge.
      expect(Math.abs(p.x)).toBeLessThanOrEqual(SEMANTIC_SPREAD + 1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(SEMANTIC_SPREAD + 1);
    }
  });

  it("returns an empty projection on an empty slice (no throw)", () => {
    const { positions, fallbackIds } = semanticProjection([]);
    expect(positions.size).toBe(0);
    expect(fallbackIds).toHaveLength(0);
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
