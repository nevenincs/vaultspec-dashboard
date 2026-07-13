---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Consume the progressive hook in Stage in place of the raw slice hook, unchanged scene contract

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

Consume useProgressiveGraphSlice in `frontend/src/app/stage/Stage.tsx` in place of useGraphSlice; scene contract unchanged - the document swap rides the existing warm-start set-data path.

## Outcome

Availability derives refreshing during the fill, so the canvas shows the constellation + the non-blocking refresh banner instead of a blank skeleton.

## Notes
