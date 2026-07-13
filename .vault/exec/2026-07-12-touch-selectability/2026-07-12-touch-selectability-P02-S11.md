---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Scope doc tab title selection to the title span so tab dragging survives, and guard the doc-tab menu open

## Scope

- `frontend/src/app/stage/DockWorkspace.tsx`

## Description

- Import `guardedContextMenu` and wrap the doc-tab `onContextMenu` handler with it.
- Add `select-text` scoped to the title span only, leaving the tab root and close button unchanged so drag-to-dock still works.

## Outcome

`frontend/src/app/stage/DockWorkspace.tsx` now yields the doc-tab context menu to a live text selection, and the open document's title text is selectable without affecting dockview's drag-to-dock on the tab root. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.
