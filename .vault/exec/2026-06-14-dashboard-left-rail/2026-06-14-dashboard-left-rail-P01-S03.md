---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Apply attenuated-chrome tokens so the rail cedes attention to the stage

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Apply attenuated-chrome tokens: `LeftRail` carries `text-ink-muted` so the rail is dimmed by default and the active surface reads brightest, ceding attention to the stage.
- Use only token utilities (`border-rule`, `bg-paper-*`, `p-vs-*`); no bespoke color, ground, or motion introduced.

## Outcome

The rail reads as attenuated supporting chrome built entirely from the inherited OKLCH token tier.

## Notes

No new tokens added; warmth lives in the existing token layer.
