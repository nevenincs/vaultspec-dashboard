---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S43'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize shared dialog and confirmation titles, descriptions, and actions

## Scope

- `frontend/src/app/chrome/Dialog.tsx`
- `frontend/src/app/chrome/ConfirmDialog.tsx`

## Description

- Verified `Dialog.tsx` resolves its close accessible name through `useLocalizedMessage`
  over a typed descriptor, with all other title/description/action copy owned by the
  caller passing localized content in as props.
- Verified `ConfirmDialog.tsx` resolves its default confirm/cancel action copy through
  typed descriptors.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

The shared dialog and confirmation primitives render only localized, caller-supplied or
typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`5eef2d0599` ("i18n(frontend): migrate UI surfaces to the localization catalog"). This
record retroactively documents and ticks the plan step; verification was file inspection
plus a scoped scanner run, not a fresh implementation.
