---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S49'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize add-project dialog guidance, refusal, validation, and actions

## Scope

- `frontend/src/app/left/AddProjectDialog.tsx`

## Description

- Verified the dialog resolves its guidance, refusal, validation, and action copy
  through `useLocalizedMessage` over typed descriptors.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The add-project dialog renders only localized, typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in commit
`acee980bce` ("feat(picker): rebuild the workspace picker into a production folder
picker"), which co-developed the workspace-picker-dialog rebuild alongside this plan's
localization lane. This record retroactively documents and ticks the plan step;
verification was file inspection plus a scoped scanner run, not a fresh implementation.
