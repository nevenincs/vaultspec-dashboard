---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Style WorkTab using only inherited design-language tokens and the two sanctioned icon families with no new token, icon, or motion grammar

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Styled `WorkTab` using only inherited design-language tokens and the two sanctioned icon families: a Phosphor `ListChecks` domain mark and a Lucide `CircleSlash` structural mark.

## Outcome

No new token, no third icon family, no new motion grammar introduced.

## Notes

Tokens and sizing mirror the sibling right-rail surfaces (NowStrip, ChangesOverview).
