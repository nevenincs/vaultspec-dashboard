import { beforeEach, describe, expect, it } from "vitest";

import type { FetchLike } from "./engine";
import { EngineClient, EngineError } from "./engine";
import { resetDrainProgress, useDrainProgressStore } from "./drainProgress";

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
  beforeEach(() => resetDrainProgress());

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
      "/api/vault-tree?scope=wt-1&page_size=200",
      "/api/graph/query",
      "/api/filters?scope=wt-1",
      "/api/nodes/feature%3Aa?scope=wt-1",
      "/api/nodes/feature%3Aa/neighbors?scope=wt-1&depth=1",
      "/api/nodes/feature%3Aa/evidence?scope=wt-1",
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
      "/api/ops/core/vault-check",
      "/api/ops/rag/reindex",
      "/api/search",
    ]);
  });

  it("posts the corpus target as the wire field `type`, not `target`", async () => {
    // The engine's SearchBody reads the corpus from `type` (#[serde(rename =
    // "type")]). A `target` key is silently dropped and the search defaults to
    // the vault corpus, so the code target never reaches rag. This asserts the
    // serialized body carries `type` and no stray `target`.
    const { calls, fetchImpl } = recordingFetch({
      data: { results: [] },
      tiers: {},
    });
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });
    await client.search({ query: "timeline", target: "code" });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.type).toBe("code");
    expect(body).not.toHaveProperty("target");
    // An omitted target posts neither key (the engine then defaults to vault).
    await client.search({ query: "auth" });
    const plain = JSON.parse(String(calls[1].init?.body));
    expect(plain).not.toHaveProperty("type");
    expect(plain).not.toHaveProperty("target");
  });

  it("walks the vault-tree cursor to completion so the rail holds the whole listing", async () => {
    // The rail narrows the vault tree client-side, so a partial first page would
    // silently drop every feature whose documents sit beyond it (Issue #6: most
    // feature selections emptied the rail). vaultTree must follow `next_cursor`
    // until exhausted and concatenate every page's entries.
    const pages = [
      {
        data: { entries: [{ stem: "a-S01", doc_type: "exec", feature_tags: ["a"] }] },
        tiers: {},
        next_cursor: "a-S01",
      },
      {
        data: { entries: [{ stem: "b-S01", doc_type: "exec", feature_tags: ["b"] }] },
        tiers: {},
      },
    ];
    const calls: { url: string }[] = [];
    let page = 0;
    const fetchImpl: FetchLike = (url) => {
      calls.push({ url });
      const body = pages[Math.min(page, pages.length - 1)];
      page += 1;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });

    const tree = await client.vaultTree("wt-1");

    expect(calls.map((c) => c.url)).toEqual([
      // First page is deliberately small (progressive first paint, ADR D5);
      // continuation pages use the route max.
      "/api/vault-tree?scope=wt-1&page_size=200",
      "/api/vault-tree?scope=wt-1&page_size=2000&cursor=a-S01",
    ]);
    expect(tree.entries.map((e) => e.feature_tags[0])).toEqual(["a", "b"]);
    expect(tree.complete).toBe(true);
  });

  it("hands out honest partial prefixes while the vault-tree drain continues (ADR D5)", async () => {
    // Narrow-during-drain guard (universal-data-loading): each onPartial batch is
    // the accumulated PREFIX marked complete:false — the rail can render and even
    // narrow it, but the flag keeps the affordance honest until the resolved
    // whole listing (complete:true) replaces it. A match beyond the loaded prefix
    // is never silently absent from the COMPLETE set.
    const pages = [
      {
        data: { entries: [{ stem: "a-S01", doc_type: "exec", feature_tags: ["a"] }] },
        tiers: {},
        next_cursor: "a-S01",
      },
      {
        data: { entries: [{ stem: "b-S01", doc_type: "exec", feature_tags: ["b"] }] },
        tiers: {},
        next_cursor: "b-S01",
      },
      {
        data: { entries: [{ stem: "c-S01", doc_type: "exec", feature_tags: ["c"] }] },
        tiers: {},
      },
    ];
    let page = 0;
    const fetchImpl: FetchLike = () => {
      const body = pages[Math.min(page, pages.length - 1)];
      page += 1;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });
    const partials: { count: number; complete: boolean | undefined }[] = [];

    const tree = await client.vaultTree("wt-1", (partial) => {
      partials.push({ count: partial.entries.length, complete: partial.complete });
    });

    // One partial per page that still had a cursor, each a growing prefix.
    expect(partials).toEqual([
      { count: 1, complete: false },
      { count: 2, complete: false },
    ]);
    expect(tree.entries).toHaveLength(3);
    expect(tree.complete).toBe(true);
    // The drain-progress entry never outlives the walk (settled on resolve).
    expect(useDrainProgressStore.getState().drains["vault-tree:wt-1"]).toBeUndefined();
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

  it("posts the explicit scope through the retained archive maintenance op", async () => {
    const { calls, fetchImpl } = recordingFetch({
      data: { envelope: { status: "archived", data: {} } },
      tiers: {},
    });
    const client = new EngineClient({ baseUrl: "/api", fetchImpl });

    await client.opsCoreArchive({ scope: "wt-1", feature: "scope-boundary" });

    expect(calls.map((call) => call.url)).toEqual(["/api/ops/core/archive"]);
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ scope: "wt-1", feature: "scope-boundary" }),
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
