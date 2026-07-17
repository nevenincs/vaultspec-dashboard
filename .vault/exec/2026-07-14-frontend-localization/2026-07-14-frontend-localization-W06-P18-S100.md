---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S100'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Reject em dashes and invalid ellipsis punctuation in locale resources and production copy

## Scope

- `frontend/src/localization/catalogPunctuation.test.ts`
- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/fixtures/localization/invalid/punctuation.tsx`

## Description

- Added `catalogPunctuation.test.ts`, sweeping every locale resource value for a
  prohibited em dash or a hand-typed (non-Unicode-ellipsis) invalid ellipsis form.
- Added a corresponding punctuation RULE to `scan-localization.mjs` (with a
  dedicated adverse fixture, `punctuation.tsx`) so production source copy is swept
  the same way, additive to (never a replacement of) the existing untranslated-
  literal finding — the scanner test confirms the rule fires for both prohibited
  forms across both carrier positions (JSX text and an attribute).

## Outcome

Em dashes and invalid ellipsis punctuation are now rejected at both the locale
resource level (catalog values) and the production source level (the scanner
rule), closing both the authored-catalog and authored-source punctuation classes.

## Notes

Test landed at commit `3e66868d0f` (part of the "W03 defect tail... W06 punctuation
enforcement" batch); the scanner rule landed at `c8320e07de` ("scanner — remove
obsolete allowlist + legacy-bridge rule, add punctuation rule with adverse
fixture, l10n S98/S100/S137 batch"). This record was authored during a fill pass
(bookkeeping only, no code changes by me).

Independently reverified: `git show 3e66868d0f --stat` confirms
`catalogPunctuation.test.ts` (132 lines added); `git show c8320e07de --stat`
confirms the punctuation fixture and scanner rule; live rerun of
`catalogPunctuation.test.ts` — 5/5 passed (part of the 23/23 combined W06.P18 run);
`scan-localization.test.ts` — 14/14 passed, including the assertion that the
punctuation rule fires >=2 times across both prohibited forms and both carrier
positions.
