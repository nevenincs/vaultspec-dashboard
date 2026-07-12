import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

import type {
  DashboardState,
  GraphSlice,
  LineageSlice,
  PlanInterior,
  SessionState,
} from "../engine";

export function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

export function seedQuery(client: QueryClient, queryKey: readonly unknown[]): void {
  client.setQueryData(queryKey, { seeded: true });
}

export function sessionState(scope: string): SessionState {
  return {
    workspace: "workspace-a",
    active_workspace: "workspace-a",
    active_scope: scope,
    scope_context: { folder: null, feature_tags: [] },
    recents: [],
    tiers: {},
  };
}

export function dashboardState(scope: string): DashboardState {
  return {
    scope,
    selected_ids: ["doc:cached"],
    hovered_id: null,
    filters: { text: "cached" },
    date_range: { from: "2026-06-01", to: "2026-06-30" },
    timeline_mode: { kind: "time-travel", at: 42 },
    graph_granularity: "document",
    corpus: "vault",
    salience_lens: "design",
    salience_focus: "doc:cached",
    representation_mode: "lineage",
    panel_state: {
      left_collapsed: true,
      right_collapsed: true,
      right_tab: "changes",
    },
    graph_bounds: { shape: "rect", size: 1200 },
    tiers: {},
  };
}

export function graphSlice(): GraphSlice {
  return {
    nodes: [],
    edges: [],
    tiers: {},
  };
}

export function lineageSlice(): LineageSlice {
  return {
    nodes: [],
    arcs: [],
    tiers: {},
    truncated: null,
  };
}

export function planInterior(): PlanInterior {
  return {
    plan_node_id: "doc:plan",
    waves: [],
    phases: [],
    steps: [
      {
        node_id: "doc:plan#step-1",
        id: "step-1",
        action: "Trace state boundary",
        done: false,
      },
    ],
    summary: {
      wave_count: 0,
      phase_count: 0,
      step_count: 1,
      done_count: 0,
      plan_state: "not-started",
    },
    truncated: null,
  };
}

export function isInvalidated(
  client: QueryClient,
  queryKey: readonly unknown[],
): boolean {
  return (
    client.getQueryCache().find({ queryKey, exact: true })?.state.isInvalidated ?? false
  );
}

export function hasQuery(client: QueryClient, queryKey: readonly unknown[]): boolean {
  return client.getQueryCache().find({ queryKey, exact: true }) !== undefined;
}
