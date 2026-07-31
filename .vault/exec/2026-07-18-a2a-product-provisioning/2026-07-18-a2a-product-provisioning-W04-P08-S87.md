---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
body_hash: 'sha256:e5eb244a51d4ea417b1de92038fb6c5348bd2bbd518680f5dfb7134b83eb3cc5'
step_id: 'S87'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Carry and verify the independently invokable standalone MCP entrypoint in every capsule without assigning it dashboard lifecycle ownership

## Scope

- `engine/crates/vaultspec-product/src/bin/product_build.rs`

## Description

- Carry and verify the independently invokable standalone MCP entrypoint in every composed capsule — distinct from the gateway entrypoint — without assigning it any dashboard lifecycle ownership.

## Outcome

The standalone MCP entrypoint is carried and verified in the composed tree with no lifecycle binding; APPROVED, tests green.

## Notes

No residual — local-verifiable and reviewed.
