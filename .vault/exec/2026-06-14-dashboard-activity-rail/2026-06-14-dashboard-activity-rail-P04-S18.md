---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---




# Add a WorkTab render test asserting the degraded state derives from the tiers truth and not from a bare transport error

## Scope

- `frontend/src/app/right/WorkTab.render.test.tsx`

## Description

- Added a `WorkTab` render test asserting the degraded state derives from the tiers truth and not from a bare transport error: a tiers-less 500 fault must not render degraded.

## Outcome

A non-JSON 500 transport fault (no tiers) keeps the frame in its non-degraded empty state, proving tiers-driven degradation.

## Notes

The 500 classifies as non-retryable degraded so the query settles deterministically with no tiers.
