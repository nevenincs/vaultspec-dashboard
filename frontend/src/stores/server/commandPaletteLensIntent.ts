import { dashboardFiltersFromChoices, normalizeFilterChoices } from "../view/filters";
import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface CommandPaletteLensIntent {
  applyLensChoices: (choices: unknown) => Promise<unknown>;
}

export const normalizeCommandPaletteLensScope = normalizeDashboardStateWriteScope;

/**
 * Stores/server write seam for applying a saved command-palette lens.
 * Lens lookup and persistence are view-local, but applying the snapshot writes
 * canonical dashboard filters and date range through one narrow dashboard intent.
 */
export function useCommandPaletteLensIntent(scope: unknown): CommandPaletteLensIntent {
  const normalizedScope = normalizeCommandPaletteLensScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  return {
    applyLensChoices: (choices) => {
      const normalized = normalizeFilterChoices(choices);
      return normalizedScope === null || normalized === null
        ? Promise.resolve(null)
        : mutations.setFiltersAndDateRange(
            dashboardFiltersFromChoices(normalized),
            normalized.dateRange,
          );
    },
  };
}
