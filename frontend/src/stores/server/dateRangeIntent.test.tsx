// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  normalizeDateRangeIntentRange,
  normalizeDateRangeIntentScope,
  useDateRangeIntent,
} from "./dateRangeIntent";

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

describe("useDateRangeIntent", () => {
  it("normalizes runtime scope values", () => {
    expect(normalizeDateRangeIntentScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDateRangeIntentScope("   ")).toBeNull();
    expect(normalizeDateRangeIntentScope({ scope: "scope-a" })).toBeNull();
    expect(
      normalizeDateRangeIntentRange({
        from: " 2026-06-30 ",
        to: "2026-06-01",
      }),
    ).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(normalizeDateRangeIntentRange({ to: "2026-06-30" })).toEqual({
      to: "2026-06-30",
    });
    expect(normalizeDateRangeIntentRange({ from: "bad" })).toBeNull();
    expect(normalizeDateRangeIntentRange({})).toBeNull();
    expect(normalizeDateRangeIntentRange("2026-06-30")).toBeNull();
    expect(normalizeDateRangeIntentRange(["2026-06-01"])).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDateRangeIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.setRange({ from: "2026-06-30", to: "2026-06-01" }),
    ).resolves.toBeNull();
    await expect(result.current.clearRange()).resolves.toBeNull();
  });

  it("keeps date-range intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: unknown }) => useDateRangeIntent(scope),
      { initialProps: { scope: " scope-a " }, wrapper: wrapper(client) },
    );

    const firstIntent = result.current;
    const firstSetRange = result.current.setRange;
    const firstClearRange = result.current.clearRange;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(firstIntent);
    expect(result.current.setRange).toBe(firstSetRange);
    expect(result.current.clearRange).toBe(firstClearRange);
  });

  it("drops malformed range payloads at the intent seam", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDateRangeIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setRange("2026-06-30")).resolves.toBeNull();
    await expect(
      result.current.setRange(["2026-06-01", "2026-06-30"]),
    ).resolves.toBeNull();
  });

  it("accepts trimmed scopes for canonical dashboard date-range writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useDateRangeIntent(` ${scope} `), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.setRange({ from: "2026-06-01", to: "2026-06-30" });
    });
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      date_range: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("rejects malformed runtime scope objects before date-range writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDateRangeIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.setRange({ from: "2026-06-01", to: "2026-06-30" }),
    ).resolves.toBeNull();
    await expect(result.current.clearRange()).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });
  });

  it("rejects malformed range payloads before clearing canonical dashboard state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDateRangeIntent(scope), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setRange("2026-06-01")).resolves.toBeNull();
    await expect(result.current.setRange({ from: "bad" })).resolves.toBeNull();
    await expect(result.current.setRange({})).resolves.toBeNull();

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });

    await act(async () => {
      await result.current.clearRange();
    });
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      date_range: {},
    });
  });
});
