---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S52'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Drive animated incremental deltas across a mode switch in Stage

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

## Outcome

Mode-switch animation: the `set-representation-mode` handler re-seeds id-keyed positions (object constancy, no re-key) and the sprite/edge reconcilers carry identity across the switch; live add/remove deltas still fade via the unchanged `apply-deltas` path. No full rebuild that would re-key.

## Notes
