import {
  normalizeDashboardGraphBounds,
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface DashboardGraphControlsIntent {
  setGraphBounds: (bounds: unknown) => Promise<unknown>;
}

export const normalizeDashboardGraphControlsScope = normalizeDashboardStateWriteScope;

/**
 * Stores/server write seam for graph-control dashboard state.
 * GraphControls may emit canvas intent, but it should not import the broad
 * dashboard-state mutation surface.
 */
export function useDashboardGraphControlsIntent(
  scope: unknown,
): DashboardGraphControlsIntent {
  const normalizedScope = normalizeDashboardGraphControlsScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  return {
    setGraphBounds: (bounds) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : mutations.setGraphBounds(normalizeDashboardGraphBounds(bounds)),
  };
}
