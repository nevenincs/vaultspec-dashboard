import { describe, expect, it } from "vitest";

import { buildFixtureCorpus } from "./corpus";

describe("buildFixtureCorpus", () => {
  const corpus = buildFixtureCorpus();

  it("is deterministic for a given seed", () => {
    const again = buildFixtureCorpus();
    expect(again.nodes).toEqual(corpus.nodes);
    expect(again.edges).toEqual(corpus.edges);
    expect(again.events).toEqual(corpus.events);
  });

  it("builds every feature with its five-document lifecycle", () => {
    for (const feature of corpus.features) {
      const featureNode = corpus.nodes.find((n) => n.id === `feature:${feature}`);
      expect(featureNode?.lifecycle?.progress).toBeDefined();
      for (const docType of ["research", "adr", "plan", "exec", "audit"]) {
        expect(
          corpus.nodes.some(
            (n) => n.kind === docType && n.feature_tags?.includes(feature),
          ),
        ).toBe(true);
      }
    }
  });

  it("carries all four tiers in the document-level edge set", () => {
    const tiers = new Set(corpus.edges.map((e) => e.tier));
    expect(tiers).toEqual(new Set(["declared", "structural", "temporal", "semantic"]));
    // Structural edges carry states; semantic confidence is sub-1.
    expect(
      corpus.edges
        .filter((e) => e.tier === "structural")
        .every((e) => e.state !== undefined),
    ).toBe(true);
    // Broken-ness is state, not low confidence: broken edges carry 0.0 on
    // the wire (ruling W02P05-201) and intact ones carry full confidence.
    const structural = corpus.edges.filter((e) => e.tier === "structural");
    expect(structural.some((e) => e.state === "broken")).toBe(true);
    expect(
      structural.every((e) =>
        e.state === "broken" ? e.confidence === 0 : e.confidence === 1,
      ),
    ).toBe(true);
    expect(
      corpus.edges.filter((e) => e.tier === "semantic").every((e) => e.confidence < 1),
    ).toBe(true);
  });

  it("aggregates meta-edges whose counts match the underlying edges", () => {
    expect(corpus.metaEdges.length).toBeGreaterThan(0);
    for (const meta of corpus.metaEdges) {
      expect(meta.meta).toBeDefined();
      const total = Object.values(meta.meta!.breakdown_by_tier).reduce(
        (s, v) => s + v,
        0,
      );
      expect(total).toBe(meta.meta!.count);
      expect(meta.src.startsWith("feature:")).toBe(true);
      expect(meta.dst.startsWith("feature:")).toBe(true);
    }
  });

  it("orders the event log by ts with load-bearing node_ids", () => {
    const times = corpus.events.map((e) => Date.parse(e.ts));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(corpus.events.every((e) => e.node_ids.length > 0)).toBe(true);
  });

  it("provides plan interiors with check-state matching the plan progress", () => {
    for (const [planId, interior] of corpus.planInteriors) {
      const plan = corpus.nodes.find((n) => n.id === planId);
      const progress = plan?.lifecycle?.progress;
      expect(progress).toBeDefined();
      const doneSteps = interior.nodes.filter(
        (n) => n.lifecycle?.state === "complete",
      ).length;
      expect(doneSteps).toBe(progress!.done);
      expect(interior.nodes.length).toBe(progress!.total);
    }
  });

  it("mirrors documents into the vault tree", () => {
    expect(corpus.vaultTree.length).toBe(corpus.features.length * 5);
    expect(corpus.vaultTree.every((e) => e.path.startsWith(".vault/"))).toBe(true);
  });
});
