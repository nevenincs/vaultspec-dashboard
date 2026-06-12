import { describe, expect, it } from "vitest";

import { EngineClient } from "../stores/server/engine";
import { MockEngine, buildDeltaTimeline } from "./mockEngine";
import { buildFixtureCorpus } from "./fixtures/corpus";

function client(mock: MockEngine): EngineClient {
  return new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
}

describe("buildDeltaTimeline", () => {
  it("assigns a monotonic 1-based sequence in ts order", () => {
    const timeline = buildDeltaTimeline(buildFixtureCorpus());
    expect(timeline.length).toBeGreaterThan(0);
    timeline.forEach((d, i) => {
      expect(d.seq).toBe(i + 1);
      if (i > 0) expect(d.ts).toBeGreaterThanOrEqual(timeline[i - 1].ts);
    });
  });
});

describe("MockEngine routes", () => {
  it("serves every client family with a tiers block", async () => {
    const mock = new MockEngine();
    const c = client(mock);
    const planId = [...mock.corpus.planInteriors.keys()][0];

    const responses = [
      await c.status(),
      await c.map(),
      await c.vaultTree("wt-main"),
      await c.graphQuery({ scope: "wt-main" }),
      await c.filters("wt-main"),
      await c.node(planId),
      await c.nodeNeighbors(planId),
      await c.nodeEvidence(planId),
      await c.discover(mock.corpus.nodes.find((n) => n.kind === "research")!.id),
      await c.events({ scope: "wt-main", bucket: "1d" }),
      await c.search({ query: "auth" }),
      await c.opsCore("vault-check"),
    ];
    for (const r of responses) {
      expect((r as { tiers: unknown }).tiers).toBeDefined();
    }
  });

  it("serves the constellation as feature nodes plus meta-edges only (§4)", async () => {
    const mock = new MockEngine();
    const slice = await client(mock).graphQuery({ scope: "wt-main" });
    expect(slice.nodes.every((n) => n.kind === "feature")).toBe(true);
    expect(slice.edges.every((e) => e.meta !== undefined)).toBe(true);
  });

  it("serves plan interiors on node detail", async () => {
    const mock = new MockEngine();
    const planId = [...mock.corpus.planInteriors.keys()][0];
    const detail = await client(mock).node(planId);
    expect(detail.interior?.nodes.length).toBeGreaterThan(0);
  });

  it("asof + diff share the delta clock and splice without gap or overlap", async () => {
    const mock = new MockEngine();
    const c = client(mock);
    const mid = mock.timeline[Math.floor(mock.timeline.length / 2)].ts;
    const asof = await c.graphAsof({ scope: "wt-main", t: mid });
    const diff = await c.graphDiff({ scope: "wt-main", from: mid, to: Date.now() });
    expect(asof.seq).toBeGreaterThan(0);
    if (diff.deltas.length > 0) {
      expect(diff.deltas[0].seq).toBe(asof.seq + 1);
    }
    expect(diff.last_seq).toBe(mock.lastSeq);
  });

  it("excludes the semantic tier from historical slices (§5)", async () => {
    const mock = new MockEngine();
    const mid = mock.timeline[mock.timeline.length - 1].ts;
    const asof = await client(mock).graphAsof({ scope: "wt-main", t: mid });
    expect(asof.edges.every((e) => e.tier !== "semantic")).toBe(true);
  });

  it("degrades truthfully: rag down → 502 with reasoned tier block", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    const c = client(mock);
    await expect(c.search({ query: "x" })).rejects.toMatchObject({ status: 502 });
    const status = await c.status();
    expect(status.tiers.semantic).toEqual({
      available: false,
      reason: "rag service down",
    });
    mock.degrade("semantic", null);
    expect((await c.status()).tiers.semantic.available).toBe(true);
  });

  it("streams SSE frames with seq carried on graph deltas", async () => {
    const mock = new MockEngine();
    const sinceSeq = mock.lastSeq - 2;
    const response = await mock.fetchImpl(
      `/api/stream?channels=graph&since=${sinceSeq}`,
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: graph");
    const firstData = JSON.parse(text.split("data: ")[1].split("\n")[0]);
    expect(firstData.seq).toBe(sinceSeq + 1);
    await reader.cancel();
  });

  it("rejects scope-less working-tree reads (stateless scope, §3)", async () => {
    const mock = new MockEngine();
    await expect(client(mock).vaultTree("")).rejects.toMatchObject({ status: 400 });
  });
});
