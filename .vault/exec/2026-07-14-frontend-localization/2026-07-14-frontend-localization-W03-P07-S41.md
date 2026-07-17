---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S41'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove raw error rendering and localize safe application and region recovery actions

## Scope

- `frontend/src/platform/errors/ErrorBoundary.tsx`

## Description

- Verified the boundary resolves every visible string (title, safe message, retry and
  reload actions) through `useLocalizedMessage` over typed descriptors instead of raw
  English literals.
- Confirmed no raw error object, stack, or diagnostic value is rendered to the user.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The application and region error boundary is fully typed-message-driven; recovery
actions never leak implementation vocabulary.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`5eef2d0599` ("i18n(frontend): migrate UI surfaces to the localization catalog"). This
record retroactively documents and ticks the plan step; verification was file inspection
plus a scoped scanner run, not a fresh implementation.
