---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the PipelineStatusView interface (loading, degraded, degradedTiers, reasons, artifacts) and the derivePipelineStatusView selector that reads the pipeline tier from the served block (success or error envelope, fresh error winning), modeled on deriveGraphSliceAvailability

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the `PipelineStatusView` interface and the `derivePipelineStatusView` selector reading the structural tier from the served block (success or error envelope, fresh error winning), modeled on `deriveGraphSliceAvailability`.

## Outcome

Degradation is interpreted in the stores layer from tiers truth; while degraded the stale list is suppressed.

## Notes

None.
