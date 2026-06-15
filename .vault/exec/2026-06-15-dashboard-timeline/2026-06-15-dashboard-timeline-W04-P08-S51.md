---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S51'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add the fit-all control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the fit-all control as a Lucide-iconed button.
- Add a pure `fitSpan` helper that computes the clamped scale and offset to fit a closed date span into the viewport with an inset margin, docking the span start at the left inset.
- Wire fit-all to the engine-enumerated corpus date bounds (a dumb projection of the wire extent), feeding them through `fitSpan` to the store.

## Outcome

Fit-all rescales and offsets the strip so the whole loaded corpus span frames in the viewport. Verified by a pure-helper test asserting the span start docks at the inset and the end stays in frame with the scale clamped, plus a component test asserting fit-all changes scale and docks a non-zero offset against the live corpus bounds.

## Notes

The corpus extent comes from the filters vocabulary date bounds, keeping the control a dumb consumer of the wire rather than computing the span from loaded nodes.
