---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-left-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-06-14-dashboard-left-rail-plan placeholders are machine-filled by
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
     The Keep the inline git status badge read-only with no mutation affordance anywhere in the rail and ## Scope

- `frontend/src/app/left/WorktreePicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Keep the inline git status badge read-only with no mutation affordance anywhere in the rail

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- Keep the inline git status badge read-only: the WorktreePicker ahead/behind/dirty badge surfaces git STATE only, with no stage/commit/discard/checkout affordance anywhere in the rail.

## Outcome

The git badge stays read-only status; no mutation affordance exists in the rail.

## Notes

`WorktreePicker` is unchanged for this step; the read-only render test scans every rail button for forbidden git/disk/vault mutation vocabulary and finds none.
