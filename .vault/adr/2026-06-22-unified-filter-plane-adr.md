---
tags:
  - '#adr'
  - '#unified-filter-plane'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - "[[2026-06-22-unified-filter-plane-research]]"
  - "[[2026-06-19-filter-consolidation-adr]]"
  - "[[2026-06-19-filter-controls-adr]]"
---

# `unified-filter-plane` adr: `unified filter plane` | (**status:** `accepted`)

## Problem Statement

Filtering behaviour and intent are not uniform across the dashboard's
corpus-projecting surfaces, even though the filter STATE is already one
canonical plane. The `unified-filter-plane` research mapped three concrete
asymmetries:

- The left rail authors the canonical filter (`dashboardState.filters`) and the
  graph fully consumes it, but the TIMELINE consumes none of it — it narrows only
  by the date range it itself writes, so a feature filter set in the rail leaves
  the timeline showing the whole corpus.
- The graph carries its OWN per-category toggle (the legend's coloured dots,
  backed by a canvas-local `hiddenCategories` mask) that hides node types on the
  canvas only and deliberately never writes the canonical filter — a second,
  view-local filtering authority expressing the same "narrow to these categories"
  intent as the rail's KIND facet, but in a way that never cross-wires.
- The engine settings `label_filter` and `confidence_floor` look like a third
  filtering authority (though they already fold into the canonical filter on
  load).

The user directive is explicit: a single global filter and display must drive
every UI component. When the rail's feature filter has a value, the graph AND the
timeline must respond; and a category narrowing performed on the graph must drive
the rail and timeline in turn. This ADR binds that one-authority model across the
whole stack — backend wire, TanStack stores, scene, and chrome — so the controls
and their cross-wiring are uniform and the FILTER-vs-VISIBILITY intent is settled,
once, for every future surface.

This supersedes one boundary of the accepted `2026-06-19-filter-consolidation-adr`
(which deliberately ratified the timeline as a date-only, non-facet-filtered
view). It does NOT disturb that ADR's other settled decisions: the left rail
remains the sole facet-CONTROL author, the timeline remains the sole date-range
WRITER, and the right rail's semantic Search pillar stays fenced from filtering.

## Considerations

- **State is not the gap.** There is one `Filter` shape (twelve facets) in
  `engine-query`, persisted verbatim as `DashboardState.filters`, written through
  one stores seam (`useDashboardStateMutations`). Centralization of the STATE and
  of control PLACEMENT was already achieved in the 2026-06-19 cycle and is guarded
  by `filterConsolidation.guard.test.ts`. The remaining gaps are (a) views that do
  not CONSUME the plane and (b) a control that bypasses it.
- **Cross-wiring is free once every view reads the one plane.** Because
  `dashboardState.filters` is a single TanStack-cached, backend-persisted record,
  every subscriber re-renders on change and every writer reaches every subscriber.
  "Bidirectional" needs no event bus or signal — it is a consequence of one
  authority with many subscribers (`dashboard-layer-ownership`,
  `views-are-projections-of-one-model`). The graph toggle and the timeline are
  non-bidirectional today purely because one writes a private mask and the other
  reads no filter.
- **Filter vs visibility is the intent question.** A control means one of two
  things: "narrow the corpus" (a FILTER — must drive every corpus view) or "change
  how THIS view presents what is already there" (a VISIBILITY/presentation flip —
  no dataset meaning, never cross-wires). The graph category toggle straddled
  these. Resolved with the user: category narrowing is a FILTER. There is no
  competing canvas-local category-visibility concept.
- **Genuine presentation flips remain view-local and legitimate.** The timeline's
  phase-lane collapse, label density, graph layout/appearance params
  (`set-force-params` / `set-appearance-params`), salience lens, focus, and
  representation mode change how a view renders or emphasises the SAME corpus —
  they carry no "narrow the dataset" meaning and stay where they live. The intent
  law distinguishes them from filters; it does not collapse them into the filter.

## Constraints

- **No engine semantics drift.** The engine stays read-and-infer
  (`engine-read-and-infer`); widening a temporal route to accept the existing
  `Filter` is a parameter-plumbing change over the already-shipped filter grammar,
  not new filtering logic. The `Filter` struct, its validation, and the tiers
  envelope are unchanged.
- **Layer ownership is preserved.** Only `frontend/src/stores/` writes the wire and
  reads the raw filter; scene and chrome consume projected results
  (`dashboard-layer-ownership`, `view-rewrite-preserves-the-state-and-scene-contract`).
  Promoting the graph legend toggle means routing its click through the stores
  filter-write seam, not giving the scene a new fetch.
- **Bounded by default.** Any widened query keeps the existing bounds — the graph
  node ceiling and constellation LOD default (`graph-queries-are-bounded-by-default`),
  the lineage range bound, the events walk limit. A filter NARROWS; it never lifts
  a ceiling.
- **Selector discipline.** New consumer selectors (timeline filter, promoted
  category facet) return raw stable state and derive in `useMemo`
  (`stable-selectors`) — the timeline lineage read must not start refetching on
  every viewport nudge; only a filter/as-of change is a new query identity.
- **Parent-feature stability.** Every dependency is shipped and stable: the
  `Filter` grammar, the `PATCH /dashboard-state` authority, `GET /graph/lineage`'s
  existing `filter` param, the stores mutation seam, and the structural guard
  test. No frontier risk; this is convergence work over mature surfaces.

## Implementation

A high-level layering of WHAT changes; the execution plan sequences it.

**D1 — One filter authority; the intent law (BINDING).** Every control whose
meaning is "narrow the corpus" writes `dashboardState.filters` through the stores
mutation seam and therefore drives the rail tree, the graph, and the timeline.
Every control whose meaning is "present THIS view differently" stays view-local
and is explicitly NOT a filter. No surface holds a private corpus-filter or a
private category-visibility mask.

