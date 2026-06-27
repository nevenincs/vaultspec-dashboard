---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Preserve the collapse model and the single top-to-bottom focus order across the slots

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Preserve the collapse model: `leftRailCollapsed` and the header collapse toggle stay in the `AppShell` aside chrome (~2.5rem spine collapsed, 16rem expanded).
- Keep a single top-to-bottom focus order: the header collapse toggle is first, then `LeftRail` continues it through workspace, worktree, the browser mode toggle, the filter, and the active mode's rows.

## Outcome

Collapse is unchanged; the rail content is one labelled `scope rail` landmark continuing the focus order from the collapse toggle.

## Notes

The collapse chevron remains in the deferred `AppShell` header; no change to its behaviour was needed.
