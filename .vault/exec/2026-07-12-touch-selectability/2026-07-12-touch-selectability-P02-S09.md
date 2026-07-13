---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S09'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable selection on inspector node title, property values, and edge row labels and guard the node and edge menu opens

## Scope

- `frontend/src/app/right/Inspector.tsx`

## Description

- Import `guardedContextMenu` and wrap the node-panel `onContextMenu` handler with it.
- Add `select-text` to the node title element.
- Wrap the `PropertyRow` value content in a `select-text` span for both the tabular and plain-value branches.
- Add `select-text` to the per-tier edge row button and wrap its `onContextMenu` handler with `guardedContextMenu`.

## Outcome

`frontend/src/app/right/Inspector.tsx` now yields its node and edge context menus to a live text selection, and the node title, property values, and edge row labels carry `select-text` so pointer/touch selection works over the button-hosted rows. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.
