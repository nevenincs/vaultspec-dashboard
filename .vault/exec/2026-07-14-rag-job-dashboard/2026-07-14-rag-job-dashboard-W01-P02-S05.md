---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S05'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Create the bounded useRagLogs stores hook - lines cap, job filter, poll only while consumed, tiers-gated offline truth - with live-wire tests

## Scope

- `frontend/src/stores/server/ragControl.ts`

## Description

## Outcome

## Notes

## Description

- Create the bounded `useRagLogs` hook: lines clamp at the client boundary, optional job filter, steady 5s poll only while enabled (the panel-open gate), tiers-gated offline truth, no accumulation beyond the last served envelope.
- Parse the RAW pre-formatted log strings the envelope carries (`{lines: string[], total, filters}`) into `RagLogLine[]` - level + timestamp extracted when present, unstructured lines untoned - with rows/line-length defence caps.
- Live-wire + pure tests per the ragControl conventions.

## Outcome

Green (71 tests across the plane). Executed by rag-stores-coder; verified independently.

## Notes

CONTRACT AMENDMENT (orchestrator decision): the ADR said max 1000 lines, but the engine broker clamps at 500 - the client max and the lines selector were aligned DOWN to 500 (never offer a choice the broker under-delivers); the ADR constraint is amended in place rather than bumping the engine bound during a foreign engine lane.