**D2 — Promote the graph category toggle to the canonical filter.** The legend's
category dots write the canonical `doc_types`/`kinds` facet via
`toggleFilterFacet` instead of the canvas-local `hiddenCategories` mask. Toggling
a category off on the graph removes that category from the rail tree, the graph,
and the timeline together. The canvas-local visibility seam
(`graphCategoryVisibility.ts`, the `hiddenCategories` view-store slice, and the
scene compose step that applied it) is retired. The legend remains the
colour/shape key and now reflects the canonical filter's active state.

**D3 — The timeline consumes the canonical filter.** The timeline passes
`dashboardState.filters` to its lineage read (the hook and the
`GET /graph/lineage` route already accept a `filter`; the timeline simply never
supplied it). The lineage query identity folds the filter, so a filter change is a
new bounded query while viewport scroll/zoom remains in-memory windowing (no
refetch). The timeline's phase-lane visibility switch stays a view-local
presentation flip (D1), and the timeline remains the sole date-range writer.

**D4 — Even out the temporal wire contract.** Every endpoint that projects the
corpus accepts the same canonical `Filter`: `GET /graph/asof` takes a filter
(time-travel honours the active filter instead of hardcoding
`Filter::default()`), and the timeline's event lane is narrowed by the canonical
filter — either by routing the lane through the already-filterable `lineage`
projection or by widening `GET /events` to accept the `Filter` facets in addition
to its `from`/`to`/`kinds`/`bucket` window. `GET /vault-tree` continues to serve
the full bounded tree narrowed client-side by the same canonical filter (its
existing, bounded mechanism); `POST /search` stays fenced as semantic search, not
filtering.

**D5 — Settings are canonical-filter seeds, not a second authority.**
`label_filter` and `confidence_floor` are documented and treated as defaults that
SEED `dashboardState.filters.text` / `.min_confidence` on scope load (the existing
`dashboardGraphSettingsDefaultsPatch` behaviour), never a query-time bypass. No
re-plumb; this decision pins the intent so a future change cannot turn them into a
shadow authority.

**D6 — Guardrails.** The structural guard is extended so a future surface that
projects the corpus without consuming the canonical filter, or that introduces a
private filter / category-visibility mask, fails the gate — the same
build-breaking discipline that already fences facet-control placement.

## Rationale

The research established that the model is already singular; the failures are a
non-consuming view (timeline, Finding 3) and a bypassing control (graph category
toggle, Finding 4), with an uneven wire (Finding 6) underneath. The cheapest
correct fix is therefore not new architecture but enforcing the one-authority
model everywhere: route the bypassing control through the canonical write seam and
make the non-consuming view read the plane. The user resolved the one genuine
intent fork by choosing a single global filter with no competing canvas-local
visibility concept (research "Decision inputs" item 1), which makes D2 a retirement
rather than a renaming and keeps the intent law crisp: a control either narrows the
corpus (and cross-wires) or it does not (and stays local). Cross-wiring then
follows for free from one TanStack-cached authority (Finding 7), so the directive's
"graph and timeline respond, and vice versa" is satisfied without an event/signal
layer. Evening out the wire (D4) is required so that the timeline and time-travel
snapshots narrow IDENTICALLY to the graph rather than approximately — the contract
must not let one projection of the corpus disagree with another about what the
active filter means.

## Consequences

- **Gains.** One filter drives every corpus view bidirectionally; the controls
  read uniformly (narrow-the-corpus always cross-wires, present-this-view never
  pretends to); a whole class of "why didn't the timeline/graph update?" defects
  becomes structurally impossible; the intent law gives every future surface an
  unambiguous home for a new control.
- **Honest difficulties.** D2 removes a capability some users may rely on — a
  transient canvas-only declutter that did NOT disturb the rest of the dashboard.
  Under the one-authority model, hiding a category on the graph now also hides it
  in the rail and timeline. This is the deliberate, user-chosen trade (uniformity
  over a local-only convenience); if a transient graph-only declutter is later
  wanted back, it must be reintroduced as a DECLARED view-local visibility flip
  (D1), never as a private corpus filter.
- **Wire change blast radius.** D4 touches temporal routes (`/graph/asof`,
  `/events` or the lineage lane). The mock engine double must mirror the widened
  shape exactly (`mock-mirrors-live-wire-shape`) or the timeline filter passes in
  mock and breaks live. Time-travel now varies with the active filter, so cached
  as-of reads key on the filter too.
- **Pathways opened.** With the intent law in place, future facets (a new tier or
  relation control, a saved-filter set) drop into the one plane and reach every
  view automatically; and a future "lens"/emphasis feature has a clean, separate
  home that cannot be confused with filtering.
- **Pitfalls.** The timeline lineage read must fold the filter into query identity
  WITHOUT folding the viewport (or every scroll refetches — `stable-selectors`,
  the existing no-refetch windowing contract). The promoted category toggle must
  write through the stores seam, not give the scene a fetch
  (`dashboard-layer-ownership`).

## Codification candidates

- **Rule slug:** `one-filter-authority-every-corpus-view-consumes-it`.
  **Rule:** Every control that narrows the corpus writes the single canonical
  `dashboardState.filters` through the stores mutation seam and is consumed by
  every corpus-projecting view (rail tree, graph, timeline); a view-local control
  may only change how THAT view presents the same corpus (lane collapse, label
  density, layout/appearance, lens, focus) and must never hold a private
  corpus-filter or category-visibility mask. This extends
  `filtering-has-one-canonical-surface` from control PLACEMENT to control INTENT +
  universal CONSUMPTION, and is a candidate only after it holds across one full
  execution cycle.
