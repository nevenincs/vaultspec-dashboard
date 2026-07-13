---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# `mobile-unified-rail` `P02` summary

All three Steps complete. The Status-first unified rail was authored and wired into the
compact shell, and the bottom tab bar was reduced to the surviving surfaces.

- Created: `frontend/src/app/shell/CompactUnifiedRail.tsx`, `frontend/src/app/left/CompactFilterSheet.tsx`
- Modified: `frontend/src/app/left/BrowserRegion.tsx`, `frontend/src/app/left/LeftRail.tsx`, `frontend/src/app/shell/CompactAppShell.tsx`, `frontend/src/app/shell/BottomTabBar.tsx`, `frontend/src/app/kit/glyphs.tsx`

## Description

`S03` authored `CompactUnifiedRail`, stacking the Status overview then the Browse tree
as two sticky, collapsible `FoldSection`s under one Home-pane scroll; `BrowserRegion`
became natural-height on compact so no nested scroll traps the tree, and the dead
compact branch of `LeftRail` was removed (it is now desktop-only). The canonical filter
mount was rehomed into `CompactFilterSheet` under `app/left/` — satisfying the
`filterConsolidation` guard while keeping the sheet outside the Browse fold. `S04`
rewired `CompactAppShell` to render the unified rail for `home` and route the worktree
title, search, advanced-filter, and workspace-switcher chrome to it, keeping the
Timeline pane. `S05` reduced the bottom tab bar to Home / Timeline / Search and added a
`House`-based `Home` glyph to the centralized kit. View-layer only; no engine, wire, or
model change. Phase gate green.
