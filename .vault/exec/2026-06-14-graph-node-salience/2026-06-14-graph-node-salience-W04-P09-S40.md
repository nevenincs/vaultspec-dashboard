---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S40'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Read salience degradation from the tiers block (fresh error tiers winning over a stale held-success block), never from a bare transport error

## Scope

- `frontend/src/stores/server/queries.ts`

## Description


## Outcome

Read salience degradation from the tiers block in deriveSalienceSliceView: partial honors the engine's explicit salience_partial flag OR a degraded tier in the served block, with FRESH error tiers winning over a stale held-success block, never inferred from a bare transport error. Unit-proven across all four cases.

## Notes

