---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the usePipelineStatusView hook that wires usePipelineStatus into derivePipelineStatusView, reading tiers from data then the EngineError envelope, so the Work surface consumes interpreted truth and never the raw tiers block

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the `usePipelineStatusView` hook wiring `usePipelineStatus` into the selector, reading tiers from data then the EngineError envelope so the surface consumes interpreted truth, never the raw tiers block.

## Outcome

The Work surface reads one selector for loading/degraded/artifacts; the fresh error tier wins over a stale success.

## Notes

None.
