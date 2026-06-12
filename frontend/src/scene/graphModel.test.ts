import { describe, expect, it } from "vitest";

import { SceneGraphModel } from "./graphModel";
import type { SceneEdgeData, SceneNodeData } from "./sceneController";

const node = (id: string, extra?: Partial<SceneNodeData>): SceneNodeData => ({
  id,
  kind: "plan",
  ...extra,
});

const edge = (
  id: string,
  src: string,
  dst: string,
  extra?: Partial<SceneEdgeData>,
): SceneEdgeData => ({
  id,
  src,
  dst,
  relation: "implements",
  tier: "declared",
  confidence: 1,
  ...extra,
});

describe("SceneGraphModel", () => {
  it("replaces the slice on setData (keyframe path)", () => {
    const m = new SceneGraphModel();
    m.setData([node("a"), node("b")], [edge("e1", "a", "b")]);
    m.setData([node("c")], []);
    expect(m.nodeCount).toBe(1);
    expect(m.edgeCount).toBe(0);
    expect(m.getNode("a")).toBeUndefined();
    expect(m.getNode("c")).toBeDefined();
  });

  it("upserts on add/change by stable id (identity guarantee)", () => {
    const m = new SceneGraphModel();
    m.setData([node("a", { lifecycle: { state: "active" } })], []);
    m.applyDelta({
      op: "change",
      node: node("a", { lifecycle: { state: "complete" } }),
      t: 1,
      seq: 1,
    });
    expect(m.getNode("a")?.lifecycle?.state).toBe("complete");
    expect(m.nodeCount).toBe(1);
    m.applyDelta({ op: "add", node: node("a"), t: 2, seq: 2 });
    expect(m.nodeCount).toBe(1);
  });

  it("removes incident edges when a node is removed", () => {
    const m = new SceneGraphModel();
    m.setData(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "b", "c")],
    );
    m.applyDelta({ op: "remove", node: node("b"), t: 1, seq: 1 });
    expect(m.edgeCount).toBe(0);
    expect(m.edgesOf("a")).toEqual([]);
    expect(m.edgesOf("c")).toEqual([]);
  });

  it("maintains incidence and neighbors across edge add/remove", () => {
    const m = new SceneGraphModel();
    m.setData([node("a"), node("b"), node("c")], [edge("e1", "a", "b")]);
    m.applyDelta({ op: "add", edge: edge("e2", "a", "c"), t: 1, seq: 1 });
    expect(new Set(m.neighborsOf("a"))).toEqual(new Set(["b", "c"]));
    m.applyDelta({ op: "remove", edge: edge("e1", "a", "b"), t: 2, seq: 2 });
    expect(m.neighborsOf("a")).toEqual(["c"]);
    expect(m.edgesOf("b")).toEqual([]);
  });

  it("merges edge changes and re-indexes incidence on endpoint change", () => {
    const m = new SceneGraphModel();
    m.setData(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b", { state: "resolved", tier: "structural" })],
    );
    m.applyDelta({
      op: "change",
      edge: edge("e1", "a", "c", { state: "broken", tier: "structural" }),
      t: 1,
      seq: 1,
    });
    expect(m.getEdge("e1")?.state).toBe("broken");
    expect(m.edgesOf("b")).toEqual([]);
    expect(m.edgesOf("c")).toEqual(["e1"]);
  });

  it("surfaces dangling edges instead of hiding them", () => {
    const m = new SceneGraphModel();
    m.setData([node("a")], [edge("e1", "a", "ghost")]);
    expect(m.danglingEdgeIds()).toEqual(["e1"]);
  });
});
