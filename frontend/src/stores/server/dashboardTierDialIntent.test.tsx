// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  normalizeDashboardTierDialScope,
  useDashboardTierDialIntent,
} from "./dashboardTierDialIntent";
import type { DashboardState } from "./engine";
import { useDashboardState } from "./queries";

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
  if (cleanupScope === null) return;
  await createLiveClient().patchDashboardState(
    dashboardDocumentStateResetPatch(cleanupScope),
  );
  cleanupScope = null;
});

describe("useDashboardTierDialIntent", () => {
  it("normalizes runtime scope values", () => {
    expect(normalizeDashboardTierDialScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardTierDialScope("   ")).toBeNull();
    expect(normalizeDashboardTierDialScope({ scope: "scope-a" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardTierDialIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setTierEnabled("semantic", false)).resolves.toBeNull();
    await expect(result.current.setMinConfidence("semantic", 0.75)).resolves.toBeNull();
  });

  it("patches tier filters through canonical dashboard state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        intent: useDashboardTierDialIntent(` ${scope} `),
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), {
      timeout: 6000,
    });

    let disabled!: DashboardState;
    await act(async () => {
      disabled = (await result.current.intent.setTierEnabled(
        " semantic ",
        false,
      )) as DashboardState;
    });
    expect(disabled.filters.tiers?.semantic).toBe(false);
    await waitFor(() =>
      expect(result.current.state.data?.filters.tiers?.semantic).toBe(false),
    );

    let floored!: DashboardState;
    await act(async () => {
      floored = (await result.current.intent.setMinConfidence(
        " semantic ",
        0.75,
      )) as DashboardState;
    });
    expect(floored.filters.tiers?.semantic).toBe(false);
    expect(floored.filters.min_confidence?.semantic).toBe(0.75);
    await waitFor(() =>
      expect(result.current.state.data?.filters.min_confidence?.semantic).toBe(0.75),
    );
  });

  it("drops malformed runtime tier inputs before dashboard writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      filters: {
        tiers: { semantic: false },
        min_confidence: { semantic: 0.7 },
      },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardTierDialIntent(scope), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setTierEnabled("semantic", "true")).resolves.toBeNull();
    await expect(result.current.setTierEnabled("rogue", true)).resolves.toBeNull();
    await expect(result.current.setMinConfidence("declared", 0.95)).resolves.toBeNull();

    const state = await createLiveClient().dashboardState(scope);
    expect(state.filters.tiers?.semantic).toBe(false);
    expect(state.filters.min_confidence?.semantic).toBeCloseTo(0.7);
  });

  it("rejects malformed runtime scope objects before tier filter writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      filters: {
        tiers: { semantic: false },
        min_confidence: { semantic: 0.7 },
      },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardTierDialIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setTierEnabled("semantic", true)).resolves.toBeNull();
    await expect(result.current.setMinConfidence("semantic", 0.95)).resolves.toBeNull();
    const state = await createLiveClient().dashboardState(scope);
    expect(state.filters.tiers?.semantic).toBe(false);
    expect(state.filters.min_confidence?.semantic).toBeCloseTo(0.7);
  });
});
