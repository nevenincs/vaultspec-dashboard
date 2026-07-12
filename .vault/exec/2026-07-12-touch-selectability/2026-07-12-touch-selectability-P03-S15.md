---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Carve the computed date-range readout out of the timeline scrubber selection suppression

## Scope

- `frontend/src/app/timeline/TimelineRangeSelector.tsx`

## Description

- Add `select-text` to the computed date-range readout span, carving it out of the scrubber strip's gesture-chrome `select-none`

## Outcome

The readout (data) is selectable while the scrubber track and grips keep their drag-gesture suppression, matching the ADR's adjunct scoping law.

## Notes

