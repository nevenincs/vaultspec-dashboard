---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable selection on commit hash, subject, and age text and guard the commit and pull-request row menu opens

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

- Import `guardedContextMenu` and wrap the pull-request row `onContextMenu` handler with it.
- Wrap the recent-commit row `onContextMenu` handler with `guardedContextMenu`.
- Add `select-text` to the commit short-hash, subject, and age spans, and to the open-plan title button used by the same surface.

## Outcome

`frontend/src/app/right/StatusTab.tsx` now yields the commit-row and pull-request-row context menus to a live text selection, and the commit hash/subject/age text is selectable inside its row button. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.
