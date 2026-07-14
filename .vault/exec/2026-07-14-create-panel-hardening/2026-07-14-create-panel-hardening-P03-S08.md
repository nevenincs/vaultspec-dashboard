---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S08'
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
     The S08 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Author the compact render suite (viewport-class driven): footer reachability with constrained height, listbox containment, touch-target floors, and the 320-width presentation and ## Scope

- `frontend/src/app/left/CreateDocDialog.compact.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the compact render suite (viewport-class driven): footer reachability with constrained height, listbox containment, touch-target floors, and the 320-width presentation

## Scope

- `frontend/src/app/left/CreateDocDialog.compact.render.test.tsx`

## Description

- Author the compact render suite with the shell's stubbed compact + coarse-pointer media queries (the CompactUnifiedRail idiom): the primary action pinned outside the one scrolling body with the safe-area inset (soft-keyboard reachability), the viewport width clamp (narrow centered modal per the design ruling, no sheet chrome), the portaled fixed-position suggestion listbox (clip-proof), and the 2.75rem floors on the back and chip-remove affordances.

## Outcome

4 compact tests green; the structural contract of the approved compact frame is locked.

## Notes

happy-dom has no layout, so the suite asserts the structural contract (containment, classes, portal target), not pixels; the space-aware placement math is locked in the combobox primitive suite.
