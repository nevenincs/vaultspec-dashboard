---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S135'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Reject prohibited internal and development vocabulary in catalog values and rendered fallback mappings

## Scope

- `frontend/src/localization/catalogVocabulary.test.ts`

## Description

- Swept `PROHIBITED_UI_TERMS` (built on the production policy export, not
  reimplemented) over the whole source catalog corpus — zero hits.
- Added adverse coverage per prohibited term family, proving the sweep actually
  catches a violation rather than only confirming a clean corpus.
- Added word-boundary safety assertions so ordinary words containing a prohibited
  substring (`restore`, `store`, `webhook`, `telescope`, `tokenized`, `componentry`)
  do not false-positive.

## Outcome

Prohibited internal/development vocabulary is now provably absent from the catalog
and rendered fallback mappings, with adversarial proof the check is live (not
vacuous) and boundary-safe (not over-eager).

## Notes

Landed at commit `65df838460` (same batch as `S130`/`S136`). This record was
authored during a fill pass (bookkeeping only, no code changes by me).

Independently reverified: `git show 65df838460 --stat` confirms
`catalogVocabulary.test.ts`; live rerun — 4/4 passed (part of the 23/23 combined
W06.P18 run), including the word-boundary-safety and adverse-per-family
assertions; ESLint clean.
