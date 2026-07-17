---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S137'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Reject English call-site defaults, dynamic message keys, and concatenated translated fragments

## Scope

- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/scan-localization.test.ts`
- `frontend/scripts/fixtures/localization/invalid/all-rules.tsx`

## Description

Verify-and-record satisfied-as-found: the three finding codes this step asks for —
`translation-default` (English call-site default), `dynamic-message-key`, and
`translated-fragment` (concatenated translated pieces, both `binary-plus` and
`template` carrier forms) — already existed in the scanner (`FINDING_CODES` at
`scan-localization.mjs`) as of the `S14` foundation step (bounded production-source
scanner). No new rule was needed; this step's job was to confirm the rule already
covers the cases the plan names and that adverse coverage exists, not to author new
detection.

## Outcome

All three finding codes are proven live by the scanner test's
"reports every production finding code from real invalid source" assertion, which
checks the UNION of every fixture-driven finding equals the full `FINDING_CODES`
set — so `translation-default`/`dynamic-message-key`/`translated-fragment` are each
proven to fire against `all-rules.tsx`, not merely declared as constants.

## Notes

Pre-existed from `W01.P03.S14` (`frontend/scripts/scan-localization.mjs` +
`localization-allowlist.json`, since superseded — see `S98`). This step is recorded
as verify-and-record satisfied-as-found, not landed at a new commit; the
allowlist-removal/legacy-bridge-rule cleanup that touched the same file for other
reasons landed at `c8320e07de` (the "S98/S100/S137 batch" commit message groups
this step with that cleanup, but the three finding codes themselves are untouched
by it).

Independently reverified: grepped `scan-localization.mjs` for
`dynamicMessageKey`/`translatedFragment`/`translationDefault` — all three codes
present with active detection logic (not stubs); live rerun of
`scan-localization.test.ts` — 14/14 passed, including the "reports every
production finding code from real invalid source" test whose fixture-union
assertion covers all three codes.
