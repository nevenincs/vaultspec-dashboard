---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S03'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Build useDataActivityView: aggregate useIsFetching/useIsMutating (excluding stream queries by key predicate), the drain-progress slice, and the live-connection slice into one interpreted { active, determinate, kind } view with show-grace and minimum-visible hold, keeping raw-selector discipline per frontend-store-selectors

## Scope

- `frontend/src/stores/server/dataActivity.ts`

## Description

Create `frontend/src/stores/server/dataActivity.ts`: `useDataActivityView` aggregating `useIsFetching` (stream keys excluded via `isStreamQueryKey`), `useIsMutating`, and the drain rollup into `{ active, visible, determinate, kind }`; `useDebouncedActivityVisible` implements the 300ms show-grace + 600ms minimum-visible hold; raw-selector discipline held (raw drains record selected, rollup derived in `useMemo`).

## Outcome

One stores-owned activity truth; stream exclusion prevents the perpetually-fetching SSE queries from pinning the indicator on.

## Notes
