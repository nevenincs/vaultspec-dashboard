---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S222'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize category display vocabulary

## Scope

- `frontend/src/app/kit/category.ts`
- `frontend/src/app/kit/category.test.ts`
- `frontend/src/app/kit/index.ts`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/locales/en/features.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`

## Description

- Preserve the explicit eight-token category union and its canonical order.
- Add a frozen exhaustive presentation map with exact nullable lookup.
- Reuse the six canonical document-type descriptors by identity.
- Add dedicated catalog labels for Code and Features.
- Preserve alias normalization, category colors, filters, DOM identity, and index exclusion.
- Add genuine English, French, and Arabic contract coverage.

## Outcome

Category presentation now uses typed catalog descriptors without duplicating document-type
vocabulary or exposing raw tokens. Aliases remain input normalization only, and unknown,
padded, internal, or non-displayable values cannot become labels.

## Notes

Terra passed 33 focused tests and the complete frontend lint recipe. Independent Sol
review passed with no findings. TypeScript, targeted ESLint, structural category guards,
catalog policy, scanner, and diff checks passed. The scanner remained clean at 1,151
findings with no allowlist change, matching the documented blind spot.
