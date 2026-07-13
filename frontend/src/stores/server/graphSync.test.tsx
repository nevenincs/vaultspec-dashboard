// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient, type GraphDeltaEntry, type GraphSlice } from "./engine";
import { useLiveStatusStore } from "./liveStatus";
import type { StreamChunk } from "./queries";
import { GRAPH_GENERATION_QUERY_SUBTREES, engineKeys } from "./queries";
import {
  GRAPH_BUILDING_REFETCH_MS,
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
  useGraphSliceBuildingReconcilePoll,
} from "./graphSync";
import { liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";

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
    expect(useGraphLiveDeltaStore.getState().gapCount).toBe(GRAPH_LIVE_GAP_COUNT_MAX);
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

  it("advances lastSeq + marks connected immediately, and debounces the document-delta SIBLING refresh to one trailing sweep, leaving the graph slice to its delta (P-HIGH-1 / graph-slice-delta D4)", () => {
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
      // ONE coalesced trailing SIBLING refresh per burst: every generation-keyed
      // projection re-reads the fresh generation (the open editor / tree / facets /
      // node, W03.P04.S10) EXCEPT the ~3.5 MB graph document slice, which the
      // graph-slice delta patches instead of refetching (graph-slice-delta ADR D4).
      // With no active graph observer mounted here, the graph subtree is never
      // invalidated.
      expect(invalidate).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["engine", "graph", "scopeA"] }),
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
      // Every subtree EXCEPT the graph slice — one sweep per sibling, once per burst.
      expect(invalidate).toHaveBeenCalledTimes(
        GRAPH_GENERATION_QUERY_SUBTREES.length - 1,
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

    const malformed = renderHook(() => useGraphLiveDeltaView({ scope: "scopeA" }, 10));
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
    await waitFor(
      () => expect(result.current.featureDeltas.map((d) => d.seq)).toEqual([11]),
      ENGINE_WAIT,
    );
    expect(result.current.gapCount).toBe(0);
  });

  it("increments gapCount on a BACKWARD seq (delta clock reset by an engine restart)", () => {
    const client = new QueryClient();
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
    // keyframeSeq=10: a forward delta seq=11 applies, then a BACKWARD delta seq=4 —
    // the engine restarted and the clock reset to a lower seq, so this delta is a
    // new generation the held state predates. It must re-keyframe, not splice onto
    // the stale graph (mixed-generation edges = the load-time artefact).
    client.setQueryData(engineKeys.stream(["graph"], 10, "scopeA"), [fc(11), fc(4)]);
    const { result } = renderHook(() => useGraphLiveSync("scopeA", true, 10), {
      wrapper: wrapper(client),
    });
    expect(result.current.gapCount).toBe(1);
    expect(result.current.featureDeltas).toHaveLength(0);
  });

  it("re-keyframes when a reconnect resumes to an EMPTY stream (restart reset the clock)", async () => {
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
    expect(result.current.gapCount).toBe(0);

    // Engine restart: the stream reconnects but the clock reset, so the resumed
    // since=10 replays NOTHING — chunks shrink to []. Without re-keyframing the
    // graph would silently stay stale; the hook re-anchors via a gap increment.
    client.setQueryData(key, []);
    await waitFor(() => expect(result.current.gapCount).toBe(1), ENGINE_WAIT);
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

describe("useGraphSliceBuildingReconcilePoll (building-tier delta poll — graph-slice-delta root fix)", () => {
  afterEach(() => {
    cleanup();
    engineClient.useTransport(liveTransport);
  });

  const docVaultKey = engineKeys.graph(
    "scopeA",
    {},
    undefined,
    "document",
    "status",
    null,
    "vault",
  );
  const buildingTiers = {
    declared: { available: false, reason: "building declared links" },
  } as unknown as GraphSlice["tiers"];

  function jsonResponse(data: object): Response {
    return new Response(JSON.stringify({ data, tiers: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("polls the DELTA path on cadence for an eligible building slice — never a full /graph/query refetch — and stops when the tier flips ready", async () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const held = {
        nodes: [{ id: "n1" }, { id: "n2" }, { id: "n3" }, { id: "n4" }],
        edges: [],
        tiers: buildingTiers,
        generation: 4,
        slice_token: "tok",
        filter: {},
      } as unknown as GraphSlice;
      client.setQueryData(docVaultKey, held);
      // Active observer so the reconcile's `type:"active"` find hits the slice.
      const observer = new QueryObserver(client, {
        queryKey: docVaultKey,
        queryFn: () => held,
        staleTime: Infinity,
        gcTime: Infinity,
      });
      const unsubObserver = observer.subscribe(() => {});

      let deltaCalls = 0;
      let fullCalls = 0;
      engineClient.useTransport(async (input, init) => {
        if (input.includes("/graph/query/delta")) {
          deltaCalls += 1;
          return jsonResponse({
            since: 4,
            generation: 5,
            changed_nodes: [{ id: "n5" }],
            removed_node_ids: [],
            changed_edges: [],
            removed_edge_ids: [],
            tiers: {},
          });
        }
        if (input.includes("/graph/query")) {
          fullCalls += 1;
        }
        return liveTransport(input, init);
      });

      const { rerender, unmount } = renderHook(
        ({ building }: { building: boolean }) =>
          useGraphSliceBuildingReconcilePoll("scopeA", building, true),
        { initialProps: { building: true }, wrapper: wrapper(client) },
      );

      await vi.advanceTimersByTimeAsync(GRAPH_BUILDING_REFETCH_MS);
      // ONE sub-KB delta round-trip; the ~3.5 MB full slice is NEVER re-pulled.
      expect(deltaCalls).toBe(1);
      expect(fullCalls).toBe(0);
      // The held slice is patched (fresh generation + tiers cleared → banner flips).
      const patched = client.getQueryData<GraphSlice>(docVaultKey);
      expect(patched?.generation).toBe(5);
      expect(patched?.nodes.map((n) => n.id).sort()).toEqual([
        "n1",
        "n2",
        "n3",
        "n4",
        "n5",
      ]);

      // The tier flipped ready → the consumer passes building:false → the poll stops.
      rerender({ building: false });
      await vi.advanceTimersByTimeAsync(GRAPH_BUILDING_REFETCH_MS * 3);
      expect(deltaCalls).toBe(1);
      expect(fullCalls).toBe(0);

      unsubObserver();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes a NON-eligible building slice (feature/code/as-of) to the floored graph-only sweep, never the delta", async () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      let deltaCalls = 0;
      engineClient.useTransport(async (input, init) => {
        if (input.includes("/graph/query/delta")) deltaCalls += 1;
        return liveTransport(input, init);
      });

      renderHook(() => useGraphSliceBuildingReconcilePoll("scopeA", true, false), {
        wrapper: wrapper(client),
      });

      await vi.advanceTimersByTimeAsync(GRAPH_BUILDING_REFETCH_MS);
      // No delta attempted; the floored sweep fires its leading edge on the graph
      // subtree only (the D1 floor bounds a non-eligible full re-pull to ≤1/cooldown).
      expect(deltaCalls).toBe(0);
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

  it("does nothing while not building", async () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      let deltaCalls = 0;
      engineClient.useTransport(async (input, init) => {
        if (input.includes("/graph/query/delta")) deltaCalls += 1;
        return liveTransport(input, init);
      });
      renderHook(() => useGraphSliceBuildingReconcilePoll("scopeA", false, true), {
        wrapper: wrapper(client),
      });
      await vi.advanceTimersByTimeAsync(GRAPH_BUILDING_REFETCH_MS * 3);
      expect(deltaCalls).toBe(0);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
