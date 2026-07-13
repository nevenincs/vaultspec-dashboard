---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S52'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the fit-feature control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the fit-feature control as a Lucide-iconed button, disabled until a feature filter is active.
- Compute the active feature's date span from the committed date range when one is set, falling back to the corpus bounds, and feed it through the shared `fitSpan` helper to the store.

## Outcome

Fit-feature is disabled with no feature filter and enables once a feature tag is chosen; activating it fits the feature's span. Verified by a component test asserting the disabled-then-enabled transition when a feature chip is toggled.

## Notes

The feature filter alone narrows which arcs draw, not the dates, so fit-feature derives its span from the committed range or corpus bounds rather than re-deriving member dates; a tighter per-feature date span is a natural follow-on once the lineage hook exposes feature extents.
