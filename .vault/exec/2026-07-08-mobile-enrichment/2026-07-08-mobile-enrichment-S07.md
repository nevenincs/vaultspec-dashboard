---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S07'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---




# D6: compact reader breadcrumb legibility — drop the Vault root on compact and keep ancestor crumbs whole so only the title truncates (no more Va… / Decisi… / title…)

## Scope

- `frontend/src/app/kit/Breadcrumb.tsx`

## Description

- Add an `includeRoot` option to `buildDocTrail`; the compact reader passes `false` to drop the low-value "Vault" root, leaving the doc-type / title pair.
- Change the shared `Breadcrumb` so ancestor crumbs stay whole (`shrink-0` / `whitespace-nowrap`) and only the final (title) segment truncates.

## Outcome

The compact reader trail reads "Decisions / <title>" instead of "Va… / Decisi… / title…" (verified live @390px). The wide desktop `DocPanel` trail is unchanged; the `Breadcrumb` render test and the compact guard test stay green.

## Notes

