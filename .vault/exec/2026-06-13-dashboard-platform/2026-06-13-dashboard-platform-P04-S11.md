---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S11'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---




# Implement the FailureKind taxonomy, classifyError, and the failure-policy hook with an injected degradation mapper

## Scope

- `frontend/src/platform/policy/failurePolicy.ts`

## Description

- Defined the `FailureKind` taxonomy (`transient` / `degraded` / `contained` /
  `fatal`) and the `FailureClassification` shape (`kind`, `retryable`, `signal`).
- Implemented `classifyError`: pure and total - maps `StreamLostError` ->
  degraded/stream-lost, `WorkerCrashError` -> contained, HTTP status codes
  structurally (busy -> transient, 5xx -> degraded, 4xx -> request-rejected), a bare
  fetch `TypeError` -> backend-unreachable, everything else -> fatal.
- Defined the platform-owned `StreamLostError` and `WorkerCrashError` marker classes so
  classification stays decoupled from the stores.
- Implemented the `FailurePolicy`: `report()` classifies, logs at the kind-appropriate
  level (fatal -> error, else warn), and routes a degraded failure to an injected
  `DegradationHandler`; `setDegradationHandler` is the app/degradation vocabulary seam.
- Exported `queryErrorRouter` and the `useFailurePolicy` hook face.

## Outcome

The mechanism half of ADR D4. 9 tests cover every classification branch (including the
structural HTTP read that proves no `EngineError` import), warn-vs-error logging, the
degradation-handler routing for degraded-only, and the query router's `source=query`
tagging. The `status: 503` plain-object test is the explicit decoupling proof.

## Notes

The mechanism/vocabulary line is the load-bearing ADR D1 boundary: this module never
imports the stores' `EngineError`; it recognizes the engine HTTP error by its numeric
`status` field. SSE resume stays the Data team's; only the stream-lost classification is
here.
