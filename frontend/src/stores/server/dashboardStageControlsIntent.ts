import {
  normalizeDashboardStateWriteScope,
  normalizeStringMember,
  useDashboardStateMutations,
} from "./dashboardState";
import {
  REPRESENTATION_MODES,
  SALIENCE_LENSES,
  type RepresentationMode,
  type SalienceLens,
} from "./engine";

export interface DashboardStageControlsIntent {
  pending: boolean;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
  setLens: (lens: unknown) => Promise<unknown>;
}

export const normalizeDashboardStageControlsScope = normalizeDashboardStateWriteScope;

export function normalizeDashboardStageControlsRepresentationMode(
  mode: unknown,
): RepresentationMode | null {
  return normalizeStringMember(mode, REPRESENTATION_MODES);
}

export function normalizeDashboardStageControlsLens(
  lens: unknown,
): SalienceLens | null {
  return normalizeStringMember(lens, SALIENCE_LENSES);
}

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
    setRepresentationMode: (mode) => {
      const normalizedMode = normalizeDashboardStageControlsRepresentationMode(mode);
      return normalizedScope === null || normalizedMode === null
        ? inert()
        : mutations.setRepresentationMode(normalizedMode);
    },
    setLens: (lens) => {
      const normalizedLens = normalizeDashboardStageControlsLens(lens);
      return normalizedScope === null || normalizedLens === null
        ? inert()
        : mutations.setLens(normalizedLens);
    },
  };
}
