---
tags:
  - '#exec'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S02'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
---

# Mount highlighting in the document editor

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Replace the plain Markdown edit textarea in `MarkdownDocView` with `HighlightedTextarea`.
- Keep `editor.draftText`, `updateEditorDraft`, save, rename, property editing, and unsaved-guard flows unchanged.
- Use the existing `markdown` language hint so document body structure and fenced code tokenize through the shared highlighter.

## Outcome

- Edit mode now displays highlighted Markdown while the native textarea remains the input and accessibility authority.

## Notes

- Code files remain read-only.
