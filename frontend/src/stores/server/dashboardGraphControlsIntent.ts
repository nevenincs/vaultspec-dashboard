import {
  normalizeDashboardGraphBounds,
  normalizeDashboardStateWriteScope,
  normalizeStringMember,
  useDashboardStateMutations,
} from "./dashboardState";
import {
  DASHBOARD_BOUND_SHAPES,
  type DashboardGraphBounds,
} from "./engine";

export interface DashboardGraphControlsIntent {
  setGraphBounds: (bounds: unknown) => Promise<unknown>;
}

export const normalizeDashboardGraphControlsScope = normalizeDashboardStateWriteScope;

function isDashboardGraphControlsBoundsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeDashboardGraphControlsBounds(
  bounds: unknown,
): DashboardGraphBounds | null {
  if (!isDashboardGraphControlsBoundsRecord(bounds)) return null;
  const shape = normalizeStringMember(bounds.shape, DASHBOARD_BOUND_SHAPES);
  if (shape === null) return null;
  return typeof bounds.size === "number" && Number.isFinite(bounds.size)
    ? normalizeDashboardGraphBounds(bounds)
    : null;
}

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
    setGraphBounds: (bounds) => {
      const normalizedBounds = normalizeDashboardGraphControlsBounds(bounds);
      return normalizedScope === null || normalizedBounds === null
        ? Promise.resolve(null)
        : mutations.setGraphBounds(normalizedBounds);
    },
  };
}
