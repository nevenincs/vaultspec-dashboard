---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S32'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add set-representation-mode command and representation-mode-changed event to the seam

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

## Outcome

Added `set-representation-mode` command (connectivity/lineage/semantic) and `representation-mode-changed` event (carries requested + APPLIED mode + downgrade reason) to the locked seam, additively. Explicitly distinct from `set-layout-mode` (force/circular).

## Notes
