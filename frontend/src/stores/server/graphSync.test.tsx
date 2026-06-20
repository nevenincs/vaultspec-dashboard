// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphDeltaEntry } from "./engine";
import { useLiveStatusStore } from "./liveStatus";
import type { StreamChunk } from "./queries";
import { GRAPH_GENERATION_QUERY_SUBTREES, engineKeys } from "./queries";
import {
  GRAPH_FEATURE_DELTAS_CAP,
  GRAPH_LIVE_GAP_COUNT_MAX,
  maxSeq,
  normalizeGraphFeatureDeltas,
  normalizeGraphLiveGapCount,
  normalizeGraphLiveEnabled,
  normalizeGraphLiveKeyframeSeq,
  normalizeGraphLiveScope,
  resetGraphLiveDeltaState,
  useGraphLiveDeltaStore,
  useGraphLiveDeltaView,
  useGraphLiveSync,
} from "./graphSync";

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

describe("graph live delta store seam", () => {
  beforeEach(() => resetGraphLiveDeltaState());
  afterEach(() => resetGraphLiveDeltaState());

  it("normalizes feature deltas to finite feature entries and a bounded newest batch", () => {
    const feature = (seq: number): GraphDeltaEntry => ({
      granularity: "feature",
      op: "add",
      node: { id: `feature:${seq}`, kind: "feature" },
      t: seq,
      seq,
    });
    const normalized = normalizeGraphFeatureDeltas([
      { granularity: "document", op: "add", t: 0, seq: 0 } as never,
      { granularity: "feature", op: "add", t: 1, seq: Number.NaN } as never,
      ...Array.from({ length: GRAPH_FEATURE_DELTAS_CAP + 3 }, (_, i) => feature(i)),
    ] as never);

    expect(normalized).toHaveLength(GRAPH_FEATURE_DELTAS_CAP);
    expect(normalized[0]?.seq).toBe(3);
    expect(normalized.at(-1)?.seq).toBe(GRAPH_FEATURE_DELTAS_CAP + 2);
    expect(normalized.every((delta) => delta.granularity === "feature")).toBe(true);
    expect(normalizeGraphFeatureDeltas({ deltas: [] })).toEqual([]);
  });

  it("copies and normalizes feature delta batches at the store boundary", () => {
    const deltas: GraphDeltaEntry[] = [
      {
        granularity: "feature",
        op: "add",
        node: { id: "feature:owned", kind: "feature" },
        t: 1000,
        seq: 11,
      },
    ];

    useGraphLiveDeltaStore.getState().setLifecycle("scopeA", 10);
    useGraphLiveDeltaStore.getState().setFeatureDeltas(deltas);
    deltas.push({
      granularity: "feature",
      op: "add",
      node: { id: "feature:late", kind: "feature" },
      t: 1001,
      seq: 12,
    });

    expect(useGraphLiveDeltaStore.getState().featureDeltas).toHaveLength(1);
    expect(useGraphLiveDeltaStore.getState().featureDeltas[0]?.seq).toBe(11);

    useGraphLiveDeltaStore.getState().setFeatureDeltas({ deltas });
    expect(useGraphLiveDeltaStore.getState().featureDeltas).toEqual([]);
  });

  it("bounds graph live gap counts at the store boundary", () => {
    expect(normalizeGraphLiveGapCount(Number.NaN)).toBe(0);
    expect(normalizeGraphLiveGapCount(-1)).toBe(0);
    expect(normalizeGraphLiveGapCount(1.8)).toBe(1);
    expect(normalizeGraphLiveGapCount(GRAPH_LIVE_GAP_COUNT_MAX + 5)).toBe(
      GRAPH_LIVE_GAP_COUNT_MAX,
    );

    useGraphLiveDeltaStore.setState({
      scope: "scopeA",
      keyframeSeq: 10,
      featureDeltas: [],
      gapCount: GRAPH_LIVE_GAP_COUNT_MAX,
    });
    useGraphLiveDeltaStore.getState().incrementGap();
    expect(useGraphLiveDeltaStore.getState().gapCount).toBe(
      GRAPH_LIVE_GAP_COUNT_MAX,
    );
  });

  it("normalizes live scope and keyframe identity at the store boundary", () => {
    expect(normalizeGraphLiveScope(" scopeA ")).toBe("scopeA");
    expect(normalizeGraphLiveScope("   ")).toBeNull();
    expect(normalizeGraphLiveScope({ scope: "scopeA" })).toBeNull();
    expect(normalizeGraphLiveKeyframeSeq(10)).toBe(10);
    expect(normalizeGraphLiveKeyframeSeq(Number.NaN)).toBeNull();
    expect(normalizeGraphLiveEnabled(true)).toBe(true);
    expect(normalizeGraphLiveEnabled("true")).toBe(false);

    useGraphLiveDeltaStore.getState().setLifecycle(" scopeA ", 10);
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: "scopeA",
      keyframeSeq: 10,
    });

    useGraphLiveDeltaStore.getState().setLifecycle({ scope: "scopeA" }, 10);
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: null,
      keyframeSeq: null,
      featureDeltas: [],
      gapCount: 0,
    });
  });
});

