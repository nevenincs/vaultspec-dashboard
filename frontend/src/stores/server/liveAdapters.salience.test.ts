// graph-representation W01.P03.S13: prove the consumed wire fields (salience,
// derivation, embedding) survive the client path the app actually uses — a
// captured mock graph sample fed through adaptGraphSlice (mock-mirrors-live-wire-
// shape). The mock is the test double of the live origin, so feeding its output
// through the same adapter the EngineClient uses verifies the new fields are
// carried byte-for-byte, not dropped at the seam.

import { describe, expect, it } from "vitest";

import { buildFixtureCorpus } from "../../testing/fixtures/corpus";
import { MockEngine } from "../../testing/mockEngine";
import { adaptGraphSlice, unwrapEnvelope } from "./liveAdapters";
import type { EngineNode, GraphSlice } from "./engine";

/** Run a /graph/query through the mock's real fetch transport, then unwrap +
 *  adapt exactly as the EngineClient.graphQuery path does. */
async function queryThroughClientPath(
  engine: MockEngine,
  body: { granularity?: string; lens?: string },
): Promise<GraphSlice> {
  const res = await engine.fetchImpl("/graph/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "wt-main", ...body }),
  });
  return adaptGraphSlice(unwrapEnvelope(await res.json()));
}

describe("graph-representation consumed wire fields survive the client path", () => {
  it("serves the requested lens's salience as a single float per node", async () => {
    const engine = new MockEngine();
    const status = await queryThroughClientPath(engine, {
      granularity: "document",
      lens: "status",
    });
    const design = await queryThroughClientPath(engine, {
      granularity: "document",
      lens: "design",
    });

    const aPlan = status.nodes.find((n) => n.kind === "plan")!;
    const aAdr = status.nodes.find((n) => n.kind === "adr")!;
    expect(typeof aPlan.salience).toBe("number");
    expect(aPlan.salience! >= 0 && aPlan.salience! <= 1).toBe(true);

    // The lens genuinely re-orders importance: a plan outranks an adr under the
    // status lens (roadmap authority), and the design lens raises the adr.
    expect(aPlan.salience!).toBeGreaterThan(aAdr.salience!);
    const designPlan = design.nodes.find((n) => n.id === aPlan.id)!;
    const designAdr = design.nodes.find((n) => n.id === aAdr.id)!;
    expect(designAdr.salience!).toBeGreaterThan(designPlan.salience!);
  });

  it("carries the derivation label alongside the declared tier on lineage edges", async () => {
    const engine = new MockEngine();
    const slice = await queryThroughClientPath(engine, { granularity: "document" });
    // The merged wire carries `derivation` on EVERY edge (null when no pipeline
    // relationship, graph-node-semantics); a lineage edge is one with a real
    // (non-null) label. Selecting on a truthy label finds it.
    const lineageEdge = slice.edges.find((e) => e.derivation != null)!;
    expect(lineageEdge).toBeDefined();
    // derivation is ALONGSIDE the tier, never instead of it.
    expect(lineageEdge.tier).toBe("declared");
    expect([
      "grounds",
      "authorizes",
      "binds",
      "generated-by",
      "aggregates",
      "reviews",
    ]).toContain(lineageEdge.derivation);
  });

  it("carries per-node embedding vectors on document nodes", async () => {
    const engine = new MockEngine();
    const slice = await queryThroughClientPath(engine, { granularity: "document" });
    const withEmbedding = slice.nodes.find(
      (n: EngineNode) => Array.isArray(n.embedding) && n.embedding.length > 0,
    );
    expect(withEmbedding).toBeDefined();
    expect(withEmbedding!.embedding!.every((v) => typeof v === "number")).toBe(true);
  });

  it("carries the per-type status fields (status_value/status_class) on document nodes", async () => {
    const engine = new MockEngine();
    const slice = await queryThroughClientPath(engine, { granularity: "document" });

    // An adr carries the affirmed/provisional/negated/retired status family;
    // every served adr has BOTH additive fields (node-visual-richness P01).
    const adr = slice.nodes.find((n: EngineNode) => n.kind === "adr")!;
    expect(typeof adr.status_value).toBe("string");
    expect(typeof adr.status_class).toBe("string");

    // A plan carries the tiered class with an L-tier value.
    const plan = slice.nodes.find((n: EngineNode) => n.kind === "plan")!;
    expect(plan.status_class).toBe("tiered");
    expect(plan.status_value).toMatch(/^L[1-4]$/);

    // An audit carries the graded class with a severity value.
    const audit = slice.nodes.find((n: EngineNode) => n.kind === "audit")!;
    expect(audit.status_class).toBe("graded");
    expect(["low", "medium", "high", "critical"]).toContain(audit.status_value);

    // A superseded rule is the compound case: class retired, value superseded.
    const superseded = slice.nodes.find(
      (n: EngineNode) => n.kind === "rule" && n.status_value === "superseded",
    );
    expect(superseded).toBeDefined();
    expect(superseded!.status_class).toBe("retired");

    // A type with no per-type status machine (exec) carries NEITHER field —
    // honest absence survives the adapter, never a fabricated status.
    const exec = slice.nodes.find((n: EngineNode) => n.kind === "exec")!;
    expect(exec.status_value).toBeUndefined();
    expect(exec.status_class).toBeUndefined();
  });

  it("computes a per-lens salience for every node in the corpus", () => {
    const corpus = buildFixtureCorpus();
    for (const node of corpus.nodes) {
      const s = corpus.salienceByLens.get(node.id);
      expect(s).toBeDefined();
      expect(s!.status >= 0 && s!.status <= 1).toBe(true);
      expect(s!.design >= 0 && s!.design <= 1).toBe(true);
    }
  });
});
