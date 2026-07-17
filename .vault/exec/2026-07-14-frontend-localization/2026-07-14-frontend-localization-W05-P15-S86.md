---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S86'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize document chrome, properties, metadata, and viewer menu labels

## Scope

- `frontend/src/app/viewer/DocChrome.tsx`
- `frontend/src/app/viewer/PropertiesPopover.tsx`

## Description

- Verified both files resolve their chrome, properties, metadata, and menu-label copy
  through `useLocalizedMessage` over typed descriptors.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.
- Ran the live focused suites `DocChrome.render.test.tsx` and
  `PropertiesPopover.render.test.tsx`; all cases pass.

## Outcome

Document chrome and the properties popover render only localized, typed-descriptor
copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`5eef2d0599` ("i18n(frontend): migrate UI surfaces to the localization catalog"). This
record retroactively documents and ticks the plan step; verification was file
inspection, a scoped scanner run, and a live focused-test run, not a fresh
implementation.
