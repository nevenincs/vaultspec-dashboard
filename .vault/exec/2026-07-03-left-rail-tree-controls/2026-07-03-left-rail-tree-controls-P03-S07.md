---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S07'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# New persisted view-local sort store (key: recency|name|created|modified|size, direction, default recency/desc) with one reset path on workspace swap

## Scope

- `frontend/src/stores/view/railSort.ts`

## Description

- New `frontend/src/stores/view/railSort.ts`: persisted zustand store `{key, direction}`, default `recency/desc`, re-choose flips direction, bounded persist + tolerant merge, `resetRailSort` one restore path

## Outcome

Store persists across reload (verified live via localStorage).

## Notes

None.
