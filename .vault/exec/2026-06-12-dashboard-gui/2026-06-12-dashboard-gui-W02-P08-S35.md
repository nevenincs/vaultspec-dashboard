---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S35'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement range selection as the product's single date-range filter with play-the-range growth animation per G4.c

## Scope

- `frontend/src/app/timeline/RangeSelect.tsx`

## Description

- Add `frontend/src/app/timeline/RangeSelect.tsx`: shift-drag across the
  timeline selects a band (plain drag stays the playhead's) and commits it
  as the product's SINGLE date-range filter - written into the S28 filter
  model's `dateRange`, which both views read and the filter bar shows as
  the timeline-owned chip (G4.c).
- Implement play-the-range: the band's play action animates the playhead
  linearly across the range on animation frames (`useRangePlayer` mounted
  with the timeline), driving real time-travel scrubs through S34 - the
  network visibly grows. Pure, tested `playPosition` and `rangeFromDrag`.
- The clear action drops the range and docks the playhead back to LIVE.

## Outcome

One temporal filter, owned by the timeline, with the growth-animation
story working end-to-end against the mock. Gates green: typecheck, eslint,
vitest (168 passed), prettier.

## Notes

Play uses the default 4s traversal; reduced-motion handling for the play
animation rides S48 with the rest of the motion floor.
