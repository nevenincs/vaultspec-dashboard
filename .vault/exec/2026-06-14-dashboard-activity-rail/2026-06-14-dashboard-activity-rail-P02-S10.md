---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:5c3af412a253e1ca194d85500fa948a591cf7ff1cddbbdf699969d1845552819'
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
