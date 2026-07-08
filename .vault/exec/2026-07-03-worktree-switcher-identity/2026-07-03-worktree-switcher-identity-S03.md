---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S03'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Rewrite the switch-failure messages in plain sentence case and expose the active-project label from the picker view seam

## Scope

- `frontend/src/stores/view/worktreePickerChrome.ts`

## Description

- Compute the active project's display name in the picker view seam (registry root through the repo-identity derivation) and thread it into the presentation view.
- Rewrite the two switch-failure messages in plain sentence case.

## Outcome

The trigger and disclosure label read the project name from one seam; failure copy is user-facing language. Chrome store suite passes.

## Notes

None.
