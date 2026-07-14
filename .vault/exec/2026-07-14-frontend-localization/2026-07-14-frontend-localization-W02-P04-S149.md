---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S149'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the shared feature repair action

## Scope

- The shared feature repair action builder
- Its feature-menu composition
- Repair descriptor, confirmation, localization-runtime, and menu tests
- The exact localization scanner baseline

## Description

- Replaced dynamic autofix row labels with the stable `features:guardedActions.repair` command.
- Replaced the missing-feature message with `features:disabledReasons.selectFeature`.
- Replaced legacy arm-to-confirm metadata with a typed guarded confirmation on enabled actions only.
- Kept feature interpolation in the confirmation title and used value-free catalog descriptors for the body, confirm label, and cancel label.
- Ensured disabled actions carry neither confirmation form, dispatch, nor run behavior.
- Preserved caller IDs, Wrench icon, transform section, time-travel gate, dispatch-only shape, and exact operation payload.
- Left archive behavior and its two temporary bridge entries untouched for `S150`.
- Removed exactly two matching repair bridge entries from the scanner allowlist.

## Outcome

Feature repair now uses a concise catalog-owned row label and a clear guarded dialog that names the selected feature. Unavailable actions tell users to select a feature without exposing operation terminology.

The focused run passed 94 tests across six files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,497 to 1,495 findings, and the temporary action bridge decreased from 143 to 141 entries.

## Notes

Terra performed the bounded migration. Sol approved the guarded confirmation architecture and reported no findings in the final review.
