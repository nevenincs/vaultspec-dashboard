---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the contract-shaped scene graph model with node kind, lifecycle, degree-by-tier and edge relation, tier, confidence, state per G3.a and the contract identity guarantees

## Scope

- `frontend/src/scene/graphModel.ts`

## Description

- Add `frontend/src/scene/graphModel.ts`: `SceneGraphModel`, the
  renderer-agnostic store for the contract-shaped graph slice on stage,
  keyed by the contract's stable node and edge ids (identity guarantees:
  the GUI caches and animates by id).
- Reuse the locked seam types (`SceneNodeData` with kind, lifecycle,
  degree-by-tier, dates; `SceneEdgeData` with relation, tier, confidence,
  structural state) rather than duplicating shapes.
- Implement keyframe replace (`setData`), ordered-delta application
  (`applyDelta`: add/change upsert by id, remove drops incident edges),
  incidence indexing, 1-hop `neighborsOf` for ego highlight, and
  `danglingEdgeIds` surfacing inconsistent slices instead of hiding them.
- Add `frontend/src/scene/graphModel.test.ts` covering keyframe replace,
  upsert-by-id, node-removal edge cleanup, incidence/neighbor maintenance,
  endpoint re-indexing on edge change, and dangling-edge surfacing.

## Outcome

The scene layer has its data backbone: a framework-free model the delta log
(S06) mutates and the field renderer (W01.P03) reads. Gates green:
typecheck, eslint, vitest (21 passed), prettier.

## Notes

Engine-aggregated constellation meta-edges (count plus breakdown-by-tier)
are not represented yet; they enter with W02.P06.S21 and may need an
optional field on the locked `SceneEdgeData` shape - noted for
experience-architect review at that boundary, not smuggled in here.

