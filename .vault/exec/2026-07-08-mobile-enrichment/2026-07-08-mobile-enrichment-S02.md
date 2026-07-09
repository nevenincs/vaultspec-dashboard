---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S02'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# D1: compact workspace switcher — MobileTopBar title trigger opens a BottomSheet re-presenting useWorktreePickerView with the shared activate/swap intents and unsaved-edit guard

## Scope

- `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`

## Description

- Add `WorkspaceSwitcherSheet` re-presenting `useWorktreePickerView` in a `BottomSheet` (Worktrees + Projects + Add a project); every switch routes through `guardUnsavedDiscard`.
- Add `onTitleActivate` to `MobileTopBar` (name + disclosure chevron trigger).
- Wire the Browse title trigger and the sheet open-state (local chrome) in `CompactAppShell`.

## Outcome

The compact Browse title opens the switcher; worktree/project switches are guarded; the desktop `WorktreePicker` is untouched.

## Notes
