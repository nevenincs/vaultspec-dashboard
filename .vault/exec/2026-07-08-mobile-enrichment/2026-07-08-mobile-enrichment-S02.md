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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-enrichment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The D1: compact workspace switcher — MobileTopBar title trigger opens a BottomSheet re-presenting useWorktreePickerView with the shared activate/swap intents and unsaved-edit guard and ## Scope

- `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
