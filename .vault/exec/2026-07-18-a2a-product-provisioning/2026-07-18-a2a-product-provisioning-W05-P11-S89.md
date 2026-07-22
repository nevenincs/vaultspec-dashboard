---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S89'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Add bearer-gated lifecycle status, run, and job methods without exposing a browser-to-A2A transport

## Scope

- `frontend/src/stores/server/engine/client.ts`

## Description

- Added three bearer-gated lifecycle methods to the one `EngineClient` in `client.ts`: `a2aLifecycleStatus`, `a2aLifecycleRun`, `a2aLifecycleJob`.
- Routed each through the existing private `get`/`post` helpers so the browser bearer is carried exactly as every other route, and the response envelope is unwrapped (flattening the `tiers` block onto the projection).
- Imported the new wire types from the `statusTypes` module type barrel.

## Outcome

The dashboard reaches the A2A component ONLY through the engine — there is no browser-to-A2A transport method on the client. A lifecycle refusal surfaces as an `EngineError` whose typed `errorKind` names the cause. Gate green.

## Notes

None.
