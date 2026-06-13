import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode, GraphDeltaEntry } from "../stores/server/engine";
import { buildFixtureCorpus } from "../testing/fixtures/corpus";
import {
  engineEdgeToScene,
  engineNodeToScene,
  graphDeltaToScene,
  sliceToScene,
} from "./sceneMapping";

describe("sceneMapping", () => {
  const corpus = buildFixtureCorpus();

  it("maps wire nodes to seam nodes (snake_case → camelCase)", () => {
    const wire = corpus.nodes.find((n) => n.kind === "feature")!;
    const scene = engineNodeToScene(wire);
    expect(scene.id).toBe(wire.id);
    expect(scene.title).toBe(wire.title);
    expect(scene.degreeByTier).toEqual(wire.degree_by_tier);
    expect(scene.lifecycle).toEqual(wire.lifecycle);
    // Feature-convergence sizing input carries across the seam (S02 / D4.1).
    expect(scene.memberCount).toBe(wire.member_count);
  });

  it("leaves memberCount absent for non-feature (document) nodes", () => {
    const doc = corpus.nodes.find((n) => n.kind !== "feature")!;
    expect(engineNodeToScene(doc).memberCount).toBeUndefined();
  });

  it("maps meta-edges with their aggregation payload", () => {
    const wire = corpus.metaEdges[0];
    const scene = engineEdgeToScene(wire);
    expect(scene.meta).toEqual({
      count: wire.meta!.count,
      breakdownByTier: wire.meta!.breakdown_by_tier,
    });
  });

  it("maps plain edges without inventing a meta payload", () => {
    const wire = corpus.edges[0];
    expect(engineEdgeToScene(wire).meta).toBeUndefined();
  });

  it("maps a full slice", () => {
    const mapped = sliceToScene({ nodes: corpus.nodes, edges: corpus.metaEdges });
    expect(mapped.nodes.length).toBe(corpus.nodes.length);
    expect(mapped.edges.every((e) => e.meta !== undefined)).toBe(true);
  });
});

// graphDeltaToScene — spliceLive bridge (constellation-live-delta S07).
// Stage maps feature-granularity GraphDeltaEntry objects through this
// function before pushing them via SceneController.command("apply-deltas").
describe("graphDeltaToScene", () => {
  it("returns null when neither node nor edge is present", () => {
    const entry = { op: "add", t: 100, seq: 1 } as unknown as GraphDeltaEntry;
    expect(graphDeltaToScene(entry)).toBeNull();
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
});
