import {
  normalizeDashboardFeatureTag,
  normalizeDashboardRepresentationMode,
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

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
    setRepresentationMode: (mode) =>
      normalizedScope === null
        ? inert()
        : mutations.setRepresentationMode(normalizeDashboardRepresentationMode(mode)),
  };
}
