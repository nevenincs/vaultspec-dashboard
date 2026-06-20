// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  normalizeDashboardStageControlsScope,
  useDashboardStageControlsIntent,
} from "./dashboardStageControlsIntent";

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

describe("useDashboardStageControlsIntent", () => {
  it("normalizes runtime scope before dashboard control writes", () => {
    expect(normalizeDashboardStageControlsScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardStageControlsScope("   ")).toBeNull();
    expect(normalizeDashboardStageControlsScope({ scope: "scope-a" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardStageControlsIntent(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.pending).toBe(false);
    await expect(result.current.setRepresentationMode("semantic")).resolves.toBeNull();
    await expect(result.current.setLens("design")).resolves.toBeNull();
  });

  it("is inert for malformed runtime scope values", async () => {
    const client = testQueryClient();
    const { result } = renderHook(
      () => useDashboardStageControlsIntent({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.pending).toBe(false);
    await expect(result.current.setRepresentationMode("semantic")).resolves.toBeNull();
    await expect(result.current.setLens("design")).resolves.toBeNull();
  });
});
