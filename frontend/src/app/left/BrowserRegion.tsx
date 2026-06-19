// The browser region (dashboard-left-rail ADR "Browser" + "In-rail filter" /
// Figma `LeftRail_*`): the single file-thinking region of the rail that hosts the
// TWO browser modes — VAULT (the `/vault-tree` projection re-nested feature →
// doc_type → document) and CODE (the `/file-tree` projection) — behind a
// compact keyboard-reachable toggle, with an in-rail filter above the listing.
//
// Composition only (dashboard-layer-ownership): this region fetches nothing,
// mints no node identity, and reads no `tiers` block — the VaultBrowser and
// CodeTree it mounts each own that through their stores hooks. It reads the
// chosen mode from the browser-mode store and the filter text from canonical
// dashboard state, so browser narrowing, graph filtering, and filter chips share
// one text-filter authority.
//
// The filter narrows the ALREADY-FETCHED listing client-side while the shared
// text-filter draft seam commits the canonical dashboard filter. It issues no
// extra listing request, the deliberate counterpart to the global right-rail
// search pillar.

import { useBrowserMode, useBrowserModeIntent } from "../../stores/view/browserMode";
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
import { BrowserModeToggle } from "./BrowserModeToggle";
import { CodeTree } from "./CodeTree";
import { RailFilter } from "./RailFilter";
import { VaultBrowser } from "./VaultBrowser";

export function BrowserRegion() {
  const scope = useActiveScope();
  const mode = useBrowserMode();
  const setMode = useBrowserModeIntent();
  const textFilter = useDashboardTextFilterDraft(scope);
  // The rail filter area is the one canonical facet-filter surface
  // (filter-consolidation ADR): it owns the flyout open-state and the active-count
  // badge, and mounts the centralized FilterSidebar anchored to the filter row.
  const filterSummary = useDashboardFilterSummaryView(scope);
  const filterOpen = useFilterSidebarOpen();

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-[0.875rem]"
      aria-label="file browser"
      data-browser-region
    >
      {/* Mode toggle + in-rail filter — the region's view-local affordances,
          above the scrollable listing so they stay reachable as the tree grows.
          The filter area is relatively positioned so the facet flyout drops
          anchored to it. */}
      <BrowserModeToggle mode={mode} onModeChange={setMode} />
      <div className="relative" data-rail-filter-area>
        <RailFilter
          modeLabel={mode}
          value={textFilter.value}
          onChange={textFilter.setValue}
          onClear={textFilter.clear}
          filterActiveCount={filterSummary.activeFilterCount}
          filterOpen={filterOpen}
          onToggleFilter={toggleFilterSidebar}
        />
        <FilterSidebar
          open={filterOpen}
          onClose={closeFilterSidebar}
          scope={scope}
          hidden={{ nodes: 0, edges: 0 }}
        />
      </div>

      {/* The active mode's browser, all three narrowed by the same in-rail
          filter. The listing scrolls; the affordances above stay pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "code" ? (
          <CodeTree filter={textFilter.value} />
        ) : (
          <VaultBrowser filter={textFilter.value} />
        )}
      </div>
    </section>
  );
}
