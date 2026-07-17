---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S173'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate project and worktree render tests through production catalogs

## Scope

- `frontend/src/app/left/ProjectNavigator.render.test.tsx`
- `frontend/src/app/left/WorktreePicker.render.test.tsx`

## Description

- Confirmed neither test file mocks or stubs the localization runtime.
- Ran both test files live against the production engine and catalogs; all cases pass.

## Outcome

The project and worktree render tests exercise production locale resources end to end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation.
