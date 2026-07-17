---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S234'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace change query copy with typed outcomes and safe user concepts

## Scope

- `frontend/src/stores/server/queries/gitchanges.ts`

## Description

- `GIT_CHANGE_BUCKET_LABEL` was a hardcoded `Record<GitChangeBucket, string>`
  (`"Staged"`, `"Modified"`, `"Deleted"`, `"New"`); retyped to
  `Record<GitChangeBucket, MessageDescriptor>` resolving to a new
  `common:changeBuckets.{staged,modified,deleted,new}` catalog family.
- `GitChangeGroupView.label`'s type changed from `string` to `MessageDescriptor`,
  moving resolution to the render boundary (`W04.P10.S60`) instead of baking
  resolved English into the query-layer view model.
- Catalog ritual completed: `locales/en/common.ts` (new keys),
  `localization/messagePolicy.ts` (role classification), and
  `localization/catalogKeys.test.ts` (`EXPECTED_CATALOG_KEYS`) updated together.

## Outcome

The change-query module serves only typed message descriptors for its bucket
labels; no raw English survives in the query layer.

## Notes

Fixed by opus-l10n. Independently reverified: `git diff` matches the reported
change exactly (type widened to `Record<GitChangeBucket, MessageDescriptor>`,
four new `common:changeBuckets.*` catalog entries), localization scanner clean,
and the live suite (`gitchanges.test.ts` + `catalogKeys.test.ts` +
`messagePolicy.test.ts`) — 51/51 passed, matching the reported count. This record
was authored during a reconciliation pass; not a fresh implementation on my part.
This closes the `W04.P10.S60` blocker reported earlier.
