import { describe, expect, it } from "vitest";

import type { FetchLike } from "./engine";
import { EngineClient, EngineError } from "./engine";

function recordingFetch(payload: unknown = { ok: true }, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { calls, fetchImpl };
}

describe("EngineClient", () => {
  it("covers every contract query family with the right path and method", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });

    await client.map();
    await client.vaultTree("wt-1");
    await client.graphQuery({ scope: "wt-1" });
    await client.filters("wt-1");
    await client.node("feature:a");
    await client.nodeNeighbors("feature:a", { depth: 1 });
    await client.nodeEvidence("feature:a");
    await client.discover("feature:a");
    await client.events({ scope: "wt-1", bucket: "auto" });
    await client.graphAsof({ scope: "wt-1", t: 123 });
    await client.graphDiff({ scope: "wt-1", from: 1, to: 2 });
    await client.status();
    await client.opsCore("vault-check");
    await client.opsRag("reindex");
    await client.search({ query: "auth" });

    const urls = calls.map((c) => c.url);
    expect(urls).toEqual([
      "/api/map",
      "/api/vault-tree?scope=wt-1",
      "/api/graph/query",
      "/api/filters?scope=wt-1",
      "/api/nodes/feature%3Aa",
      "/api/nodes/feature%3Aa/neighbors?depth=1",
      "/api/nodes/feature%3Aa/evidence",
      "/api/nodes/feature%3Aa/discover",
      "/api/events?scope=wt-1&bucket=auto",
      "/api/graph/asof?scope=wt-1&t=123",
      "/api/graph/diff?scope=wt-1&from=1&to=2",
      "/api/status",
      "/api/ops/core/vault-check",
      "/api/ops/rag/reindex",
      "/api/search",
    ]);
    // Mutating families post; reads get.
    const posts = calls.filter((c) => c.init?.method === "POST").map((c) => c.url);
    expect(posts).toEqual([
      "/api/graph/query",
      "/api/nodes/feature%3Aa/discover",
      "/api/ops/core/vault-check",
      "/api/ops/rag/reindex",
      "/api/search",
    ]);
  });

  it("builds the multiplexed stream URL with splice resume (§7)", () => {
    const client = new EngineClient({ baseUrl: "/api" });
    expect(client.streamUrl(["graph", "git"], 42)).toBe(
      "/api/stream?channels=graph%2Cgit&since=42",
    );
    expect(client.streamUrl(["backends"])).toBe("/api/stream?channels=backends");
  });

  it("throws a typed EngineError on non-2xx", async () => {
    const { fetchImpl } = recordingFetch({ error: "down" }, 502);
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });
    await expect(client.status()).rejects.toThrowError(EngineError);
    await expect(client.status()).rejects.toMatchObject({
      status: 502,
      path: "/status",
    });
  });
});
