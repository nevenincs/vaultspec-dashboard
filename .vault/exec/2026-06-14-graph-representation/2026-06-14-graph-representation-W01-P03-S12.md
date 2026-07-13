---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Serve salience for the requested lens and derivation/embedding from the mock graph route

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

## Outcome

Mock `/graph/query` reads the request lens and projects each node's salience for that lens onto the single `salience` field (default status); derivation/embedding pass through on nodes/edges.

## Notes
