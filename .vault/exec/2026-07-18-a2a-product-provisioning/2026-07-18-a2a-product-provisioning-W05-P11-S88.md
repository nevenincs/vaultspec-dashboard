---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
body_hash: 'sha256:cb5547b8d5067e8548178a54c6d0906722e45578e7f1c51bda59b719fa0d4321'
step_id: 'S88'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Define lifecycle status, job, operation, receipt, ownership, readiness, progress, and typed refusal wire shapes

## Scope

- `frontend/src/stores/server/engine/statusTypes.ts`

## Description

- Added the tolerant stores-layer wire types for the served `/a2a/lifecycle/*` plane in `statusTypes.ts`, mirroring the engine's `routes/a2a_lifecycle.rs` projection.
- Defined the closed `A2aLifecycleOp` set (install, ensure, start, stop, restart, repair, update, rollback, remove, doctor) matching the engine `LifecycleOpArg` enum.
- Defined the tagged `A2aReadiness` union (`uninstalled`, `installed-stopped`, `gateway-ready` with `worker` cold/ready) mirroring the engine `Readiness` serde shape.
- Defined `A2aInstallState`, `A2aLifecycleStatus` (carrying the flattened `tiers` block so the agent tier rides through), `A2aLifecycleRunBody`, `A2aLifecycleRefusalKind`, and `A2aLifecycleJob`.

## Outcome

New wire types are exported through the existing `engine` barrel (`export * from "./statusTypes"`). tsc, eslint, prettier all green. No adapter needed: the shapes are read tolerantly and additive wire fields are absorbed.

## Notes

The orchestration-tier degradation is deliberately NOT modelled as a new type here — it is read from the existing `tiers.agent` block via `readAgentTierAvailability`. These types carry the install/readiness lifecycle truth, kept distinct from orchestration availability.
