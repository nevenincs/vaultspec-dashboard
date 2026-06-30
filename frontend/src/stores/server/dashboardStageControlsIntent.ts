import { useCallback, useMemo, useRef } from "react";

import { normalizeStringMember, useDashboardStateMutations } from "./dashboardState";
import {
  GRAPH_GRANULARITIES,
  REPRESENTATION_MODES,
  SALIENCE_LENSES,
  type GraphGranularity,
  type RepresentationMode,
  type SalienceLens,
} from "./engine";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardStageControlsIntent {
  pending: boolean;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
  setLens: (lens: unknown) => Promise<unknown>;
  /** Switch the graph between the feature-constellation overview and the
   *  per-document graph. A PURE view-projection flip: it changes only
   *  `graph_granularity` (re-keying the graph slice), never the corpus filter —
   *  filtering stays on its one authority (one-filter-authority-every-corpus-view-
   *  consumes-it). */
  setGranularity: (granularity: unknown) => Promise<unknown>;
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

export function normalizeDashboardStageControlsGranularity(
  granularity: unknown,
): GraphGranularity | null {
  return normalizeStringMember(granularity, GRAPH_GRANULARITIES);
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
  const setGranularityRef = useRef(mutations.setGranularity);
  setRepresentationModeRef.current = mutations.setRepresentationMode;
  setLensRef.current = mutations.setLens;
  setGranularityRef.current = mutations.setGranularity;

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
  const setGranularity = useCallback(
    (granularity: unknown) => {
      const normalizedGranularity =
        normalizeDashboardStageControlsGranularity(granularity);
      return normalizedScope === null || normalizedGranularity === null
        ? Promise.resolve(null)
        : setGranularityRef.current(normalizedGranularity);
    },
    [normalizedScope],
  );

  return useMemo(
    () => ({
      pending: mutations.mutation.isPending,
      setRepresentationMode,
      setLens,
      setGranularity,
    }),
    [mutations.mutation.isPending, setGranularity, setLens, setRepresentationMode],
  );
}
