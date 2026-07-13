---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the LineageNode wire type carrying stable id, doc-type, derived phase, blob-true dates, title, and degree

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageNode` wire type carrying the stable `doc:{stem}` id, doc-type, derived phase lane, blob-true dates, optional title, and degree.
- Add a `LineagePhase` union (`research|adr|plan|exec|review|codify`) mirroring the engine `PipelineLanePhase` kebab-case wire tokens.
- Type `dates.modified` as a NUMBER (the engine `Timestamp` is i64 epoch-ms), not a string, to match the live wire exactly.

## Outcome

`LineageNode` and `LineagePhase` are exported from `engine.ts`. The `modified` epoch-ms-number typing is the load-bearing fidelity detail, confirmed against `engine-model` `Dates { modified: Option<i64> }`.

## Notes

`title` is optional (engine `skip_serializing_if = Option::is_none`); the type forwards it only when present.
