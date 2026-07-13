---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Re-enable selection on plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows

## Scope

- `frontend/src/app/right/`

## Description

- Add `select-text` to the changed-file label span in `ChangesOverview.tsx`.
- Add `select-text` to the step-id and heading spans in `PlanStepTree.tsx`'s `StepRow`.
- Add `select-text` to the open-plan title button in `StatusTab.tsx`'s `PlanPill`.

## Outcome

Plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows now carry `select-text`; no menus exist on these rows so no guard routing was needed. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.

