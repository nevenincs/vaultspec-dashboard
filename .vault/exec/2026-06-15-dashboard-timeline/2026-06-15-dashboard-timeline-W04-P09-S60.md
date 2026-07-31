---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:ca414de73f4aea6a4a45370e3448f0f9c65431e974de6d656522a418e9e4abfb'
step_id: 'S60'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Render a contained, copy-toned, retry-able error scoped to the timeline

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified a genuine request failure surfaces a contained, copy-toned `role="alert"` `data-timeline-error` message scoped to the timeline with a real keyboard-reachable retry button calling the lineage refetch, leaving the lane scaffold drawn behind it and never leaking into the stage.

## Outcome

Error state is a contained, copy-toned, retry-able alert scoped to the timeline; the scaffold is not blanked. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S60 render test (transport rejection yields a contained alert with a retry button, scaffold still drawn).
