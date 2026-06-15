---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the grayscale-safe StatusPill component rendering the ADR status as a word-first pill (proposed / accepted / deprecated) with hue as redundant reinforcement only

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Added the grayscale-safe `StatusPill` component rendering the ADR status as a word-first pill (proposed/accepted/deprecated/rejected) with hue as redundant reinforcement only and an accessible name.

## Outcome

ADR status reads as a word; the pill stays distinct by text when hue is removed.

## Notes

None.
