---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Stop the vault filter flyout auto-opening on field focus

## Scope

- `frontend/src/app/stage/FilterSidebar.tsx`

## Description

- Re-diagnosed the live state: a concurrent left-rail filter campaign had already moved the facets behind an "Advanced filters" button so focusing the rail filter input no longer auto-opens the flyout — the original inline trap is gone.
- Verified the residual fix lands through the shared focus-restore on the kit Popover (S09): the FilterSidebar flyout uses the kit Popover, so it inherits dismiss + restore.

## Outcome

- Live-verified: focusing the rail filter input opens no dialog (`dialogOpenAfterFocus: false`); opening the flyout via the button and pressing Escape closes it and lands focus on a real left-rail control, never `<body>` — the trap-to-nowhere is eliminated.

## Notes

- The flyout's exact restore-to-trigger is currently overridden by the concurrent campaign's own portalled-flyout focus handling (Escape landed on "worktree scope: main", the rail's first control, not the "Advanced filters" trigger). Not a trap (stays in-app, in a region); the precise trigger restore is a W06.P09 overlay-enrollment refinement to coordinate once that campaign commits.
- This step's primary defect was resolved by the sibling campaign; my contribution is the shared-Popover restore (S09) and the live verification.
