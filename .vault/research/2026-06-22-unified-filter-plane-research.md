---
tags:
  - '#research'
  - '#unified-filter-plane'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - '[[2026-06-19-filter-consolidation-adr]]'
  - '[[2026-06-19-filter-consolidation-research]]'
  - '[[2026-06-19-filter-controls-adr]]'
  - '[[2026-06-17-dashboard-state-centralization-audit]]'
---

# `unified-filter-plane` research: `unified filter plane`

This research maps how filtering flows today across the four owned layers — the
`vaultspec` engine wire, the `frontend/src/stores/` TanStack layer, the
`frontend/src/scene/` graph, and the `frontend/src/app/` chrome (left rail,
graph stage, timeline) — to ground a binding decision that standardizes
filtering BEHAVIOUR and INTENT across every surface.

The user directive: a single global filter and display must drive every UI
component. When the left rail's feature filter has a value set, the graph AND
the timeline must respond; and a category narrowing performed on the graph must
in turn drive the rail and timeline. The controls are not uniform today — the
graph carries a per-category toggle the rail and timeline never see, the timeline
ignores the feature filter entirely, and two engine settings are a second
filtering authority. This document is the rag-grounded map that the
`unified-filter-plane` ADR decides against.

All findings below are sourced from direct file inspection (file:line), grounded
by `vaultspec-rag` semantic search across the engine and frontend.

## Finding 1 — State is already one plane; the gap is in the CONTROLS and the CONSUMERS, not the model

There is exactly ONE canonical filter shape and ONE persisted authority:

- The engine owns a single `Filter` struct (`engine/crates/engine-query/src/filter.rs`)
  with twelve facets: `tiers`, `min_confidence` (per-tier), `relations`,
  `structural_state`, `kinds`, `doc_types`, `feature_tags`, `feature_query`
  (glob/regex over feature tags, compiled + thread-cached), `statuses`,
  `plan_tiers`, `health` (graph-context: dangling/orphaned), `text`, and
  `date_range`. `Filter::validated()` sorts/dedupes/validates and echoes the
  normalized form back to the client (contract §4).
- The persisted dashboard state stores that exact shape:
  `DashboardState.filters: Filter` (`engine/crates/vaultspec-api/src/routes/state.rs`),
  patched as-is via `PATCH /dashboard-state` with `filters: Option<Filter>`,
  LRU-bounded to 16 scopes. No schema divergence between the engine filter and
  the persisted filter.
- The frontend writes that one slice through a single seam,
  `useDashboardStateMutations` (`frontend/src/stores/server/dashboardState.ts`):
  `setFilters`, `setTextFilter`, `setFeatureQuery`, `toggleFilterFacet`,
  `setDateRange`, `setFiltersAndDateRange`. Every verb reads the current cached
  filter before patching, so writes compose atomically.

The 2026-06-19 filter-consolidation cycle already centralized the STATE and the
CONTROL PLACEMENT (left rail is the sole facet author; a structural guard test
`frontend/src/app/filterConsolidation.guard.test.ts` fails the build if a facet
control mounts outside `app/left/`). What it did NOT do — and what this campaign
addresses — is make every corpus-projecting view actually CONSUME that one plane,
and reconcile the controls that bypass it.

## Finding 2 — The graph fully consumes the canonical filter

`dashboardGraphFilter(state)` (`frontend/src/stores/server/dashboardState.ts`)
clones `state.filters` and overlays `state.date_range`, and
`dashboardGraphQueryVariables(state)` sends it as the `filter` body of
`POST /graph/query`. The engine route accepts the full `Filter`
(`engine/crates/vaultspec-api/src/routes/query.rs`, `GraphQueryBody.filter`),
validates it, and applies all twelve facets via `matches_node` / `matches_edge`
/ the health pass. So the graph is a correct, complete consumer: any facet set in
the rail narrows the graph today.

## Finding 3 — The timeline does NOT consume the canonical filter (the central defect)

`Timeline.tsx` calls `useTimelineLineageView(scope)` with NO filter argument
(`frontend/src/app/timeline/Timeline.tsx:998`). The hook's signature accepts an
optional `filter`/`range`/`asOf` (`frontend/src/stores/server/queries.ts`,
`useTimelineLineageView`), and the lineage query key folds `(scope, range,
filter, asOf)` — and the engine `GET /graph/lineage` route DOES accept a
URL-encoded `Filter` (`engine/crates/vaultspec-api/src/routes/temporal.rs`,
`LineageParams.filter`). The wire supports it end-to-end; the timeline simply
never passes it. The timeline narrows only by date-range (which it authors as the
sole writer) and a lane-visibility switch (a view-state flip over phase lanes,
not a corpus filter).

This is exactly the asymmetry the directive targets: set a feature filter in the
rail and the rail tree + graph narrow, but the timeline keeps showing the whole
corpus. The prior `2026-06-19-filter-consolidation-adr` RATIFIED this on purpose
(it framed the timeline as a date-centric phase-lane view, not a facet-filtered
projection). The directive revises that boundary.

