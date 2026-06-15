---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the adaptPipelineStatus and adaptPlanInterior adapters that unwrap the envelope and tolerate the live wire shape, mirroring adaptGraphSlice, so one client path serves both mock and live origins

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Verified the `adaptPipeline` and `adaptPlanInterior` tolerant adapters unwrap the envelope and tolerate the live shape; extended `adaptPipelineArtifact` to forward `feature_tags` and `dates` on truthful absence.

## Outcome

One client path serves both mock and live origins for the pipeline capabilities.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
