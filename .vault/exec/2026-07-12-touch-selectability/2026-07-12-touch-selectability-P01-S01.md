---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Author the shared selection-guard helper that yields the app context menu to a live non-collapsed text selection intersecting the target, plus its yield/open unit matrix

## Scope

- `frontend/src/app/menus/guardedContextMenu.ts`

## Description

- Author `shouldYieldContextMenuToSelection`, `selectionForEventTarget`, and the `guardedContextMenu` wrapper in `frontend/src/app/menus/guardedContextMenu.ts` per ADR D1
- Implement `Range.intersectsNode` intersection with a containment fallback that over-approximates toward yielding
- Author the nine-case yield/open unit matrix in `frontend/src/app/menus/guardedContextMenu.test.ts` under the happy-dom environment pragma

## Outcome

Guard module and matrix landed; 9/9 tests pass. `selectionForEventTarget` resolves null (never throws) outside a DOM environment so node-env handler tests keep passing.

## Notes

