---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable text selection on code tree row path text and route the code-file menu through the selection guard

## Scope

- `frontend/src/app/left/CodeTree.tsx`

## Description

- Add `select-text` to the code tree row class derived by the shared browser-tree
  store selector (`deriveCodeBrowserTreeRowView`), re-enabling selection over file
  path text inside the row `<button>`.
- Wrap the row's `onContextMenu` (the `code-file` resolver) with `guardedContextMenu`.

## Outcome

Code tree rows keep their path text selectable and the `code-file` menu yields to an
active intersecting selection.

## Notes
