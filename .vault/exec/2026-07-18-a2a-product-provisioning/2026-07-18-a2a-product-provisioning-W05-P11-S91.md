---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S91'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Validate every lifecycle dispatch as a closed typed operation with bounded data-removal intent before it reaches the engine client

## Scope

- `frontend/src/stores/server/a2aLifecycleActions.ts`

## Description

- Added `a2aLifecycleActions.ts`: the terminal dispatch effect registered onto the one platform `appDispatcher` under `a2a-lifecycle:run`, mirroring `provisionActions`/`opsActions`.
- Authored `isA2aLifecycleRunPayload`: a bounded, typed validator that accepts ONLY a closed body of a single enumerated `op` and nothing else.
- Exported `dispatchA2aLifecycleRun` which re-validates before dispatch and resolves with the `{job, attached}` envelope.

## Outcome

The validator is the wire-contract guard: a malformed op, a smuggled client `path`, a free-form `args` field, or any implicit data-removal flag (`delete_data`/`purge`) riding a `remove` is refused BEFORE the wire. `remove` is a bounded intent — the engine preserves user data and no client-side purge flag exists. Gate green; the handler holds no cache write (the run hook owns invalidation).

## Notes

None.
