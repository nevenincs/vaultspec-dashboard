// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { dashboardDocumentStateSeed } from "../server/dashboardState";
import type { SessionState } from "../server/engine";
import { dashboardStateSessionIdentity, engineKeys } from "../server/queries";
import { SEARCH_QUERY_MAX_CHARS } from "../searchQuery";
import {
  normalizeDashboardTextFilterDraftValue,
  useDashboardTextFilterDraft,
} from "./dashboardTextFilter";
import { ENGINE_WAIT } from "../../testing/timing";

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

function seedDashboardTextFilterScope(
  client: QueryClient,
  session: SessionState,
  scope: string,
  text: string,
): void {
  client.setQueryData(
    engineKeys.dashboardState(scope, dashboardStateSessionIdentity(session)),
    dashboardDocumentStateSeed(scope, { filters: { text } }),
  );
}

afterEach(() => {
  cleanup();
});

describe("useDashboardTextFilterDraft", () => {
  it("normalizes runtime input at the draft boundary", () => {
    expect(normalizeDashboardTextFilterDraftValue("graph")).toBe("graph");
    expect(normalizeDashboardTextFilterDraftValue("  graph  ")).toBe("graph");
    expect(normalizeDashboardTextFilterDraftValue(null)).toBe("");
    expect(normalizeDashboardTextFilterDraftValue({ value: "graph" })).toBe("");
    expect(
      normalizeDashboardTextFilterDraftValue(
        ` graph ${"x".repeat(SEARCH_QUERY_MAX_CHARS)}`,
      ),
    ).toHaveLength(SEARCH_QUERY_MAX_CHARS);
  });

  it("resets a pending local draft when the scope changes with the same canonical text", async () => {
    const client = testQueryClient();
    const scopeA = "text-filter-a";
    const scopeB = "text-filter-b";
    const session: SessionState = {
      workspace: "text-filter-workspace",
      active_scope: scopeA,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    seedDashboardTextFilterScope(client, session, scopeA, "");
    seedDashboardTextFilterScope(client, session, scopeB, "");

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useDashboardTextFilterDraft(scope),
      { initialProps: { scope: scopeA }, wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);

    act(() => result.current.setValue("from-a"));
    expect(result.current.value).toBe("from-a");

    rerender({ scope: scopeB });

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);
  });

  it("resets a pending local draft when the dashboard source changes with the same canonical text", async () => {
    const client = testQueryClient();
    const scope = "text-filter-source";
    const sessionA: SessionState = {
      workspace: "text-filter-workspace-a",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    const sessionB: SessionState = {
      ...sessionA,
      workspace: "text-filter-workspace-b",
    };
    client.setQueryData(engineKeys.session(), sessionA);
    seedDashboardTextFilterScope(client, sessionA, scope, "");
    seedDashboardTextFilterScope(client, sessionB, scope, "");

    const { result, rerender } = renderHook(() => useDashboardTextFilterDraft(scope), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);

    act(() => result.current.setValue("from-session-a"));
    expect(result.current.value).toBe("from-session-a");

    act(() => {
      client.setQueryData(engineKeys.session(), sessionB);
    });
    rerender();

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);
  });

  it("keeps malformed runtime draft input from becoming visual state", async () => {
    const client = testQueryClient();
    const scope = "text-filter-runtime";
    const session: SessionState = {
      workspace: "text-filter-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    seedDashboardTextFilterScope(client, session, scope, "");

    const { result } = renderHook(() => useDashboardTextFilterDraft(scope), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);

    act(() => result.current.setValue({ value: "ad hoc" }));

    expect(result.current.value).toBe("");
  });

  it("normalizes malformed runtime scope before reading canonical dashboard text", async () => {
    const client = testQueryClient();
    const scope = "text-filter-malformed-scope";
    const session: SessionState = {
      workspace: "text-filter-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    seedDashboardTextFilterScope(client, session, scope, "should-not-leak");

    const { result } = renderHook(() => useDashboardTextFilterDraft({ scope }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.value).toBe(""), ENGINE_WAIT);

    act(() => result.current.setValue("local"));
    expect(result.current.value).toBe("local");

    act(() => result.current.clear());
    expect(result.current.value).toBe("");
  });
});
