// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { StreamLostError } from "../../../platform/policy/failurePolicy";
import { assertBounded, syntheticGraphDeltas } from "../../../testing/adverse";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import {
  STREAM_RETENTION,
  engineKeys,
  latestBackendSignalSignature,
  normalizeBackendSignalChannel,
  normalizeEngineStreamChannel,
  normalizeEngineStreamChannels,
  normalizeEngineStreamIdentity,
  normalizeEngineStreamScope,
  normalizeEngineStreamSince,
  parseSseFrames,
  sseChunks,
  streamReducer,
  type StreamChunk,
} from "./index";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("backend-signal status refresh identity", () => {
  it("normalizes engine stream identity before query keys or subscriptions", () => {
    expect(normalizeEngineStreamChannel(" graph ")).toBe("graph");
    expect(normalizeEngineStreamChannel("fs")).toBeNull();
    expect(normalizeEngineStreamChannel(null)).toBeNull();
    expect(
      normalizeEngineStreamChannels([" git ", "graph", "backends", "git", "message"]),
    ).toEqual(["backends", "git", "graph"]);
    expect(normalizeEngineStreamSince(42.9)).toBe(42);
    expect(normalizeEngineStreamSince(-1)).toBeUndefined();
    expect(normalizeEngineStreamSince(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeEngineStreamScope(" wt-1 ")).toBe("wt-1");
    expect(normalizeEngineStreamScope("   ")).toBeUndefined();
    expect(
      normalizeEngineStreamIdentity([" git ", "backends", "git"], 10.2, " wt-1 "),
    ).toEqual({
      channels: ["backends", "git"],
      since: 10,
      scope: "wt-1",
    });
  });

  it("coalesces semantically identical stream query keys", () => {
    expect(engineKeys.stream(["git", "backends"], 10.8, " wt-1 ")).toEqual(
      engineKeys.stream([" backends ", "git", "git"], 10, "wt-1"),
    );
    expect(engineKeys.stream(["graph"], undefined, " wt-1 ")).toEqual([
      ...engineKeys.all,
      "stream",
      "graph",
      "live",
      "wt-1",
    ]);
    expect(engineKeys.stream(["fs", "message"], -1, "   ")).toEqual([
      ...engineKeys.all,
      "stream",
      "",
      "live",
      "active",
    ]);
  });

  it("uses the latest backend/git values rather than accumulator length", () => {
    const saturated = Array.from({ length: STREAM_RETENTION }, (_, i) => ({
      channel: i % 2 === 0 ? "backends" : "git",
      data: i % 2 === 0 ? { rag: "running" } : { dirty: false },
    }));
    const sameLengthDifferentValue = [
      ...saturated.slice(1),
      { channel: "git", data: { dirty: true } },
    ];

    expect(latestBackendSignalSignature(saturated)).not.toEqual(
      latestBackendSignalSignature(sameLengthDifferentValue),
    );
  });

  it("normalizes backend-signal channels before deriving the refresh signature", () => {
    expect(normalizeBackendSignalChannel(" git ")).toBe("git");
    expect(normalizeBackendSignalChannel("backends")).toBe("backends");
    expect(normalizeBackendSignalChannel("graph")).toBeNull();
    expect(normalizeBackendSignalChannel(null)).toBeNull();

    expect(
      latestBackendSignalSignature([
        { channel: "graph", data: { generation: 2 } },
        { channel: " git ", data: { dirty: true } },
        { channel: "message", data: { ignored: true } },
      ]),
    ).toBe('backends:|git:{"dirty":true}');
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

describe("sseChunks stream failure handling", () => {
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

describe("streamReducer bounded growth (P-HIGH-6)", () => {
  it("ring-caps the accumulator under a long delta storm and keeps the latest seq", () => {
    // Without the cap this accumulator would hold all 10_000 chunks for the
    // session (HIGH-6). The reducer must retain only the tail window.
    let acc: StreamChunk[] = [];
    for (const delta of syntheticGraphDeltas(10_000)) {
      acc = streamReducer(acc, { channel: "graph", data: delta });
    }
    assertBounded(acc.length, STREAM_RETENTION, "stream accumulator");
    expect(acc.length).toBe(STREAM_RETENTION);
    // The latest seq is always retained, so consumers' maxSeq stays correct.
    const seqs = acc.map((chunk) => (chunk.data as { seq: number }).seq);
    expect(Math.max(...seqs)).toBe(10_000);
  });

  it("still dedups a repeated seq within the window", () => {
    const frame: StreamChunk = { channel: "graph", data: { op: "add", seq: 7 } };
    let acc: StreamChunk[] = [];
    acc = streamReducer(acc, frame);
    acc = streamReducer(acc, frame);
    expect(acc).toHaveLength(1);
  });
});
