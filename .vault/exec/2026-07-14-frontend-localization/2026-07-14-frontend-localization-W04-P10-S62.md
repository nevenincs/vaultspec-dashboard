---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S62'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize change menu actions

## Scope

- `frontend/src/app/right/menus/changeMenu.ts`

## Description

- Verified every action label resolves through a typed message-key descriptor
  (`common:actions.copyPath`, `common:actions.copy`) or a shared already-localized
  builder (`openInEditorAction`, `revealAction`, `copyAction`), never a raw English
  literal.
- Confirmed the hunk-copy action is correctly omitted (not shown disabled) when the
  descriptor carries no hunk, and no internal path/hunk vocabulary leaks into visible
  copy.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.
- Ran the live `rightMenus.test.ts` suite: the change-menu assertions pass (the file's
  two failures are unrelated edge-menu and rail-section assertions, tracked separately).

## Outcome

The change menu renders only localized, typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed via the
shared-builder migration in commit `fca95b4c66` ("feat(localization): migrate clipboard
action language"). This record retroactively documents and ticks the plan step;
verification was file inspection, a scoped scanner run, and a live focused-test run, not
a fresh implementation.
