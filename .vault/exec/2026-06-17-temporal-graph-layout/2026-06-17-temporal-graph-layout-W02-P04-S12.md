---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:126ee27daab4101732724f2eaed9ee3c652c01f78e4d5cdc530216d7528ff65b'
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
