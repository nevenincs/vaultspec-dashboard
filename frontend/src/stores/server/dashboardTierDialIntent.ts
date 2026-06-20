import {
  dashboardFiltersWithMinConfidence,
  dashboardFiltersWithTier,
  normalizeDashboardConfidenceTier,
  normalizeDashboardStateWriteScope,
  normalizeDashboardTierEnabled,
  normalizeDashboardTierName,
  useDashboardStateMutations,
} from "./dashboardState";
import type { DashboardFilters } from "./engine";
import { useDashboardState } from "./queries";

export interface DashboardTierDialIntent {
  setTierEnabled: (tier: unknown, enabled: unknown) => Promise<unknown>;
  setMinConfidence: (tier: unknown, value: unknown) => Promise<unknown>;
}

export const normalizeDashboardTierDialScope = normalizeDashboardStateWriteScope;

/**
 * Stores/server write seam for tier-dial filter intent.
 * The app dial emits tier choices only; dashboard filter patch composition stays
 * centralized beside the canonical dashboard-state reader.
 */
export function useDashboardTierDialIntent(scope: unknown): DashboardTierDialIntent {
  const normalizedScope = normalizeDashboardTierDialScope(scope);
  const dashboardState = useDashboardState(normalizedScope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  const filters = dashboardState.data?.filters ?? ({} satisfies DashboardFilters);
  return {
    setTierEnabled: (tier, enabled) => {
      const normalizedTier = normalizeDashboardTierName(tier);
      const normalizedEnabled = normalizeDashboardTierEnabled(enabled);
      return normalizedScope === null ||
        normalizedTier === null ||
        normalizedEnabled === null
        ? inert()
        : mutations.setFilters(
            dashboardFiltersWithTier(filters, normalizedTier, normalizedEnabled),
          );
    },
    setMinConfidence: (tier, value) => {
      const normalizedTier = normalizeDashboardConfidenceTier(tier);
      return normalizedScope === null || normalizedTier === null
        ? inert()
        : mutations.setFilters(
            dashboardFiltersWithMinConfidence(filters, normalizedTier, value),
          );
    },
  };
}
