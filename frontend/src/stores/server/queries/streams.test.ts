// @vitest-environment happy-dom
// Split from queries.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamLostError } from "../../../platform/policy/failurePolicy";
import { assertBounded, syntheticGraphDeltas } from "../../../testing/adverse";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import {
  acquireSseChunks,
  MAX_SSE_INCOMPLETE_BYTES,
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
  it("throws StreamLostError on a non-ok stream response", async () => {
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

  it("keeps a non-owner AbortError classified as stream loss", async () => {
    const failingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new DOMException("foreign abort", "AbortError"));
      },
    });
    await expect(async () => {
      for await (const _chunk of sseChunks(
        new Response(failingBody, { status: 200 }),
      )) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });

  it("throws StreamLostError on clean EOF so a mounted query reconnects", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('event: progress\ndata: {"seq":7}\n\n'),
          );
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const received: StreamChunk[] = [];

    await expect(async () => {
      for await (const frame of sseChunks(response)) received.push(frame);
    }).rejects.toBeInstanceOf(StreamLostError);
    expect(received).toEqual([{ channel: "progress", data: { seq: 7 } }]);
  });

  it("aborts a delimiter-free stream once its incomplete remainder crosses the byte ceiling", async () => {
    const fragment = new Uint8Array(64 * 1024).fill("x".charCodeAt(0));
    const fragmentCount = Math.floor(MAX_SSE_INCOMPLETE_BYTES / fragment.length) + 1;
    const runawayBody = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < fragmentCount; index++) {
          controller.enqueue(fragment);
        }
        controller.close();
      },
    });
    const response = new Response(runawayBody, { status: 200 });

    await expect(async () => {
      for await (const _chunk of sseChunks(response)) {
        void _chunk;
      }
    }).rejects.toThrow("graph stream frame exceeds byte ceiling");
  });

  it("drains many completed frames without treating total stream bytes as one frame", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 512; index++) {
          controller.enqueue(
            encoder.encode(`event: graph\ndata: {"seq":${index}}\n\n`),
          );
        }
        controller.close();
      },
    });
    const seen: number[] = [];
    await expect(async () => {
      for await (const chunk of sseChunks(new Response(body, { status: 200 }))) {
        seen.push((chunk.data as { seq: number }).seq);
      }
    }).rejects.toBeInstanceOf(StreamLostError);
    expect(seen).toHaveLength(512);
    expect(seen.at(-1)).toBe(511);
  });
});

