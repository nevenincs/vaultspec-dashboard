// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { DEFAULT_CHOICES } from "../view/filters";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  normalizeCommandPaletteLensDateRange,
  normalizeCommandPaletteLensScope,
  useCommandPaletteLensIntent,
} from "./commandPaletteLensIntent";
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

describe("useCommandPaletteLensIntent", () => {
  it("normalizes runtime scope before dashboard lens writes", () => {
    expect(normalizeCommandPaletteLensScope(" scope-a ")).toBe("scope-a");
    expect(normalizeCommandPaletteLensScope("   ")).toBeNull();
    expect(normalizeCommandPaletteLensScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeCommandPaletteLensDateRange(undefined)).toEqual({});
    expect(normalizeCommandPaletteLensDateRange({})).toEqual({});
    expect(
      normalizeCommandPaletteLensDateRange({
        from: "2026-06-30",
        to: "2026-06-01",
      }),
    ).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(normalizeCommandPaletteLensDateRange("2026-06-01")).toBeNull();
    expect(normalizeCommandPaletteLensDateRange(["2026-06-01"])).toBeNull();
    expect(normalizeCommandPaletteLensDateRange({ from: "bad" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useCommandPaletteLensIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.applyLensChoices({
        ...structuredClone(DEFAULT_CHOICES),
        featureTags: ["state"],
        dateRange: { from: "2026-01-01" },
      }),
    ).resolves.toBeNull();
  });

  it("is inert for malformed runtime scope values", async () => {
    const client = testQueryClient();
    const { result } = renderHook(
      () => useCommandPaletteLensIntent({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    await expect(
      result.current.applyLensChoices({
        ...structuredClone(DEFAULT_CHOICES),
        featureTags: ["state"],
      }),
    ).resolves.toBeNull();
  });

  it("keeps lens intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }) => useCommandPaletteLensIntent(scope),
      {
        initialProps: { scope: " scope-a " },
        wrapper: wrapper(client),
      },
    );
    const first = result.current;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(first);
    expect(result.current.applyLensChoices).toBe(first.applyLensChoices);
  });

  it("applies saved lens choices through canonical dashboard state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        intent: useCommandPaletteLensIntent(scope),
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), {
      timeout: 6000,
    });

    let applied!: DashboardState;
    await act(async () => {
      applied = (await result.current.intent.applyLensChoices({
        ...structuredClone(DEFAULT_CHOICES),
        tiers: {
          declared: true,
          structural: true,
          temporal: true,
          semantic: false,
        },
        minConfidence: { temporal: 0.6 },
        docTypes: ["adr"],
        featureTags: ["state"],
        relations: ["mentions"],
        structuralStates: ["broken"],
        textMatch: "boundary",
        dateRange: { from: "2026-06-01", to: "2026-06-30" },
      })) as DashboardState;
    });

    expect(applied.filters).toMatchObject({
      tiers: {
        declared: true,
        structural: true,
        temporal: true,
        semantic: false,
      },
      doc_types: ["adr"],
      feature_tags: ["state"],
      relations: ["mentions"],
      structural_state: ["broken"],
      text: "boundary",
    });
    expect(applied.filters.min_confidence?.temporal).toBeCloseTo(0.6);
    expect(applied.date_range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    await waitFor(() =>
      expect(result.current.state.data).toMatchObject({
        filters: {
          feature_tags: ["state"],
          text: "boundary",
        },
        date_range: { from: "2026-06-01", to: "2026-06-30" },
      }),
    );
  });

  it("normalizes runtime lens choices before writing dashboard state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        intent: useCommandPaletteLensIntent(scope),
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), {
      timeout: 6000,
    });

    let applied!: DashboardState;
    await act(async () => {
      applied = (await result.current.intent.applyLensChoices({
        tiers: { semantic: false },
        minConfidence: { temporal: 2 },
        featureTags: ["state", 7],
        structuralStates: ["broken", "bad"],
        dateRange: { to: "2026-06-30" },
      })) as DashboardState;
    });

    expect(applied.filters).toMatchObject({
      tiers: {
        declared: true,
        structural: true,
        temporal: true,
        semantic: false,
      },
      feature_tags: ["state"],
      structural_state: ["broken"],
    });
    expect(applied.filters.min_confidence?.temporal).toBeCloseTo(1);
    expect(applied.date_range).toEqual({ to: "2026-06-30" });
  });

  it("drops malformed runtime lens choices before dashboard writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        intent: useCommandPaletteLensIntent(scope),
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), {
      timeout: 6000,
    });

    let dropped!: unknown;
    await act(async () => {
      dropped = await result.current.intent.applyLensChoices(["not-a-lens"]);
    });

    expect(dropped).toBeNull();
    expect(result.current.state.data?.filters).toEqual({});
    expect(result.current.state.data?.date_range).toEqual({});
  });

  it("rejects malformed lens date ranges before clearing dashboard date state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });

    const client = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        intent: useCommandPaletteLensIntent(scope),
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), {
      timeout: 6000,
    });

    await act(async () => {
      await expect(
        result.current.intent.applyLensChoices({
          ...structuredClone(DEFAULT_CHOICES),
          featureTags: ["state"],
          dateRange: { from: "not-a-date" },
        }),
      ).resolves.toBeNull();
    });

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      filters: {},
      date_range: { from: "2026-05-01", to: "2026-05-31" },
    });

    let cleared!: DashboardState;
    await act(async () => {
      cleared = (await result.current.intent.applyLensChoices({
        ...structuredClone(DEFAULT_CHOICES),
        dateRange: {},
      })) as DashboardState;
    });

    expect(cleared.date_range).toEqual({});
  });
});
