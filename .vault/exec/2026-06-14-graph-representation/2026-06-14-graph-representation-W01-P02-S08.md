---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:f0be7c4793d480af5780a5c652578b33dd9ab3ac17c02dc2f87ebcacb7564606'
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
