---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S35'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Create a dedicated durable A2A run-token lease repository containing only token hashes, bundle identity, reservation identity, post-commit A2A run and thread identity, non-secret lease identity, expiry, and settlement state

## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs`

## Description

- Created the dedicated, self-contained A2A run-token lease repository: its OWN SQLite file, migration ledger, and schema (`a2a_run_leases` + `a2a_run_lease_tokens`), touching no authoring table.
- Stored token HASHES only (never a raw secret), bound to a non-secret lease identity, bundle id, reservation id, post-commit run/thread id, expiry, and settlement state.
- Implemented the lifecycle API: reserve (pre-commit) then commit (bind authoritative run/thread and go active); resolve_token (hash to actor + lease identity, refused past expiry or terminal); revoke_lease and settle_terminal_by_run (idempotent, revoke the EXACT hashed bundle); unresolved_leases and expire_elapsed for reconciliation.
- Added inline tests proving migration/reopen durability, independent revocation of two concurrent same-role runs, expiry teardown, and past-expiry non-resolution.

## Outcome

The durable admit-before-mint lease store exists, decoupled from authoring persistence, hash-only, with per-lease exact-bundle revocation. Gate: build + fmt + lib-clippy clean; lease tests 4/4.

## Notes

S42 (the repository acceptance suite) is partially covered by these inline tests; its restart-reconciliation leg pairs with the reconciliation logic (S160/S161) and is left for that slice.
