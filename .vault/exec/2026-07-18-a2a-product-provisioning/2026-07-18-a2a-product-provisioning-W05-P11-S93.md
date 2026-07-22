---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S93'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove malformed operations, client path fields, free-form arguments, and implicit data deletion cannot pass the lifecycle dispatcher

## Scope

- `frontend/src/stores/server/a2aLifecycleActions.test.ts`

## Description

- Added `a2aLifecycleActions.test.ts`: proves the dispatcher handler is registered; that the validator accepts every closed op and nothing else; and that malformed operations, smuggled client paths, free-form args, and implicit data-deletion flags are all refused.
- Proved a malformed payload throws BEFORE any transport call (captured URLs empty).
- Routed a read-only `doctor` run through the seam to the REAL `/a2a/lifecycle/run` broker (live wire, no mock).

## Outcome

Six tests green against the live engine. The one live capability exercised is `doctor` — a read-only op that never mutates the machine-global install — so it is safe against the shared serve. Mutating ops are never dispatched live.

## Notes

None.
