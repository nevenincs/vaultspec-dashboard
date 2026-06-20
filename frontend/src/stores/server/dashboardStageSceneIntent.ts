import {
  normalizeDashboardFeatureTag,
  normalizeDashboardStateWriteScope,
  normalizeStringMember,
  useDashboardStateMutations,
} from "./dashboardState";
import {
  REPRESENTATION_MODES,
  type RepresentationMode,
} from "./engine";

export interface DashboardStageSceneIntent {
  descendFeatureTag: (featureTag: unknown) => Promise<unknown>;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
}

export const normalizeDashboardStageSceneScope = normalizeDashboardStateWriteScope;

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
  const inert = () => Promise.resolve(null);
  return {
    descendFeatureTag: (featureTag) => {
      const normalizedFeatureTag = normalizeDashboardStageSceneFeatureTag(featureTag);
      return normalizedScope === null || normalizedFeatureTag === null
        ? inert()
        : mutations.descendFeatureTag(normalizedFeatureTag);
    },
    setRepresentationMode: (mode) => {
      const normalizedMode = normalizeDashboardStageSceneRepresentationMode(mode);
      return normalizedScope === null || normalizedMode === null
        ? inert()
        : mutations.setRepresentationMode(normalizedMode);
    },
  };
}
