---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S215'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize island focus, close, and copy menu actions

## Scope

- `frontend/src/app/islands/menus/islandMenu.ts`

## Description

- Verified every action label resolves through a typed message-key descriptor
  (`common:actions.focusOnStage`, `common:actions.closeIsland`, `common:actions.copy`)
  or the shared `copyAction` builder, never a raw English literal.
- Confirmed no internal identifier is rendered as visible copy (only copied as data via
  `copyAction`'s `text`, consistent with the shared clipboard pattern).
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The island interior context menu renders only localized, typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), building on the earlier
`fca95b4c66` ("feat(localization): migrate clipboard action language") shared-builder
migration. This record retroactively documents and ticks the plan step; verification
was file inspection plus a scoped scanner run, not a fresh implementation.
