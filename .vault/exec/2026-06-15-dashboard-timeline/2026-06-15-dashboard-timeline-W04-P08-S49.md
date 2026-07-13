---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S49'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the feature filter to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the feature filter chip group, sourcing its vocabulary from the engine feature-tag enumeration through the shared filters-vocabulary hook.
- Write chosen feature tags into the shared filter store's feature-tags facet so the surface collapses the arcs to that feature's lineage thread.

## Outcome

Feature chips render the live feature-tag enumeration; toggling writes the filter store's feature tags. Verified by a component test driven through the real mock-engine transport that finds an enumerated feature chip and asserts the store write.

## Notes

The feature-tag list is capped to the leading entries for the bar, matching the stage `FilterBar` slice so a large corpus does not flood the control surface.
