---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S42'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove dedicated A2A lease-repository migration, reopen, expiry, idempotent settlement, and restart reconciliation without depending on authoring-session schemas

## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs`

## Description

- Confirm the dedicated A2A lease repository proves migration, reopen, reserve/commit/resolve, idempotent settlement, and lease-id mismatch in one standalone test that opens its own SQLite file with no authoring-session schema dependency.
- Confirm expiry revocation and the pre-sweep resolution refusal are proven by their own tests, and restart durability by the terminal-settlement reopen and reserved-revoke-on-restart tests.

## Outcome

S42's acceptance is satisfied by the committed dedicated-repository test suite: `migrate_reopen_reserve_commit_resolve_and_settle` covers schema migration, fresh-handle reopen durability, reserve inertness until commit, authoritative binding, idempotent terminal settlement (Settled then AlreadyTerminal), and lease-id mismatch; `expiry_revokes_an_unsettled_lease` and `a_token_past_expiry_does_not_resolve_even_before_the_sweep` cover expiry; the terminal-settlement suite's `a_settled_terminal_is_durable_across_a_repo_reopen` and `reserved_leases_revoke_on_restart_while_committed_leases_survive` cover restart reconciliation. All open a standalone `LeaseRepo`, never an authoring-session store. Verified green earlier this session (a2a_run_leases 5/5 + settlement suite).

## Notes

No new test was required — the acceptance was fully met by the committed inline suite, so this step closes on verification rather than added code. A full-crate re-run at close time was blocked by an unrelated live `vaultspec-product` `generation`/`locking` module-split refactor; the S42 tests themselves were confirmed passing before that churn began.
