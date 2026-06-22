import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode } from "../stores/server/engine";
import {
  engineEdgeToScene,
  engineNodeToScene,
  graphDeltasToApplyCommand,
  graphDeltaToScene,
  sliceToScene,
} from "./sceneMapping";

// The scene mappers are PURE wire→seam transforms (snake_case → camelCase,
// meta-payload folding). They are tested with explicit wire-shaped vectors —
// inputs to a pure function, exactly as the graphDeltaToScene block below — not
// a mock engine and not a captured corpus.

const featureNode: EngineNode = {
  id: "feature:alpha",
  kind: "feature",
  title: "alpha",
  member_count: 3,
  degree_by_tier: { declared: 2, structural: 1 },
  lifecycle: { state: "active", progress: { done: 1, total: 3 } },
};

const docNode: EngineNode = {
  id: "doc:2026-01-02-alpha-adr",
  kind: "document",
  doc_type: "adr",
};

const metaEdge: EngineEdge = {
  id: "meta:alpha--beta",
  src: "feature:alpha",
  dst: "feature:beta",
  relation: "relates",
  tier: "declared",
  confidence: 1,
  meta: { count: 4, breakdown_by_tier: { declared: 3, structural: 1 } },
};

const plainEdge: EngineEdge = {
  id: "e1",
  src: "doc:a",
  dst: "doc:b",
  relation: "references",
  tier: "structural",
  confidence: 1,
  state: "resolved",
};

describe("sceneMapping (pure wire→seam transforms)", () => {
  it("maps wire feature nodes to seam nodes (snake_case → camelCase)", () => {
    const scene = engineNodeToScene(featureNode);
    expect(scene.id).toBe(featureNode.id);
    expect(scene.title).toBe(featureNode.title);
    expect(scene.degreeByTier).toEqual(featureNode.degree_by_tier);
    expect(scene.lifecycle).toEqual(featureNode.lifecycle);
    // Feature-convergence sizing input carries across the seam (S02 / D4.1).
    expect(scene.memberCount).toBe(featureNode.member_count);
  });

  it("leaves memberCount absent for document nodes", () => {
    expect(engineNodeToScene(docNode).memberCount).toBeUndefined();
  });

  it("maps meta-edges with their aggregation payload", () => {
    const scene = engineEdgeToScene(metaEdge);
    expect(scene.meta).toEqual({
      count: metaEdge.meta!.count,
      breakdownByTier: metaEdge.meta!.breakdown_by_tier,
    });
  });

  it("maps plain edges without inventing a meta payload", () => {
    expect(engineEdgeToScene(plainEdge).meta).toBeUndefined();
  });

  it("maps a full slice (every meta-edge carries its payload)", () => {
    const mapped = sliceToScene({ nodes: [featureNode, docNode], edges: [metaEdge] });
    expect(mapped.nodes.length).toBe(2);
    expect(mapped.edges.every((e) => e.meta !== undefined)).toBe(true);
  });

  it("drops malformed keyframe rows at the scene slice boundary", () => {
    expect(sliceToScene(null)).toEqual({ nodes: [], edges: [] });
    expect(
      sliceToScene({
        nodes: ["bad", { id: " feature:ok ", kind: "feature" }, { id: "   " }],
        edges: [
          { id: " e1 ", src: " feature:ok ", dst: " doc:target " },
          { id: "bad", src: "", dst: "doc:target" },
          null,
        ],
      }),
    ).toMatchObject({
      nodes: [{ id: "feature:ok" }],
      edges: [{ id: "e1", src: "feature:ok", dst: "doc:target" }],
    });
  });
});

