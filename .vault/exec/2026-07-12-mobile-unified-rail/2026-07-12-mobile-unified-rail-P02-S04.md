---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Render the unified rail for the Home pane in the compact shell, keep the Timeline pane, and route the search, advanced-filter, and workspace-switcher triggers to the Home top bar

## Scope

- `frontend/src/app/shell/CompactAppShell.tsx`

## Description

- Render `CompactUnifiedRail` for the `home` pane and keep `CompactTimeline` for `timeline`; drop the standalone Browse and Status branches from the `<main>`.
- Route the worktree-name title, the search + advanced-filter top-bar actions, and the workspace-switcher title trigger to the `home` surface.
- Correct the stale Browse references in the surrounding comments to Home.

## Outcome

The compact shell mounts the unified rail as its landing surface; the Timeline surface and the one-scroll `<main>` (which owns `overflow-y-auto`) are unchanged.

## Notes
