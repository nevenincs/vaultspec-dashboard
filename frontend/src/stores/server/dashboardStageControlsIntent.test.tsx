// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  normalizeDashboardStageControlsGranularity,
  normalizeDashboardStageControlsLens,
  normalizeDashboardStageControlsRepresentationMode,
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
    expect(normalizeDashboardStageControlsRepresentationMode(" radial ")).toBe(
      "radial",
    );
    expect(normalizeDashboardStageControlsRepresentationMode("unknown")).toBeNull();
    expect(
      normalizeDashboardStageControlsRepresentationMode({ mode: "radial" }),
    ).toBeNull();
    expect(normalizeDashboardStageControlsLens(" design ")).toBe("design");
    expect(normalizeDashboardStageControlsLens("unknown")).toBeNull();
    expect(normalizeDashboardStageControlsLens({ lens: "design" })).toBeNull();
    expect(normalizeDashboardStageControlsGranularity(" feature ")).toBe("feature");
    expect(normalizeDashboardStageControlsGranularity("document")).toBe("document");
    expect(normalizeDashboardStageControlsGranularity("unknown")).toBeNull();
    expect(
      normalizeDashboardStageControlsGranularity({ granularity: "feature" }),
    ).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardStageControlsIntent(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.pending).toBe(false);
    await expect(result.current.setRepresentationMode("semantic")).resolves.toBeNull();
    await expect(result.current.setLens("design")).resolves.toBeNull();
    await expect(result.current.setGranularity("feature")).resolves.toBeNull();
  });

  it("keeps stage-control intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: unknown }) => useDashboardStageControlsIntent(scope),
      { initialProps: { scope: " scope-a " }, wrapper: wrapper(client) },
    );

    const firstIntent = result.current;
    const firstSetRepresentationMode = result.current.setRepresentationMode;
    const firstSetLens = result.current.setLens;
    const firstSetGranularity = result.current.setGranularity;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(firstIntent);
    expect(result.current.setRepresentationMode).toBe(firstSetRepresentationMode);
    expect(result.current.setLens).toBe(firstSetLens);
    expect(result.current.setGranularity).toBe(firstSetGranularity);
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

  it("is inert for malformed control enum values", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardStageControlsIntent("scope-a"), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.setRepresentationMode({ mode: "radial" }),
    ).resolves.toBeNull();
    await expect(result.current.setRepresentationMode("unknown")).resolves.toBeNull();
    await expect(result.current.setLens({ lens: "design" })).resolves.toBeNull();
    await expect(result.current.setLens("unknown")).resolves.toBeNull();
    await expect(
      result.current.setGranularity({ granularity: "feature" }),
    ).resolves.toBeNull();
    await expect(result.current.setGranularity("unknown")).resolves.toBeNull();
  });
});
