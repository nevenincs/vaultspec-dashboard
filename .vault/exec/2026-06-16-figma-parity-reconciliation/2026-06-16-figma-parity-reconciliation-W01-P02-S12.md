---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Freeze and document the SceneController command and event contract as the canvas rewrite API surface

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Document the locked `SceneController` command/event channel as the canvas rewrite API surface in the figma-parity-reconciliation contract reference.
- Enumerate the data shapes the controller carries (the node-data visual-anatomy input, the edge input, the delta op, the screen-space anchor) and which fields the rewrite reads.
- Enumerate the frozen inbound command union and the frozen outbound event union member-by-member, plus the anchor and lifecycle surface.
- Record that the rewrite plugs a new field renderer behind the seam without widening either union, and routes selection/hover back through the existing events.

## Outcome

The `SceneController` command and event contract is frozen as documentation only; the command union, event union, and lifecycle surface are unchanged. The canvas rewrite (Wave W03) builds against exactly this seam. No surface change was made, honoring the W01.P01.S04 lock discipline.

## Notes

Documentation only, no code. Any future surface change to this seam is an ADR-flagged redline, not a drive-by edit, as the seam header already mandates.
