---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S33'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the stage filter bar and sidebar from the binding FacetChipGroup primitive over the preserved filter store

## Scope

- `frontend/src/app/stage/FilterBar.tsx`
- `frontend/src/app/stage/FilterSidebar.tsx`

## Description

- Rebuild the stage filter bar and the full filter sidebar onto the new Figma
  role-named token foundation, binding to the FacetChipGroup primitive (Figma node
  136:27).
- Migrate the bar's sidebar toggle and text-match field and the sidebar's section
  rows and toggles from the legacy radius scale to the canonical `rounded-fg-xs`;
  date-range, cost, and section badges to the pill radius (`rounded-fg-pill`).
- Migrate the sidebar overlay panel from the legacy float shadow to the
  three-level overlay elevation (`shadow-fg-overlay`) and dense badges/values to
  the `caption` type role.

## Outcome

Both surfaces are dumb projections over the PRESERVED filter store and the
`useFiltersVocabulary` query — facet values are drawn from the engine-enumerated
vocabulary, nothing hardcoded; they fetch nothing of their own and read no raw
tiers block. The debounced text-match write, the tier dial, the recoverable
hidden-count cost chip, and the Escape-dismiss + focus discipline are preserved
verbatim. The shared `FacetChipGroup` Kit primitive (in the chrome layer) is
consumed unchanged.

## Notes

No store shape or query change. The shared `FacetChipGroup` chrome primitive is
outside this Step's scope fence and was not modified. The aggregate frontend gate
is red on unrelated uncommitted scene-layer WIP from a concurrent builder; both
scoped files here pass eslint, prettier, and tsc cleanly.
