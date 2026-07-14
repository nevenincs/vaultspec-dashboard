---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S244'
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
     The S244 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Create bounded non-shipped alternate-locale resources for real locale-reactivity tests and ## Scope

- `frontend/src/localization/testing/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Create bounded non-shipped alternate-locale resources for real locale-reactivity tests

## Scope

- `frontend/src/localization/testing/`

## Description

- Add compact left-to-right and right-to-left catalogs with the source catalog's namespace shape.
- Add a real synchronously initialized runtime for locale-reactivity tests.
- Keep alternate resources outside the shipped locale registry and production import graph.
- Verify interpolation, fallback, locale changes, and direction with the real localization runtime.

## Outcome

Tests can now use two bounded alternate locales without mocks or shipped translation
resources. The fixture supports descriptor interpolation, safe fallback resolution,
React runtime integration, and both writing directions.

## Notes

Prettier, ESLint, TypeScript, and a focused Vitest real-runtime check passed. A source
search confirmed that production modules and build entry points do not import the test
fixture. Step `S07` owns the durable integration tests.
