---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S152'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Export the authenticated A2A terminal-settlement route module outside the public ops orchestration namespace

## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs`

## Description

- Exported the authenticated A2A terminal-settlement route module from routes/mod, in the internal namespace and outside the public ops orchestration surface.

## Outcome

The settlement route is reachable to the router without being an ops verb. Gate: build + clippy clean.

## Notes

None.
