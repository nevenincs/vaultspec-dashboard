---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S36'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add activeRepresentationMode and setRepresentationMode to the view store

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

## Outcome

Added `activeRepresentationMode` + `overlays` view state and `setRepresentationMode`/`setOverlays` setters (defaults connectivity, both overlays on); neither resets on scope swap (viewer preference, not corpus state).

## Notes
