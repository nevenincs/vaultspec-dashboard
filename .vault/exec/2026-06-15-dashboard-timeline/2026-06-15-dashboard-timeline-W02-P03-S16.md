---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add the LineageSlice wire type carrying nodes, arcs, tiers, and truncated

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageSlice` wire type to the stores engine module, mirroring the live `/graph/lineage` envelope unwrapped onto the flat-with-tiers internal shape.
- Carry `nodes`, `arcs`, a `tiers` block, and an optional-nullable `truncated` honesty block, matching the engine `LineageSlice` serialization exactly.

## Outcome

`LineageSlice` lands in `engine.ts` in the same snake-case wire style as `GraphSlice`. `truncated` is typed present-and-non-null only when the document node ceiling fires; null otherwise. Consumed by the client method, the adapter, and the hook in later steps.

## Notes

The wire serves `tiers` on the envelope (not inside `data`); `unwrapEnvelope` lifts it onto the flat body, so the internal type carries `tiers` directly.
