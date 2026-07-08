---
tags:
  - '#exec'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S01'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
---

# Extract reusable highlighted code rendering

## Scope

- `frontend/src/app/viewer/HighlightedCode.tsx`

## Description

- Add `HighlightedLineContent` and `HighlightedTextLines` as reusable Shiki token-line renderers.
- Add `HighlightedTextarea` as a native-textarea overlay editor that renders highlighted Markdown underneath the editable control.
- Add trailing-line splitting behavior for editor and viewer callers.
- Move `CodeViewer` token-line rendering onto the shared renderer.

## Outcome

- `CodeViewer` still owns virtualization and line numbers, but no longer carries its own token span renderer.
- The shared component preserves the existing token-tier color binding and supports combined Shiki font-style flags.

## Notes

- No data migration or engine change.
