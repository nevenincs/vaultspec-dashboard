---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the EngineClient pipelineStatus method that GETs the bounded in-flight pipeline projection for a scope and as-of and adapts the envelope through liveAdapters

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Verified the EngineClient `pipeline(scope)` method GETs `/pipeline` and adapts the envelope through `adaptPipeline`.

## Outcome

The client exposes the in-flight projection method the new query hook calls.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
