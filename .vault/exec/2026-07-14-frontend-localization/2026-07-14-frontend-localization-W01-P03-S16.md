---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S16'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

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
