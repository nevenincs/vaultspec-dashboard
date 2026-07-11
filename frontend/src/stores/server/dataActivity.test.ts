// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_MIN_VISIBLE_MS,
  ACTIVITY_SHOW_GRACE_MS,
  isStreamQueryKey,
  resolveActivityKind,
  useDataActivityView,
  useDebouncedActivityVisible,
} from "./dataActivity";
import {
  MAX_DRAIN_ENTRIES,
  reportDrainProgress,
  resetDrainProgress,
  rollupDrainProgress,
  settleDrainProgress,
  useDrainProgressStore,
} from "./drainProgress";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Start a never-settling fetch; swallow the cancellation `client.clear()`
 *  raises at teardown so it never surfaces as an unhandled rejection. */
function fetchForever(
  client: QueryClient,
  options: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<never>;
    retry: boolean;
  },
): void {
  client.fetchQuery(options as never).catch(() => {});
}

describe("drain-progress slice", () => {
  beforeEach(() => resetDrainProgress());
  afterEach(() => resetDrainProgress());

  it("tracks per-page progress and drops the entry on settle", () => {
    reportDrainProgress("vault-tree:wt-1", 1, 2000);
    reportDrainProgress("vault-tree:wt-1", 2, 4000);
    expect(useDrainProgressStore.getState().drains["vault-tree:wt-1"]).toEqual({
      pagesLoaded: 2,
      rowsLoaded: 4000,
    });
    settleDrainProgress("vault-tree:wt-1");
    expect(useDrainProgressStore.getState().drains).toEqual({});
  });

  it("rejects malformed ids and counts without mutating state", () => {
    const before = useDrainProgressStore.getState().drains;
    reportDrainProgress("", 1, 10);
    reportDrainProgress("x", -1, 10);
    reportDrainProgress("x", 1, Number.NaN);
    settleDrainProgress("never-started");
    expect(useDrainProgressStore.getState().drains).toBe(before);
  });

  it("is bounded: a new id past the cap evicts the oldest entry", () => {
    for (let i = 0; i < MAX_DRAIN_ENTRIES; i += 1) {
      reportDrainProgress(`drain:${i}`, 1, 100);
    }
    reportDrainProgress("drain:overflow", 1, 100);
    const drains = useDrainProgressStore.getState().drains;
    expect(Object.keys(drains)).toHaveLength(MAX_DRAIN_ENTRIES);
    expect(drains["drain:0"]).toBeUndefined();
    expect(drains["drain:overflow"]).toBeDefined();
  });

  it("rolls up rows across concurrent drains, null when idle", () => {
    expect(rollupDrainProgress({})).toBeNull();
    expect(
      rollupDrainProgress({
        a: { pagesLoaded: 2, rowsLoaded: 4000 },
        b: { pagesLoaded: 1, rowsLoaded: 2000 },
      }),
    ).toEqual({ rowsLoaded: 6000, drainCount: 2 });
  });
});

describe("stream-key exclusion", () => {
  it("matches only the engine stream key family", () => {
    expect(
      isStreamQueryKey(["engine", "stream", "backends,git", "live", "active"]),
    ).toBe(true);
    expect(isStreamQueryKey(["engine", "graph", "wt-1"])).toBe(false);
    expect(isStreamQueryKey(["stream"])).toBe(false);
    expect(isStreamQueryKey([])).toBe(false);
  });
});

describe("resolveActivityKind", () => {
  it("orders drain over mutation over fetch over idle", () => {
    expect(resolveActivityKind(0, 0, false)).toBe("idle");
    expect(resolveActivityKind(2, 0, false)).toBe("fetching");
    expect(resolveActivityKind(2, 1, false)).toBe("mutating");
    expect(resolveActivityKind(2, 1, true)).toBe("draining");
  });
});

describe("useDebouncedActivityVisible", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows only after the grace window and holds for the minimum visible window", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDebouncedActivityVisible(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(ACTIVITY_SHOW_GRACE_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);

    // Deactivate immediately: the hold keeps it visible for the minimum window.
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(ACTIVITY_MIN_VISIBLE_MS - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it("never shows for activity shorter than the grace (cache-hit blink guard)", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDebouncedActivityVisible(active),
      { initialProps: { active: true } },
    );
    act(() => vi.advanceTimersByTime(ACTIVITY_SHOW_GRACE_MS - 50));
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(ACTIVITY_MIN_VISIBLE_MS + ACTIVITY_SHOW_GRACE_MS));
    expect(result.current).toBe(false);
  });
});

describe("useDataActivityView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDrainProgress();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetDrainProgress();
  });

  it("is idle and hidden with no counted activity", () => {
    const { result } = renderHook(() => useDataActivityView(), {
      wrapper: wrapper(new QueryClient()),
    });
    expect(result.current).toEqual({
      active: false,
      visible: false,
      determinate: null,
      kind: "idle",
    });
  });

  it("turns determinate-draining while a listing walk reports, then settles", () => {
    const { result } = renderHook(() => useDataActivityView(), {
      wrapper: wrapper(new QueryClient()),
    });
    act(() => {
      reportDrainProgress("vault-tree:wt-1", 1, 2000);
    });
    expect(result.current.active).toBe(true);
    expect(result.current.kind).toBe("draining");
    expect(result.current.determinate).toEqual({ rowsLoaded: 2000, drainCount: 1 });
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(ACTIVITY_SHOW_GRACE_MS));
    expect(result.current.visible).toBe(true);

    act(() => {
      settleDrainProgress("vault-tree:wt-1");
    });
    expect(result.current.active).toBe(false);
    expect(result.current.determinate).toBeNull();
    // The hold keeps the indicator visible; it hides after the minimum window.
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(ACTIVITY_MIN_VISIBLE_MS));
    expect(result.current.visible).toBe(false);
  });

  it("excludes perpetually-fetching stream queries from the active count", () => {
    const client = new QueryClient();
    // A stream-shaped query that never settles (SSE lifetime), plus nothing else:
    // the view must stay idle.
    fetchForever(client, {
      queryKey: ["engine", "stream", "backends,git", "live", "active"],
      queryFn: () => new Promise<never>(() => {}),
      retry: false,
    });
    const { result } = renderHook(() => useDataActivityView(), {
      wrapper: wrapper(client),
    });
    expect(result.current.active).toBe(false);
    expect(result.current.kind).toBe("idle");
    client.clear();
  });

  it("counts a real query fetch as activity", () => {
    const client = new QueryClient();
    fetchForever(client, {
      queryKey: ["engine", "graph", "wt-1"],
      queryFn: () => new Promise<never>(() => {}),
      retry: false,
    });
    const { result } = renderHook(() => useDataActivityView(), {
      wrapper: wrapper(client),
    });
    expect(result.current.active).toBe(true);
    expect(result.current.kind).toBe("fetching");
    client.clear();
  });
});
