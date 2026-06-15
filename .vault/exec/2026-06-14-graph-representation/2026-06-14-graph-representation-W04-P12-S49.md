---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S49'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Build the RepresentationModePanel control emitting mode intent into the view store

## Scope

- `frontend/src/app/stage/RepresentationModePanel.tsx`

## Description


## Outcome

Built `RepresentationModePanel.tsx`: three role=switch mode controls (Lucide marks, tokens), writes `setRepresentationMode` into the view store; Stage issues the scene command (single scene owner). Never fetches.

## Notes

