---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S07'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Add a bounded content query keyed by {scope, nodeId} with explicit gcTime and a cache cap, as the sole wire client of /nodes/{id}/content

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add the `content` cache key keyed by (scope, nodeId) — the contract's cacheability unit for a per-scope read.
- Add `useNodeContent`, the sole wire client of the content route, disabled until both a node id and a scope are present, following the enabled-on-id pattern.
- Bound the query at creation per bounded-by-default-for-every-accumulator with an explicit `CONTENT_GC_TIME` so an unobserved entry (up to the byte cap) is evicted promptly rather than retained for the whole session; the per-observer single-entry shape bounds concurrent cache pressure.

## Outcome

The content query is the bounded, sole stores client of `/nodes/{id}/content`. Stores tests stay green.

## Notes

None.
