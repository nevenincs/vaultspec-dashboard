---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S04'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Verify the brokered logs read forwards lines and job_id end-to-end against the live engine, add the typed opsRagLogs client method, and apply the params-only passthrough fix on the engine route if params are dropped

## Scope

- `frontend/src/stores/server/engine/client.ts`

## Description

## Outcome

## Notes

## Description

- Verify the brokered logs read end-to-end: the engine route extracts job_id and clamps lines (MAX_RAG_LOG_LINES=500) before forwarding to the rag client, proven by the existing engine unit test plus a LIVE probe of the machine service (lines and job_id both honored) and a live vitest read through the spawned broker.
- Add the typed `opsRagLogs(params, signal)` client method with `RagLogsEnvelope` homed in the engine wire type family.

## Outcome

Params passthrough WORKS AS-IS - no engine change. Executed by the named Opus coder rag-stores-coder; verified independently.

## Notes

Scope-less signature by design: /ops/rag reads carry no scope param; scope keys/gates at the hook layer like every existing rag read. A stale agent (rail-stores-coder) briefly collided in client.ts/statusTypes before standing down; the coder reconciled to one green design.