describe("two-phase SSE cancellation", () => {
  it("does not acquire a response for an already-aborted owner", async () => {
    const owner = new AbortController();
    owner.abort();
    let acquisitions = 0;

    const iterator = acquireSseChunks(async () => {
      acquisitions += 1;
      return new Response();
    }, owner.signal);

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(acquisitions).toBe(0);
  });

  it("aborts pending response acquisition and completes owner cancellation normally", async () => {
    const owner = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const iterator = acquireSseChunks((signal) => {
      requestSignal = signal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }, owner.signal);

    const pending = iterator.next();
    await Promise.resolve();
    owner.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(requestSignal?.aborted).toBe(true);
  });

  it("hands post-header cancellation to the reader exactly once", async () => {
    const owner = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: graph\ndata: {"seq":1}\n\n'),
        );
      },
      cancel() {
        cancellations += 1;
      },
    });
    const iterator = acquireSseChunks(async (signal) => {
      requestSignal = signal;
      return new Response(body, { status: 200 });
    }, owner.signal);

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { channel: "graph", data: { seq: 1 } },
    });
    owner.abort();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    await expect(iterator.return()).resolves.toEqual({ done: true, value: undefined });

    expect(requestSignal?.aborted).toBe(false);
    expect(cancellations).toBe(1);
  });

  it("does not yield buffered frames after owner cancellation", async () => {
    const owner = new AbortController();
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: graph\ndata: {"seq":1}\n\nevent: graph\ndata: {"seq":2}\n\n',
          ),
        );
      },
      cancel() {
        cancellations += 1;
      },
    });
    const iterator = acquireSseChunks(
      async () => new Response(body, { status: 200 }),
      owner.signal,
    );

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { channel: "graph", data: { seq: 1 } },
    });
    owner.abort();

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(cancellations).toBe(1);
  });

  it("removes the owner listener after an early consumer return", async () => {
    const owner = new AbortController();
    const addListener = vi.spyOn(owner.signal, "addEventListener");
    const removeListener = vi.spyOn(owner.signal, "removeEventListener");
    let cancellations = 0;
    const iterator = acquireSseChunks(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('event: graph\ndata: {"seq":1}\n\n'),
              );
            },
            cancel() {
              cancellations += 1;
            },
          }),
          { status: 200 },
        ),
      owner.signal,
    );

    await iterator.next();
    await iterator.return();
    expect(cancellations).toBe(1);
    const abortListeners = addListener.mock.calls
      .filter(([type]) => type === "abort")
      .map(([, listener]) => listener);
    expect(abortListeners).toHaveLength(2);
    for (const listener of abortListeners) {
      expect(removeListener).toHaveBeenCalledWith("abort", listener);
    }
    owner.abort();
    await Promise.resolve();
    expect(cancellations).toBe(1);
  });

  it("keeps cancellation bookkeeping constant across a long stream", async () => {
    const owner = new AbortController();
    const encoder = new TextEncoder();
    let cancellations = 0;
    let sequence = 0;
    let cancelled = false;
    const reader = {
      async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
        if (cancelled) return { done: true, value: undefined };
        sequence += 1;
        return {
          done: false,
          value: encoder.encode(`event: graph\ndata: {"seq":${sequence}}\n\n`),
        };
      },
      async cancel() {
        cancelled = true;
        cancellations += 1;
      },
    };
    const response = {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    } as unknown as Response;
    const iterator = acquireSseChunks(async () => response, owner.signal);
    const raceDescriptor = Object.getOwnPropertyDescriptor(Promise, "race");
    const nativeRace = Promise.race.bind(Promise);
    let cancellationRaces = 0;
    let consumed = 0;
    Object.defineProperty(Promise, "race", {
      ...raceDescriptor,
      value: <T>(values: Iterable<T | PromiseLike<T>>) => {
        cancellationRaces += 1;
        return nativeRace(values);
      },
    });

    try {
      for (let index = 0; index < 1_024; index++) {
        const result = await iterator.next();
        if (!result.done) consumed += 1;
      }
      owner.abort();
      await iterator.next();
    } finally {
      Object.defineProperty(Promise, "race", raceDescriptor!);
    }

    expect(consumed).toBe(1_024);
    expect(sequence).toBe(1_024);
    expect(cancellations).toBe(1);
    expect(cancellationRaces).toBe(0);
  });

  it("resolves a headers-then-abort race through reader cancellation", async () => {
    const owner = new AbortController();
    let settleResponse: ((response: Response) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    let cancellations = 0;
    const iterator = acquireSseChunks((signal) => {
      requestSignal = signal;
      return new Promise<Response>((resolve) => {
        settleResponse = resolve;
      });
    }, owner.signal);
    const pending = iterator.next();
    await Promise.resolve();
    settleResponse?.(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancellations += 1;
          },
        }),
        { status: 200 },
      ),
    );
    await Promise.resolve();
    owner.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(requestSignal?.aborted).toBe(false);
    expect(cancellations).toBe(1);
  });

  it("surfaces reader cancellation failure and removes the owner listener", async () => {
    const owner = new AbortController();
    const cancellationFailure = new Error("reader cancellation failed");
    let cancellations = 0;
    const iterator = acquireSseChunks(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancellations += 1;
              throw cancellationFailure;
            },
          }),
          { status: 200 },
        ),
      owner.signal,
    );
    const pending = iterator.next();
    await Promise.resolve();
    owner.abort();

    await expect(pending).rejects.toBe(cancellationFailure);
    await expect(iterator.return()).resolves.toEqual({ done: true, value: undefined });
    expect(cancellations).toBe(1);
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
