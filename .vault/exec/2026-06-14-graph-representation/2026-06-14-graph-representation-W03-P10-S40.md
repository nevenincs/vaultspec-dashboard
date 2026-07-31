---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:bd9da5b9860ce4c4f2b380bdc481f814476ce9ca6d71d066037d4cd31a8c6092'
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
