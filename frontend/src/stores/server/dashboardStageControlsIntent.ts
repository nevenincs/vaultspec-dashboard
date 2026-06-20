import {
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface DashboardStageControlsIntent {
  pending: boolean;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
  setLens: (lens: unknown) => Promise<unknown>;
}

export const normalizeDashboardStageControlsScope = normalizeDashboardStateWriteScope;

/**
 * Stores/server write seam for stage layout and salience controls.
 * The controls choose user intent; dashboard mutation shape and lifecycle stay
 * behind this stores-owned boundary.
 */
export function useDashboardStageControlsIntent(
  scope: unknown,
): DashboardStageControlsIntent {
  const normalizedScope = normalizeDashboardStageControlsScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  return {
    pending: mutations.mutation.isPending,
    setRepresentationMode: (mode) =>
      normalizedScope === null
        ? inert()
        : mutations.setRepresentationMode(normalizeDashboardRepresentationMode(mode)),
    setLens: (lens) =>
      normalizedScope === null
        ? inert()
        : mutations.setLens(normalizeDashboardSalienceLens(lens)),
  };
}
