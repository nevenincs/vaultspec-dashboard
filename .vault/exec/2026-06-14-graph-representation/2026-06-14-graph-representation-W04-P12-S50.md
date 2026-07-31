---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:6c7a87d5ff95d3606d8e9a6d6b972a093f3c923d6943d09e7f258385ff9a4722'
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
