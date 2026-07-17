---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S07'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Build the rail-footer FrameworkStatusCluster strip mirroring the bound frame - pinned outside the rail scroll, one FocusZone tab stop, chips dispatch the panel toggle descriptors

## Scope

- `frontend/src/app/right/FrameworkStatusCluster.tsx`

## Description

## Outcome

## Notes

## Description

- Build `FrameworkStatusCluster` mirroring the bound frame: pinned footer strip, four chips over `useFrameworkStatusView` tones/counts, one horizontal FocusZone tab stop, per-chip aria naming plane + health.
- Chips dispatch through the shared `controlPanelToggleAction` descriptors (`.run`), the same builders the palette composes - no bespoke handlers.
- Mount as a sibling below the scroll panel in the desktop ActivityRail; render test added.

## Outcome

Green (6 render tests). Executed by rail-chrome-coder; verified independently.

## Notes

Pinning required moving the rail scroll from the outer rail column onto the panel div (`shellLayout.ts` SHELL_ACTIVITY_* classes) - desktop-only constants, compact unaffected; one deliberate out-of-scope edit, flagged and accepted.
