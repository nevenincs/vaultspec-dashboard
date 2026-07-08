---
name: filtering
---

# Filtering: one authority, every corpus view consumes it

- **One corpus-filter authority.** The backend-persisted `dashboardState.filters` record (engine `Filter` grammar) is the only corpus filter, written through the stores mutation seam (`toggleFilterFacet` / `useDashboardFilterSidebarIntent`). Every control that narrows the corpus writes a facet of that one record; every corpus view (rail tree, graph, timeline) consumes it, so all surfaces narrow in lock-step. No surface holds a private corpus-filter or a private node-visibility mask.
- **The advanced facet flyout is authored only from the left rail** (`frontend/src/app/left/`, mounting `FilterSidebar` / `FilterMenu`). Every other surface is a pure consumer with no filter control. The graph legend may co-author only the canonical `doc_types` facet through the shared write seam.
- **Filter vs presentation.** A control that narrows the corpus is a filter and writes the record. A control that only changes how one view renders the same corpus (timeline lane collapse, label density, graph layout/appearance/salience, focus, representation mode) is view-local and never touches `dashboardState.filters`.
- Date range is written only by the timeline's interactive Setter. The right-rail semantic Search pillar (`POST /search`) is distinct from filtering — keep the two fenced.
- **A client-narrowed listing holds the complete paginated set.** When a stores reader narrows a listing on the client, its wire client walks the cursor to completion (page size = the route's max, bounded page cap) — or forwards the facet to the engine. Never narrow a partial first page; matches beyond it vanish silently.
- Guard: `filterConsolidation.guard.test.ts` (fails on a private mask or a non-consuming corpus view).
