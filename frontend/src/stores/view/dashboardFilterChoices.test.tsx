// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { dashboardDocumentStateSeed } from "../server/dashboardState";
import { dashboardStateSessionIdentity, engineKeys } from "../server/queries";
import type { SessionState } from "../server/engine";
import {
  useDashboardFilterChoices,
  useDashboardVisibilityCommand,
  useDashboardFilterChoicesView,
} from "./dashboardFilterChoices";

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

describe("useDashboardFilterChoices", () => {
  it("marks fallback choices as not loaded before dashboard-state is served", () => {
    const client = testQueryClient();
    const scope = "filter-choice-scope";
    const session: SessionState = {
      workspace: "filter-choice-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);

    const { result } = renderHook(() => useDashboardFilterChoicesView(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current.loaded).toBe(false);
    expect(result.current.choices).toMatchObject({
      docTypes: [],
      featureTags: [],
      textMatch: "",
      dateRange: {},
    });
  });

  it("projects canonical dashboard-state filters into the lens snapshot shape", () => {
    const client = testQueryClient();
    const scope = "filter-choice-scope";
    const session: SessionState = {
      workspace: "filter-choice-workspace",
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
        filters: {
          doc_types: ["adr"],
          feature_tags: ["state"],
          structural_state: ["broken"],
          text: "boundary",
        },
        date_range: { from: "2026-06-01", to: "2026-06-18" },
      }),
    );

    const { result } = renderHook(() => useDashboardFilterChoices(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toMatchObject({
      docTypes: ["adr"],
      featureTags: ["state"],
      structuralStates: ["broken"],
      textMatch: "boundary",
      dateRange: { from: "2026-06-01", to: "2026-06-18" },
    });

    const view = renderHook(() => useDashboardFilterChoicesView(scope), {
      wrapper: wrapper(client),
    });
    expect(view.result.current.loaded).toBe(true);
  });

  it("projects dashboard filters into a scene visibility command", () => {
    const client = testQueryClient();
    const scope = "filter-visibility-scope";
    const session: SessionState = {
      workspace: "filter-choice-workspace",
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
        filters: { feature_tags: ["state"] },
      }),
    );

    const { result } = renderHook(
      () =>
        useDashboardVisibilityCommand(scope, {
          nodes: [
            { id: "doc:a", kind: "doc", feature_tags: ["state"] },
            { id: "doc:b", kind: "doc", feature_tags: ["other"] },
          ],
          edges: [
            {
              id: "edge:a-b",
              src: "doc:a",
              dst: "doc:b",
              relation: "mentions",
              tier: "declared",
              confidence: 1,
            },
          ],
        }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      kind: "set-visibility",
      visibleNodeIds: new Set(["doc:a"]),
      visibleEdgeIds: new Set(),
    });
  });

  it("does not expose cached dashboard filters for malformed runtime scope", () => {
    const client = testQueryClient();
    const scope = "filter-visibility-scope";
    const session: SessionState = {
      workspace: "filter-choice-workspace",
      active_scope: scope,
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    };
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", dashboardStateSessionIdentity(session)),
      dashboardDocumentStateSeed("", {
        filters: { feature_tags: ["state"] },
      }),
    );

    const { result } = renderHook(
      () =>
        useDashboardVisibilityCommand(
          { scope },
          {
            nodes: [
              { id: "doc:a", kind: "doc", feature_tags: ["state"] },
              { id: "doc:b", kind: "doc", feature_tags: ["other"] },
            ],
            edges: [],
          },
        ),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      kind: "set-visibility",
      visibleNodeIds: new Set(["doc:a", "doc:b"]),
      visibleEdgeIds: new Set(),
    });
  });
});
