---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S03'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Update or add primitive render tests for the footer slot, reduced-motion gate, and listbox containment, and re-run every existing Dialog and combobox consumer suite green and ## Scope

- `frontend/src/app/chrome and consumer test suites` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Update or add primitive render tests for the footer slot, reduced-motion gate, and listbox containment, and re-run every existing Dialog and combobox consumer suite green

## Scope

- `frontend/src/app/chrome and consumer test suites`

## Description

- Extend the Dialog primitive render tests: the footer slot renders OUTSIDE the one scrolling body with the safe-area inset (and absent when unused), and both animated layers carry the motion-reduce gate.
- Author the combobox floating-listbox suite: portal + fixed placement, space-capped height on a short viewport, flip-above when below-space is tight, aria-controls only-when-rendered, and the coarse-pointer option floor (stubbed rects and media queries; the assertions target the placement contract, not pixels).
- Re-run every Dialog/combobox consumer suite.

## Outcome

15 primitive tests green (10 Dialog + 5 combobox); consumer sweep 242 tests green across 39 files (chrome 82, viewer/settings/left 160); whole-frontend tsc exit 0.

## Notes

None.
