---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add salience and embedding to SceneNodeData and derivation to SceneEdgeData

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

## Outcome

Added `salience`/`embedding` to `SceneNodeData` and `derivation` to `SceneEdgeData` as additive optional RL-1/RL-2 seam fields; the sigma fallback ignores them harmlessly.

## Notes
