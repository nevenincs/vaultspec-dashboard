import { useCallback, useMemo, useRef } from "react";

import { useDashboardStateMutations } from "./dashboardState";
import { normalizeDashboardDateRange } from "./dashboardDateRange";
import { normalizeStoreScope } from "./scopeIdentity";

export const normalizeDateRangeIntentScope = normalizeStoreScope;

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
  const setDateRangeRef = useRef(mutations.setDateRange);
  setDateRangeRef.current = mutations.setDateRange;

  const setRange = useCallback(
    (range: unknown) => {
      const normalizedRange = normalizeDateRangeIntentRange(range);
      return normalizedScope === null || normalizedRange === null
        ? Promise.resolve(null)
        : setDateRangeRef.current(normalizedRange);
    },
    [normalizedScope],
  );
  const clearRange = useCallback(
    () =>
      normalizedScope === null ? Promise.resolve(null) : setDateRangeRef.current({}),
    [normalizedScope],
  );

  return useMemo(() => ({ setRange, clearRange }), [clearRange, setRange]);
}
