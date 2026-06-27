---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S17'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# retain graph edges with tier styling and ego highlight while keeping them non-authoritative for layout

## Scope

- `frontend temporal edge rendering`

## Description

- Retained lineage arcs as Cosmos edges without making them layout authority.

## Outcome

The adapter forwards in-slice arcs as tiered scene edges, while temporal mode pauses simulation so links remain visual evidence only.

## Notes

Verified by adapter tests and the Cosmos static-layout behavior in typecheck.
