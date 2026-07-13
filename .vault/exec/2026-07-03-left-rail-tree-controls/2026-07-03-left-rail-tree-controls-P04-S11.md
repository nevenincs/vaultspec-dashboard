---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Vertical indent guide lines on `[data-vault-folder-body]`: 1px border-ink line per level at the rows' rem indent math, theme-aware token color

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Vertical indent guide per expanded folder body (`[data-tree-guide]`): absolute hairline `bg-rule` under the parent's chevron column, rem-aligned to the rows' indent math, layout-neutral
- Code tree already carries `DepthGuides` — no change needed

## Outcome

`lint:px` clean; guides render at every expanded level (live screenshot).

## Notes

None.
