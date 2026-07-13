---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Author the unified rail composing the Status overview then the Browse tree as natural-height sticky collapsible sections under one outer scroll

## Scope

- `frontend/src/app/shell/CompactUnifiedRail.tsx`
- `frontend/src/app/left/CompactFilterSheet.tsx`
- `frontend/src/app/left/BrowserRegion.tsx`
- `frontend/src/app/left/LeftRail.tsx`

## Description

- Add `CompactUnifiedRail` composing the Status overview then the Browse tree as two sticky, collapsible `FoldSection`s under the one Home-pane scroll, Status first.
- Add `CompactFilterSheet` under `app/left/` to own the canonical filter mount, and render it from the rail's TOP LEVEL, OUTSIDE the collapsible Browse fold, so the top-bar filter button still works when Browse is collapsed.
- Make `BrowserRegion` natural-height on compact (drop the internal `flex-1 overflow-y-auto` on the tree wrapper) so the outer pane is the single scroll.
- Remove the now-dead compact branch of `LeftRail`; the rail is desktop-only, its compact composition rehomed into the unified rail.

## Outcome

One vertical scroll stacks Status above Browse with sticky section headers; no nested scroll traps the tree below the Status section. Typecheck, eslint, prettier, and the px guard clean.

## Notes

The integration-sensitive step. Two design decisions made the single scroll behave: composing both rails as natural-height sections, and keeping the filter sheet outside the Browse fold. The first draft mounted `FilterSidebar` directly in `CompactUnifiedRail` (`app/shell/`), which tripped the `filterConsolidation` guard (every filter mount must live under `app/left/`); the mount was rehomed into `CompactFilterSheet` under `app/left/`, satisfying the guard while keeping the sheet outside the fold.
