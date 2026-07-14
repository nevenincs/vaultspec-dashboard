---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S15'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace frontend-localization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Add the localization scanner to the standard frontend lint gate and ## Scope

- `frontend/package.json`
- `justfile` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the localization scanner to the standard frontend lint gate

## Scope

- `frontend/package.json`
- `justfile`

## Description

- Expose the production localization scanner as the `lint:localization` package command.
- Run localization enforcement immediately after ESLint in the standard frontend lint
  recipe.
- Preserve the order and behavior of every existing frontend lint gate.

## Outcome

The standard frontend lint recipe now rejects new, stale, or metadata-altered
localization findings before formatting and type checking. The direct command and full
recipe both accept the unchanged 1,560-entry migration baseline.

## Notes

The full frontend lint recipe passed and showed localization enforcement directly after
ESLint, followed by the existing pixel, module-size, formatting, TypeScript, token, and
Figma-name gates.
