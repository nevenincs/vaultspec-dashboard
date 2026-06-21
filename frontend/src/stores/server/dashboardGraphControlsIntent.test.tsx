// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  normalizeDashboardGraphControlsBounds,
  normalizeDashboardGraphControlsScope,
  useDashboardGraphControlsIntent,
} from "./dashboardGraphControlsIntent";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

let cleanupScope: string | null = null;

afterEach(async () => {
  cleanup();
  if (cleanupScope) {
    await createLiveClient()
      .patchDashboardState(dashboardDocumentStateResetPatch(cleanupScope))
      .catch(() => undefined);
    cleanupScope = null;
  }
});

describe("useDashboardGraphControlsIntent", () => {
  it("normalizes runtime scope and graph-bounds payloads", () => {
    expect(normalizeDashboardGraphControlsScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardGraphControlsScope("   ")).toBeNull();
    expect(normalizeDashboardGraphControlsScope({ scope: "scope-a" })).toBeNull();
    expect(
      normalizeDashboardGraphControlsBounds({ shape: " rect ", size: 24.6 }),
    ).toEqual({
      shape: "rect",
      size: 25,
    });
    expect(normalizeDashboardGraphControlsBounds({ shape: "free", size: 10 })).toEqual({
      shape: "free",
      size: 0,
    });
    expect(normalizeDashboardGraphControlsBounds("rect")).toBeNull();
    expect(
      normalizeDashboardGraphControlsBounds({ shape: "hex", size: 10 }),
    ).toBeNull();
    expect(
      normalizeDashboardGraphControlsBounds({ shape: "circle", size: "large" }),
    ).toBeNull();
    expect(
      normalizeDashboardGraphControlsBounds({
        shape: "circle",
        size: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardGraphControlsIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.setGraphBounds({ shape: "rect", size: 120 }),
    ).resolves.toBeNull();
  });

  it("keeps graph-control intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: unknown }) => useDashboardGraphControlsIntent(scope),
      { initialProps: { scope: " scope-a " }, wrapper: wrapper(client) },
    );

    const firstIntent = result.current;
    const firstSetGraphBounds = result.current.setGraphBounds;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(firstIntent);
    expect(result.current.setGraphBounds).toBe(firstSetGraphBounds);
  });

  it("accepts trimmed scopes for canonical dashboard graph-bounds writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardGraphControlsIntent(` ${scope} `), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.setGraphBounds({ shape: "circle", size: 120.4 });
    });

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      graph_bounds: { shape: "circle", size: 120 },
    });
  });

  it("rejects malformed runtime scope objects before graph-bounds writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_bounds: { shape: "rect", size: 64 },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardGraphControlsIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.setGraphBounds({ shape: "circle", size: 128 }),
    ).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      graph_bounds: { shape: "rect", size: 64 },
    });
  });

  it("rejects malformed graph-bounds payloads before resetting dashboard bounds", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_bounds: { shape: "rect", size: 64 },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardGraphControlsIntent(scope), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setGraphBounds("rect")).resolves.toBeNull();
    await expect(
      result.current.setGraphBounds({ shape: "circle", size: "large" }),
    ).resolves.toBeNull();
    await expect(
      result.current.setGraphBounds({ shape: "hex", size: 128 }),
    ).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      graph_bounds: { shape: "rect", size: 64 },
    });
  });
});
