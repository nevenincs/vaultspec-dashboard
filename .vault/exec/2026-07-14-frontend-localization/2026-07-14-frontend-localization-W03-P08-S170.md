---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S170'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize vault-browser grouping, document states, and accessible names

## Scope

- `frontend/src/app/left/VaultBrowser.tsx`

## Description

- Verified `VaultBrowser.tsx` is a thin wrapper that owns no string literals of its own:
  it re-exports presentation helpers from `vaultRowPresentation.ts` and delegates
  rendering entirely to the shared `TreeBrowser` projection (already localized,
  `W03.P08.S47`).
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The vault-browser mode's own module carries no unlocalized copy; grouping, document
state, and accessible-name presentation are fully owned by its already-localized
dependencies.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"). This record
retroactively documents and ticks the plan step; verification was file inspection plus a
scoped scanner run, not a fresh implementation. Note: the re-exported `freshnessLabel`
helper ultimately traces to `frontend/src/app/presentation/freshness.ts`, which carries a
genuine localization defect (hardcoded English relative-time suffixes) reported
separately under `W03.P07.S113`; that defect is out of this step's own scope
(`VaultBrowser.tsx` only) and is not fixed here.

AMENDMENT (2026-07-17): `W03.P07.S113` has since landed. `freshness.ts` now exports
`freshness()`/`Freshness` (typed descriptor + `fresh` boolean) in place of the old
string-returning `freshnessLabel`/`isFresh`; `vaultRowPresentation.ts` and
`VaultBrowser.tsx`'s re-exports were updated in the same atomic change to
`freshness`/`freshnessToneClass` (the latter now keyed on the stable `fresh` boolean).
Independently confirmed via `git diff` and a clean scanner run that `VaultBrowser.tsx`
still owns no string literals of its own — it re-exports the new, now-fully-localized
API. No further action needed; this step was never itself defective, only downstream
of a dependency that has since closed.
