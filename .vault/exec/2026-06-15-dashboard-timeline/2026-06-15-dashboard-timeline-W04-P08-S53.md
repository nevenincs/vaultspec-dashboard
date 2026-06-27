---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S53'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the jump-to-date control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the jump-to-date control as a native tabular date input plus a go button, with a Lucide calendar mark; the go button is disabled until a valid date is entered, and Enter in the input triggers the jump.
- Add a pure `jumpToDateOffset` helper that returns the clamped scroll offset centring an instant in the viewport at the current scale (scale unchanged).
- Wire the control to set the store's scroll offset from the parsed date.

## Outcome

Jump-to-date centres the chosen date in the viewport without changing the zoom. Verified by a pure-helper test asserting the centred instant maps back to the viewport centre and clamps at the origin, plus a component test asserting the disabled-when-empty state and the centred offset after entering a date.

## Notes

The jump uses a real native date input so the control is tabular and keyboard-reachable for free; the scale is deliberately left untouched (a jump moves where you look, not how zoomed you are).
