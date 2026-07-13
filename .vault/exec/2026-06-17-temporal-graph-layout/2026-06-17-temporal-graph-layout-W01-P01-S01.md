---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# add a temporal graph slice adapter that maps lineage nodes and arcs into scene nodes and edges

## Scope

- `frontend temporal scene mapping`

## Description

- Added `lineageToTemporalScene` to map bounded lineage nodes and arcs into scene nodes and scene edges.

## Outcome

Lineage nodes now enter the graph canvas as `document` scene nodes with stable ids, doc type, title, dates, salience, temporal bucket metadata, and seed positions. Arcs become tiered scene edges only when both endpoints survive the bounded slice.

## Notes

Verified by `temporalScene.test.ts`.
