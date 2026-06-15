---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S17'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add a selector unit test asserting derivePipelineStatusView reports degraded when the pipeline tier is absent or unavailable in the served block and reads a fresh error envelope's tiers over a stale held success

## Scope

- `frontend/src/stores/server/queries.test.ts`

## Description

- Added the selector unit tests for `derivePipelineStatusView`: degraded when the structural tier is unavailable or absent, not degraded on a wholly absent block (transport fault), and the fresh error tier winning over a stale held success; plus `derivePlanInteriorView` rollup and truncation coverage.

## Outcome

The degradation honesty law is proven by unit test for the new pipeline-status selector.

## Notes

None.
