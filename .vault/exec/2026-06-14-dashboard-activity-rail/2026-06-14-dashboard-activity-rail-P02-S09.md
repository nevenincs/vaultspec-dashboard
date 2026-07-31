---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:150cc0e4fd9c8eb0f8a08e5503fe082e83c3fe3ba942853e7dc87979cebb64fe'
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
