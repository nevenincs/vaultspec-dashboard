// The compact filter sheet mount (mobile-unified-rail ADR). The canonical corpus
// filter is authored ONLY from the left rail (filtering-has-one-canonical-surface,
// enforced by the filterConsolidation guard, which binds every `FilterSidebar` mount
// to `app/left/`). On compact the unified rail hosts the Browse tree, but the filter
// FLYOUT mount must still live here under `app/left/`; the unified rail renders this
// at its TOP LEVEL — outside the collapsible Browse fold — so the Home top-bar filter
// button keeps working even when Browse is collapsed.
//
// Layer law (dashboard-layer-ownership): dumb chrome. Self-contained: it reads the
// shared filter-sidebar open state and the active scope, and presents the one
// canonical `FilterSidebar` (rendered as a bottom sheet on compact). It authors no
// filter of its own — it re-presents the single corpus-filter surface.

import { useActiveScope } from "../../stores/server/queries";
import {
  closeFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { FilterSidebar } from "../stage/FilterSidebar";

export function CompactFilterSheet() {
  const scope = useActiveScope();
  const filterOpen = useFilterSidebarOpen();
  return (
    <FilterSidebar
      open={filterOpen}
      onClose={closeFilterSidebar}
      scope={scope}
      hidden={{ nodes: 0, edges: 0 }}
    />
  );
}
