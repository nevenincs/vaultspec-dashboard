---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S08'
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
     The S08 and 2026-06-14-dashboard-left-rail-plan placeholders are machine-filled by
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
     The Issue no wire request from the filter and clear it on scope swap and ## Scope

- `frontend/src/app/left/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Issue no wire request from the filter and clear it on scope swap

## Scope

- `frontend/src/app/left/`

## Description

- Confirm the filter issues no wire request: it only sets store state read by the dumb browser views; no query is keyed on it.
- Clear the filter on scope swap via the browser-mode store reset wired into setScope / swapWorkspace.

## Outcome

The filter issues no fetch and clears on both worktree and workspace swaps; proven by the isolation-05 adversarial test and the LeftRail no-wire render assertion.

## Notes

The no-wire property is asserted by spying the real transport across a filter change in the render test.
