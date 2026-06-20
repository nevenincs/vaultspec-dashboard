import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";
import { normalizeDashboardTextFilter } from "./dashboardStateNormalization";
import {
  dashboardStateSessionIdentity,
  useDashboardState,
  useSession,
} from "./queries";

export interface DashboardTextFilterIntent {
  canonicalText: string;
  sourceIdentity: string;
  writeTextFilter: (value: unknown) => Promise<unknown>;
}

export const normalizeDashboardTextFilterScope = normalizeDashboardStateWriteScope;

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
  return {
    canonicalText: normalizeDashboardTextFilterCanonicalText(
      dashboardState.data?.filters.text,
    ),
    sourceIdentity: dashboardStateSessionIdentity(session.data),
    writeTextFilter: (value) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : dashboardMutations.setTextFilter(value),
  };
}
