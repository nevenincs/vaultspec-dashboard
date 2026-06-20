import type { DashboardState, GraphGranularity } from "./engine";

export const FRESH_DASHBOARD_GRAPH_GRANULARITY: GraphGranularity = "feature";
export const DOCUMENT_DASHBOARD_GRAPH_GRANULARITY: GraphGranularity = "document";

export function isFreshDashboardGraphDefaultsState(
  state: Pick<DashboardState, "filters" | "graph_granularity">,
): boolean {
  return (
    state.graph_granularity === FRESH_DASHBOARD_GRAPH_GRANULARITY &&
    Object.keys(state.filters).length === 0
  );
}
