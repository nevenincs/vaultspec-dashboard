---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S130'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Define the canonical operation-to-verb inventory and reject divergent synonyms across action IDs

## Scope

- `frontend/src/localization/actionVocabulary.test.ts`

## Description

- Authored a canonical operation→verb inventory (e.g. `reload` never `refresh`) and
  asserted every action-role catalog value (263 keys swept, non-vacuous) leads with
  its canonical `IMPERATIVE_ACTION_VERB`.
- Built directly on the production policy exports — no reimplemented verb logic.
- Added adverse coverage: a divergent synonym is proven rejected, not just the
  positive corpus swept.

## Outcome

Every action-role message in the catalog now provably leads with its canonical
imperative verb, and the test proves a synonym drift is caught rather than merely
asserting the current corpus is clean.

## Notes

Landed at commit `65df838460` ("W06 enforcement — action-verb oracle,
prohibited-terms sweep, raw-interpolation safety over the full catalog, l10n
S130/S135/S136"). This record was authored during a fill pass (bookkeeping only,
no code changes by me).

Independently reverified: `git show 65df838460 --stat` confirms
`actionVocabulary.test.ts` among the three files landed in this commit; live rerun
— 5/5 passed (part of the 23/23 combined W06.P18 run); ESLint clean.
