---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S61'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Re-affirm time-travel mode (warm tint, return-to-live chip, ops-disable) off the shared timelineMode

## Scope

- `frontend/src/app/timeline/timeTravel.ts`

## Description

- Re-affirmed time-travel honesty driven off the single shared `timelineMode`: `isTimeTravel` and `opsDisabledFor` are the one honesty reading that the warm tint, the return-to-live chip, the ops-disable, and the historical scrub all consume; no surface re-derives the mode or guesses the disable from a transport state.
- Fixed a type-narrowing defect the prior partial run introduced: `isTimeTravel` returned `boolean`, so reaching the time-travel variant field on the scrub path failed the type build. Promoted it to a type predicate so the single reading both gates the cues and narrows the variant.

## Outcome

Time-travel honesty re-affirmed off the shared mode; the honesty predicates compile and narrow correctly. Source largely from the prior partial run; this run fixed the broken type narrowing and added test coverage.

## Notes

The prior partial run added the honesty predicates and the doc block but left `isTimeTravel` returning a plain boolean, which broke the project type build at the scrub-path variant-field access. This run repaired the narrowing (type predicate) and added the S61 predicate tests (isTimeTravel / opsDisabledFor over both modes, plus congruence with the mode). Honors degradation-is-read-from-tiers and the one-delta-clock invariant.
