// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS } from "./dashboardState";
import {
  normalizeDashboardStageSceneFeatureTag,
  normalizeDashboardStageSceneScope,
  useDashboardStageSceneIntent,
} from "./dashboardStageSceneIntent";

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

describe("useDashboardStageSceneIntent", () => {
  it("normalizes runtime scope before scene-driven dashboard writes", () => {
    expect(normalizeDashboardStageSceneScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardStageSceneScope("   ")).toBeNull();
    expect(normalizeDashboardStageSceneScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeDashboardStageSceneFeatureTag(" state ")).toBe("state");
    expect(
      normalizeDashboardStageSceneFeatureTag(
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(normalizeDashboardStageSceneFeatureTag("   ")).toBeNull();
    expect(normalizeDashboardStageSceneFeatureTag({ tag: "state" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardStageSceneIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.descendFeatureTag("state")).resolves.toBeNull();
    await expect(
      result.current.setRepresentationMode("connectivity"),
    ).resolves.toBeNull();
  });

  it("is inert for malformed runtime scope values", async () => {
    const client = testQueryClient();
    const { result } = renderHook(
      () => useDashboardStageSceneIntent({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    await expect(result.current.descendFeatureTag("state")).resolves.toBeNull();
    await expect(
      result.current.setRepresentationMode("connectivity"),
    ).resolves.toBeNull();
  });

  it("is inert for malformed scene feature-descent payloads", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardStageSceneIntent("scope-a"), {
      wrapper: wrapper(client),
    });

    await expect(result.current.descendFeatureTag("   ")).resolves.toBeNull();
    await expect(
      result.current.descendFeatureTag(
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).resolves.toBeNull();
    await expect(
      result.current.descendFeatureTag({ tag: "state" }),
    ).resolves.toBeNull();
  });
});
