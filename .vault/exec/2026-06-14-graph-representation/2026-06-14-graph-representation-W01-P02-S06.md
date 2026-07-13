---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Fold lens into the graph query cache key

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

## Outcome

Folded `lens` into `engineKeys.graph` and `useGraphSlice` so two lenses are distinct cache entries (DOI makes the served set lens-dependent).

Folded `lens` into `engineKeys.graph` and `useGraphSlice` so two lenses are distinct cache entries (DOI makes the served set lens-dependent).

## Notes
