---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S114'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Move production graph-control labels and descriptions into catalogs while retaining technical lab-only vocabulary internally

## Scope

- `frontend/src/scene/three/graphControlSchema.ts`

## Description

- Verified the schema itself carries no display strings: every entry is a bare
  technical `id` (e.g. `charge`, `linkDistance`, `labelBudget`) plus numeric/enum
  bounds, with no `label`/`description`/`title` field.
- Confirmed the production labels and descriptions consumed by the UI are sourced
  entirely from the already-localized `graphControlsVocabulary.ts` catalog, keyed by
  these same technical schema ids and consumed through `graphControlsChrome.ts`
  (`W03.P09.S147`).
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The graph-control schema retains its technical, lab-only vocabulary as internal ids
only; every production-facing label or description is sourced from the typed catalog,
satisfying the step's split.

## Notes

Reconciliation pass (bookkeeping only, no code changes). No dedicated localization
commit touched this file's own content because it never held display strings; the
catalog split landed in bulk commit `3562d0262a` ("localize frontend and split
oversized modules") via `graphControlsVocabulary.ts` and `graphControlsChrome.ts`. This
record retroactively documents and ticks the plan step; verification was file inspection
plus a scoped scanner run, not a fresh implementation.
