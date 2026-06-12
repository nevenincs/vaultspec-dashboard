---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S25'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement expand-ego working set with breadcrumb chips, collapse, and clear-to-constellation per G3.b

## Scope

- `frontend/src/app/stage/WorkingSet.tsx`

## Description

- Add `frontend/src/app/stage/WorkingSet.tsx`: the breadcrumb chip trail
  above the stage - one removable chip per expansion, a
  clear-to-constellation chip, keyboard E (expand the selection's ego) and
  Backspace (collapse the last expansion) per G3.b; keyboard ignores form
  fields.
- Materialize expansions in the stage: each working-set id fans into a
  neighbors query (`useQueries` over the contract cache keys), the
  constellation and all expansion slices union by stable id (pure, tested
  `mergeSlices`), and the merged slice feeds the seam keyframe.
- Wire the seam's `expand` event (locked at S04) into
  `addToWorkingSet` - context-menu/field expansion and keyboard share one
  path.
- Add `frontend/src/app/stage/WorkingSet.test.ts` for the merge semantics.

## Outcome

The working set is explicit, visible, and reversible: expand grows the
materialized stage, every chip answers "why is this node on my screen?",
collapse and clear restore exactly. Gates green: typecheck, eslint, vitest
(128 passed), prettier.

## Notes

Expansions re-keyframe the field (set-data) rather than patch it; with
warm-start seeding the existing constellation keeps its positions and only
new nodes settle in - the G3.e local-perturbation path does the visual
work.

