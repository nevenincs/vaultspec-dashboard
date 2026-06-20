import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";
import { normalizeDashboardDateRange } from "./dashboardDateRange";

export const normalizeDateRangeIntentScope = normalizeDashboardStateWriteScope;

export function useDateRangeIntent(scope: unknown): {
  setRange: (range: unknown) => Promise<unknown>;
  clearRange: () => Promise<unknown>;
} {
  const normalizedScope = normalizeDateRangeIntentScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  return {
    setRange: (range) =>
      normalizedScope === null
        ? inert()
        : mutations.setDateRange(normalizeDashboardDateRange(range)),
    clearRange: () => (normalizedScope === null ? inert() : mutations.setDateRange({})),
  };
}
