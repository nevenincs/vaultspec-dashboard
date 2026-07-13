---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Pass active lens into useGraphSlice from Stage

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

## Outcome

Stage reads `activeLens` and passes it into `useGraphSlice`; a lens switch is a re-query (the composition rule).

Stage reads `activeLens` and passes it into `useGraphSlice`; a lens switch is a re-query (the composition rule).

## Notes
