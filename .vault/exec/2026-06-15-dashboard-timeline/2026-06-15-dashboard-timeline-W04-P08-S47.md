---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S47'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add relation/derivation filter chips sourced from the engine filters enumeration

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the relation/derivation filter chip group, reusing the stage facet-chip pattern (`aria-pressed`, token styling).
- Source the chip vocabulary from the engine filters enumeration through the shared filters-vocabulary hook; never a hardcoded relation list.
- Write the chip choices into the shared filter store's relations facet so the rendered arc kinds follow the engine vocabulary.

## Outcome

Relation chips render the live filters relation enumeration; toggling a chip writes the filter store. Verified by a component test driven through the real mock-engine transport that finds an enumerated relation chip and asserts the store write, proving the vocabulary comes from the wire, not a literal.

## Notes

The chip group is a small shared local component mirroring the stage facet-chip shape, reused for both relation and feature filters so the two bars read alike.
