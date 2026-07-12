---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S02'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Report per-page progress from the vaultTree and codeFiles cursor walks into the drain-progress seam (start/page/settle/error), leaving walk semantics and the complete-set drain unchanged

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

Instrument the `vaultTree` and `codeFiles` cursor walks in `frontend/src/stores/server/engine.ts`: report each page into the drain seam inside a try/finally that settles the entry on success and error; reporting fires only while a next cursor exists so single-page listings never touch the slice.

## Outcome

Walk semantics and the complete-set drain unchanged; the multi-page walks are now visible to the activity plane.

## Notes
