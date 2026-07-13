---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable text selection on vault tree row data text and route the row menus through the selection guard

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Add `select-text` to the shared row shell class used by every tree level (feature
  folder, category folder, document leaf), re-enabling selection over titles, meta,
  and dates inside the roving-tabindex `<button>`.
- Wrap the row's `onContextMenu` (used by `vault-doc` / `vault-feature` /
  `vault-category` resolvers) and the section header's `onContextMenu` (`vault-section`)
  with `guardedContextMenu`.

## Outcome

Every level of the vault tree re-enables selection over its data text via
`user-select: text` on the shared row shell, and both context-menu entry points yield
to a live intersecting selection.

## Notes
