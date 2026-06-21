import { useCallback, useMemo, useRef } from "react";

import { normalizeStringMember, useDashboardStateMutations } from "./dashboardState";
import {
  REPRESENTATION_MODES,
  SALIENCE_LENSES,
  type RepresentationMode,
  type SalienceLens,
} from "./engine";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardStageControlsIntent {
  pending: boolean;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
  setLens: (lens: unknown) => Promise<unknown>;
}

export const normalizeDashboardStageControlsScope = normalizeStoreScope;

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
  const setRepresentationModeRef = useRef(mutations.setRepresentationMode);
  const setLensRef = useRef(mutations.setLens);
  setRepresentationModeRef.current = mutations.setRepresentationMode;
  setLensRef.current = mutations.setLens;

  const setRepresentationMode = useCallback(
    (mode: unknown) => {
      const normalizedMode = normalizeDashboardStageControlsRepresentationMode(mode);
      return normalizedScope === null || normalizedMode === null
        ? Promise.resolve(null)
        : setRepresentationModeRef.current(normalizedMode);
    },
    [normalizedScope],
  );
  const setLens = useCallback(
    (lens: unknown) => {
      const normalizedLens = normalizeDashboardStageControlsLens(lens);
      return normalizedScope === null || normalizedLens === null
        ? Promise.resolve(null)
        : setLensRef.current(normalizedLens);
    },
    [normalizedScope],
  );

  return useMemo(
    () => ({
      pending: mutations.mutation.isPending,
      setRepresentationMode,
      setLens,
    }),
    [mutations.mutation.isPending, setLens, setRepresentationMode],
  );
}
