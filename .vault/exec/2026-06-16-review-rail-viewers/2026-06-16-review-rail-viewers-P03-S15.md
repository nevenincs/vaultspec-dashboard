---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S15'
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
     The S15 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Map the required language set and the long tail to grammar loaders and a language_hint resolver shared by both viewers and ## Scope

- `frontend/src/app/viewer/languages.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Map the required language set and the long tail to grammar loaders and a language_hint resolver shared by both viewers

## Scope

- `frontend/src/app/viewer/languages.ts`

## Description

- Map the full required language set (rust, python, js, ts, jsx, tsx, bash, batch, powershell, c, cpp, json, toml, yaml, markdown) plus css/html to per-language lazy `@shikijs/langs/*` imports.
- Add a `resolveGrammar` hint resolver shared by both viewers, normalizing fence-info and extension aliases (rs, ts, sh, c++, yml, …) onto canonical grammar ids, returning null for an unknown hint so the viewer renders plain text.

## Outcome

Both viewers share one language vocabulary and one resolver; the resolver test covers the required set, the alias normalization, and the null degradation.

## Notes

None.
