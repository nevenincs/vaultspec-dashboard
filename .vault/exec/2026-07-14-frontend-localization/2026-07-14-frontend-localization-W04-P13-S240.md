---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S240'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace context-menu presentation strings with typed descriptors

## Scope

- `frontend/src/stores/view/contextMenu.ts`

## Description

- Verified the module carries no owned display strings: it is pure keyboard-interaction
  and menu-state logic (cursor movement, dismissal, activation) over already-typed
  `ActionDescriptor`s produced by the per-kind resolvers; every string literal found is
  a keyboard key name (`"Escape"`, `"ArrowDown"`, etc.), not display copy.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.
- Ran the live focused suite `contextMenu.test.ts`; all cases pass.

## Outcome

The context-menu store carries no unlocalized copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed via the
keymap/action localization migrations in commits `87e9d5572a` ("feat(frontend):
localize keycap display") and `cc049d8a65` ("feat(localization): resolve shared action
presentation"). This record retroactively documents and ticks the plan step;
verification was file inspection, a scoped scanner run, and a live focused-test run,
not a fresh implementation.
