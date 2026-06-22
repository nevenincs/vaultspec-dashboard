---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S30'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the work tab from the binding WorkTab Kit primitive over the preserved pipeline-status query

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rebuild the work tab onto the new Figma role-named token foundation, binding to
  the WorkTab Kit primitive (Figma node 137:40).
- Migrate all dense counts and metadata from the legacy dense type scale to the
  `caption` role, and all rows, pills, and status badges from the legacy radius
  and rounded-full scales to the canonical `rounded-fg-xs` and `rounded-fg-pill`.
- Keep the grayscale-safe progress ring, status pill, step check mark, pipeline
  arc, and the lazily-loaded bounded plan step tree intact.

## Outcome

The work tab is a dumb projection over the preserved `usePipelineStatusView` and
`usePlanInteriorView` selectors; it fetches nothing, reads no raw tiers block, and
emits navigation intent only through the existing selection seam. Degradation is
read from the selector's interpreted tiers truth (the designed degraded / loading
/ empty states are preserved verbatim), and the plan interior stays bounded with
honest truncation. The shared `ProgressRing` and `PlanStepTree` exports the Status
overview reuses are unchanged.

## Notes

No store shape or query-key change. The aggregate frontend gate is red on
unrelated uncommitted scene-layer WIP from a concurrent builder; the scoped file
here passes eslint, prettier, and tsc cleanly.
