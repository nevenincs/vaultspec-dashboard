---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Test the progressive slice (cold fill, passthrough on data, asOf bypass, refreshing availability during fill) and the paced drain

## Scope

- `frontend/src/stores/server/queries.test.ts + engine.test.ts`

## Description

Test the progressive slice in `frontend/src/stores/server/queries.test.ts`: live cold fill (feature-only nodes held, isPending masked, refreshing availability derived true) then document swap; feature-granularity bypass fires no second query; time-travel issues only document bodies.

## Outcome

2 tests green against the live engine. Review caught one tautological waitFor assertion (isPending || true) - removed; the real gate (graphBodies.length > 0) already followed it.

## Notes
