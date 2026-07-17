---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S211'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize or explicitly development-fence the three-lab graph surface

## Scope

- `frontend/src/three-lab/ThreeLab.tsx`
- `frontend/src/three-lab/main.tsx`

## Description

- Verified `ThreeLab.tsx` resolves its control and label copy through
  `useLocalizedMessage` over typed descriptors (49 call sites) and `main.tsx` resolves
  its bootstrap copy the same way (2 call sites).
- Confirmed via `vite.config.ts` that `command === "build"` restricts the production
  Rollup input to `index.html` only — the entire `three-lab` surface is excluded from
  the production bundle, satisfying the "explicitly development-fence" half of the
  step's disjunction as well.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

The three-lab graph surface is both fully localized AND excluded from production
builds.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was file inspection, a scoped scanner
run, and confirmation of the vite production-input restriction, not a fresh
implementation.
