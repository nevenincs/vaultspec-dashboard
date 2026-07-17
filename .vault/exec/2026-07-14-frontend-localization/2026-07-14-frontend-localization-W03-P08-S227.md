---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S227'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize workspace menu actions with user-facing concepts

## Scope

- `frontend/src/app/left/menus/workspaceMenu.ts`

## Description

- Verified every action label and disabled reason resolves through a typed message-key
  descriptor (`common:actions.copyPath`, `common:actions.removeFromRegistry`,
  `common:disabledReasons.noProjectPath`,
  `common:disabledReasons.launchProjectCannotBeRemoved`) or a shared already-localized
  builder (`copyAction`, `revealAction`), never a raw English literal.
- Confirmed the destructive "Remove from registry" action carries an explicit
  confirmation and the time-travel gate without exposing internal registry vocabulary.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The workspace menu renders only localized, user-facing copy with no internal
identifiers.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), building on the earlier
`fca95b4c66` ("feat(localization): migrate clipboard action language") shared-builder
migration. This record retroactively documents and ticks the plan step; verification
was file inspection plus a scoped scanner run, not a fresh implementation.
