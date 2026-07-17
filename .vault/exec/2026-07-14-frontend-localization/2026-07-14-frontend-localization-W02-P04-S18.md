---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S18'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Prove the final strict action contract, normalization, execution lanes, descriptor safety, and explicit destructive copy

## Scope

- `frontend/src/platform/actions/registry.test.ts`

## Description

- Deleted the `normalizeLegacyActionPresentation` bridge-test block entirely — no
  test exercises the removed legacy path anymore.
- Inverted the normalization/fire tests to PROVE rejection rather than acceptance:
  a raw string label is asserted to be dropped/rejected (`null`, action not fired)
  rather than coerced into a presentable descriptor; every normalized-label
  assertion in the file now expects a `MessageDescriptor`, never a string.
- Confirmed via direct read: the file contains multiple explicit "a raw string
  label is rejected by the strict typed contract" comment-anchored assertions
  (normalization, disabled-reason drop, and fire-path rejection), proving the
  contract at three separate seams rather than one.

## Outcome

`registry.test.ts` proves the FINAL strict action contract end to end: a raw
string can never normalize into a presentable label/reason, execution lanes and
descriptor safety are unchanged, and destructive confirmations still require
explicit typed copy.

## Notes

Landed at commit `9b23233257`, alongside `S17`. Independently reverified: `git
diff` matches the reported change exactly, read the three "raw string label is
rejected" assertion sites directly to confirm the inversion claim (not just
trusting the report's framing), and reran the file live — 26/26 passed as part of
the combined 79/79 suite run (`registry.test.ts` + `contextMenu.test.ts` +
`keymapDispatcher.test.ts` + `actionCoverage.guard.test.ts` +
`commandPalette.guard.test.ts` + `chromeActions.test.ts`). Fixed by opus-l10n;
this record documents the fix, not a fresh implementation on my part. This closes
`W02.P04.S18`, the plan's final closure gate alongside `S17` — see the corrected
Open Items section of the 2026-07-17 reconciliation closing dossier for the full
history of this gate's mis-description and correction.
