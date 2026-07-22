---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S155'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove attach-control callback authentication, worker IPC rejection, durable-terminal ordering, idempotency, exact hashed-bundle revocation, INPUT_REQUIRED retention, expiry, and restart reconciliation against the production repository and router

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_terminal_settlement.rs`

## Description

- Confirm the settlement acceptance suite proves, against the production repository and router, that the terminal callback authenticates on the attach-control credential ONLY and rejects the worker-IPC and unrelated credentials.
- Confirm it proves durable-terminal ordering and idempotency, exact hashed-bundle revocation on a matching lease id, no settlement on a lease-id mismatch, INPUT_REQUIRED (non-terminal) retention, expiry revocation, and restart reconciliation across a repository reopen.
- Format the two long assertions to satisfy `cargo fmt --check`.

## Outcome

S155's acceptance is proven by the committed live-wire suite exercising the real router + real `LeaseRepo`: `settlement_authenticates_attach_control_only_and_settles_idempotently`, `a_mismatched_callback_lease_id_settles_nothing`, `non_terminal_callbacks_retain_the_running_lease`, `a_settled_terminal_is_durable_across_a_repo_reopen`, `reserved_leases_revoke_on_restart_while_committed_leases_survive`, and `an_expired_lease_stops_resolving_and_the_sweep_revokes_it`. The rustfmt fix landed in commit `da2cfe5695`. Verified green earlier this session (settlement suite 6/6).

## Notes

The substantive acceptance suite was already committed; the only residual was a rustfmt formatting of two assertions, now committed so `cargo fmt --check` is clean. A full-crate re-run at close time was blocked by an unrelated live `vaultspec-product` module-split refactor; the settlement suite was confirmed passing before that churn.
