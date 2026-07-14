---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S121'
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
     The S121 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Enforce concise plain-language wording, sentence case, canonical imperative verbs, prohibited vocabulary, and actionable recovery in source locale messages and ## Scope

- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/messagePolicy.test.ts`
- `frontend/src/locales/en/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Enforce concise plain-language wording, sentence case, canonical imperative verbs, prohibited vocabulary, and actionable recovery in source locale messages

## Scope

- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/messagePolicy.test.ts`
- `frontend/src/locales/en/`

## Description

- Classify every source-locale key by its user-facing message role.
- Validate concise sentence-case copy, canonical action verbs, recovery guidance,
  protected terminology, and prohibited implementation vocabulary.
- Treat named interpolation values as opaque data while rejecting malformed static
  placeholders, raw keys, nested messages, and diagnostic signatures.
- Exercise the production catalog and adverse policy fixtures through the exported
  validator.

## Outcome

- The English catalog remains the sole source-copy authority and required no wording
  changes.
- Every current message key has an exhaustive policy role and passes the production
  validator.
- Stable policy issue codes cover grammar, actionability, punctuation, terminology,
  placeholder safety, and diagnostic leakage.
- Review remediation closes namespace-key, internal-language, path, command, and false
  recovery-statement bypasses without inspecting interpolated user data.
- Namespace-derived key recognition excludes URI schemes, while recovery validation
  accepts only explicit imperative complement shapes.

## Notes

- The focused Vitest suite, ESLint, Prettier, and TypeScript project build completed
  successfully.
- Adverse and safe-boundary fixtures cover exact terminology matches, diagnostic forms,
  recovery clauses, approved terminology, ordinary colons, and substring safety.
