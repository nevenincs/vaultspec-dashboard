---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S28'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the filter model bound to the engine-enumerated filters vocabulary with per-tier confidence floats per G3.f and contract redline R3

## Scope

- `frontend/src/stores/view/filters.ts`

## Description

- Add `frontend/src/stores/view/filters.ts`: the single filter model -
  tier dial state (per-tier toggles plus confidence floors), facet chips
  (doc type, feature, relation, structural state, text match), and the
  timeline-owned date range - with setters, reset, and whole-set `apply`
  for lenses (S31).
- Compile choices two ways, both pure and tested: `toGraphFilter` produces
  the engine's wire object with min-confidence as per-tier 0..1 floats per
  contract redline R3; `computeVisibility` produces the scene's
  visibility membership per RL-5a (edges need both endpoints visible,
  confidence floors apply to temporal/semantic, structural-state powers
  the show-broken lens, meta-edges survive while any constituent tier is
  on) plus the hidden counts for the cost chip.
- Wire the stage: the merged slice and the filter store drive a
  `set-visibility` command - the scene animates what the filter removed
  (G3.f fades, built in S07).
- Add `frontend/src/stores/view/filters.test.ts` covering wire compile and
  every membership rule.

## Outcome

One filter model exists with its two compiled forms; the stage already
responds with animated membership diffs. Gates green: typecheck, eslint,
vitest (140 passed), prettier.

## Notes

Facet values are never hardcoded - the controls (S29/S30) enumerate the
engine vocabulary endpoint; this store only holds choices.

