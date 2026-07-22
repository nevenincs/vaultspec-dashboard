---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S36'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Issue and revoke run-scoped token bundles only for the bounded server-validated required-role set returned by prepare, without storing raw secrets or revoking another run for the same actor

## Scope

- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`

## Description

- Mint one run-scoped raw token per required role, drawn only from the bounded, server-validated role set the prepare stage returned.
- Persist only each token's hash in the dedicated lease repository; the raw token values ride solely on the loopback response body and never touch durable storage.
- Revoke a run's ENTIRE bundle atomically on dispatch or commit failure, and prove that concurrent runs for the same actor role revoke independently — one run's teardown never revokes another's live bundle.

## Outcome

Run-scoped token issuance and revocation are confined to the prepare-returned role set with no raw-secret persistence and no cross-run revocation, verified green. The bounded role set is validated (non-empty, capped, unique, agent-id charset) before minting. Verified against the committed implementation; the a2a-lane hardening landed in commit `6cb2d28726`. Gate: `cargo build -p vaultspec-api` clean, touched-scope tests pass (including `concurrent_runs_for_one_role_revoke_independently` and `provisioned_bundle_covers_every_role_with_distinct_tokens_and_no_bearer`), clippy `--lib -D warnings` clean, fmt clean.

## Notes

The mint/revoke core was implemented in an earlier session's committed work; this record closes the step after verifying its correctness end-to-end and completing the lane's residual hardening. No raw secret is ever written to the lease store — hash-only lookup is enforced at both provision and resolve time.
