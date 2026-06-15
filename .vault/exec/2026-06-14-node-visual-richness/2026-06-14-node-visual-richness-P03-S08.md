---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---




# add status_value and status_class to the scene node data as a flagged seam redline

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Add an optional `status?: { value?: string; class?: StatusClass; ordinal?: number }` field to the locked scene node-data type, importing `StatusClass` from the scene's pure status util.
- Flag it as an additive seam redline in the doc comment, mirroring the existing `salience`/`memberCount` redlines per the lock discipline, and note the sigma fallback ignores it.

## Outcome

The locked scene seam now carries the resolved status object additively, so the renderer can read status without any existing seam member changing. The exact shape is `status?: { value?: string; class?: StatusClass; ordinal?: number }`.

## Notes

The redline stays minimal — one optional field on the RL-1 surface, backward-compatible, no new command or event. The import is type-only.
