---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S06'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Mount the indicator once per shell branch reading only useDataActivityView (the desktop shell frame and the compact MobileTopBar) so no other surface re-derives activity

## Scope

- `frontend/src/app/AppShell.tsx + frontend/src/app/shell/MobileTopBar.tsx`

## Description

Create `frontend/src/app/chrome/DataActivityIndicator.tsx` (the ONE connected mount reading `useDataActivityView`) and mount it once per shell branch in `frontend/src/app/AppShell.tsx`: the compact branch (where no canvas exists) and the desktop frame.

## Outcome

Universal loading floor present in both shells; no other surface re-derives activity.

## Notes
