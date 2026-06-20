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
    await client.node("feature:a", "wt-1");
    await client.nodeNeighbors("feature:a", { scope: "wt-1", depth: 1 });
    await client.nodeEvidence("feature:a", "wt-1");
    await client.discover("feature:a", "wt-1");
    await client.events({ scope: "wt-1", bucket: "auto" });
    await client.graphAsof({ scope: "wt-1", t: 123 });
    await client.graphDiff({ scope: "wt-1", from: 1, to: 2 });
    await client.status();
    await client.opsCore("vault-check");
    await client.opsRag("reindex");
    await client.search({ query: "auth" });
    await client.pipeline("wt-1");
    await client.planInterior("feature:a", "wt-1");

    const urls = calls.map((c) => c.url);
    expect(urls).toEqual([
      "/api/map",
      "/api/vault-tree?scope=wt-1",
      "/api/graph/query",
      "/api/filters?scope=wt-1",
      "/api/nodes/feature%3Aa?scope=wt-1",
      "/api/nodes/feature%3Aa/neighbors?scope=wt-1&depth=1",
      "/api/nodes/feature%3Aa/evidence?scope=wt-1",
      "/api/nodes/feature%3Aa/discover",
      "/api/events?scope=wt-1&bucket=auto",
      "/api/graph/asof?scope=wt-1&t=123",
      "/api/graph/diff?scope=wt-1&from=1&to=2",
      "/api/status",
      "/api/ops/core/vault-check",
      "/api/ops/rag/reindex",
      "/api/search",
      "/api/pipeline?scope=wt-1",
      "/api/nodes/feature%3Aa/plan-interior?scope=wt-1",
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
    expect(calls.find((c) => c.url.endsWith("/discover"))?.init?.body).toBe(
      JSON.stringify({ scope: "wt-1" }),
    );
  });

  it("builds the multiplexed stream URL with splice resume (§7)", () => {
    const client = new EngineClient({ baseUrl: "/api" });
    expect(client.streamUrl(["graph", "git"], 42)).toBe(
      "/api/stream?channels=graph%2Cgit&since=42",
    );
    expect(client.streamUrl(["backends"])).toBe("/api/stream?channels=backends");
  });

  it("posts the explicit scope through read-only git ops", async () => {
    const { calls, fetchImpl } = recordingFetch({
      data: { verb: "diff", output: "diff --git a/x b/x\n" },
      tiers: {},
    });
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });

    await client.opsGit("diff", { scope: "wt-1", path: "src/app.ts" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/ops/git/diff");
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ scope: "wt-1", path: "src/app.ts" }),
    );
  });

  it("posts the explicit scope through document write and create ops", async () => {
    const { calls, fetchImpl } = recordingFetch({
      data: { envelope: { status: "updated", data: {} } },
      tiers: {},
    });
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });

    await client.opsCoreWrite("set-body", {
      scope: "wt-1",
      ref: "2026-06-17-plan",
      body: "# plan\n",
      expected_blob_hash: "c245aabbccddeeff00112233445566778899aabb",
    });
    await client.opsCoreCreate({
      scope: "wt-1",
      doc_type: "plan",
      feature: "scope-boundary",
    });

    expect(calls.map((call) => call.url)).toEqual([
      "/api/ops/core/set-body/write",
      "/api/ops/core/create",
    ]);
    expect(calls[0].init?.body).toBe(
      JSON.stringify({
        scope: "wt-1",
        ref: "2026-06-17-plan",
        body: "# plan\n",
        expected_blob_hash: "c245aabbccddeeff00112233445566778899aabb",
      }),
    );
    expect(calls[1].init?.body).toBe(
      JSON.stringify({
        scope: "wt-1",
        doc_type: "plan",
        feature: "scope-boundary",
      }),
    );
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
