---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S06'
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
     The S06 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Mount localization before the application boundary without changing theme or data-provider authority and ## Scope

- `frontend/src/main.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mount localization before the application boundary without changing theme or data-provider authority

## Scope

- `frontend/src/main.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

- Bind the production document language before theme initialization and React mounting.
- Dispose only the document-language subscription during hot replacement.
- Mount the localization provider outside the application error boundary.
- Preserve the existing error, query, router, policy, theme, and diagnostic ownership.

## Outcome

The production root now applies the initialized locale to the document before visible
React output and makes the same runtime available to every application fallback and
route. Existing provider order and development-only controls remain unchanged.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

Targeted Prettier, ESLint, and TypeScript checks passed. The full frontend lint gate
also passed, including formatting, TypeScript, token drift, and component-name checks.
No user-facing copy, raw message key, diagnostic value, or runtime logging was added.
