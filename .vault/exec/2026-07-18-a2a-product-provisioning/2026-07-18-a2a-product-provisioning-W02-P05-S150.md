---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S150'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Export the crate-private dedicated A2A run-token lease repository module without coupling it to authoring-session storage

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Exported the crate-private `a2a_run_leases` module from the crate root, without any public re-export coupling it to authoring-session storage.

## Outcome

The lease repository is reachable to seated routes and boot reconciliation as a crate-private module. Gate: build + lib-clippy clean.

## Notes

None.
