---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S119'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Validate interpolation parameter parity across every shipped locale

## Scope

- `frontend/src/localization/catalogInterpolation.test.ts`

## Description

- Inspect every production message leaf in every shipped locale for complete, valid,
  bounded interpolation tokens and prohibited nested-message syntax.
- Compare each non-source shipped locale's distinct interpolation names with the source
  locale when additional shipped locales are present.
- Resolve production messages without parameters through the production descriptor and
  safe fallback contracts to their actual source copy.
- Exercise matching parameter resolution and missing-value recovery with the real
  left-to-right and right-to-left alternate-locale resources.

## Outcome

Production catalog interpolation now has a real-resource invariant test. The test reads
the shipped locale aggregate directly, rejects malformed delimiters and nested catalog
references, bounds distinct parameter names, and proves source-copy resolution through
production message contracts. Additional shipped locales must preserve each source
message's distinct interpolation names. Matching left-to-right and right-to-left
parameters resolve without placeholders, while missing values use safe localized
recovery copy.

## Notes

The production English catalog currently contains no interpolation parameters. The
production scan does not require a second shipped locale, but its distinct-token parity
check activates when one is added. Bounded alternate-locale fixtures supply non-vacuous
complete and missing-value behavior in both writing directions. No production catalog
was changed. Targeted Vitest, ESLint, Prettier, and TypeScript checks passed. Semantic
discovery was unavailable because the installed `vaultspec-rag` executable lacks its
Python module; direct source inspection provided the required grounding.
