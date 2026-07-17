---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S60'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize changes overview summaries, comparisons, and actions with consistent verbs

## Scope

- `frontend/src/app/right/ChangesOverview.tsx`

## Description

- `ChangeGroup`'s section-header rendering was hardcoded to render
  `group.label` (a raw string sourced from `gitchanges.ts`'s
  `GIT_CHANGE_BUCKET_LABEL`, `W04.P13.S234`) directly. Now calls
  `useLocalizedMessageResolver()` and resolves `group.label` (now a
  `MessageDescriptor`) through `resolveMessage(group.label).message` before
  passing it to `SectionLabel`.

## Outcome

The changes overview's group section headers (Staged / Modified / Deleted /
New) render only localized, typed-descriptor copy.

## Notes

Fixed by opus-l10n, in the same change as `W04.P13.S234` (the two steps share
one hardcoded-label defect split across the query layer and its render
consumer). Independently reverified: `git diff` matches the reported change
exactly, localization scanner clean, and the live suite (`gitchanges.test.ts` +
`catalogKeys.test.ts` + `messagePolicy.test.ts`, the same 51/51 batch as S234)
passed. This record was authored during a reconciliation pass; not a fresh
implementation on my part.
