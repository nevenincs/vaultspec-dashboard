import { describe, expect, it } from "vitest";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { MockEngine } from "../../testing/mockEngine";
import { EngineClient } from "./engine";
import { engineKeys, parseSseFrames, sseChunks, stableKey } from "./queries";

describe("stableKey", () => {
  it("is order-insensitive for object keys and drops undefined", () => {
    expect(stableKey({ b: 1, a: 2 })).toBe(stableKey({ a: 2, b: 1 }));
    expect(stableKey({ a: 1, gone: undefined })).toBe(stableKey({ a: 1 }));
    expect(stableKey(undefined)).toBe("");
  });
});

describe("engineKeys", () => {
  it("keys graph slices by the (scope, filter, as-of, granularity) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { semantic: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { semantic: false } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Defaults: as-of "live", granularity "document" (the engine's default).
    expect(d[d.length - 2]).toBe("live");
    expect(d[d.length - 1]).toBe("document");
    // Granularity is part of the cache identity: the constellation (feature)
    // and a document slice never collide in cache.
    const feature = engineKeys.graph("wt-1", undefined, undefined, "feature");
    const document = engineKeys.graph("wt-1", undefined, undefined, "document");
    expect(feature).not.toEqual(document);
    expect(feature[feature.length - 1]).toBe("feature");
  });
});

describe("parseSseFrames", () => {
  it("parses completed frames and keeps the remainder", () => {
    const { frames, rest } = parseSseFrames(
      'event: graph\ndata: {"seq":1}\n\nevent: git\ndata: {"head":"abc"}\n\nevent: graph\ndata: {"se',
    );
    expect(frames).toEqual([
      { channel: "graph", data: { seq: 1 } },
      { channel: "git", data: { head: "abc" } },
    ]);
    expect(rest).toContain('data: {"se');
  });

  it("passes non-JSON data through as text", () => {
    const { frames } = parseSseFrames("data: plain\n\n");
    expect(frames).toEqual([{ channel: "message", data: "plain" }]);
  });
});

describe("sseChunks over the mock engine stream", () => {
  it("yields replayed graph deltas in sequence order from since=", async () => {
    const mock = new MockEngine();
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
    const since = mock.lastSeq - 3;
    const response = await client.openStream(["graph"], since);
    const seqs: number[] = [];
    for await (const chunk of sseChunks(response)) {
      seqs.push((chunk.data as { seq: number }).seq);
      if (seqs.length === 3) break;
    }
    expect(seqs).toEqual([since + 1, since + 2, since + 3]);
  });

  it("delivers live pushes on subscribed channels only", async () => {
    const mock = new MockEngine();
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
    const response = await client.openStream(["backends"]);
    const received: unknown[] = [];
    const consume = (async () => {
      for await (const chunk of sseChunks(response)) {
        received.push(chunk);
        break;
      }
    })();
    // Give the stream a tick to subscribe, then push.
    await new Promise((r) => setTimeout(r, 0));
    mock.push("git", { head: "ignored" });
    mock.push("backends", { rag: "stopped" });
    await consume;
    expect(received).toEqual([{ channel: "backends", data: { rag: "stopped" } }]);
  });

  it("throws StreamLostError on a non-ok stream response (ADR D2)", async () => {
    const badResponse = new Response("nope", { status: 503 });
    await expect(async () => {
      for await (const _chunk of sseChunks(badResponse)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });

  it("throws StreamLostError when the body read fails mid-stream", async () => {
    const failingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const response = new Response(failingBody, { status: 200 });
    await expect(async () => {
      for await (const _chunk of sseChunks(response)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });
});
