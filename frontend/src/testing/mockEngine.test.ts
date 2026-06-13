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
    const slice = await client(mock).graphQuery({
      scope: "wt-main",
      granularity: "feature",
    });
    expect(slice.nodes.every((n) => n.kind === "feature")).toBe(true);
    expect(slice.nodes.length).toBeGreaterThan(0);
    // Live serves meta-edges in a SEPARATE array with edges empty; the client
    // folds them into edges (each carrying its aggregation on .meta).
    expect(slice.edges.length).toBeGreaterThan(0);
    expect(slice.edges.every((e) => e.meta !== undefined)).toBe(true);
  });

  it("serves document granularity by default, mirroring the live engine", async () => {
    const mock = new MockEngine();
    const slice = await client(mock).graphQuery({ scope: "wt-main" });
    expect(slice.nodes.every((n) => n.kind !== "feature")).toBe(true);
    // Document edges are real edges, never meta-aggregations.
    expect(slice.edges.length).toBeGreaterThan(0);
    expect(slice.edges.every((e) => e.meta === undefined)).toBe(true);
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

  it("excludes the semantic tier from historical slices (§5), classified on the corpus clock (012)", async () => {
    const mock = new MockEngine();
    const c = client(mock);
    const mid = mock.timeline[Math.floor(mock.timeline.length / 2)].ts;
    const historical = await c.graphAsof({ scope: "wt-main", t: mid });
    expect(
      historical.edges.every((e) => e.tier !== "semantic" || e.meta !== undefined),
    ).toBe(true);
    expect(historical.edges.some((e) => e.tier === "semantic" && !e.meta)).toBe(false);
    // At the corpus's own LIVE edge, semantic serves again — wall clock
    // plays no part in the classification.
    const live = await c.graphAsof({ scope: "wt-main", t: mock.maxEventTs });
    expect(live.edges.some((e) => e.tier === "semantic" && !e.meta)).toBe(true);
  });

  it("carries feature nodes in historical slices (009)", async () => {
    const mock = new MockEngine();
    const mid = mock.timeline[Math.floor(mock.timeline.length / 2)].ts;
    const asof = await client(mock).graphAsof({ scope: "wt-main", t: mid });
    expect(asof.nodes.some((n) => n.kind === "feature")).toBe(true);
    // Scrubbing from the constellation never vanishes the default species:
    // at any T past the first feature's creation, features exist.
  });

  it("windows the diff on seq so ts-collision siblings always splice (010)", async () => {
    const mock = new MockEngine();
    const c = client(mock);
    // Find a ts shared by multiple deltas (collision group).
    const byTs = new Map<number, number>();
    for (const d of mock.timeline) byTs.set(d.ts, (byTs.get(d.ts) ?? 0) + 1);
    const collisionTs = [...byTs.entries()].find(([, n]) => n > 1)?.[0];
    expect(collisionTs).toBeDefined();
    const group = mock.timeline.filter((d) => d.ts === collisionTs);
    // A diff window ending exactly at the collision ts includes the WHOLE
    // sibling group, and the follow-up window starting there drops none.
    const before = await c.graphDiff({
      scope: "wt-main",
      from: collisionTs! - 1,
      to: collisionTs!,
    });
    for (const sibling of group) {
      expect(before.deltas.some((d) => d.seq === sibling.seq)).toBe(true);
    }
    const after = await c.graphDiff({
      scope: "wt-main",
      from: collisionTs!,
      to: mock.maxEventTs,
    });
    const seqs = new Set(after.deltas.map((d) => d.seq));
    for (const sibling of group) {
      expect(seqs.has(sibling.seq)).toBe(false);
    }
    expect(after.deltas[0]?.seq).toBe(group[group.length - 1].seq + 1);
  });

  it("gates degraded tier CONTENT, not just the block (011)", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    const c = client(mock);
    const constellation = await c.graphQuery({
      scope: "wt-main",
      granularity: "feature",
    });
    // Fixture meta-edges aggregate semantic-only breakdowns: all gated.
    expect(constellation.edges).toHaveLength(0);
    const asof = await c.graphAsof({ scope: "wt-main", t: mock.maxEventTs });
    expect(asof.edges.some((e) => e.tier === "semantic")).toBe(false);
    mock.degrade("semantic", null);
    expect(
      (await c.graphQuery({ scope: "wt-main", granularity: "feature" })).edges.length,
    ).toBeGreaterThan(0);
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

  it("serves an empty corpus end-to-end under no-vault, git still live (035)", async () => {
    const mock = new MockEngine();
    mock.setNoVault(true);
    const c = client(mock);
    expect(
      (await c.graphQuery({ scope: "wt-main", granularity: "feature" })).nodes,
    ).toHaveLength(0);
    expect((await c.vaultTree("wt-main")).entries).toHaveLength(0);
    expect((await c.status()).nodes).toBe(0);
    const events = await c.events({ scope: "wt-main" });
    expect(events.events!.length).toBeGreaterThan(0);
    expect(events.events!.every((e) => e.kind === "commit")).toBe(true);
    mock.setNoVault(false);
    expect(
      (await c.graphQuery({ scope: "wt-main", granularity: "feature" })).nodes.length,
    ).toBeGreaterThan(0);
  });

  it("drops lifecycle-lane events under date-mandate-missing (035)", async () => {
    const mock = new MockEngine();
    mock.setLifecycleSparse(true);
    const events = await client(mock).events({ scope: "wt-main" });
    expect(events.events!.some((e) => e.kind === "step-checked")).toBe(false);
    expect(events.events!.some((e) => e.kind === "commit")).toBe(true);
    expect(events.events!.some((e) => e.kind.startsWith("doc-"))).toBe(true);
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
