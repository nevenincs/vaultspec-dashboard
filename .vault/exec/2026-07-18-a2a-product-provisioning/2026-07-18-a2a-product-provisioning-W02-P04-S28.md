---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S28'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Report installed release set, owned or foreign gateway identity, protocol, state schema, and authenticated readiness in the component handshake

## Scope

- `engine/crates/vaultspec-api/src/handshake.rs`

## Description

- Added `decorate_agent_tier` in the handshake module: it attaches the A2A component handshake to the always-present `agent` tier - installed release set, owned-or-foreign gateway identity, declared protocol and state-schema ranges, and the one readiness model.
- Sourced the projection from the product controller live per response (not a memoized version line) because A2A is a dashboard-OWNED companion whose readiness changes; wired it into the shared `decorate_tiers` entry point so every served tiers block carries it.
- Kept the component projection secret-free: the attach token is never projected.

## Outcome

Every response's `agent` tier carries the A2A component handshake beside the existing core/rag decorations. Availability and reason stay whatever the tier computation set; the decoration only adds the `component` block. Build/clippy/fmt green; the full api lib suite (870) passes.

## Notes

None.
