---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S228'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize worktree menu actions without exposing internal identifiers

## Scope

- `frontend/src/app/left/menus/worktreeMenu.ts`
- `frontend/src/app/left/menus/leftMenus.test.ts`
- `frontend/src/app/left/menus/leftMenus.localization.test.ts`
- `frontend/src/platform/actions/clipboardActions.ts`
- `frontend/src/platform/actions/clipboardActions.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/locales/en/projects.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/messagePolicy.test.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Replace legacy worktree labels and disabled reasons with typed message descriptors.
- Add canonical action and recovery messages to the catalog contract.
- Remove the raw worktree identifier copy action while preserving internal activation behavior.
- Verify production descriptors against genuine English, French, and Arabic resources.
- Remove the three exact legacy scanner exemptions.

## Outcome

The worktree menu now presents localized, user-facing actions while keeping transport
identity internal. Switching, optional branch copying, path reveal, ordering, icons,
time-travel behavior, and action dispatch remain unchanged.

## Notes

Terra and Sol approved the implementation with no findings. Seventy-two focused tests,
the full frontend lint recipe, TypeScript, formatting, and diff checks passed. The
localization scanner is clean at 1,062 findings, including 38 remaining legacy action
presentations.
