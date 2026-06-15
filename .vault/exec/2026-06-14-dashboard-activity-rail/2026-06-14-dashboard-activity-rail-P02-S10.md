---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---




# Make the WorkTab degraded and empty states grayscale-safe so meaning is carried by shape and text first, not color alone

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Made the degraded and empty states grayscale-safe: meaning carried by mark shape plus text first, token ink as redundant reinforcement only.

## Outcome

Both states read in grayscale without relying on hue.

## Notes

Follows the non-color-only gate established across the design-adoption cycle.
