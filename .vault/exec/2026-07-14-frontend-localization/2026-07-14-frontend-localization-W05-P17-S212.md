---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S212'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize or production-fence the standalone three-lab HTML shell

## Scope

- `frontend/three.html`

## Description

- Verified the file renders no visible or announced text: an empty `<title>`, a bare
  `<div id="root">`, and a module script tag — locale-neutral by construction.
- Confirmed via `vite.config.ts` that the production Rollup input is restricted to
  `index.html` only, so `three.html` never ships in a production build regardless of
  its (already locale-neutral) content.

## Outcome

The standalone three-lab HTML shell carries no unlocalized copy and is excluded from
production builds — both halves of the step's disjunction are satisfied.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was file inspection and confirmation
of the vite production-input restriction, not a fresh implementation.
