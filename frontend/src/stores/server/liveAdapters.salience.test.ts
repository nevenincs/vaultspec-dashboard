// graph-representation W01.P03.S13: prove the consumed wire fields (salience,
// derivation, status, embeddings) survive the client path the app actually uses —
// the REAL engine's /graph/query fed through the SAME unwrapEnvelope +
// adaptGraphSlice the EngineClient runs. No mock: a passing test proves the live
// wire carries these fields and the adapter preserves them byte-for-byte.
//
// Assertions are PROPERTY-based (a field is present, a float is in range, a lens
// genuinely re-orders, a label is from the valid set) rather than pinned to
// specific fixture values — the file's purpose is "the fields survive the seam",
// which holds for any real corpus.

import { beforeAll, describe, expect, it } from "vitest";

import { liveFetch, liveScope } from "../../testing/liveClient";
import type { EngineNode, GraphSlice } from "./engine";
import { adaptGraphSlice, unwrapEnvelope } from "./liveAdapters";

let scope: string;
beforeAll(async () => {
  scope = await liveScope();
});

/** POST /graph/query against the live engine, then unwrap + adapt exactly as the
 *  EngineClient.graphQuery path does. */
async function queryLive(body: { granularity?: string; lens?: string }): Promise<GraphSlice> {
  const res = await liveFetch("/graph/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, ...body }),
  });
  return adaptGraphSlice(unwrapEnvelope(await res.json()));
}

describe("graph-representation consumed wire fields survive the live client path", () => {
  it("serves a per-node salience float in [0,1] for the requested lens", async () => {
    const status = await queryLive({ granularity: "document", lens: "status" });
    expect(status.nodes.length).toBeGreaterThan(0);
    for (const n of status.nodes) {
      expect(typeof n.salience).toBe("number");
      expect(n.salience! >= 0 && n.salience! <= 1).toBe(true);
    }
  });

  it("the lens genuinely re-orders importance (status vs design differ)", async () => {
    const status = await queryLive({ granularity: "document", lens: "status" });
    const design = await queryLive({ granularity: "document", lens: "design" });
    const byId = new Map(design.nodes.map((n) => [n.id, n.salience]));
    // At least one node's salience differs between the two lenses — the lens is a
    // real re-weighting, not a constant.
    const reweighted = status.nodes.some(
      (n) => byId.has(n.id) && byId.get(n.id) !== n.salience,
    );
    expect(reweighted).toBe(true);
  });

  it("carries a valid derivation label alongside the declared tier on lineage edges", async () => {
    const slice = await queryLive({ granularity: "document" });
    // The merged wire carries `derivation` on every edge (null when no pipeline
    // relationship); the fixture's research→adr→plan→exec chain yields lineage
    // edges with a real label.
    const lineageEdge = slice.edges.find((e) => e.derivation != null);
    expect(lineageEdge).toBeDefined();
    // derivation rides ALONGSIDE the tier (never instead of it): the edge keeps a
    // real provenance tier and carries a valid pipeline-relationship label.
    expect(["declared", "structural", "temporal", "semantic"]).toContain(lineageEdge!.tier);
    expect([
      "grounds",
      "authorizes",
      "binds",
      "generated-by",
      "aggregates",
      "reviews",
    ]).toContain(lineageEdge!.derivation);
  });

  it("does NOT inline embeddings on /graph/query document nodes (ADR D2)", async () => {
    const slice = await queryLive({ granularity: "document" });
    const withEmbedding = slice.nodes.find(
      (n: EngineNode) => Array.isArray(n.embedding) && n.embedding.length > 0,
    );
    expect(withEmbedding).toBeUndefined();
  });

  it("serves the dedicated /graph/embeddings route in its bounded shape (ADR D2/D3)", async () => {
    // The embeddings route returns its envelope (raw float vectors keyed by node
    // id, a generation stamp, the tiers block) on a SEPARATE route. The vector
    // count depends on whether rag has embedded the corpus; the SHAPE is the
    // contract under test.
    const res = await liveFetch(`/graph/embeddings?scope=${encodeURIComponent(scope)}`);
    const body = unwrapEnvelope(await res.json()) as {
      embeddings: { node_id: string; vector: number[] }[];
      generation: number;
      tiers: Record<string, { available: boolean }>;
    };
    expect(Array.isArray(body.embeddings)).toBe(true);
    expect(typeof body.generation).toBe("number");
    expect(body.tiers).toBeTypeOf("object");
    // When embeddings are present they are float vectors under doc: ids.
    for (const e of body.embeddings) {
      expect(e.node_id.startsWith("doc:")).toBe(true);
      expect(e.vector.every((v) => typeof v === "number")).toBe(true);
    }
  });

  it("status fields are honest: both present or both absent, never a fabricated half", async () => {
    // node-visual-richness P01: status_value + status_class are an additive PAIR.
    // The live engine emits them only when the doc genuinely declares a status —
    // never a fabricated value (the old mock invented statuses, a false green this
    // migration removes). The honest invariant: the two fields move together, and
    // a type with no per-type status machine carries neither.
    const slice = await queryLive({ granularity: "document" });
    expect(slice.nodes.length).toBeGreaterThan(0);
    for (const n of slice.nodes as EngineNode[]) {
      const hasValue = n.status_value !== undefined;
      const hasClass = n.status_class !== undefined;
      expect(hasValue).toBe(hasClass);
      if (hasValue) {
        expect(typeof n.status_value).toBe("string");
        expect(typeof n.status_class).toBe("string");
      }
    }
    // An exec has no per-type status machine — honest absence survives the adapter.
    const exec = slice.nodes.find((n: EngineNode) => n.doc_type === "exec");
    if (exec) {
      expect(exec.status_value).toBeUndefined();
      expect(exec.status_class).toBeUndefined();
    }
  });
});
