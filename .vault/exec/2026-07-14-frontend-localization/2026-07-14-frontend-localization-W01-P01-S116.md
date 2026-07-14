---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S116'
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
     The S116 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Implement the React localization provider over the initialized production runtime and ## Scope

- `frontend/src/platform/localization/LocalizationProvider.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the React localization provider over the initialized production runtime

## Scope

- `frontend/src/platform/localization/LocalizationProvider.tsx`

## Description

- Bind React to the synchronously initialized application localization runtime.
- Resolve unknown message descriptors through the safe resolver at render time.
- Subscribe descriptor consumers to language changes without enabling Suspense.

## Outcome

React surfaces can now share the production localization runtime through a provider
that accepts only children. The localized-message hook remains reactive while keeping
translation keys, malformed descriptors, and missing resources behind the established
safe fallback boundary.

## Notes

The full frontend lint gate passed. A temporary real render test passed with the
project's DOM environment and was removed because the durable runtime suite belongs to
the later test step. No scaffolds remain.
