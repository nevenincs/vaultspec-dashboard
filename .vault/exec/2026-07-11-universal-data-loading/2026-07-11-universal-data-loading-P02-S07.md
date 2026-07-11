---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S07'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Add the held-slice refetch affordance: surface the graph slice's isFetching through GraphSliceAvailability and render a non-blocking corner 'Refreshing view' banner in the canvas overlay without ever blanking the held field

## Scope

- `frontend/src/app/stage/CanvasStateOverlay.tsx + frontend/src/stores/server/queries.ts`

## Description

Extend `GraphSliceAvailability` with `refreshing` (fetching behind a HELD slice: `isFetching && !isPending && data`), derived in `useGraphSliceAvailability`; add the `refreshing` canvas state to `resolveCanvasState` at lowest precedence and render it as the muted `Refreshing view...` corner banner in `CanvasStateOverlay` - the held field is never blanked.

## Outcome

The keepPreviousData window is now visible on the stage; every designed annotation (degraded/truncated/unknown-tier) outranks it.

## Notes
