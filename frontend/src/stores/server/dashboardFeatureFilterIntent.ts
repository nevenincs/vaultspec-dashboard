import { useCallback, useMemo, useRef } from "react";

import type { FeatureQuery } from "../featureQuery";
import { useDashboardStateMutations } from "./dashboardState";
import { normalizeDashboardFeatureQuery } from "./dashboardStateNormalization";
import { dashboardStateSessionIdentity, useDashboardState, useSession } from "./queries";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardFeatureFilterIntent {
  /** The canonical feature-query the field echoes, or null when unset. */
  canonicalFeatureQuery: FeatureQuery | null;
  /** Re-seed identity (session) so the field's local echo resets on a swap. */
  sourceIdentity: string;
  /** Write the canonical feature-query (a `{value,mode}` or null to clear). */
  writeFeatureQuery: (query: unknown) => Promise<unknown>;
}

export const normalizeDashboardFeatureFilterScope = normalizeStoreScope;

export function normalizeDashboardFeatureFilterCanonical(
  value: unknown,
): FeatureQuery | null {
  return normalizeDashboardFeatureQuery(value) ?? null;
}

/**
 * Stores/server seam for the canonical dashboard feature-query read/write state —
 * the backend feature filter (`feature_query`: glob/regex over `feature_tags`) the
 * rail's feature search bar authors. The view-layer draft hook debounces local
 * echo; it must not subscribe to dashboard-state or compose the mutation directly
 * (dashboard-layer-ownership). Mirrors `useDashboardTextFilterIntent`.
 */
export function useDashboardFeatureFilterIntent(
  scope: unknown,
): DashboardFeatureFilterIntent {
  const normalizedScope = normalizeDashboardFeatureFilterScope(scope);
  const session = useSession();
  const dashboardState = useDashboardState(normalizedScope);
  const dashboardMutations = useDashboardStateMutations(normalizedScope);
  const setFeatureQueryRef = useRef(dashboardMutations.setFeatureQuery);
  setFeatureQueryRef.current = dashboardMutations.setFeatureQuery;
  // Read the canonical feature-query as primitives so the memoized object stays
  // referentially stable between renders (stable-selectors): a fresh object every
  // render would defeat the field's re-seed effect.
  const canonical = normalizeDashboardFeatureFilterCanonical(
    dashboardState.data?.filters.feature_query,
  );
  const canonicalValue = canonical?.value ?? null;
  const canonicalMode = canonical?.mode ?? null;
  const sourceIdentity = dashboardStateSessionIdentity(session.data);
  const writeFeatureQuery = useCallback(
    (query: unknown) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : setFeatureQueryRef.current(query),
    [normalizedScope],
  );

  return useMemo(
    () => ({
      canonicalFeatureQuery:
        canonicalValue !== null && canonicalMode !== null
          ? { value: canonicalValue, mode: canonicalMode }
          : null,
      sourceIdentity,
      writeFeatureQuery,
    }),
    [canonicalValue, canonicalMode, sourceIdentity, writeFeatureQuery],
  );
}
