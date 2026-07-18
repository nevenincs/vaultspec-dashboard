---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-18'
modified: '2026-07-18'
step_id: 'S138'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Expand the bounded alternate-locale resources for full expanded-copy and right-to-left browser verification

## Scope

- `frontend/src/localization/testing/reviewStationResources.ts`
- `frontend/src/localization/testing/agentResources.ts`
- `frontend/scripts/scan-localization.mjs`

## Description

Expanded French/Arabic alternate-locale test resources (`requestChanges`
body/placeholder/labels in `reviewStationResources.ts`; `agentResources.ts`
mirrors for `teamRunRefused`/`teamRunDismiss`), driving the `S104`/`S105`
e2e specs. The expansion initially tripped the scanner's exact-file
test-resource exclusion list (4 findings); the punch list replaced that
exact-file allowlist with a structural
`src/localization/testing/*Resources.ts` pattern, closing the gap
structurally (any future `*Resources.ts` fixture in that directory is
excluded by shape+location, not by an ever-growing per-file list).

## Outcome

The scanner is clean over the expanded fixtures, and the exclusion mechanism
is now structural rather than exact-file, closing a class of gap (a new
fixture module tripping the scanner until manually allowlisted) rather than
just the one instance.

## Notes

Fix landed at commit `c169ad5a98`, same commit as `S102`/`S103`/`S107`. This
record was authored during the campaign's one closing cold-verification
pass — no code changes by me.

Independently reverified: read `scan-localization.mjs`'s
`TEST_LOCALE_RESOURCE_SOURCE` pattern directly, confirming it matches
`^src/localization/testing/\w*[rR]esources\.ts$` — structural, not an
exact-file list; ran `just dev lint frontend`'s `lint:localization` step
myself — clean, 0 findings; live rerun of `S104`/`S105`'s e2e specs (which
this fixture expansion drives) — 3/3 and 7/7 respectively.
