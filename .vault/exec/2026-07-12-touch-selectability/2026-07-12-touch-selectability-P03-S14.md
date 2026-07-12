---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S14'
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
     The S14 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Re-enable selection on combobox and feature-suggestion option data text in the viewer and left-rail pickers and ## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-enable selection on combobox and feature-suggestion option data text in the viewer and left-rail pickers

## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx`

## Description

- Add `select-text` to the option primary/secondary column in `AutocompleteCombobox`
- Add `select-text` to the suggestion display and tag spans in `FeatureSearchField`

## Outcome

Both picker option lists render selectable data text. The comboboxes keep their focus-retention `preventDefault()` on option mouse-down (widget-intrinsic blur-race guard); pointer selection therefore starts on press-and-hold within the spans on touch but not from a desktop drag beginning on an option - accepted for transient dropdown surfaces.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
