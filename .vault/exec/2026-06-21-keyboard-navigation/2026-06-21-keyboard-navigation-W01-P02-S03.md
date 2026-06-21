---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
step_id: 'S03'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Add the bounded ordered focus-region registry (left rail, stage dock, graph canvas, right rail, timeline) with visible-aware resolution and entry-memory hand-off to FocusZone

## Scope

- `frontend/src/app/chrome/focusRegions.ts`

## Description

- Added the ordered focus-region registry (left-rail, stage, right-rail, timeline) keyed on a `data-focus-region` attribute, with visible-aware resolution (offsetParent), per-region entry memory bounded by the fixed region count, and `cycleFocusRegion`/`focusRegion`/`rememberRegionFocus` helpers.
- `focusRegion` lands on the region's remembered child, else its first focusable descendant (composing the sibling `focusableDescendants`), else the container itself — so a region is never a dead end.

## Outcome

- Live-verified: F6 cycles stage to right-rail to timeline to left-rail to stage (canonical order, visible-aware, wraps); regions land on their first focusable. prettier/eslint/tsc clean.

## Notes

- Scope corrected from `stores/view` to `app/chrome`: the registry composes the `app/chrome` focus utilities and `stores` must not import `app` upward. The graph canvas is one tab stop WITHIN `stage` (handled by the canvas contract in W03), not a separate top-level region.
