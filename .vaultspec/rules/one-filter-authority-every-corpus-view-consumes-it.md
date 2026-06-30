---
derived_from:
  - "audit:2026-06-22-unified-filter-plane-audit"
---

# One filter authority: every control that narrows the corpus writes the one plane, every corpus view consumes it

## Rule

There is exactly ONE corpus-filter authority — the backend-persisted
`dashboardState.filters` record (the engine `Filter` grammar, written through the
`frontend/src/stores/` mutation seam, e.g. `toggleFilterFacet` /
`useDashboardFilterSidebarIntent`). Every control whose meaning is "narrow the
corpus" — wherever it lives (the left rail's advanced flyout, the graph legend's
category dots, a future surface) — writes a facet of that one record and nothing
else; and every view that PROJECTS the corpus (the rail tree, the graph, the
timeline) CONSUMES that one record so it narrows in lock-step. A control whose
meaning is only "present THIS view differently" (timeline phase-lane collapse,
label density, graph layout/appearance params, salience lens, focus,
representation mode) stays view-local and is explicitly NOT a filter — it carries
no "narrow the dataset" meaning and never cross-wires. No surface may hold a
private corpus-filter or a private node-visibility mask.

## Why

The `2026-06-22-unified-filter-plane-adr` (accepted) settled the filtering INTENT
after the research found the state was already one plane but two things bypassed
it: the timeline consumed no filter (it showed the whole corpus while the rail and
graph narrowed), and the graph legend wrote a private canvas-local
`hiddenCategories` mask that never reached the rail or timeline. Both are the same
defect — a corpus-narrowing control or view that does not go through the one
authority — and both produce the "why didn't the other surface update?" class of
bug. This rule EXTENDS `filtering-has-one-canonical-surface` from control
PLACEMENT (that rule fences the advanced facet *flyout* to the left rail) to
control INTENT plus universal CONSUMPTION: the authority is one STATE, authorable
from more than one surface (the user chose to let the graph legend co-author
`doc_types`), consumed by every corpus view. Because the record is one
TanStack-cached, backend-persisted object, cross-wiring is then free — many
subscribers, one writer-target — with no event bus. The cycle verified it live
end-to-end: one click on any facet (`doc_types` from the legend; `plan_states`,
`statuses`, `health` from the flyout) fires `PATCH /dashboard-state` then refetches
`POST /graph/query` + `GET /graph/lineage?filter=…`, and the facets COMPOSE on the
single record (a HEALTH click's wire carried both `statuses` and `health`).

## How

- **Good:** a surface needs to narrow the corpus by a facet — it calls the shared
  filter-write seam (`toggleFilterFacet` via `useDashboardFilterSidebarIntent`, or
  `setFeatureQuery`) so the facet lands on `dashboardState.filters`; the rail tree,
  the graph (`/graph/query`), and the timeline (`/graph/lineage?filter=`) all narrow
  from that one record. A new facet is one more field on the record, picked up by
  every consumer for free.
- **Good:** a control changes only how one view renders the SAME corpus (collapse a
  timeline lane, change label density, tune graph forces, switch the salience lens)
  — it stays in that view's local state and never touches `dashboardState.filters`.
- **Bad:** a surface hides corpus nodes through a private mask (the retired
  `hiddenCategories` / `graphCategoryVisibility` seam, a local "visible set" the
  other views can't see), or a corpus view fetches its slice without forwarding the
  canonical filter (the timeline that read `lineage` with no `filter` arg) — both
  desync the surfaces and are fenced by `filterConsolidation.guard.test.ts`, which
  fails the build on a private-mask token or a non-consuming timeline.

## Status

Active. Promoted from the `2026-06-22-unified-filter-plane-adr` codification
candidate on explicit user direction (ahead of the usual one-cycle wait), after the
one-authority model was verified live across all four facets. It EXTENDS, and does
not replace, `filtering-has-one-canonical-surface`: that rule still fences the
advanced facet flyout to the left rail; this rule governs the filter-vs-visibility
INTENT and the universal-consumption obligation, and relaxes the "one surface"
reading to "one STATE, authorable from more than one surface, consumed by all."

## Source

ADR `2026-06-22-unified-filter-plane-adr` (decisions D1, D2, D6) and audit
`2026-06-22-unified-filter-plane-audit` (the live four-facet verification). Sibling
rules `filtering-has-one-canonical-surface` (the control-placement rule this
extends), `dashboard-layer-ownership` and `views-are-projections-of-one-model` (the
one-way boundaries that make many-consumers-one-authority safe), `stable-selectors`
(the consumer selectors this adds must select raw + derive in `useMemo`).
