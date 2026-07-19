---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S19'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Depend on the product-contract crate and required bounded runtime features from the resident API

## Scope

- `engine/crates/vaultspec-api/Cargo.toml`

## Description

- Add the `vaultspec-product` path dependency to the resident API crate manifest
  so the lifecycle plane can consume the shared product controller.

## Outcome

`vaultspec-api` builds against `vaultspec-product`; the existing bounded `tokio`
runtime features already cover the plane's `spawn_blocking` + `timeout` needs, so
no new feature was added.

## Notes

None.
