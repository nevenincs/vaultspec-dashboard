---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Throw StreamLostError on an abnormal stream close or non-ok response in the SSE consumer

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Replaced the bare `Error` in `sseChunks` with the platform-owned `StreamLostError` on
  a non-ok stream response and on a mid-stream read failure (ADR D2), so the failure
  policy classifies it `degraded`/`stream-lost`.
- A clean end-of-stream (`done`) still returns normally - it is not a lost stream.
- An intentional abort (unmount / scope change → `AbortError`) is re-thrown untouched, so
  a deliberate cancel never masquerades as a dropped stream.

## Outcome

The stream consumer now signals a lost stream truthfully. 2 new tests assert
`StreamLostError` on a 503 stream response and on a body that errors mid-read; the two
existing happy-path stream tests (since= replay, channel filtering) stay green.

## Notes

`isAbort` keys on `error.name === "AbortError"` to separate a cancel from a drop - the
streamed-query passes an abort signal on teardown, and that path must not flip the
degradation surface. `queries.ts` importing `StreamLostError` is stores -> platform
(downward), which the layer boundary permits.
