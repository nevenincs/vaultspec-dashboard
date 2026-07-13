---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S55'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the range-select chip with play-the-range to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the range-select chip rendering the committed date range as a clearable, tabular chip in the control bar.
- Wire the clear action to empty the date range through the single date-range writer and return the playhead toward LIVE.
- Reuse the existing range-player (the play trigger plus the mounted RAF driver hook) so the chip's play button animates the playhead across the committed band.

## Outcome

The range chip appears only when a range is committed, with tabular bounds, a play trigger, and a clear that empties the range and returns toward LIVE. Verified by a component test that seeds a committed range, asserts the play control renders, clears it, and asserts the date range empties.

## Notes

The chip writes the date range ONLY through the shared single date-range writer, preserving the single-date-range-writer invariant; the play behavior reuses the retained range-player from the existing range-select so reduced-motion and the RAF loop discipline come for free.