// graphDeltaToScene — spliceLive bridge (constellation-live-delta S07).
// Stage maps feature-granularity GraphDeltaEntry objects through this
// function before pushing them via SceneController.command("apply-deltas").
describe("graphDeltaToScene", () => {
  it("returns null when neither node nor edge is present", () => {
    const entry = { op: "add", t: 100, seq: 1 };
    expect(graphDeltaToScene(entry)).toBeNull();
  });

  it("drops malformed runtime delta payloads at the scene boundary", () => {
    expect(graphDeltaToScene(null)).toBeNull();
    expect(graphDeltaToScene("delta")).toBeNull();
    expect(
      graphDeltaToScene({
        op: "invalid",
        node: { id: "feature:auth" },
        t: 100,
        seq: 1,
      }),
    ).toBeNull();
    expect(
      graphDeltaToScene({
        op: "add",
        node: { id: "feature:auth" },
        t: Number.POSITIVE_INFINITY,
        seq: 1,
      }),
    ).toBeNull();
    expect(
      graphDeltaToScene({
        op: "add",
        node: { id: "   " },
        t: 100,
        seq: 1,
      }),
    ).toBeNull();
  });

  it("maps a feature-node add delta to a SceneDelta", () => {
    const node: EngineNode = {
      id: "feature:auth",
      kind: "feature",
      title: "Auth",
      member_count: 5,
    };
    const result = graphDeltaToScene({
      op: "add",
      node,
      t: 100,
      seq: 1,
      granularity: "feature",
    });
    expect(result).not.toBeNull();
    expect(result!.op).toBe("add");
    expect(result!.seq).toBe(1);
    expect(result!.t).toBe(100);
    expect(result!.node).toMatchObject({
      id: "feature:auth",
      kind: "feature",
      title: "Auth",
      memberCount: 5,
    });
    expect(result!.edge).toBeUndefined();
  });

  it("maps an edge change delta to a SceneDelta", () => {
    const edge: EngineEdge = {
      id: "e1",
      src: "a",
      dst: "b",
      relation: "declares",
      tier: "declared",
      confidence: 0.9,
      state: "resolved",
    };
    const result = graphDeltaToScene({ op: "change", edge, t: 200, seq: 2 });
    expect(result).not.toBeNull();
    expect(result!.op).toBe("change");
    expect(result!.seq).toBe(2);
    expect(result!.t).toBe(200);
    expect(result!.node).toBeUndefined();
    expect(result!.edge).toMatchObject({
      id: "e1",
      src: "a",
      dst: "b",
      tier: "declared",
    });
  });

  it("preserves both node and edge when both are present (remove delta)", () => {
    const node: EngineNode = { id: "doc:x", kind: "document" };
    const edge: EngineEdge = {
      id: "e2",
      src: "doc:x",
      dst: "doc:y",
      relation: "links",
      tier: "structural",
      confidence: 1,
    };
    const result = graphDeltaToScene({ op: "remove", node, edge, t: 300, seq: 3 });
    expect(result).not.toBeNull();
    expect(result!.op).toBe("remove");
    expect(result!.node).toBeDefined();
    expect(result!.edge).toBeDefined();
  });

  it("snake_case member_count renames to camelCase memberCount across the seam", () => {
    const node: EngineNode = { id: "feature:ux", kind: "feature", member_count: 12 };
    const result = graphDeltaToScene({ op: "add", node, t: 10, seq: 5 });
    expect(result!.node!.memberCount).toBe(12);
  });

  it("projects a batch into the locked apply-deltas command", () => {
    const node: EngineNode = {
      id: "feature:auth",
      kind: "feature",
      title: "Auth",
      member_count: 5,
    };
    const edge: EngineEdge = {
      id: "e1",
      src: "feature:auth",
      dst: "feature:docs",
      relation: "declares",
      tier: "declared",
      confidence: 0.9,
    };

    expect(
      graphDeltasToApplyCommand([
        { op: "add", t: 100, seq: 1 },
        { op: "add", node, t: 200, seq: 2, granularity: "feature" },
        { op: "change", edge, t: 300, seq: 3, granularity: "feature" },
      ]),
    ).toMatchObject({
      kind: "apply-deltas",
      seq: 3,
      deltas: [
        { op: "add", seq: 2, node: { id: "feature:auth", memberCount: 5 } },
        { op: "change", seq: 3, edge: { id: "e1", tier: "declared" } },
      ],
    });
  });

  it("returns null for a batch with no scene-bearing deltas", () => {
    expect(graphDeltasToApplyCommand([{ op: "add", t: 100, seq: 1 }])).toBeNull();
    expect(graphDeltasToApplyCommand(null)).toBeNull();
  });
});
