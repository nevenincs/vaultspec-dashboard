---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
body_hash: 'sha256:7316f3d32b03e95fabe43eec2d4538693b9ba9bef8276647c9d73bc9b0af0177'
step_id: 'S01'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Build useProgressiveGraphSlice: wrap useGraphSlice so a live, cold, document-granularity request serves the same-identity feature-LOD slice as held data (isPending masked) until the document slice lands

## Scope

- `bypass for asOf`
- `memoized result object`
- `frontend/src/stores/server/queries.ts`

## Description

Add useProgressiveGraphSlice to `frontend/src/stores/server/queries.ts`: a live, cold, document-granularity request enables the same-identity feature-LOD useGraphSlice and returns its data as the held slice with isPending masked false until the document slice lands; passthrough for feature granularity, time-travel (asOf), and any held/placeholder data; result memoized.

## Outcome

16x smaller cold first paint; the fill is a cache SHARE with the nav descent's constellation (same query key).

## Notes
