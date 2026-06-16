---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S13'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Build a useHighlighter hook owning a singleton createHighlighterCore with per-language and per-theme dynamic import lazy registration

## Scope

- `frontend/src/app/viewer/useHighlighter.ts`

## Description

- Build `useHighlighter` owning a module-level singleton `createHighlighterCore` (fine-grained core + the JavaScript regex engine, no Oniguruma WASM), deduped by a module-level promise.
- Lazy-register grammars per language on first use, sharing one in-flight load per grammar; tokenize to HAST via `codeToHast` for React rendering.
- Degrade to plain text on an unknown hint or a grammar load failure, never throwing into the viewer; expose a test reset seam.

## Outcome

The shared highlighter tokenizes against the real engine; the probe test confirms HAST output with token-bound foregrounds.

## Notes

None.
