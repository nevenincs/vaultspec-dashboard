---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S12'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# extend debug snapshots with temporal range, bucket counts, and simulation status

## Scope

- `frontend graph debug snapshot`

## Description

- Extended debug snapshots with representation and temporal bucket state.

## Outcome

`debugSnapshot` now reports requested/applied representation mode, static-layout status, and temporal bucket counts. The timeline canvas also renders a compact debug readout.

## Notes

Verified by typecheck; richer debug UI remains open for later plan rows.
