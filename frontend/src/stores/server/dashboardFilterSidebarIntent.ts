import { useCallback, useMemo, useRef } from "react";

import { useDashboardStateMutations } from "./dashboardState";
import { normalizeStoreScope } from "./scopeIdentity";

export interface DashboardFilterSidebarIntent {
  toggleFacet: (facet: unknown, value: unknown) => Promise<unknown>;
  /** Clear ONE facet (e.g. the legend's `doc_types` Reset) without disturbing
   *  the other flyout facets — the canonical scoped-clear seam. */
  clearFacet: (facet: unknown) => Promise<unknown>;
  clearFilters: () => Promise<unknown>;
}

export const normalizeDashboardFilterSidebarScope = normalizeStoreScope;

/**
 * Stores/server write seam for filter-sidebar dashboard filter intent.
 * The sidebar owns presentation and local feature-search chrome; dashboard filter
 * mutation shape remains centralized here.
 */
export function useDashboardFilterSidebarIntent(
  scope: unknown,
): DashboardFilterSidebarIntent {
  const normalizedScope = normalizeDashboardFilterSidebarScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const toggleFilterFacetRef = useRef(mutations.toggleFilterFacet);
  const clearFilterFacetRef = useRef(mutations.clearFilterFacet);
  const setFiltersRef = useRef(mutations.setFilters);
  toggleFilterFacetRef.current = mutations.toggleFilterFacet;
  clearFilterFacetRef.current = mutations.clearFilterFacet;
  setFiltersRef.current = mutations.setFilters;

  const toggleFacet = useCallback(
    (facet: unknown, value: unknown) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : toggleFilterFacetRef.current(facet, value),
    [normalizedScope],
  );
  const clearFacet = useCallback(
    (facet: unknown) =>
      normalizedScope === null
        ? Promise.resolve(null)
        : clearFilterFacetRef.current(facet),
    [normalizedScope],
  );
  const clearFilters = useCallback(
    () =>
      normalizedScope === null ? Promise.resolve(null) : setFiltersRef.current({}),
    [normalizedScope],
  );

  return useMemo(
    () => ({ toggleFacet, clearFacet, clearFilters }),
    [clearFacet, clearFilters, toggleFacet],
  );
}
