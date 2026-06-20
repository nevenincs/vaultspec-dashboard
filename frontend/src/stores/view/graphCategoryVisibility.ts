// Canvas-local category-visibility seam (graph legend toggles). The category
// legend's coloured dots are filter toggles that hide/show that category's nodes
// on the graph canvas ONLY — a scene-rendering visibility layer, NEVER the
// canonical dashboard filter (filtering-has-one-canonical-surface: the left rail
// stays the sole facet-filter author; this never writes dashboardState.filters,
// so the tree/timeline/other consumers are unaffected). Stage and the legend
// consume the mask through this named boundary so it does not leak the broad
// view-store surface into app code (mirrors graphOverlays.ts).

import { useMemo } from "react";

import { useViewStore } from "./viewStore";

/**
 * The hidden-category mask as a Set. Selects the STABLE raw list (stable until a
 * toggle) and memoizes the Set — building the Set inside the selector would
 * return a fresh ref every getSnapshot, the cached-snapshot infinite loop
 * (stable-selectors).
 */
export function useHiddenCategorySet(): ReadonlySet<string> {
  const raw = useViewStore((state) => state.hiddenCategories);
  return useMemo(() => new Set(raw), [raw]);
}

/** Toggle one category token's canvas visibility (graph legend dot). */
export function toggleHiddenCategory(category: string): void {
  useViewStore.getState().toggleHiddenCategory(category);
}

/** Replace the canvas category-visibility mask wholesale (e.g. show all). */
export function setHiddenCategories(categories: unknown): void {
  useViewStore.getState().setHiddenCategories(categories);
}
