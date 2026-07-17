---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S80'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize editor toolbar formatting, save, close, and unsaved-change actions

## Scope

- `frontend/src/app/viewer/EditorToolbar.tsx`

## Description

- Verified the component resolves its formatting, save, close, and unsaved-change
  action copy through `useLocalizedMessage` over typed descriptors (4 call sites).
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The editor toolbar renders only localized, typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`5eef2d0599` ("i18n(frontend): migrate UI surfaces to the localization catalog"). This
record retroactively documents and ticks the plan step; verification was file inspection
plus a scoped scanner run, not a fresh implementation.
