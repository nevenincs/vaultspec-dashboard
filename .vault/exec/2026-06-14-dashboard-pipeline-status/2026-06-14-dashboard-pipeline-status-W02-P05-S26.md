---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S26'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Render the loading state from the selector's real pending flag tied to the query, never a perpetual spinner, going static under prefers-reduced-motion

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered the loading state from the selector real pending flag tied to the query, using the repo `animate-pulse-live` text cue that goes static under prefers-reduced-motion, never a perpetual spinner.

## Outcome

Loading is a real pending state and respects the reduced-motion floor.

## Notes

None.
