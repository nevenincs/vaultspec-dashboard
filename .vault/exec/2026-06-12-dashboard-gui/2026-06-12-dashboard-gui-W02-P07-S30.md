---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S30'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the facet chip bar for doc type, feature, relation, structural status, text match, with the hidden-count chip per G3.f

## Scope

- `frontend/src/app/stage/FilterBar.tsx`

## Description

- Add `frontend/src/app/stage/FilterBar.tsx`: the bar docked at the
  stage's top edge (part of the instrument, not global chrome) - tier
  dial first, then facet chips for doc type, feature, and structural
  status, a text-match input, the read-only timeline-owned date-range
  chip, and the hidden-count cost chip ("filtered-out is recoverable
  context").
- Facet values come from the engine-enumerated vocabulary endpoint -
  nothing hardcoded; the structural status triple is the contract's own
  enum.
- Wire the stage: visibility membership computed once per
  (slice, choices) pair feeds both the seam `set-visibility` command and
  the cost chip; the working-set chip trail moved below the bar.
- Add `frontend/src/app/stage/FilterBar.test.ts` covering the dial's fixed
  order, semantic inapplicability (S29), and the cost-chip label rules.

## Outcome

The full filter surface is live above the field: toggles, floors, facets,
and text drive animated membership diffs, and the cost is always named.
Gates green: typecheck, eslint, vitest (143 passed), prettier.

## Notes

Feature and relation chip rows are capped to the first handful of
vocabulary values for bar compactness; the full enumerations surface
through the palette (S43) and inspector (S42). The bar shows the
high-traffic facets; nothing is hardcoded.

