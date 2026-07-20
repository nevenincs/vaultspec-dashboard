---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S151'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Construct and retain the dedicated A2A run-token lease repository in AppState for seated routes and restart reconciliation

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Constructed and retained the dedicated lease repository in AppState, opened under the workspace vault data dir (its own file, isolated from the authoring store) once per state build, loud-on-failure like `user_state`.

## Outcome

Seated routes and restart reconciliation share one retained lease repository handle. Gate: build + fmt + lib-clippy clean; full state construction unchanged for existing tests.

## Notes

Rooted at the workspace vault; multi-scope lease routing (a settlement callback for a run started under a different scope) is a refinement to revisit with the settlement route (S41).
