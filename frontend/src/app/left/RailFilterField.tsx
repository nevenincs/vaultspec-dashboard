// The rail filter area (binding `LeftRail` 238:600 — the "Search or filter…" row
// between the project header and the tabs). It is the ONE canonical filter surface
// (filtering-has-one-canonical-surface), composed of two deliberately distinct
// controls:
//
//   • The FEATURE search bar (FeatureSearchField) — a live, autofilling FEATURE
//     filter driving the canonical backend `feature_query` (glob/regex over feature
//     tags) with no fetch, narrowing the rail tree and the graph it projects to.
//   • A dedicated "Filters" button — the SOLE opener of the advanced-filter flyout
//     (KIND / STATUS / HEALTH / EDITED). The flyout opens ONLY on a button press;
//     focusing or keyboard-navigating the search bar never opens it. An active-count
//     badge on the button shows how many advanced facets are applied.
//
// Read-only navigation law: this emits no scope/node selection and never fetches.
// There is no semantic-search pillar here — feature filtering lives in this bar and
// the command palette only.

import { Filter } from "lucide-react";

import { Badge, IconButton } from "../kit";
import {
  useActiveScope,
  useDashboardFilterSummaryView,
} from "../../stores/server/queries";
import {
  closeFilterSidebar,
  toggleFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { FilterSidebar } from "../stage/FilterSidebar";
import { FeatureSearchField } from "./FeatureSearchField";

export function RailFilterField() {
  const scope = useActiveScope();
  const filterOpen = useFilterSidebarOpen();
  const summary = useDashboardFilterSummaryView(scope);
  const activeFilters = summary.activeFilterCount;

  return (
    <div className="flex items-center gap-fg-2" data-rail-filter-area>
      <div className="min-w-0 flex-1">
        <FeatureSearchField />
      </div>
      <span className="relative shrink-0">
        <IconButton
          label={
            activeFilters > 0
              ? `Advanced filters (${activeFilters} applied)`
              : "Advanced filters"
          }
          active={filterOpen}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          data-rail-filter-trigger
          onClick={() => toggleFilterSidebar()}
        >
          <Filter size={16} aria-hidden />
        </IconButton>
        {activeFilters > 0 && (
          <span className="pointer-events-none absolute right-[-0.25rem] top-[-0.25rem]">
            <Badge tone="accent">{activeFilters}</Badge>
          </span>
        )}
      </span>
      <FilterSidebar
        open={filterOpen}
        onClose={closeFilterSidebar}
        scope={scope}
        hidden={{ nodes: 0, edges: 0 }}
      />
    </div>
  );
}
