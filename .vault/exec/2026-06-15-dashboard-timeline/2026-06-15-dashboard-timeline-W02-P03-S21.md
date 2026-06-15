---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add an adapter unit test covering the lineage slice reconciliation

## Scope

- `frontend/src/stores/server/liveAdapters.test.ts`

## Description

- Add an `adaptLineageSlice` unit-test block to `liveAdapters.test.ts` feeding a captured live-shaped lineage sample through the adapter.
- Assert node fields (id, phase, created string, numeric epoch-ms modified tick, title, degree), the derivation-fallback arc (no `derivation`), self-consistency of the arc endpoints, and the present-only semantic tier riding through.
- Assert the truncated honesty block is carried when present, and that a sparse/non-object body degrades to safe empties without throwing.

## Outcome

Three tests cover the reconciliation, the truncated path, and tolerance. They pin the optional-field handling and the numeric `modified` typing as regression guards.

## Notes

None.
