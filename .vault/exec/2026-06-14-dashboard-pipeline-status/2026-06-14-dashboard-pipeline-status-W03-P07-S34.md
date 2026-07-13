---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S34'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Emit step navigation intent on activating a step row, calling selectNode with the step's bound exec-record node id so selecting a step jumps to its exec record through the same selection seam

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Emitted step navigation intent on activating a step row, calling `selectNode` with the step bound `exec_node_id` so selecting a step jumps to its exec record; a step with no exec record is inert.

## Outcome

A step row jumps to its exec record through the selection seam when bound.

## Notes

None.
