---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
body_hash: 'sha256:6cc1c6faa93c07636685670e5da3801d263943d48db65222c0d40fcbc63620ec'
step_id: 'S02'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

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
