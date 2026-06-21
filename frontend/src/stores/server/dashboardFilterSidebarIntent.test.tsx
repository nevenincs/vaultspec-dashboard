// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import type { EngineNode } from "./engine";
import {
  normalizeDashboardFilterSidebarScope,
  useDashboardFilterSidebarIntent,
} from "./dashboardFilterSidebarIntent";
import { dashboardDocumentStateResetPatch } from "./dashboardState";

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

async function realDocumentNode(scope: string): Promise<EngineNode> {
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live filter-sidebar test fixture has no document node");
  }
  return node;
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

describe("useDashboardFilterSidebarIntent", () => {
  it("normalizes runtime scope values", () => {
    expect(normalizeDashboardFilterSidebarScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardFilterSidebarScope("   ")).toBeNull();
    expect(normalizeDashboardFilterSidebarScope({ scope: "scope-a" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardFilterSidebarIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.toggleFacet("doc_types", "adr")).resolves.toBeNull();
    await expect(result.current.clearFilters()).resolves.toBeNull();
  });

  it("keeps filter-sidebar intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: unknown }) => useDashboardFilterSidebarIntent(scope),
      { initialProps: { scope: " scope-a " }, wrapper: wrapper(client) },
    );

    const firstIntent = result.current;
    const firstToggleFacet = result.current.toggleFacet;
    const firstClearFilters = result.current.clearFilters;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(firstIntent);
    expect(result.current.toggleFacet).toBe(firstToggleFacet);
    expect(result.current.clearFilters).toBe(firstClearFilters);
  });

  it("accepts trimmed scopes for canonical dashboard filter writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    const docType = node.doc_type ?? "plan";
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardFilterSidebarIntent(` ${scope} `), {
      wrapper: wrapper(client),
    });

    let patched: unknown;
    await act(async () => {
      patched = await result.current.toggleFacet("doc_types", docType);
    });
    expect(patched).toMatchObject({ filters: { doc_types: [docType] } });
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      filters: { doc_types: [docType] },
    });
  });

  it("rejects malformed runtime scope objects before dashboard filter writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    const docType = node.doc_type ?? "plan";
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      filters: { doc_types: [docType] },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardFilterSidebarIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(result.current.toggleFacet("doc_types", docType)).resolves.toBeNull();
    await expect(result.current.clearFilters()).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      filters: { doc_types: [docType] },
    });
  });
});
