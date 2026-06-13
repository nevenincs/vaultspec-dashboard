import { describe, expect, it } from "vitest";

import { buildFixtureCorpus } from "../testing/fixtures/corpus";
import { engineEdgeToScene, engineNodeToScene, sliceToScene } from "./sceneMapping";

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
