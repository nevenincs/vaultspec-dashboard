---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S90'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Add stable lifecycle status and job query identities to the shared engine key registry

## Scope

- `frontend/src/stores/server/queries/internal.ts`

## Description

- Added `a2aLifecycleStatus` and `a2aLifecycleJob` query identities to the shared engine key registry in `internal.ts`.
- The status key is stable/singular (the plane is machine-global — one A2A resident per machine); the job key folds its id.

## Outcome

A settled job invalidates exactly the status key so the panel re-reads the reconciled projection. Keys derive off `engineKeys.all` like every sibling, and are re-exported through the `queries` barrel. Gate green.

## Notes

None.
