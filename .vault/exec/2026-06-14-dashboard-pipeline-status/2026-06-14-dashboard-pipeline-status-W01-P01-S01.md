---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the PipelineArtifact wire type (stable node id, doc_type, title, feature_tags, dates, pipeline_phase) and the PipelineStatusResponse envelope type carrying the artifacts array plus the tiers block, snake_case as served

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Verified the `PipelineArtifact` and `PipelineResponse` wire types exist in `engine.ts`; extended `PipelineArtifact` with optional `feature_tags` and `dates` so the ADR row feature label and the row freshness stamp read real facets (truthful absence).

## Outcome

The pipeline wire types are present and now carry the freshness/feature facets the surface needs.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
