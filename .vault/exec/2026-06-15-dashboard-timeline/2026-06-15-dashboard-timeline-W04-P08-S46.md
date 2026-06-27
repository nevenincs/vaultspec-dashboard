---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S46'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the phase-lane show/hide toggles to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the `TimelineControls` control-bar component docked at the timeline top edge.
- Render one show/hide toggle per phase-lane entry, iterating the single lane source so the toggle vocabulary never duplicates the lane list.
- Drive lane visibility through the timeline store's per-lane toggle; the pressed toggle reads from store state with a non-color active cue (sunken fill plus strong rule, dashed border when hidden) and a shape-first lane label.

## Outcome

Six phase-lane toggles render with `aria-pressed` reflecting store visibility; clicking writes the store and the surface hides that lane. Verified by a component test that toggles the research lane and asserts both the store write and every lane having a toggle.

## Notes

The toggles are real focusable buttons keyed off the canonical lane list, so the control-bar lane vocabulary stays bound to the one phase-lane source rather than a local copy.
