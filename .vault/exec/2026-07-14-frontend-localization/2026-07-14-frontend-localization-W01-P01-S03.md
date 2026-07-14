---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S03'
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
     The S03 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Define bounded typed message keys, values, descriptors, and confirmation descriptors and ## Scope

- `frontend/src/platform/localization/message.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define bounded typed message keys, values, descriptors, and confirmation descriptors

## Scope

- `frontend/src/platform/localization/message.ts`

## Description

- Derive namespace-qualified message-key types and a runtime allowlist from the English
  resource aggregate.
- Bound interpolation value names, value counts, string lengths, and finite numeric
  values without altering accepted user data.
- Normalize immutable message and confirmation descriptors through strict own-field
  validation.
- Restrict complete confirmations to explicit labels and the catalog-owned safe cancel
  action.

## Outcome

The frontend now has a React-free and store-free message contract for non-rendering
presentation seams. Unknown catalog keys, inherited or extra fields, accessors,
malformed value names, oversized data, non-finite numbers, arrays, objects, and
incomplete or ambiguous confirmations are rejected without manufacturing fallback
copy.

## Notes

The full frontend lint recipe reached an unrelated existing ESLint configuration error
in `CreateDocDialog.tsx`. Targeted Prettier and ESLint checks, the full TypeScript
project check, and an isolated TypeScript 6 strict compile of the new contract passed.
The full formatting check also reported only that unrelated file.
