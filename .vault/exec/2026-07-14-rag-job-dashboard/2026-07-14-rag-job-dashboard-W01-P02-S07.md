---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
body_hash: 'sha256:3ed5a579e4db216e63e8b6622c6d971f85a303556daa9631d7a397254684a81e'
step_id: 'S07'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Create the bounded dashboard view-state store - sort key, phase facet, filter texts, selected job, lines choice - view-local presentation state with unit tests

## Scope

- `frontend/src/stores/view/ragDashboard.ts`

## Description

## Outcome

## Notes

## Description

- Create the bounded view-local dashboard state store (controlPanels idiom, non-persisted): sort key, phase facet set, length-capped jobs/log filter texts, nullable selected job id, normalized lines choice.

## Outcome

Green. Executed by rag-stores-coder; verified independently.

## Notes

Lines choice re-normalized to 50|200|500 by the orchestrator per the S05 contract amendment. Presentation state only - never touches dashboardState.filters.
