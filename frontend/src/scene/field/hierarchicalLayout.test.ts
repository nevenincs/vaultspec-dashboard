// graph-layout-catalog W02.P06: the hierarchical / layered (Sugiyama) mode.
// Asserts longest-path layering over the backbone, distinct-from-lineage
// behaviour (it lays disconnected nodes too, carries no spine semantics), the D6
// forbidden-strategy guard, and the golden-position determinism contract.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import {
  FORBIDDEN_LAYOUT_STRATEGIES,
  HIER_LAYER_SPACING,
  HIER_NODE_SPACING,
  hierarchicalLayout,
} from "./hierarchicalLayout";

const n = (id: string): SceneNodeData => ({ id, kind: "doc" });

const edge = (
  src: string,
  dst: string,
  tier: SceneEdgeData["tier"] = "structural",
): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier,
  confidence: 1,
});

describe("hierarchicalLayout", () => {
  it("bounds the cross extent on a dense subgraph so no node lands off-screen", () => {
    // On a DENSE, deep subgraph (the live feature constellation — ~1100 backbone
    // edges over ~68 nodes) the longest-path layering threads long dummy CHAINS
    // through layers inflated to hundreds of slots, pushing real nodes to extreme
    // cross coordinates (x observed ~26,500 live) that fly off the fittable
    // canvas. A deep chain plus many long spanning edges reproduces that shape.
    const N = 24;
    const nodes = Array.from({ length: N }, (_, i) => n(`n${i}`));
    const edges: SceneEdgeData[] = [];
    for (let i = 0; i < N - 1; i += 1) edges.push(edge(`n${i}`, `n${i + 1}`)); // deep chain
    for (let i = 4; i < N; i += 1) edges.push(edge("n0", `n${i}`)); // long spanning edges
    for (let i = 2; i < N; i += 3) edges.push(edge("n1", `n${i}`));
    const pos = hierarchicalLayout(nodes, edges);
    const xs = [...pos.values()].map((p) => p.x);
    const extent = Math.max(...xs) - Math.min(...xs);
    // The invariant the bounded rescale guarantees: the cross extent never
    // exceeds the node-count's worth of slots, so the layout always fits a canvas.
    expect(extent).toBeLessThanOrEqual(N * HIER_NODE_SPACING);
  });

  it("layers a chain by longest-path depth (roots at top, descending y)", () => {
    // a -> b -> c -> d: four layers, increasing y down the hierarchy.
    const nodes = [n("a"), n("b"), n("c"), n("d")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
    const pos = hierarchicalLayout(nodes, edges);
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
    expect(pos.get("b")!.y).toBeLessThan(pos.get("c")!.y);
    expect(pos.get("c")!.y).toBeLessThan(pos.get("d")!.y);
    // Four distinct layers, each one HIER_LAYER_SPACING apart from the root.
    expect(pos.get("d")!.y).toBeCloseTo(3 * HIER_LAYER_SPACING);
  });

  it("spreads siblings within a layer to distinct cross positions", () => {
    // One root with three children: the children share a layer (same y) but get
    // distinct x via coordinate assignment (no single-x stack).
    const nodes = [n("root"), n("c0"), n("c1"), n("c2")];
    const edges = [edge("root", "c0"), edge("root", "c1"), edge("root", "c2")];
    const pos = hierarchicalLayout(nodes, edges);
    const ys = new Set([pos.get("c0")!.y, pos.get("c1")!.y, pos.get("c2")!.y]);
    expect(ys.size).toBe(1); // same layer
    const xs = new Set([pos.get("c0")!.x, pos.get("c1")!.x, pos.get("c2")!.x]);
    expect(xs.size).toBe(3); // distinct columns
  });

  it("feeds ONLY the structural backbone — temporal/semantic edges are not layout input (D7)", () => {
    // a temporal edge between a and c must NOT create a layering relation; only
    // the structural a -> b is a backbone edge.
    const nodes = [n("a"), n("b"), n("c")];
    const edges = [edge("a", "b", "structural"), edge("a", "c", "temporal")];
    const pos = hierarchicalLayout(nodes, edges);
    // b is one layer below a (structural edge); c has no backbone parent so it
    // sits at the root layer (depth 0), same y as a.
    expect(pos.get("b")!.y).toBeGreaterThan(pos.get("a")!.y);
    expect(pos.get("c")!.y).toBeCloseTo(pos.get("a")!.y);
  });

  it("is DISTINCT from lineage: it lays EVERY served node, connected or not (D3)", () => {
    // A node with no backbone edge still gets a position (hierarchical lays the
    // whole slice; it carries no onSpine/dangling honesty discard).
    const nodes = [n("a"), n("b"), n("island")];
    const edges = [edge("a", "b")];
    const pos = hierarchicalLayout(nodes, edges);
    expect(pos.has("island")).toBe(true);
  });

  it("enforces the D6 forbidden-strategy guard surface", () => {
    // The exponential strategies are never importable from the layered pipeline;
    // the guard names them and the layout never trips on a clean import.
    expect(FORBIDDEN_LAYOUT_STRATEGIES).toEqual([
      "decrossOpt",
      "coordSimplex",
      "coordQuad",
    ]);
    expect(() => hierarchicalLayout([n("a"), n("b")], [edge("a", "b")])).not.toThrow();
  });

  it("is deterministic: same inputs -> same positions (golden)", () => {
    const nodes = [n("a"), n("b"), n("c"), n("d"), n("e")];
    const edges = [
      edge("a", "b"),
      edge("a", "c"),
      edge("b", "d"),
      edge("c", "d"),
      edge("d", "e"),
    ];
    const first = hierarchicalLayout(nodes, edges);
    const second = hierarchicalLayout([...nodes].reverse(), [...edges].reverse());
    for (const id of nodes.map((x) => x.id)) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("returns an empty map for an empty slice", () => {
    expect(hierarchicalLayout([], []).size).toBe(0);
  });
});
