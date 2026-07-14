---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S16'
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
     The S16 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Prove the scanner against production files and real rule fixtures without mirrored business logic and ## Scope

- `frontend/scripts/scan-localization.test.ts`
- `frontend/scripts/fixtures/localization/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove the scanner against production files and real rule fixtures without mirrored business logic

## Scope

- `frontend/scripts/scan-localization.test.ts`
- `frontend/scripts/fixtures/localization/`

## Description

- Exercise every scanner finding code with checked-in TypeScript and TSX fixtures.
- Verify symbol-aware translation bindings, structured descriptors, and semantic
  exclusions without doubles or scanner mutations.
- Prove conditional constant resolution, generated-comment handling, locale formatting,
  translated fragments, dynamic keys, and translation-default detection.
- Validate exact baseline comparison, metadata refusal, one-time initialization, and
  bounded expression, file, and finding behavior.
- Prove spread source-order overrides, deterministic finding identity, and portable path
  metadata refusal.

## Outcome

The scanner contract is covered by real source fixtures that distinguish valid dynamic
data and diagnostics from user-facing literals. Adverse fixtures exercise all nine
finding codes, while baseline, path, ordering, and resource-bound tests fail closed on
unsafe input.

## Notes

The initial valid-fixture run exposed a structured confirmation-signature defect in the
scanner. The scanner owner corrected that defect, and the unchanged fixture then passed.
Targeted formatting, lint, TypeScript, and all eight real scanner tests pass.
