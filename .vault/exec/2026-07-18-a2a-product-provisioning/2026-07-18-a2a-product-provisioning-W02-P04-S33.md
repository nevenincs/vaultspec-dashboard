---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S33'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Include the complete A2A product and ownership projection in the one-shot status command

## Scope

- `engine/crates/vaultspec-cli/src/cmd/status.rs`

## Description

- Added a `facts` helper to the CLI A2A module returning the product plus ownership projection (installed release set, readiness, ownership retention, owned-or-foreign gateway identity), degrading honestly to an error object when product paths cannot resolve.
- Wired it into the one-shot `vaultspec status` backends block as `a2a`, mirroring the served `/status` parity.

## Outcome

The one-shot status command carries the complete A2A product plus ownership projection. cli tests plus clippy green.

## Notes

None.
