import { useCallback, useMemo, useRef } from "react";

import { dashboardFiltersFromChoices, normalizeFilterChoices } from "../view/filters";
import { useDashboardStateMutations } from "./dashboardState";
import { normalizeDashboardDateRange } from "./dashboardDateRange";
import type { DashboardDateRange } from "./engine";
import { normalizeStoreScope } from "./scopeIdentity";

export interface CommandPaletteLensIntent {
  applyLensChoices: (choices: unknown) => Promise<unknown>;
}

export const normalizeCommandPaletteLensScope = normalizeStoreScope;

function isCommandPaletteLensRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeCommandPaletteLensDateRange(
  value: unknown,
): DashboardDateRange | null {
  if (value === undefined) return {};
  if (!isCommandPaletteLensRecord(value)) return null;
  const normalized = normalizeDashboardDateRange(value);
  const hasDateEndpoint = "from" in value || "to" in value;
  return hasDateEndpoint && !normalized.from && !normalized.to ? null : normalized;
}

/**
 * Stores/server write seam for applying a saved command-palette lens.
 * Lens lookup and persistence are view-local, but applying the snapshot writes
 * canonical dashboard filters and date range through one narrow dashboard intent.
 */
export function useCommandPaletteLensIntent(scope: unknown): CommandPaletteLensIntent {
  const normalizedScope = normalizeCommandPaletteLensScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const setFiltersAndDateRangeRef = useRef(mutations.setFiltersAndDateRange);
  setFiltersAndDateRangeRef.current = mutations.setFiltersAndDateRange;
  const applyLensChoices = useCallback(
    (choices: unknown) => {
      const normalized = normalizeFilterChoices(choices);
      const dateRange = isCommandPaletteLensRecord(choices)
        ? normalizeCommandPaletteLensDateRange(choices.dateRange)
        : null;
      return normalizedScope === null || normalized === null || dateRange === null
        ? Promise.resolve(null)
        : setFiltersAndDateRangeRef.current(
            dashboardFiltersFromChoices(normalized),
            dateRange,
          );
    },
    [normalizedScope],
  );
  return useMemo(() => ({ applyLensChoices }), [applyLensChoices]);
}
