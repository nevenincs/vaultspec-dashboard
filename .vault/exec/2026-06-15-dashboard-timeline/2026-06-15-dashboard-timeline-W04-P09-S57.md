---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S57'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Render the loading lane scaffold with a subtle liveness cue, never a flash of empty

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified the loading state renders the six phase-lane scaffold (lane labels and rules) on first paint, before the lineage slice resolves, with a quiet `data-timeline-loading` liveness cue (a pulsing live dot plus copy-toned line) so the surface never flashes empty.
- Confirmed the cue carries `role="status"` and is non-blocking, and that the lane scaffold stays painted while loading.

## Outcome

The loading scaffold renders the full six-lane band immediately with a subtle liveness cue; no flash of empty. Satisfied by the prior partial run; assessed and confirmed correct here.

## Notes

Source satisfied by the prior partial run. This run assessed it against the spec, confirmed the S57 render test (six-lane scaffold present on first paint, loading cue is a status), and verified the gate.
