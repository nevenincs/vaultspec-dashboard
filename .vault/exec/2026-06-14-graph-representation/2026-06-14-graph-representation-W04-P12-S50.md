---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S50'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Build the LensSelector control emitting lens intent into the view store

## Scope

- `frontend/src/app/stage/LensSelector.tsx`

## Description


## Outcome

Built `LensSelector.tsx`: two role=switch lens controls writing `setActiveLens` into the view store (a re-query). Lucide marks, tokens, ARIA. Never fetches, never reads raw tiers.

## Notes

