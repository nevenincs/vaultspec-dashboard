---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S36'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Thread the active as-of playhead into usePipelineStatusView so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Threaded the active as-of playhead (the view store time-travel mode) into `usePipelineStatusView` and the pipeline cache key so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR.

## Outcome

The surface reads as-of the playhead; a historical view is a distinct cache entry from the live view.

## Notes

The live `pipeline(scope)` wire takes no as-of yet, so a past playhead reuses the live projection until the wire grows the parameter; the surface still degrades honestly via tiers.
