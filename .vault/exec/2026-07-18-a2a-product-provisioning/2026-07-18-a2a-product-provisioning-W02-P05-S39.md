---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S39'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Persist the token bundle in the dedicated repository only after commit returns the authoritative A2A run or thread id and bind it to the non-secret lease and reservation identities

## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs`

## Description

- Reserve the hashed token bundle pre-commit, then bind it to the authoritative A2A run id and the non-secret gateway lease and reservation identities only after commit returns.
- Refuse to expose a usable credential for a run that never bound: revoke the reserved bundle if authoring registration or the commit bind fails, before any raw token leaves the stack.
- Reconcile a lost commit response idempotently from authoritative run status, binding the reserved row to the returned run and lease ids without minting again.

## Outcome

The token bundle becomes durable and resolvable only once the run is authoritatively committed and bound to its non-secret lease and reservation ids, closing the terminal-callback race without a credential ever outliving an absent run. Verified against the committed implementation; the a2a-lane hardening landed in commit `6cb2d28726`. Gate: `cargo build -p vaultspec-api` clean, touched-scope tests pass (including `malformed_or_mismatched_commit_response_never_changes_the_prebound_lease` and `accepted_start_with_a_lost_response_retains_tokens_and_recovers_idempotently`), clippy `--lib -D warnings` clean, fmt clean.

## Notes

Bind-after-commit was implemented in earlier committed work; this record closes the step after verifying the reserve-then-commit ordering and the revoke-on-failure boundaries hold. Legacy committed runs that persisted only the non-secret lease id remain viewable but cannot drive exact reserved-row repair — an intentional, honest degradation.
