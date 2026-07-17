---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S132'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove manual runtime title-casing from user-facing presentation paths through each vocabulary's catalog, formatter, or fail-closed token owner

## Scope

- `frontend/src/app/panels/VaultHealthPanel.tsx`
- `frontend/src/app/panels/panels.derive.test.ts`
- `frontend/src/app/panels/VaultHealthPanel.localization.render.test.tsx`
- `frontend/src/locales/en/common.ts`

## Description

- Deleted `titleCase()` outright from `VaultHealthPanel.tsx`.
- Replaced the runtime title-case-and-echo of the served vault-health token with a
  fail-closed CLOSED vocabulary: the served token is classified, never echoed
  verbatim — `HEALTHY_VAULT_WORDS` membership resolves to
  `common:vaultHealth.healthy`; anything else the engine serves is a REAL
  condition and fails closed to `common:vaultHealth.attention` (never surfacing
  the raw token); the unreachable/checking/no-data arms resolve to their own
  dedicated keys (`vaultHealth.unreachable`, `vaultHealth.checking`).
- `VaultHealthView.word` is now typed `MessageDescriptor`, resolved at the render
  boundary via `useLocalizedMessage`.

## Outcome

The vault-health word is now a closed catalog vocabulary classification, not a
runtime transform of served text — closing both the localization gap (the word
was never translatable) and a latent honesty gap (a runtime title-case of an
unrecognized served token could have echoed arbitrary served text verbatim; the
fail-closed classification cannot).

## Notes

Landed at commit `8c4220b333` ("pipeline + plan-interior to catalog descriptors,
delete orphaned nowStrip, catalog-size tsc fix, l10n S132/S133 batch complete"),
by `sonnet-finisher` after `opus-l10n`'s third throttle. This record was authored
during a fill pass reconciling the team lead's verification request — no code
changes by me.

Independently reverified, not relayed: read `VaultHealthPanel.tsx`'s diff
directly, confirming `titleCase()` no longer exists anywhere in the file and the
fail-closed classification is genuine (an unrecognized token cannot reach the
DOM); live rerun of `panels.derive.test.ts` and
`VaultHealthPanel.localization.render.test.tsx` — both green (part of the 77/77
combined S132/S133 batch run); `npx eslint` on the touched file — clean; a
scoped `scan-localization.mjs` run over just this step's touched files — 0
findings.
