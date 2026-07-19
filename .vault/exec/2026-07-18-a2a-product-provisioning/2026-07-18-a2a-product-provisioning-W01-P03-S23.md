---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S23'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Mount and inventory the bearer-gated lifecycle routes separately from the fixed ops A2A namespace

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Mount the three bearer-gated lifecycle routes (`/a2a/lifecycle/status`,
  `/a2a/lifecycle/run`, `/a2a/lifecycle/jobs/{id}`) in the router, in a block
  deliberately SEPARATE from the fixed `/ops/a2a` orchestration namespace.
- Add the three routes to the `CONTRACT_ROUTES` inventory.

## Outcome

The lifecycle routes are served and inventoried, gated by the same bearer
middleware as every data route; the fixed five-verb `/ops/a2a` surface is
unchanged. The contract-route bearer guard passes (every inventory prefix is a
gated API prefix).

## Notes

None.
