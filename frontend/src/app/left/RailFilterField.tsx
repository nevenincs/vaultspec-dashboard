// The rail filter field (binding `LeftRail` 238:600 — the "Search or filter…"
// field between the project header and the tabs). It is the ONE canonical filter
// surface (filtering-has-one-canonical-surface): a FEATURE filter, not a semantic
// search. Two concretized behaviours, deliberately distinct so the field never
// reads as a results-returning search box:
//
//   • TYPE → live FEATURE filter. Keystrokes drive the canonical
//     `dashboardState.filters.text`, narrowing the rail tree (and the graph it
//     projects to) by feature/stem instantly, with no fetch. The placeholder names
//     this explicitly ("Filter by feature…").
//   • FOCUS / the facet affordance → the FINE-TUNED facets pop up: the centralized
//     FilterMenu flyout (KIND / TOPIC / STATUS / HEALTH), the SAME built-out facet
//     UX the graph filter authors. An active-count badge shows applied facets.
//
// Read-only navigation law: this emits no scope/node selection and never fetches;
// it routes text through the shared canonical text-filter draft and owns the facet
// flyout's open-state. There is no semantic-search pillar here — search and feature
// filtering live ONLY in the left rail and the command palette.

import { Badge, SearchField } from "../kit";
import {
  useActiveScope,
  useDashboardFilterSummaryView,
} from "../../stores/server/queries";
import { useDashboardTextFilterDraft } from "../../stores/view/dashboardTextFilter";
import {
  closeFilterSidebar,
  toggleFilterSidebar,
  useFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import { FilterSidebar } from "../stage/FilterSidebar";

export function RailFilterField() {
  const scope = useActiveScope();
  const draft = useDashboardTextFilterDraft(scope);
  const filterOpen = useFilterSidebarOpen();
  const summary = useDashboardFilterSummaryView(scope);

  // Focusing the field reveals the fine-tuned facets (the binding "pop up the
  // filter area" behaviour). Open-only on focus so a re-render never blurs the
  // input; the flyout light-dismisses on Escape / an outside pointer.
  const revealFacets = () => {
    if (!filterOpen) toggleFilterSidebar();
  };

  return (
    <div className="relative" data-rail-filter-area>
      <div
        data-rail-filter
        data-rail-filter-trigger
        onFocusCapture={revealFacets}
        onClick={revealFacets}
      >
        <SearchField
          value={draft.value}
          onChange={draft.setValue}
          onClear={draft.clear}
          placeholder="Filter by feature…"
          ariaLabel="filter the vault by feature"
        />
      </div>
      {summary.activeFilterCount > 0 && (
        <span className="pointer-events-none absolute right-fg-1-5 top-fg-1-5">
          <Badge tone="accent">{summary.activeFilterCount}</Badge>
        </span>
      )}
      <FilterSidebar
        open={filterOpen}
        onClose={closeFilterSidebar}
        scope={scope}
        hidden={{ nodes: 0, edges: 0 }}
      />
    </div>
  );
}
