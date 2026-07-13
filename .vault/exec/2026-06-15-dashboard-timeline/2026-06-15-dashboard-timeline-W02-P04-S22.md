---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the useTimelineLineage hook wrapping the lineage projection for scope, range, and filter

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add the `useTimelineLineage(scope, range, filter)` TanStack hook to `queries.ts`, wrapping `engineClient.lineage`.
- Add an `engineKeys.lineage(scope, range, filter)` cache key folding the (scope, range, filter) triple, mirroring how `events` folds (range, bucket).
- Gate `enabled` on a non-null scope, following the `useGraphSlice`/`useEngineEvents` pattern.

## Outcome

The timeline surface (W03) consumes the lineage through this single selector; it never fetches the engine, reads the raw `tiers` block, or defines a lineage shape of its own (dashboard-layer-ownership). Two date ranges or two filters never collide on one cache entry.

## Notes

None.
