---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S02'
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
     The S02 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Contain the combobox listbox on short viewports (portal or space-aware max-height), raise option rows to the touch floor, and render aria-controls only when the listbox exists and ## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Contain the combobox listbox on short viewports (portal or space-aware max-height), raise option rows to the touch floor, and render aria-controls only when the listbox exists

## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx`

## Description

- Portal the suggestion listbox to the body with fixed positioning (the context-menu host idiom) so no dialog body or scroll container can clip it.
- Make placement space-aware: measured room below the field caps the max height (16rem ceiling, ~3-row floor), flipping above when below-space is too tight; re-placed on resize and captured ancestor scroll.
- Swallow mousedown on the listbox so a scrollbar drag never blurs the input and dismisses the list.
- Raise option rows to the 2.75rem touch floor on coarse pointers (shared pointer-coarse hook).
- Set aria-controls only while the listbox is rendered.

## Outcome

Closes combobox-dropdown-clipped (MEDIUM), the combobox third of touch-target-subminimum, and combobox-aria-controls-dangling (LOW) for every consumer at once. tsc clean; all combobox consumer suites green unchanged.

## Notes

The portaled list keeps the existing blur/commit semantics: option mousedown still commits via preventDefault, and container-blur still closes the list on tab-away.
