---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S40'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add GMap feature-country label geometry at overview LOD

## Scope

- `frontend/src/scene/field/overlays.ts`

## Description

## Outcome

Added `overlays.ts`: `countryLabels` places one GMap country label per feature at its members' centroid (feature membership from featureTags, added to SceneNodeData + mapper).

## Notes
