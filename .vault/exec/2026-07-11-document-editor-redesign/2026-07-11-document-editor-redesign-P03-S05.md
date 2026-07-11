---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S05'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace document-editor-redesign with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Add the Related multi-select combobox over the corpus with removable Chips persisted as wiki-link stems to the Properties form and ## Scope

- `frontend/src/app/viewer/RelatedDocPicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the Related multi-select combobox over the corpus with removable Chips persisted as wiki-link stems to the Properties form

## Scope

- `frontend/src/app/viewer/RelatedDocPicker.tsx`

## Description

- Add the shared `AutocompleteCombobox` (kit SearchField + autocomplete listbox,
  Class-B arrow/enter/escape keys in-component) mirroring the rail's canonical
  feature-search field; single/multi and optional free-text modes.
- Add `RelatedDocPicker`: the combobox over the corpus (excluding self and already-
  linked documents) plus removable Badge tokens, persisting selections as comma-joined
  wiki-link stems.
- Add pure `parseRelatedStems` / `serializeRelatedStems` (de-dupe, tolerate `[[ ]]`).
- Render-test add / remove / already-linked exclusion and the parse round-trip.

## Outcome

Delivered. `related` now links only to documents that exist — no dangling links from
typos. Grounded rag-first on the `FeatureSearchField` combobox template. Tests and
gate pass.

## Notes

Options carry an explicit `aria-label` so a screen reader announces the title cleanly
(and the listbox is deterministically queryable) — the nested-span content name did
not compute under happy-dom.