describe("useGraphLiveSync", () => {
  beforeEach(() => {
    useLiveStatusStore.getState().reset();
    resetGraphLiveDeltaState();
  });

  afterEach(() => {
    cleanup();
    useLiveStatusStore.getState().reset();
    resetGraphLiveDeltaState();
  });

  it("advances lastSeq + marks connected immediately, and debounces invalidation to one trailing refetch (P-HIGH-1)", () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const chunks: StreamChunk[] = [
        { channel: "graph", data: { seq: 4, op: "add" } },
        { channel: "graph", data: { seq: 6, op: "change" } },
      ];
      // Seed the stream query (staleTime Infinity => useQuery returns it, no fetch).
      // Scope folds into the stream key (W02.P04.S14 per-scope clock), so the seed
      // must carry the same scope the active hook subscribes with.
      client.setQueryData(engineKeys.stream(["graph"], undefined, "scopeA"), chunks);
      const invalidate = vi.spyOn(client, "invalidateQueries");

      renderHook(() => useGraphLiveSync("scopeA", true), { wrapper: wrapper(client) });

      // The cheap signals are immediate...
      expect(useLiveStatusStore.getState().lastSeq).toBe(6);
      expect(useLiveStatusStore.getState().streamConnected).toBe(true);
      // ...but the invalidation is debounced, not fired per delta (the fix).
      expect(invalidate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      // ONE coalesced trailing refresh per burst, routed through the central
      // graph-generation invalidation seam. This refreshes the constellation and
      // every sibling projection that keys on the same graph generation, while
      // still firing once per affected subtree rather than once per delta.
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "graph", "scopeA"],
          exact: false,
        }),
      );
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "graph-embeddings", "scopeA"],
          exact: false,
        }),
      );
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "filters", "scopeA"],
        }),
      );
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "vault-tree", "scopeA"],
        }),
      );
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["engine", "node", "scopeA"],
          exact: false,
        }),
      );
      expect(invalidate).toHaveBeenCalledTimes(GRAPH_GENERATION_QUERY_SUBTREES.length);
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
    // Scope is part of the stream identity too (W02.P04.S14 per-scope clock):
    // two scopes' streams carry different deltas and must not share a cache
    // entry. Absent scope folds to the "active" sentinel, distinct from a named
    // scope.
    expect(engineKeys.stream(["graph"], 42, "scopeA")).not.toEqual(
      engineKeys.stream(["graph"], 42, "scopeB"),
    );
    expect(engineKeys.stream(["graph"], 42, "scopeA")).not.toEqual(keyWithSince);
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
          edge: {
            id: "e1",
            src: "a",
            dst: "b",
            relation: "declares",
            tier: "declared",
            confidence: 1,
          },
          t: 1001,
          seq: 12,
        },
      },
    ];
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), chunks);

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

  it("normalizes scope before reading stored feature deltas", () => {
    useGraphLiveDeltaStore.getState().setLifecycle("scopeA", 10);
    useGraphLiveDeltaStore.getState().setFeatureDeltas([
      {
        granularity: "feature",
        op: "add",
        node: { id: "feature:auth", kind: "feature" },
        t: 1000,
        seq: 11,
      },
    ]);

    const trimmed = renderHook(() => useGraphLiveDeltaView(" scopeA ", 10));
    expect(trimmed.result.current.featureDeltas).toHaveLength(1);

    const malformed = renderHook(() =>
      useGraphLiveDeltaView({ scope: "scopeA" }, 10),
    );
    expect(malformed.result.current).toEqual({ featureDeltas: [], gapCount: 0 });
  });

  it("does not subscribe or expose cached deltas for malformed runtime scope", () => {
    const client = new QueryClient();
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:cached", kind: "feature" },
          t: 1000,
          seq: 11,
        },
      },
    ]);

    const { result } = renderHook(
      () => useGraphLiveSync({ scope: "scopeA" }, true, 10),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({ featureDeltas: [], gapCount: 0 });
    expect(useLiveStatusStore.getState().lastSeq).toBeNull();
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: null,
      keyframeSeq: null,
      featureDeltas: [],
      gapCount: 0,
    });
  });

  it("accepts trimmed scope when subscribing to live graph deltas", () => {
    const client = new QueryClient();
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:trimmed", kind: "feature" },
          t: 1000,
          seq: 11,
        },
      },
    ]);

    const { result } = renderHook(() => useGraphLiveSync(" scopeA ", true, 10), {
      wrapper: wrapper(client),
    });

    expect(result.current.featureDeltas).toHaveLength(1);
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: "scopeA",
      keyframeSeq: 10,
    });
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
    // Without keyframeSeq, subscribes at live tail (undefined since, scopeA)
    client.setQueryData(engineKeys.stream(["graph"], undefined, "scopeA"), chunks);

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
      client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), chunks);
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

  it("stores feature-delta output centrally and resets it on lifecycle changes", () => {
    const client = new QueryClient();
    const chunks: StreamChunk[] = [
      {
        channel: "graph",
        data: {
          granularity: "feature",
          op: "add",
          node: { id: "feature:centralized", kind: "feature" },
          t: 1000,
          seq: 11,
        },
      },
    ];
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), chunks);

    const { rerender, result } = renderHook(
      ({ scope, keyframeSeq }) => useGraphLiveSync(scope, true, keyframeSeq),
      {
        initialProps: { scope: "scopeA", keyframeSeq: 10 },
        wrapper: wrapper(client),
      },
    );

    expect(result.current.featureDeltas).toHaveLength(1);
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: "scopeA",
      keyframeSeq: 10,
      gapCount: 0,
    });
    expect(useGraphLiveDeltaStore.getState().featureDeltas).toHaveLength(1);

    rerender({ scope: "scopeB", keyframeSeq: 10 });

    expect(result.current).toEqual({ featureDeltas: [], gapCount: 0 });
    expect(useGraphLiveDeltaStore.getState()).toMatchObject({
      scope: "scopeB",
      keyframeSeq: 10,
      featureDeltas: [],
      gapCount: 0,
    });
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
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), chunks);

    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
      wrapper: wrapper(client),
    });

    expect(result.current.gapCount).toBe(0);
    expect(result.current.featureDeltas).toHaveLength(1);
  });

  it("re-extracts deltas after a stream reconnect resets the chunk array (HIGH-1)", async () => {
    const client = new QueryClient();
    const key = engineKeys.stream(["graph"], 10, "scopeA");
    const fc = (seq: number): StreamChunk => ({
      channel: "graph",
      data: {
        granularity: "feature",
        op: "add",
        node: { id: `feature:f${seq}`, kind: "feature" },
        t: seq,
        seq,
      },
    });
    client.setQueryData(key, [fc(11), fc(12)]);
    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
      wrapper: wrapper(client),
    });
    expect(result.current.featureDeltas.map((d) => d.seq)).toEqual([11, 12]);

    // streamedQuery's reducer empties `chunks` on reconnect; the since=keyframe
    // resume replays from seq 11 again into a SHORTER array. Without the cursor
    // reset the hook would slice past the new head and drop everything.
    client.setQueryData(key, [fc(11)]);

    // Not dropped — the cursor reset re-consumes from the rebuilt head.
    await waitFor(() =>
      expect(result.current.featureDeltas.map((d) => d.seq)).toEqual([11]),
    );
    expect(result.current.gapCount).toBe(0);
  });

  it("does NOT refetch the constellation for a clean feature-only batch (MED-1)", () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), [
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
      ]);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      renderHook(() => useGraphLiveSync("scopeA", true, 10), {
        wrapper: wrapper(client),
      });
      // The feature delta splices via apply-deltas; no debounced refetch fires.
      vi.advanceTimersByTime(300);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
