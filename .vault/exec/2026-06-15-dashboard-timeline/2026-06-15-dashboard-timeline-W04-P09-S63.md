---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S63'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Make marks focusable, announcing kind, date, joined-node count, and lineage degree

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified each dated mark is a focusable, keyboard-reachable button whose accessible name announces kind, human date, distinct joined-node count (1-hop distinct neighbours), and lineage degree (the engine degree salience input); the lineage-marks group names them without masking the native button role.

## Outcome

Marks are focusable controls announcing kind/date/joined-node count/lineage degree. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S63 render tests (mark name spells kind/date/joined-nodes/degree) and the pure joined-node-count distinct-neighbour test.
