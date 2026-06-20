// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { dashboardDocumentStateSeed } from "./dashboardState";
import { dashboardStateSessionIdentity, engineKeys } from "./queries";
import type { SessionState } from "./engine";
import { SEARCH_QUERY_MAX_CHARS } from "../searchQuery";
import {
  normalizeDashboardTextFilterCanonicalText,
  normalizeDashboardTextFilterScope,
  useDashboardTextFilterIntent,
} from "./dashboardTextFilterIntent";

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

describe("useDashboardTextFilterIntent", () => {
  it("normalizes runtime scope before dashboard text-filter reads and writes", () => {
    expect(normalizeDashboardTextFilterScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardTextFilterScope("   ")).toBeNull();
    expect(normalizeDashboardTextFilterScope({ scope: "scope-a" })).toBeNull();
  });

  it("reads canonical text-filter state from the dashboard-state query", () => {
    const client = testQueryClient();
    const scope = "text-filter-scope";
    const session: SessionState = {
      workspace: "text-filter-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState(scope, dashboardStateSessionIdentity(session)),
      dashboardDocumentStateSeed(scope, {
        filters: { text: "state edge" },
      }),
    );

    const { result } = renderHook(() => useDashboardTextFilterIntent(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current.canonicalText).toBe("state edge");
    expect(result.current.sourceIdentity).toBe(dashboardStateSessionIdentity(session));
  });

  it("normalizes cached canonical text-filter reads before publishing intent", () => {
    expect(normalizeDashboardTextFilterCanonicalText(" state edge ")).toBe(
      "state edge",
    );
    expect(normalizeDashboardTextFilterCanonicalText({ text: "state edge" })).toBe(
      "",
    );
    expect(
      normalizeDashboardTextFilterCanonicalText(
        ` state ${"x".repeat(SEARCH_QUERY_MAX_CHARS)}`,
      ),
    ).toHaveLength(SEARCH_QUERY_MAX_CHARS);

    const client = testQueryClient();
    const scope = "text-filter-corrupt-cache";
    const session: SessionState = {
      workspace: "text-filter-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState(scope, dashboardStateSessionIdentity(session)),
      {
        ...dashboardDocumentStateSeed(scope),
        filters: {
          text: { value: "should-not-leak" },
        },
      },
    );

    const { result } = renderHook(() => useDashboardTextFilterIntent(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current.canonicalText).toBe("");
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useDashboardTextFilterIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.writeTextFilter("ignored")).resolves.toBeNull();
    expect(result.current.canonicalText).toBe("");
    expect(result.current.sourceIdentity).toBe(
      dashboardStateSessionIdentity(undefined),
    );
  });

  it("is inert for malformed runtime scope values", async () => {
    const client = testQueryClient();
    const { result } = renderHook(
      () => useDashboardTextFilterIntent({ scope: "text-filter-scope" }),
      { wrapper: wrapper(client) },
    );

    await expect(result.current.writeTextFilter("ignored")).resolves.toBeNull();
    expect(result.current.canonicalText).toBe("");
  });
});
