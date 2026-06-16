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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S13 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Build a useHighlighter hook owning a singleton createHighlighterCore with per-language and per-theme dynamic import lazy registration and ## Scope

- `frontend/src/app/viewer/useHighlighter.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
