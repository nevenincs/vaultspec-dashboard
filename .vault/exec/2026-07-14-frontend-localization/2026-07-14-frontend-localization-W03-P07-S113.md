---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S113'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize shared keyboard-navigation accessibility guidance and freshness presentation

## Scope

- `frontend/src/app/a11y/KeyboardNav.tsx`
- `frontend/src/app/presentation/freshness.ts`

## Description

- `KeyboardNav.tsx` was already fully typed (`resolveMessage` over descriptors) at the
  start of this reconciliation pass.
- `freshness.ts` was NOT: it built manual English relative-time strings (`"now"`,
  `` `${n}h` ``, `` `${n}d` ``, `` `${n}w` ``) instead of resolving through the
  localization runtime. Held open pending a design call because the same helper feeds
  two other in-flight phases (`left/vaultRowPresentation.ts` → `VaultBrowser.tsx`,
  `W03.P08.S170`; `right/StatusTab.tsx`, `W04.P10.S58`).
- The coding lane (opus-l10n) rewrote `freshness.ts`: the export is now
  `freshness(modified, now): Freshness | null` returning `{ descriptor, fresh }`, with
  a count-plural catalog family (`common:freshness.now` + hour/day/week plural forms),
  policy-classified role "status", and genuine en/fr/ar test resources. The old
  string-returning `freshnessLabel`/`isFresh` exports were removed outright (clean
  cutover, no bridge) and every consumer updated in the same change.
- Independently reran the bounded scanner and the file's own `freshness.test.ts`; both
  clean/green.

## Outcome

Freshness presentation is fully locale-aware (typed descriptor + plural family), and
keyboard-navigation guidance remains fully typed; both files in this step's scope are
genuinely satisfied.

## Notes

Held for one reconciliation cycle (2026-07-17) pending the freshness design call flagged
by opus-l10n, since fixing it in isolation would have broken `VaultBrowser.tsx` and
`StatusTab.tsx` non-atomically. The atomic fix landed together with amendments to
`W03.P08.S51`/`S170` and a partial migration of `W04.P10.S58`'s freshness call site
(tracked separately in those records). Verification here is independent (scanner run +
live `freshness.test.ts`), not a fresh implementation on my part.
