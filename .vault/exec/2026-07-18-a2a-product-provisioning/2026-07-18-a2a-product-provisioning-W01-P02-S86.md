---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S86'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Keep the manifest-declared standalone MCP entrypoint inspectable but outside every dashboard start, adopt, stop, drain, and cleanup path

## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs`

## Description

- Fence the caller-owned standalone MCP entrypoint in `lifecycle.rs`: expose
  `standalone_mcp_entrypoint` for INSPECTION only, alongside
  `owned_gateway_entrypoint` and `is_dashboard_owned`.
- Ensure no dashboard lifecycle path resolves or spawns the standalone MCP —
  `spawn_owned_gateway` and `GatewaySpec::from_manifest` build only from the
  gateway entrypoint, never the MCP.

## Outcome

The standalone MCP is inspectable but never dashboard-owned: `is_dashboard_owned`
is true only for the gateway entrypoint, and the owned launch resolution never
returns the MCP surface.

## Notes

None.
