---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-13-dashboard-gui-plan]]"
---

# Carry the canonical separate meta_edges wire shape and fold it into edges through one tolerant client adapter

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Carry the canonical separate `meta_edges` wire shape
  (`{src, dst, src_feature, dst_feature, count, breakdown_by_tier}`, src/dst
  the synthesized feature node ids) plus `member_count` on feature nodes.
- Fold `meta_edges` into the internal edge representation through one
  tolerant client adapter (`adaptGraphSlice`): synthesize a stable id, the
  `related` relation, the dominant tier from `breakdown_by_tier`, and an
  aggregation marker — so one downstream path renders both granularities.

## Outcome

Constellation responses (feature nodes + a separate `meta_edges` array, empty
`edges[]`) now render with connecting feature-to-feature edges; the typed
client no longer drops the engine's separate meta-edge channel.

## Notes

The fold is the single reconciliation point: consumers read the folded
`edges`, never the raw `meta_edges`. Tolerant of absent `meta_edges`
(document granularity) so both paths share the adapter.
