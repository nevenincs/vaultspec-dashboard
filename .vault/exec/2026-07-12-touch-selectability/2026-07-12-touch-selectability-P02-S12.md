---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Re-enable selection on island interior chips and step titles beneath the newly scoped island menu

## Scope

- `frontend/src/app/islands/NodeInterior.tsx`

## Description

- Add `select-text` to the feature-lifecycle chip label span, sibling to the `DocTypeMark` glyph.
- Add `select-text` to the plan-step title span inside the plan interior step chip.

## Outcome

`frontend/src/app/islands/NodeInterior.tsx` interior data text (feature-lifecycle chip labels, plan-step titles) is now selectable inside its chip `<button>`s; no context-menu routing was needed here since the island menu scoping landed in P01.S03. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.

