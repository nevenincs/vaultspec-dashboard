---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S150'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the shared feature archive action

## Scope

- The shared feature archive action builder
- Its feature-menu composition
- Archive descriptor, confirmation, localization-runtime, and menu tests
- The exact localization scanner baseline

## Description

- Replaced dynamic archive row labels with `features:destructiveActions.archive`.
- Replaced the missing-feature message with `features:disabledReasons.selectFeature`.
- Replaced legacy arm-to-confirm metadata with a typed destructive confirmation on enabled actions only.
- Kept feature interpolation in the confirmation title and used value-free catalog descriptors for the body, confirm label, and cancel label.
- Ensured disabled actions carry neither confirmation form, dispatch, nor run behavior.
- Preserved caller IDs, Archive icon, danger section, time-travel gate, dispatch-only shape, and exact operation payload.
- Removed the final temporary action-presentation bridge import and the last two shared-action allowlist entries.

## Outcome

Feature archive now uses a stable catalog-owned row label and a clear destructive dialog that names the selected feature. Unavailable actions tell users to select a feature without exposing operation terminology.

The focused run passed 94 tests across six files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,495 to 1,493 findings, and the temporary action bridge decreased from 141 to 139 entries. The shared action module now has no temporary bridge entries.

## Notes

Terra performed the bounded migration. Sol approved the destructive confirmation architecture and reported no findings in the final review.
