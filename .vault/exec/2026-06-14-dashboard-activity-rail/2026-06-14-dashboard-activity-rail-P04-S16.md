---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---




# Add a WorkTab render test asserting the degraded state renders when the stores selector reports the work pillar unavailable

## Scope

- `frontend/src/app/right/WorkTab.render.test.tsx`

## Description

- Added a `WorkTab` render test asserting the degraded state renders when the stores selector reports the work pillar unavailable (structural tier degraded via the mock).

## Outcome

The degraded state renders against the real stores client transport with the structural tier marked unavailable.

## Notes

Exercises the real mock engine transport, no component doubles (mock-mirrors-live-wire-shape).
