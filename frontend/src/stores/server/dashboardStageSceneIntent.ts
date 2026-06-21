import { useCallback, useMemo, useRef } from "react";

import {
  normalizeDashboardFeatureTag,
  normalizeStringMember,
  useDashboardStateMutations,
} from "./dashboardState";
import {
  REPRESENTATION_MODES,
  type RepresentationMode,
} from "./engine";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardStageSceneIntent {
  descendFeatureTag: (featureTag: unknown) => Promise<unknown>;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
}

export const normalizeDashboardStageSceneScope = normalizeStoreScope;

export function normalizeDashboardStageSceneFeatureTag(
  featureTag: unknown,
): string | null {
  return normalizeDashboardFeatureTag(featureTag);
}

export function normalizeDashboardStageSceneRepresentationMode(
  mode: unknown,
): RepresentationMode | null {
  return normalizeStringMember(mode, REPRESENTATION_MODES);
}

/**
 * Stores/server write seam for scene event feedback.
 * Stage subscribes to scene events, but synthesized feature descent and renderer
 * representation echoes stay behind this narrow dashboard-state boundary.
 */
export function useDashboardStageSceneIntent(
  scope: unknown,
): DashboardStageSceneIntent {
  const normalizedScope = normalizeDashboardStageSceneScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const descendFeatureTagRef = useRef(mutations.descendFeatureTag);
  const setRepresentationModeRef = useRef(mutations.setRepresentationMode);
  descendFeatureTagRef.current = mutations.descendFeatureTag;
  setRepresentationModeRef.current = mutations.setRepresentationMode;

  const descendFeatureTag = useCallback(
    (featureTag: unknown) => {
      const normalizedFeatureTag = normalizeDashboardStageSceneFeatureTag(featureTag);
      return normalizedScope === null || normalizedFeatureTag === null
        ? Promise.resolve(null)
        : descendFeatureTagRef.current(normalizedFeatureTag);
    },
    [normalizedScope],
  );
  const setRepresentationMode = useCallback(
    (mode: unknown) => {
      const normalizedMode = normalizeDashboardStageSceneRepresentationMode(mode);
      return normalizedScope === null || normalizedMode === null
        ? Promise.resolve(null)
        : setRepresentationModeRef.current(normalizedMode);
    },
    [normalizedScope],
  );

  return useMemo(
    () => ({ descendFeatureTag, setRepresentationMode }),
    [descendFeatureTag, setRepresentationMode],
  );
}
