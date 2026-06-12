---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
related:
  - '[[2026-06-12-dashboard-gui-plan]]'
---

# `dashboard-gui` `W03.P09` summary

Phase W03.P09 (left rail) is complete: all three Steps closed, frontend
quality gates green at the boundary (typecheck, eslint, vitest 180 passed
across 37 files, prettier).

- Created: `frontend/src/app/left/WorktreePicker.tsx` (+ tests)
- Created: `frontend/src/app/left/VaultBrowser.tsx` (+ tests)
- Created: `frontend/src/app/left/browserSelection.ts` (+ tests)
- Modified: `frontend/src/app/AppShell.tsx`,
  `frontend/src/stores/view/viewStore.ts`, `frontend/src/app/stage/Stage.tsx`

## Description

Orientation and scope per G2:

- S37: the worktree picker over the map endpoint - corpus-bearing
  worktrees primary, bare refs dimmed with degradation markers; the view
  store gained the explicit `scope` with wholesale-swap semantics
  (selection, working set, and islands reset; every server read and
  persistence key follows the scope).
- S38: the vault-scoped read-only browser - canonical `.vault/` grouping,
  doc-type glyphs, feature tags, compact freshness labels, collapsible
  groups.
- S39: bidirectional selection - row clicks select and focus the stage
  node (stem-derived id join per the contract identity guarantee);
  selections highlight their browser row.
