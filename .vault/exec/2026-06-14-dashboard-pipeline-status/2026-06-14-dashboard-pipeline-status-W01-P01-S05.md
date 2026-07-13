---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the EngineClient planInterior method that GETs a plan node's bounded wave-phase-step interior under the node ceiling and adapts the envelope through liveAdapters

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Verified the EngineClient `planInterior(id)` method GETs `/nodes/{id}/plan-interior` and adapts through `adaptPlanInterior`.

## Outcome

The client exposes the bounded interior method the lazy step-tree hook calls.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
