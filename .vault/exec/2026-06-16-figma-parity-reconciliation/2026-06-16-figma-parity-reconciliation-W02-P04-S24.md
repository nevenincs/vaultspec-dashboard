---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S24'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the left rail container and rail filter from the binding LeftRail Kit primitive over the preserved browser-mode store

## Scope

- `frontend/src/app/left/LeftRail.tsx`

## Description

- Migrate the left rail container cluster onto the W01.P01 Figma foundation: the browser-mode segmented toggle re-keys its container and segment radii to the canonical xs radius utility and its active-segment elevation to the canonical raised shadow utility; the in-rail filter re-keys its search-field pill to the canonical md radius, its input type to the canonical caption role utility, and its clear-control radius to the canonical xs utility.
- Keep the rail as a pure composition over the preserved browser-mode store: the browser region reads the chosen mode and the filter text from the per-scope browser-mode store and drives its setMode and setFilter mutators, mounting the active mode's browser (vault, tree, or code) with the shared filter; the mode toggle and rail filter emit only view-local intent and issue no wire request.
- Leave the LeftRail composition shell and the browser region prose intact; they carry only spacing aliases (the value-identical MATCH family outside the migration scope).

## Outcome

The left rail container and rail filter render on the canonical Figma foundation utilities (xs/md radius, raised shadow, caption type) while remaining a dumb projection over the preserved browser-mode store. The mode toggle is a roving-tabindex tablist that flips the store mode; the filter writes the store filter text and the active browser narrows the already-fetched listing client-side. No fetch, no raw tiers read, no stores shape change. eslint passes at exit 0, all of this step's files are prettier-clean, and the left-rail test suite (LeftRail, BrowserModeToggle, RailFilter) stays green.

## Notes

Figma read tools were unavailable, so the rebuild was grounded in the existing rail (restyled to its binding frame this cycle per research F3), the Code Connect mapping for the LeftRail Kit primitive, and the frozen contract reference. Gate caveat: the full frontend lint gate exits non-zero solely because of an UNTRACKED, incomplete file under the scene scorecard directory left by the concurrent W03 scene agent (it imports a not-yet-created module, failing both tsc and prettier). That file is outside this phase's scope fence (the scene layer is explicitly forbidden here) and was not touched; isolating the gate steps confirms the only failures are in that one scene file and nothing in this step's scope contributes.
