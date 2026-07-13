---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the PlanInteriorView interface and the derivePlanInteriorView selector exposing rolled-up completion, the ordered tree, and the truncated honesty block so the step tree reads bounded-interior truncation as a designed state, never a silent partial result

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the `PlanInteriorView` interface and the `derivePlanInteriorView` selector: per-container rolled-up completion attached bottom-up (steps to phase to wave to plan), the ordered tier-honest tree, and the truncated honesty block.

## Outcome

The step tree reads rolled-up completion and bounded-interior truncation as designed state, never a silent partial.

## Notes

None.
