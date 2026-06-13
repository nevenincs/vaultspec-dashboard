// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveStatusStore } from "./liveStatus";
import type { StreamChunk } from "./queries";
import { engineKeys } from "./queries";
import { maxSeq, useGraphLiveSync } from "./graphSync";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("maxSeq", () => {
  it("returns the highest seq, or null when none carry one", () => {
    expect(maxSeq(undefined)).toBeNull();
    expect(maxSeq([])).toBeNull();
    expect(
      maxSeq([
        { channel: "graph", data: { seq: 3 } },
        { channel: "graph", data: { seq: 7 } },
        { channel: "graph", data: { seq: 5 } },
      ]),
    ).toBe(7);
    expect(maxSeq([{ channel: "backends", data: { rag: "up" } }])).toBeNull();
  });
});

describe("useGraphLiveSync", () => {
  afterEach(() => useLiveStatusStore.getState().reset());

  it("advances lastSeq + marks connected immediately, and debounces invalidation to one trailing refetch (P-HIGH-1)", () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const chunks: StreamChunk[] = [
        { channel: "graph", data: { seq: 4, op: "add" } },
        { channel: "graph", data: { seq: 6, op: "change" } },
      ];
      // Seed the stream query (staleTime Infinity => useQuery returns it, no fetch).
      client.setQueryData(engineKeys.stream(["graph"], undefined), chunks);
      const invalidate = vi.spyOn(client, "invalidateQueries");

      renderHook(() => useGraphLiveSync("scopeA", true), { wrapper: wrapper(client) });

      // The cheap signals are immediate...
      expect(useLiveStatusStore.getState().lastSeq).toBe(6);
      expect(useLiveStatusStore.getState().streamConnected).toBe(true);
      // ...but the invalidation is debounced, not fired per delta (the fix).
      expect(invalidate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "graph", "scopeA"],
          exact: false,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays inert while disabled (time-travel owns the scene)", () => {
    const client = new QueryClient();
    client.setQueryData(engineKeys.stream(["graph"], undefined), [
      { channel: "graph", data: { seq: 9 } },
    ]);
    renderHook(() => useGraphLiveSync("scopeA", false), { wrapper: wrapper(client) });
    expect(useLiveStatusStore.getState().lastSeq).toBeNull();
    expect(useLiveStatusStore.getState().streamConnected).toBeNull();
  });

  // --- spliceLive path (constellation-live-delta S06/S07) ---

  it("since=keyframeSeq produces a different stream cache key from no-since", () => {
    const keyWithSince = engineKeys.stream(["graph"], 42);
    const keyNoSince = engineKeys.stream(["graph"], undefined);
    // Keys must differ so the two subscriptions never share cached data
    // (stream-01 adversarial property).
    expect(keyWithSince).not.toEqual(keyNoSince);
    expect(Array.isArray(keyWithSince)).toBe(true);
    expect(Array.isArray(keyNoSince)).toBe(true);
  });

  it("returns featureDeltas for granularity=feature chunks when keyframeSeq is provided", () => {
    const client = new QueryClient();
    const chunks: StreamChunk[] = [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:auth", kind: "feature" },
          t: 1000,
          seq: 11,
        },
      },
      {
        channel: "graph",
        data: {
          // document-granularity delta — must NOT appear in featureDeltas
          granularity: "document",
          op: "add",
          edge: { id: "e1", src: "a", dst: "b", relation: "declares", tier: "declared", confidence: 1 },
          t: 1001,
          seq: 12,
        },
      },
    ];
    client.setQueryData(engineKeys.stream(["graph"], 10), chunks);

    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
      wrapper: wrapper(client),
    });

    expect(result.current.featureDeltas).toHaveLength(1);
    expect(result.current.featureDeltas[0]).toMatchObject({
      granularity: "feature",
      op: "add",
      seq: 11,
    });
    expect(result.current.gapCount).toBe(0);
  });

  it("returns featureDeltas without gap detection when keyframeSeq is null", () => {
    const client = new QueryClient();
    const chunks: StreamChunk[] = [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:ux", kind: "feature" },
          t: 2000,
          seq: 99,
        },
      },
    ];
    // Without keyframeSeq, subscribes at live tail (undefined cache key)
    client.setQueryData(engineKeys.stream(["graph"], undefined), chunks);

    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, null), {
      wrapper: wrapper(client),
    });

    expect(result.current.featureDeltas).toHaveLength(1);
    // seq=99 with no baseline — no false gap detection
    expect(result.current.gapCount).toBe(0);
  });

  it("increments gapCount on seq discontinuity and clears featureDeltas", () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      // keyframeSeq=10, first delta seq=15 — skips 11,12,13,14
      const chunks: StreamChunk[] = [
        {
          channel: "graph",
          data: {
            granularity: "feature",
            op: "add",
            node: { id: "feature:ux", kind: "feature" },
            t: 1000,
            seq: 15,
          },
        },
      ];
      client.setQueryData(engineKeys.stream(["graph"], 10), chunks);
      const invalidate = vi.spyOn(client, "invalidateQueries");

      const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
        wrapper: wrapper(client),
      });

      expect(result.current.gapCount).toBe(1);
      expect(result.current.featureDeltas).toHaveLength(0);
      // Debounced invalidation still fires for all deltas regardless of gap
      vi.advanceTimersByTime(200);
      expect(invalidate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not flag a gap when the first feature delta arrives right after keyframeSeq", () => {
    const client = new QueryClient();
    const chunks: StreamChunk[] = [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:auth", kind: "feature" },
          t: 1000,
          seq: 11, // exactly keyframeSeq(10) + 1
        },
      },
    ];
    client.setQueryData(engineKeys.stream(["graph"], 10), chunks);

    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
      wrapper: wrapper(client),
    });

    expect(result.current.gapCount).toBe(0);
    expect(result.current.featureDeltas).toHaveLength(1);
  });
});
