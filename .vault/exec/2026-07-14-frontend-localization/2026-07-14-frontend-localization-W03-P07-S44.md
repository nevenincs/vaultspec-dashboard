---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S44'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize desktop shell and icon-rail navigation

## Scope

- `frontend/src/app/AppShell.tsx`
- `frontend/src/app/shell/IconRail.tsx`

## Description

- Verified both files resolve their visible navigation labels and accessible names
  through `useLocalizedMessage` over typed descriptors.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

The desktop shell and icon-rail navigation render only localized, typed-descriptor
copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed across bulk
commits `3562d0262a` ("localize frontend and split oversized modules") and prior
targeted commit `724ab4e1f9` ("feat(frontend): localize browser mode vocabulary"). This
record retroactively documents and ticks the plan step; verification was file inspection
plus a scoped scanner run, not a fresh implementation.
