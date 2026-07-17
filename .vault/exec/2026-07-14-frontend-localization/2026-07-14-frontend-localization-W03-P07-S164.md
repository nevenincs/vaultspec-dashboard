---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S164'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize bottom-sheet and popover accessibility and dismissal copy

## Scope

- `frontend/src/app/chrome/BottomSheet.tsx`
- `frontend/src/app/kit/Popover.tsx`

## Description

- Verified `BottomSheet.tsx` is pure display-only over caller-supplied props: `title`
  (the accessible name) is required and owned entirely by the caller; the component
  itself owns no string literals.
- Verified `Popover.tsx` renders no text at all — it is a dismiss-wiring shell around
  caller-supplied `children`.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

Neither primitive owns hardcoded English copy; both are locale-agnostic by
construction, with all accessibility text sourced from the caller.

## Notes

Reconciliation pass (bookkeeping only, no code changes). Neither file required a
localization-specific edit; both were already compliant by construction predating the
bulk localization commits. This record retroactively documents and ticks the plan step;
verification was file inspection plus a scoped scanner run.
