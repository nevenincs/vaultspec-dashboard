import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface DashboardFilterSidebarIntent {
  toggleFacet: (facet: unknown, value: unknown) => Promise<unknown>;
  clearFilters: () => Promise<unknown>;
}

export const normalizeDashboardFilterSidebarScope = normalizeDashboardStateWriteScope;

/**
 * Stores/server write seam for filter-sidebar dashboard filter intent.
 * The sidebar owns presentation and local topic-search chrome; dashboard filter
 * mutation shape remains centralized here.
 */
export function useDashboardFilterSidebarIntent(
  scope: unknown,
): DashboardFilterSidebarIntent {
  const normalizedScope = normalizeDashboardFilterSidebarScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  return {
    toggleFacet: (facet, value) =>
      normalizedScope === null ? inert() : mutations.toggleFilterFacet(facet, value),
    clearFilters: () => (normalizedScope === null ? inert() : mutations.setFilters({})),
  };
}
