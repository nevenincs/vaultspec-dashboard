---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S92'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Project backend-served install, ownership, gateway, worker, provider, admission, job, update, rollback, repair, and doctor state with bounded polling

## Scope

- `frontend/src/stores/server/a2aLifecycle.ts`

## Description

- Added `a2aLifecycle.ts`, the stores-owned lifecycle projection: `useA2aLifecycleStatus` (bounded staleTime/gcTime), `useA2aLifecycleRun` (dispatch + status invalidation), and `useA2aLifecycleJob` (bounded trigger-then-poll, stop-on-terminal, invalidate-on-settle).
- Authored the pure `deriveA2aLifecycleView` projection and its `deriveEligibleOps` helper mapping install-state + readiness to the eligible/destructive op sets, plus the orchestration availability read via the canonical `readAgentTierAvailability`.
- Exposed `A2A_DESTRUCTIVE_OPS` (remove, rollback) for the confirm affordance.

## Outcome

The projection is a PURE function the panel wraps in one `useMemo` — never a fresh reference minted inside a reactive read (frontend-store-selectors). Polling is bounded (interval resolver returns false once terminal); a settled job invalidates the status so the panel re-reads. The engine remains the authority on op legality; eligibility is a UX hint only. Gate green.

## Notes

None.
