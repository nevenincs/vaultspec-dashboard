---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S119'
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
     The S119 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Validate interpolation parameter parity across every shipped locale and ## Scope

- `frontend/src/localization/catalogInterpolation.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Validate interpolation parameter parity across every shipped locale

## Scope

- `frontend/src/localization/catalogInterpolation.test.ts`

## Description

- Inspect every production message leaf in every shipped locale for complete, valid,
  bounded interpolation tokens and prohibited nested-message syntax.
- Compare each locale's interpolation names with the source locale by semantic message
  key.
- Resolve every production message through the production descriptor and safe fallback
  contracts using bounded values.
- Exercise missing-value recovery with the real alternate-locale runtime and resources.

## Outcome

Production catalog interpolation now has a real-resource invariant test. The test reads
the shipped locale aggregate directly, rejects malformed delimiters and nested catalog
references, enforces descriptor bounds, verifies parameter parity, and proves successful
resolution through production message contracts. Missing interpolation values resolve
to safe localized recovery copy.

## Notes

The production English catalog currently contains no interpolation parameters, so the
parity loop establishes the invariant for later catalog growth. The bounded alternate
locale fixture supplies the real interpolation case for complete and missing values.
No production catalog was changed. Targeted Vitest, ESLint, Prettier, and TypeScript
checks passed. Semantic discovery was unavailable because the installed
`vaultspec-rag` executable lacks its Python module; direct source inspection provided
the required grounding.
