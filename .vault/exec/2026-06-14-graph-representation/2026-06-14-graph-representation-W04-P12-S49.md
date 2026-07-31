---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:4737a67340ab1999428d33369a8a64e7319eb89d22ddc04ab1f2318dbfcf7b5c'
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
