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
        expect.objectContaining({ queryKey: ["engine", "graph", "scopeA"], exact: false }),
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
});
