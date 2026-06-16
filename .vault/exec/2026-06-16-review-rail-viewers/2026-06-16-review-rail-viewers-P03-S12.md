---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S12'
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
     The S12 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add shiki/core, the JS regex engine, and the lang/theme packages to the frontend dependencies (runtime, never rag/torch) and ## Scope

- `frontend/package.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add shiki/core, the JS regex engine, and the lang/theme packages to the frontend dependencies (runtime, never rag/torch)

## Scope

- `frontend/package.json`

## Description

- Add shiki, the langs package, and the themes package as runtime dependencies; the fine-grained core and the JavaScript regex engine are subpath exports of shiki, so no separate engine package is needed.
- Add react-markdown and remark-gfm (P04.S16) in the same install.
- Confirm published-wheel-purity: the new deps landed in runtime dependencies and neither vaultspec-rag nor torch is present.

## Outcome

The viewer runtime deps are present, rag/torch-free. The high-severity audit findings are all pre-existing storybook/esbuild dev-tooling issues, unrelated to these additions.

## Notes

None.
