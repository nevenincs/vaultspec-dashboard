---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:e6871d6b11722f5cc180c8134985188ada0d55ae7ac0ed7833e531457e5a8bf6'
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
