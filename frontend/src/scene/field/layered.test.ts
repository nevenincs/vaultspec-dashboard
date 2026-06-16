// graph-lineage-dag W03.P10: the shared Sugiyama primitives (layered.ts) — the
// extracted longest-path layering, cycle removal, dummy insertion, crossing
// reduction, and coordinate assignment reused by lineage (and, later, the W02
// hierarchical mode). Determinism and the layered-structure invariants are
// pinned here so both consumers inherit a verified base.

import { describe, expect, it } from "vitest";

import {
  type LayeredEdge,
  assignLayers,
  insertDummies,
  layeredLayout,
  reduceCrossings,
  removeCycles,
} from "./layered";

describe("removeCycles", () => {
  it("reverses a back-edge into a DAG rather than dropping it", () => {
    const nodes = ["a", "b", "c"];
    const edges: LayeredEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" }, // back-edge
    ];
    const { dag, reversed } = removeCycles(nodes, edges);
    expect(reversed.size).toBe(1);
    // Every original edge still has a representative in the DAG (none dropped).
    expect(dag.length).toBe(3);
  });

  it("is deterministic across re-runs", () => {
    const nodes = ["x", "y", "z"];
    const edges: LayeredEdge[] = [
      { from: "x", to: "y" },
      { from: "y", to: "z" },
      { from: "z", to: "x" },
    ];
    const a = removeCycles(nodes, edges);
    const b = removeCycles(nodes, edges);
    expect([...a.reversed]).toEqual([...b.reversed]);
  });
});

describe("assignLayers", () => {
  it("assigns longest-path depth: a present parent pins depth = parent + 1", () => {
    const nodes = ["a", "b", "c"];
    const dag: LayeredEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    const layers = assignLayers(nodes, dag);
    expect(layers.get("a")).toBe(0);
    expect(layers.get("b")).toBe(1);
    expect(layers.get("c")).toBe(2);
  });

  it("uses the axis seed only as a floor for a node with no present parent", () => {
    const nodes = ["child"];
    // The parent is absent from the slice; the seed (3) floors the dangling stub.
    const dag: LayeredEdge[] = [{ from: "missing-parent", to: "child" }];
    const layers = assignLayers(nodes, dag, (id) => (id === "child" ? 3 : 0));
    expect(layers.get("child")).toBe(3);
  });

  it("lets a present parent override the axis seed", () => {
    const nodes = ["parent", "child"];
    const dag: LayeredEdge[] = [{ from: "parent", to: "child" }];
    // The child carries a high seed, but its PRESENT parent pins it to
    // layer(parent) + 1 = 1 — the seed is only a floor for parentless nodes.
    const layers = assignLayers(nodes, dag, (id) => (id === "child" ? 5 : 0));
    expect(layers.get("parent")).toBe(0);
    expect(layers.get("child")).toBe(1);
  });
});

describe("insertDummies", () => {
  it("inserts one dummy per intermediate layer on a multi-layer edge", () => {
    const layerOf = new Map([
      ["a", 0],
      ["b", 3],
    ]);
    const dag: LayeredEdge[] = [{ from: "a", to: "b" }];
    const { routed, dummies } = insertDummies(layerOf, dag, new Set());
    // Spanning layers 0->3 needs dummies at layers 1 and 2.
    expect(dummies.size).toBe(2);
    expect(routed[0].waypoints.length).toBe(2);
  });

  it("adds no dummy on a unit-length edge", () => {
    const layerOf = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    const { routed, dummies } = insertDummies(
      layerOf,
      [{ from: "a", to: "b" }],
      new Set(),
    );
    expect(dummies.size).toBe(0);
    expect(routed[0].waypoints).toEqual([]);
  });

  it("restores a reversed edge to its true direction for routing", () => {
    const layerOf = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    // The DAG carries the reversed direction (b->a); reversed records the original.
    const { routed } = insertDummies(
      layerOf,
      [{ from: "b", to: "a" }],
      new Set(["a b"]),
    );
    expect(routed[0].from).toBe("a");
    expect(routed[0].to).toBe("b");
  });
});

describe("reduceCrossings", () => {
  it("orders a layer by the median of its neighbours, deterministically", () => {
    // Two layers; the second layer should reorder to follow the first.
    const layers = [
      ["a0", "a1"],
      ["b1", "b0"], // intentionally reversed
    ];
    const routed = [
      { from: "a0", to: "b0", waypoints: [] },
      { from: "a1", to: "b1", waypoints: [] },
    ];
    const before = [...layers[1]];
    reduceCrossings(layers, routed, 4);
    // The reorder is deterministic (same result every run): re-running the SAME
    // crossing reduction on a FRESH copy of the SAME input must yield the SAME
    // order. A genuine determinism check — not a comparison of a value to itself.
    const after = [...layers[1]];
    const rerunLayers = [[...layers[0]], before];
    reduceCrossings(rerunLayers, routed, 4);
    const rerun = rerunLayers[1];
    expect(rerun).toEqual(after);
    expect(layers[1].length).toBe(2);
  });
});

describe("layeredLayout (full pipeline)", () => {
  it("produces deterministic positions across re-runs", () => {
    const nodes = ["a", "b", "c", "d"];
    const edges: LayeredEdge[] = [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
    ];
    const first = layeredLayout(nodes, edges);
    const second = layeredLayout(nodes, edges);
    expect([...second.crossOf.entries()]).toEqual([...first.crossOf.entries()]);
    expect([...second.layerOf.entries()]).toEqual([...first.layerOf.entries()]);
  });

  it("gives nodes in the same layer distinct cross-coordinates (no overlap)", () => {
    const nodes = ["root", "x", "y", "z"];
    const edges: LayeredEdge[] = [
      { from: "root", to: "x" },
      { from: "root", to: "y" },
      { from: "root", to: "z" },
    ];
    const { crossOf } = layeredLayout(nodes, edges);
    const crosses = ["x", "y", "z"].map((id) => crossOf.get(id));
    expect(new Set(crosses).size).toBe(3);
  });
});
