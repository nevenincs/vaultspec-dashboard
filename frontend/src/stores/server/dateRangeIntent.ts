import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";
import { normalizeDashboardDateRange } from "./dashboardDateRange";

export const normalizeDateRangeIntentScope = normalizeDashboardStateWriteScope;

function isDateRangeIntentRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeDateRangeIntentRange(range: unknown) {
  if (!isDateRangeIntentRecord(range)) return null;
  const normalized = normalizeDashboardDateRange(range);
  return normalized.from || normalized.to ? normalized : null;
}

export function useDateRangeIntent(scope: unknown): {
  setRange: (range: unknown) => Promise<unknown>;
  clearRange: () => Promise<unknown>;
} {
  const normalizedScope = normalizeDateRangeIntentScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  return {
    setRange: (range) => {
      const normalizedRange = normalizeDateRangeIntentRange(range);
      return normalizedScope === null || normalizedRange === null
        ? inert()
        : mutations.setDateRange(normalizedRange);
    },
    clearRange: () => (normalizedScope === null ? inert() : mutations.setDateRange({})),
  };
}
