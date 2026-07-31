---
tags:
  - '#exec'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
body_hash: 'sha256:515b38605b129d80d1a82063863b04fa858f04a14a9d15110d2ccfa1d8986016'
step_id: 'S04'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
---

# Cover highlighter editor and snippet behavior

## Scope

- `frontend/src/app/viewer/HighlightedCode.test.tsx`

## Description

- Add `HighlightedCode.test.tsx` coverage for the real highlighted textarea path and trailing-line behavior.
- Extend `useHighlighter.test.ts` to cover path-derived language hints.
- Extend `DiffPanel.render.test.tsx` to prove review snippets render real Shiki token spans while retaining diff markers.

## Outcome

- Targeted tests passed for editor, snippet, and language derivation behavior.
- Full frontend lint and full frontend Vitest passed after implementation.

## Notes

- The first full Vitest attempt timed out at the four-minute command limit; the rerun with a longer timeout passed.
