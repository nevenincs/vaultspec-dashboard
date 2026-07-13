---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S59'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Render the degraded-from-tiers state read pre-derived from the stores degradation layer

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified the degraded-from-tiers badge reads `useSurfaceStates().timeline` for the reconnecting state (pre-derived from the stores degradation layer), never guessed from a transport error, rendering a quiet polite `role="status"` `aria-live="polite"` `data-timeline-degraded` badge that leaves the lane scaffold and any cached marks behind it.
- Confirmed the same pre-derived reconnecting truth drives the Playhead LIVE to RECONNECTING chip.

## Outcome

Degraded state is read pre-derived from the tiers-backed degradation matrix (RECONNECTING on stream loss), rendered as a non-error polite status badge over an intact scaffold. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S59 render test (degradation override streamLost yields timeline reconnecting yields polite status badge, no alert, scaffold intact). Honors degradation-is-read-from-tiers-not-guessed-from-errors.
