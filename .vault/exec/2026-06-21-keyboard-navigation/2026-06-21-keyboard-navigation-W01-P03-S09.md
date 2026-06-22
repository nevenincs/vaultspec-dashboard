---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-22'
step_id: 'S09'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Audit every overlay (dialog, menu, popover, flyout) to restore focus to its trigger on close and never drop to body

## Scope

- `frontend/src/app/kit/Popover.tsx`

## Description

- Audited which overlays route through the shared `useFocusRestore`: Dialog, ContextMenuHost, CommandPalette, SearchPaletteSurface, and DocumentSearchSurface already did; the shared kit `Popover` (the non-modal flyout primitive behind the filter flyout, panel flyout, worktree picker) did NOT — the root cause of the diagnosis's "Escape to body".
- Added `useFocusRestore(open)` to `Popover` so every popover restores focus to its trigger on close, centralized in one place.

## Outcome

- Live-verified: dismissing a Popover-backed flyout no longer drops focus to `<body>`. Focus/dismiss/Popover-adjacent tests (33) and Timeline tests (14) stay green; prettier/eslint/tsc clean.

## Notes

- One overlay (the concurrent campaign's portalled filter flyout) restores to a left-rail control rather than its exact trigger because that campaign manages its own close-focus; the body-drop is gone regardless. Exact per-overlay trigger restore is verified individually in W06.P09.
