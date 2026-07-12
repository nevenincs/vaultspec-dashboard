---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S19 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Mount the disclosure affordance on compact menu-bearing surfaces and confirm Android long-press routes through the selection guard and ## Scope

- `frontend/src/app/shell/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mount the disclosure affordance on compact menu-bearing surfaces and confirm Android long-press routes through the selection guard

## Scope

- `frontend/src/app/shell/`

## Description

- Add an optional trailing slot to `DocChrome` and mount `RowMenuDisclosure` there from `MarkdownDocView` view mode with the same vault-doc entity the right-click path opens
- Mount `RowMenuDisclosure` beside every vault tree leaf row in `TreeBrowser` (sibling of the row button, never nested inside it)

## Outcome

Compact and any coarse-pointer device now reach the resolver menu by explicit tap on the two primary menu-bearing surfaces (tree rows, the open document), while Android long-press `contextmenu` rides the P01 guard. The affordance renders null on fine pointers so desktop DOM is unchanged. Viewer, left, and shell suites pass (181 tests) and typecheck is clean. Deviation: the true mount points are `TreeBrowser` and the viewer chrome rather than the `app/shell/` scope literal - the compact shell renders both, and mounting at the shared component covers desktop touch for free.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
