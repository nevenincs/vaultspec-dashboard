---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S118'
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
     The S118 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Apply and reactively update document language and direction attributes and ## Scope

- `frontend/src/platform/localization/documentLanguage.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Apply and reactively update document language and direction attributes

## Scope

- `frontend/src/platform/localization/documentLanguage.ts`

## Description

- Resolve one canonical document locale from the initialized runtime with a safe source-locale fallback.
- Apply only changed language and direction properties to the document root.
- Subscribe once per runtime and root pair with reference-counted, idempotent cleanup.
- Retain zero-reference binding ownership until exact listener removal succeeds.
- Reject internal language modes and contain failures without producing visible or diagnostic output.

## Outcome

The localization platform can now set the document language and writing direction before
the application mounts and keep both values synchronized after real language changes.
Weak ownership prevents the binding registry from retaining runtimes or document roots,
while exact listener cleanup supports repeated bind and release calls safely. A bounded
removal retry keeps transient failures recoverable, and a later bind reuses the owned
listener instead of registering a duplicate.

## Notes

Real `i18next` and browser-document assertions covered left-to-right and right-to-left
updates, redundant-mutation avoidance, internal-mode fallback, shared ownership, and
listener release. The temporary verification file was removed after it passed. Targeted
Prettier, ESLint, and strict TypeScript checks passed. Remediation also repeated real
runtime reference-count and listener-release coverage after preserving failed-removal
ownership.
