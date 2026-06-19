// FilterSidebar — the stores CONTAINER for the unified filter flyout
// (filter-controls campaign; binding Figma "graph/Filter menu" 217:633). It reads
// canonical dashboard-state + the served filter vocabulary and feeds the dumb
// presentational <FilterMenu/>; it never fetches and never reads a raw tiers block
// (dashboard-layer-ownership). Delivered as an anchored flyout dropping from the
// toolbar "Filter ▾" control — an OPAQUE overlay popover on the binding popover
// elevation (bg-paper, not a translucent panel: a frosted/`/95` panel composites
// see-through over the portal-pinned WebGL graph canvas and reads as broken), light-
// dismissed on Escape or an outside pointer (the toolbar is excluded so its own
// toggle owns open/close).
//
// Sections: KIND (doc types) · TOPIC (feature tags + client-side search) · STATUS
// (lifecycle — ADR adjectives + plan meta-states) · HEALTH (validity —
// dangling/orphaned…) · EDITED (shared date-range window). STATUS/HEALTH render only
// when the engine serves their vocabulary, so they are never dead controls.

import { Popover } from "../kit";
import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import { useDateRangeIntent } from "../../stores/server/dateRangeIntent";
import {
  dashboardEditedWindowRange,
  type DashboardEditedWindow,
  useDashboardFilterSidebarView,
  useFiltersVocabularyView,
} from "../../stores/server/queries";
import {
  clearFilterSidebarTopicSearch,
  deriveFilterSidebarMenuSections,
  setFilterSidebarTopicSearch,
  useFilterSidebarTopicSearch,
  useFilterSidebarVisualState,
} from "../../stores/view/filterSidebar";
import { FilterMenu } from "./FilterMenu";

// ---------------------------------------------------------------------------

export interface FilterSidebarProps {
  /** Whether the flyout is visible. */
  open: boolean;
  /** Close the flyout. */
  onClose: () => void;
  /** Scope for vocabulary + dashboard-state queries. */
  scope: string | null;
  /** Hidden count — owned by Stage's visibility reduction (the toolbar already
   *  surfaces the recoverable cost; reserved for a future footer). */
  hidden: { nodes: number; edges: number };
}

export function FilterSidebar({ open, onClose, scope }: FilterSidebarProps) {
  const vocabulary = useFiltersVocabularyView(scope);
  const filterView = useDashboardFilterSidebarView(scope);
  const filterIntent = useDashboardFilterSidebarIntent(scope);
  const rangeIntent = useDateRangeIntent(scope);
  const topicSearch = useFilterSidebarTopicSearch();
  // Reset the disclosure/search store when the scoped vocabulary changes so the
  // topic search never rides across a different corpus.
  const visualStateKey = useFilterSidebarVisualState(
    scope,
    vocabulary.docTypes,
    vocabulary.featureTags,
    vocabulary.statuses,
    vocabulary.health,
  );
  const presentation = filterView.presentation;

  const sections = deriveFilterSidebarMenuSections({
    vocabulary,
    filterView,
    topicSearch,
    onTopicSearchChange: setFilterSidebarTopicSearch,
    onToggleFacet: (facet, value) => void filterIntent.toggleFacet(facet, value),
    onEditedWindowSelect: (value: DashboardEditedWindow) =>
      void rangeIntent.setRange(dashboardEditedWindowRange(value)),
  });

  if (!open) return null;

  return (
    // The shared kit Popover owns the light-dismiss wiring (Escape + outside
    // pointer); `ignoreSelector` excludes the external toolbar trigger so it owns
    // its own open/close without a dismiss-then-reopen race.
    <Popover
      open={open}
      onDismiss={onClose}
      ignoreSelector="[data-filter-bar]"
      role="dialog"
      aria-label={presentation.panelAriaLabel}
      aria-modal={false}
      className={presentation.panelClassName}
      data-filter-sidebar
    >
      <FilterMenu
        key={visualStateKey}
        title={presentation.titleLabel}
        anyActive={filterView.anyActive}
        onClearAll={() => {
          void filterIntent.clearFilters();
          void rangeIntent.clearRange();
          clearFilterSidebarTopicSearch();
        }}
        sections={sections}
        maxHeight="calc(100vh - 3.5rem)"
      />
    </Popover>
  );
}
