---
tags:
  - '#exec'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S03'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
---

# Highlight review snippet diffs

## Scope

- `frontend/src/app/authoring/DiffPanel.tsx`

## Description

- Add path-derived language hints for review snippets.
- Tokenize bounded diff text through the shared highlighter.
- Render diff line text with the shared token-line renderer while preserving add/remove/context rows and gutter markers.

## Outcome

- Authoring review snippets now gain syntax highlighting when their served document path carries a supported extension.
- Diff identity remains visible through row tone, tally, and gutter sign.

## Notes

- No authoring API field was added.
