---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
body_hash: 'sha256:10c3bc3c238e554a21bf48530997b430e035986945b9287f749c2e2f9d6434a9'
step_id: 'S06'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Derive the jobs table view (sort by recency or duration, text query, phase facets, served-bound truncation honesty) as pure functions with unit tests

## Scope

- `frontend/src/stores/server/ragDashboardView.ts`

## Description

## Outcome

## Notes

## Description

- Derive the jobs table view as pure functions: recency/duration sort, case-insensitive id/step/kind text query, phase facets mapped through the existing `isJobTerminal`/`isJobFailed` interpreters (queued/running/done/failed), group counts computed over the text-filtered set so facet chips reflect the active search, and `truncated` read from served total vs served count - never a client re-count.

## Outcome

Green with unit vectors. Executed by rag-stores-coder; verified independently.

## Notes

Pure module (no hooks) so the chrome lane consumes it directly.
