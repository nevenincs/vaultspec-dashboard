---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S160'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement bounded unresolved-lease reconciliation against authenticated authoritative A2A run status, retaining INPUT_REQUIRED, idempotently settling terminal runs, and revoking elapsed leases by expiry

## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs`

## Description

- Bound the terminal-lease table so it can never grow without limit: add a schema v4 partial index on `(updated_at_ms, lease_id)` where state is settled or revoked.
- Prune terminal rows by both a time cutoff AND a `MAX_TERMINAL_ROWS` count cap, deleting in bounded `RETENTION_DELETE_BATCH` batches per `maintain` so a large backlog never triggers an unbounded DELETE.
- Run `maintain_transaction` opportunistically inside every revoke and settle transaction, in addition to the explicit `maintain` call.
- Confirm the existing unresolved-lease reconciliation surface (`unresolved_leases`, `expire_elapsed`, `reconcile_local_lease_from_status`, `settle_terminal`) implements retain-INPUT_REQUIRED, idempotent terminal settlement, and expiry revocation.

## Outcome

Terminal-lease retention is now indexed, count-bounded, and batch-limited, satisfying the resource-bounds rule against an only-growing SQLite table while preserving the reconciliation semantics: non-terminal statuses retain the lease, terminal settlement is idempotent, and elapsed leases are revoked by expiry. Landed in commit `6cb2d28726`. Gate: `cargo build -p vaultspec-api` clean, touched-scope tests pass (including a new test proving batched multi-pass convergence to the cap), clippy `--lib -D warnings` clean, `cargo fmt --check` clean.

## Notes

The count-cap prune converges over multiple `maintain` passes (bounded deletes per pass) rather than clearing a large backlog in one call — an intentional bounding that relies on `maintain` firing repeatedly, which it does on every settle, revoke, store-open, and seated boot. No raw secrets are stored at any point: only token hashes persist. The gateway-authoritative run-status reconciliation half was already committed; this step's residual was the retention bounding.
