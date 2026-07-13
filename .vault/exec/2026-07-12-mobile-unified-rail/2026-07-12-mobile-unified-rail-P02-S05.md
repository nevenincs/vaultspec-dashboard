---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Reduce the bottom tab bar to Home, Timeline, and Search and update its glyphs and labels

## Scope

- `frontend/src/app/shell/BottomTabBar.tsx`

## Description

- Reduce the compact tab list to Home, Timeline, and Search; retire the Browse and Status tabs (both folded into Home).
- Add a `House`-based `Home` glyph to the centralized kit glyph module (Lucide structural family) and bind the Home tab to it.
- Update the bar's header and FocusZone comments to the three-surface count.

## Outcome

The bottom bar shows three thumb-reachable tabs; the active tab keeps its non-colour-only accent pill and `aria-current`. The unused `Books` and `GitBranch` imports are dropped.

## Notes
