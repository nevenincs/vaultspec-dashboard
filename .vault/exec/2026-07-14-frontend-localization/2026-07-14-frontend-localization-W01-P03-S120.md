---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S120'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Add a safe plural message contract

## Scope

- `frontend/src/platform/localization/message.ts`
- `frontend/src/platform/localization/fallback.ts`
- `frontend/src/platform/localization/LocalizationProvider.tsx`
- `frontend/src/platform/localization/runtime.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/localization/catalogPlural.test.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/catalogInterpolation.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/messagePolicy.test.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/stores/view/commandPalette.ts`

## Description

- Separate logical plural message keys from physical CLDR resource variants.
- Add a bounded count descriptor builder that owns a safe non-negative integer count.
- Restrict formatter-backed interpolation to a closed safe grammar.
- Add category-complete English, French, and Arabic production-resource proofs.
- Preserve fail-closed resolution and ordinary-message behavior.

## Outcome

Frontend code can request localized counts through one logical key without selecting singular or plural forms. Physical CLDR suffixes cannot become public message keys, invalid counts and formatters fail closed, and real locale category sets are verified against `Intl.PluralRules`.

## Verification

- `just dev lint frontend`
- Sol author regression suite, 114 tests
- Terra independent localization suite, 42 tests
- Terra independent palette regressions, 29 tests
- Independent Terra review approved with no findings

## Notes

The scanner remains at 1,415 findings. The first full frontend gate found formatting-only drift in eight touched files; formatting them resolved the issue and the complete gate passed.
