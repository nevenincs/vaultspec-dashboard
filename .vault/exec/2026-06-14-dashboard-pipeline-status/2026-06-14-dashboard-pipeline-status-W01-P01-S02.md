---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:c0545cf07777cfb416f10fd12166c06b40bf20d6116cf0b0c85110ef8b32ebad'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the AdrStatus facet type (proposed | accepted | rejected | deprecated) and the PlanTier facet type (L1 | L2 | L3 | L4) and attach them to the PipelineArtifact type so an ADR row reads real status and a plan row reads real tier

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Verified the ADR status facet (`status?`) and the plan tier facet (`tier?`) are attached to `PipelineArtifact` and to `EngineNode`.

## Outcome

An ADR row reads a real status word and a plan row reads a real tier off the artifact.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
