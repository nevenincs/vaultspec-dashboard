---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S02'
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
     The S02 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Add a pure markdown formatting-insertion helper that wraps or line-prefixes the current selection and returns the new body plus caret range and ## Scope

- `frontend/src/app/viewer/markdownFormatting.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a pure markdown formatting-insertion helper that wraps or line-prefixes the current selection and returns the new body plus caret range

## Scope

- `frontend/src/app/viewer/markdownFormatting.ts`

## Description

- Add the pure `applyMarkdownFormat` helper: inline wraps (bold, italic, code,
  wiki-link), a two-slot link builder with the caret on the url slot, and line
  prefixes (heading, bulleted/numbered list, quote) that expand a selection to whole
  lines. Returns the new body plus the caret range to restore.
- Insert a placeholder and select it when an inline command runs on an empty
  selection; clamp/order an out-of-range selection defensively.
- Unit-test each command and the guard.

## Outcome

Delivered. A React/DOM-free transform module the toolbar feeds through
`updateEditorDraft`, keeping the editor slice the single draft owner. Full unit
coverage passes.

## Notes

None.