## Finding 4 — The graph carries a competing scene-local control that never cross-wires

The graph legend's coloured category dots are toggles backed by a canvas-local
mask, `hiddenCategories`, in the view store
(`frontend/src/stores/view/viewStore.ts`, `toggleHiddenCategory`), surfaced
through the named seam `frontend/src/stores/view/graphCategoryVisibility.ts` and
clicked from `frontend/src/app/stage/CategoryLegend.tsx`. By construction it
hides node categories on the canvas ONLY and explicitly never writes
`dashboardState.filters`, so the rail tree and timeline are unaffected. The scene
composes it over the canonical filter result via
`frontend/src/stores/view/dashboardFilterChoices.ts`.

This is the "graph has a per-type toggle" non-uniformity. It is a second,
view-local filtering authority that competes with the canonical `doc_types`/
`kinds` facet authored from the rail flyout (`FilterSidebar`/`FilterMenu`, KIND
section). The same intent — "narrow to these categories" — is expressed two ways
that do not agree.

## Finding 5 — Two engine settings are a third authority, but already fold INTO the canonical filter on load

`label_filter` and `confidence_floor` are declared in the engine settings schema
(`engine/crates/vaultspec-session/src/settings_schema.rs`, group "Graph",
global-only). They are NOT a query-time bypass: on scope load the frontend
`dashboardGraphSettingsDefaultsPatch` (`frontend/src/stores/server/dashboardState.ts`)
converts `confidence_floor` (percent) into `filters.min_confidence` for the
temporal/semantic tiers and `label_filter` into `filters.text`, then writes the
canonical `dashboardState.filters`. So these initialize the one plane rather than
shadowing it. The standardization obligation here is documentary (name them as
defaults that seed the canonical filter), not a re-plumb.

## Finding 6 — The backend wire is uneven across the temporal surfaces

- `POST /graph/query` — accepts the full `Filter`. ✓
- `GET /graph/lineage` — accepts the full `Filter` as URL-encoded JSON. ✓ (but
  no caller passes it, per Finding 3).
- `GET /graph/asof` — hardcodes `Filter::default()`
  (`engine/crates/vaultspec-api/src/routes/temporal.rs`): a time-travelled
  snapshot ignores the active filter. ✗
- `GET /events` — accepts only `scope`, `from`, `to`, `kinds`, `bucket`; no
  `Filter` facets (`temporal.rs`, `EventsParams`). ✗
- `GET /vault-tree` — serves the full memoized tree; the rail narrows it
  client-side (`useVaultRailFacets` + the client-side apply in
  `frontend/src/stores/server/queries.ts`). Consistent and bounded, but a
  different mechanism than the graph's server-side narrowing.
- `POST /search` — semantic rag pass-through; a distinct concept, fenced from
  filtering and intentionally untouched.

For the timeline to honour the canonical filter, the front-end gap (Finding 3)
is the only required change if the timeline renders from `lineage`. Whether the
`events` lane and `/graph/asof` must also accept the `Filter` is the wire-contract
decision the ADR settles.

## Finding 7 — Cross-wiring is automatic once every view reads the one plane

Because `dashboardState.filters` is a single TanStack-cached, backend-persisted
record, any surface that reads it via its stores hook re-renders when it changes,
and any surface that writes it via `useDashboardStateMutations` updates every
reader. "Bidirectional" therefore needs no event bus or signal: it is a
consequence of one authority + many subscribers (the `dashboard-layer-ownership`
and `views-are-projections-of-one-model` rules). The only reason the graph
category toggle and the timeline are not bidirectional today is that one writes a
private mask and the other reads no filter — both are violations of the
single-plane model, not missing plumbing.

## Decision inputs for the ADR

1. **Intent law (resolved with the user):** there is ONE filter authority. Every
   control whose meaning is "narrow the corpus" writes `dashboardState.filters`
   and therefore cross-wires to the rail, graph, and timeline. There is no
   competing canvas-local visibility mask; the graph legend toggle is promoted to
   write the canonical `doc_types`/`kinds` facet, and `graphCategoryVisibility.ts`
   is retired (Finding 4).
2. **Consumer obligation:** the timeline must narrow its lineage by the canonical
   filter (Finding 3), revising the prior date-only boundary.
3. **Wire contract:** decide which temporal endpoints (`/events`, `/graph/asof`)
   must accept the `Filter` so every projection of the corpus is narrowed
   identically (Finding 6).
4. **Settings:** document `label_filter`/`confidence_floor` as canonical-filter
   seeds, not a second authority (Finding 5).
5. **Guardrails:** extend the existing structural guard so a future surface that
   reads the corpus without consuming the canonical filter, or writes a private
   filter/visibility mask, fails the gate (Findings 1, 4, 7).
