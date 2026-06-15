---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S33'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Add set-overlays command to the SceneCommand union

## Scope

- `frontend/src/scene/sceneController.ts`

## Description


## Outcome

Added `set-overlays` command (featureCountries/featureHulls) to the SceneCommand union; the controller tracks overlay state and exposes `getRepresentationState`.

## Notes

