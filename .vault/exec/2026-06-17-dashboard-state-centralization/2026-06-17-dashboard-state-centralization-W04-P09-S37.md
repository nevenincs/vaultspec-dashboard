---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S37'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Make timeline controls read filter, date range, lens, and timeline mode from canonical dashboard state

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Make timeline controls display canonical dashboard date range when present.
- Route range selection through the shared active scope and dashboard date-range mutation.
- Remove `viewStore.timelineMode` fallbacks from playhead, time-travel, stage, right rail, command palette, and context-menu subscribers.
- Route graph layout and salience lens controls through canonical dashboard state.

## Outcome

Closed S37. Timeline controls and time-travel subscribers now read timeline mode, date range, lens, and representation state from dashboard-state, with the timeline store retained only for viewport/playhead geometry.

## Notes

The range/playhead pure tests now assert local timeline geometry; dashboard mutation behavior is exercised through mounted scoped subscribers.
