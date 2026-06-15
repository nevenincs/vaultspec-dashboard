---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S42'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Extend the mock engine to honor the lens request parameter and emit the single active-lens salience float on document nodes, byte-for-byte the live wire shape

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description


## Outcome

Extended the mock engine to honor the lens request parameter (status default) and emit the single active-lens salience float on document nodes, ordered by descending salience, plus the lens echo and salience_partial (read from the same tiers block via the live is_partial rule) - byte-for-byte the live wire shape. Feature nodes carry no salience (live parity).

## Notes

