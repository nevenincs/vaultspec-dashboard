---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S32'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add the phase-lane model with the doc-type to lane mapping as a pure helper

## Scope

- `frontend/src/app/timeline/phaseLanes.ts`

## Description

- Add the phase-lane model as a pure helper: `PHASE_LANES` (the six pipeline phases in fixed top-to-bottom order: research, adr, plan, exec, review, codify) and the `PhaseLane` type.
- Add `phaseForDocType` mirroring the engine's canonical `phase_for_doc_type` mapping exactly (research/reference to research, adr, plan, exec, audit to review, rule to codify; commit/index/unknown to null).
- Add `laneOf(node)` taking the authoritative wire `phase` first and falling back to the `doc_type` mapping; `laneIndex` for the vertical order; and lane geometry helpers `laneY`, `laneCenterY`, `lanesHeight` with `LANE_HEIGHT`.
- Reconcile to one source of truth: move the canonical lane list and type here and re-export `PHASE_LANES`/`PhaseLane` from the timeline component, which now imports them from this module for its store typing and visibility defaults.

## Outcome

There is now a single lane vocabulary: the phase-lane model owns the list, type, doc-type fallback, and geometry, and the timeline component re-exports the list and type so prior import sites keep working. No duplicated lane list remains. Commits are handled as not-a-phase-lane (null), matching the ADR's ambient/off-by-default treatment.

## Notes

The doc-type fallback is kept byte-for-byte aligned with the engine mapping so the client never invents a phase the pipeline does not own.
