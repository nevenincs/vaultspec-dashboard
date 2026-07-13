---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S33'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add unit tests for the phase-lane model and doc-type to lane mapping

## Scope

- `frontend/src/app/timeline/phaseLanes.test.ts`

## Description

- Add co-located vitest unit tests for the phase-lane model.
- Assert the lane order (the six phases top-to-bottom in pipeline order) and `laneIndex` for each token plus null for non-lane tokens.
- Assert `phaseForDocType` for every pipeline doc-type (research, reference to research, adr, plan, exec, audit to review, rule to codify) and null for ambient/unknown/absent doc-types.
- Assert `laneOf` precedence: wire `phase` authoritative, `doc_type` the fallback, null for a node in no lane.
- Assert the lane geometry helpers (`laneY`, `laneCenterY`, `lanesHeight`).

## Outcome

The lane order and the phase-to-lane and doc-type-fallback mapping are proven for every phase by passing unit tests, and the geometry helpers are covered. The mapping mirrors the engine's `phase_for_doc_type` test on the frontend side.

## Notes

None.
