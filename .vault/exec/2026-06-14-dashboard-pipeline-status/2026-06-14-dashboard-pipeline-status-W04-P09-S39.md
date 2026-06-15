---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S39'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S39 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Add roving-tabindex keyboard navigation across rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row's step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern and ## Scope

- `frontend/src/app/right/WorkTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add roving-tabindex keyboard navigation across rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row's step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Added roving-tabindex keyboard navigation across the top-level rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern.

## Outcome

Rows are keyboard-navigable and the disclosure is an accessible control bound to its tree.

## Notes

None.
