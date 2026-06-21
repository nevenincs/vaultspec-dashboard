import { useCallback, useMemo, useRef } from "react";

import { useDashboardStateMutations } from "./dashboardState";
import { normalizeDashboardTextFilter } from "./dashboardStateNormalization";
import {
  dashboardStateSessionIdentity,
  useDashboardState,
  useSession,
} from "./queries";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardTextFilterIntent {
  canonicalText: string;
  sourceIdentity: string;
  writeTextFilter: (value: unknown) => Promise<unknown>;
}

export const normalizeDashboardTextFilterScope = normalizeStoreScope;

export function normalizeDashboardTextFilterCanonicalText(value: unknown): string {
  return normalizeDashboardTextFilter(value) ?? "";
}

/**
 * Stores/server seam for canonical dashboard text-filter read/write state.
 * View-layer draft hooks may debounce local echo, but they should not subscribe to
 * dashboard-state or compose dashboard filter mutations directly.
 */
export function useDashboardTextFilterIntent(
  scope: unknown,
): DashboardTextFilterIntent {
  const normalizedScope = normalizeDashboardTextFilterScope(scope);
  const session = useSession();
  const dashboardState = useDashboardState(normalizedScope);
  const dashboardMutations = useDashboardStateMutations(normalizedScope);
  const setTextFilterRef = useRef(dashboardMutations.setTextFilter);
  setTextFilterRef.current = dashboardMutations.setTextFilter;
  const canonicalText = normalizeDashboardTextFilterCanonicalText(
    dashboardState.data?.filters.text,
  );
  const sourceIdentity = dashboardStateSessionIdentity(session.data);
  const writeTextFilter = useCallback(
    (value: unknown) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : setTextFilterRef.current(value),
    [normalizedScope],
  );

  return useMemo(
    () => ({ canonicalText, sourceIdentity, writeTextFilter }),
    [canonicalText, sourceIdentity, writeTextFilter],
  );
}
