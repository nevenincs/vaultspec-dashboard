---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S05'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Derive the framework-status cluster projection - per-chip served health tone and count from the status tiers rollup, useCoreStatus vault health, rag status, and the approvals pending count - raw-selector-plus-useMemo discipline, with unit tests

## Scope

- `frontend/src/stores/server/queries/frameworkStatus.ts`

## Description

## Outcome

## Notes

## Description

- Derive the framework-status chip projection: pure `deriveFrameworkStatusView` + `useFrameworkStatusView`, per-panel `{tone, count?, label}`.
- Compose from interpreted selectors only: `useStatusRollup` (backend + core + rag, served degradations rollup), `useRagStatus`, `useReviewStationView`.
- Unit-test tone mapping across ok/attention/down/unknown.

## Outcome

Projection + tests green. Executed by rail-stores-coder; verified independently.

## Notes

Approvals chip emits an exact count ONLY from the untruncated served queue - a truncated queue shows attention with no count (no client re-count over a cap). A served lightweight pending-count route is a filed future ask. The cluster being always-mounted keeps the review-station poll live at rest to feed the badge - flagged for S07/S08 review.
