---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S214'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Prove three-lab entry points never expose message keys, development metadata, raw tokens, or untranslated English

## Scope

- `frontend/src/three-lab/AppearancePanel.tsx`
- `frontend/src/three-lab/ThreeLab.tsx`
- `frontend/src/three-lab/main.tsx`
- `frontend/three.html`

## Description

- Verified `AppearancePanel.tsx` (13 sites), `ThreeLab.tsx` (49 sites), and `main.tsx`
  (2 sites) resolve every control and label through `useLocalizedMessage` over typed
  descriptors, per `W05.P17.S96`/`S211` — resolved `message` strings render, never
  raw keys or development metadata.
- Verified `three.html` renders no visible or announced text at all (empty `<title>`,
  bare root div), per `W05.P17.S212`.
- Confirmed via `vite.config.ts` that the production Rollup input is restricted to
  `index.html` only, so the three-lab surface never ships regardless.
- Ran the bounded localization scanner against all three non-HTML files and confirmed
  zero exact findings.

## Outcome

The three-lab entry points are proven to expose only resolved, localized production
copy — never a key, development metadata, or a raw token — and are additionally
excluded from the production bundle entirely.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was file inspection, a scoped scanner
run, and confirmation of the vite production-input restriction, not a fresh
implementation.
