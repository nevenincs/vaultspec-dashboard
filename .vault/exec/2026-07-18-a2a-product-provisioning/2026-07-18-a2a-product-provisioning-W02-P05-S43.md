---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S43'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove two concurrent runs for one role revoke independently and no raw token enters records, output, logs, receipts, or discovery

## Scope

- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`

## Description

- Confirm the committed acceptance test proves two concurrent runs for one role actor mint distinct random secrets, that revoking exactly one bundle's hash leaves the concurrent same-role run resolving, and that no raw secret reaches records, Debug output, or persistence.
- Apply clippy hygiene to that test (slice-from-ref over a cloned single-element array).

## Outcome

S43's acceptance is proven by the committed `concurrent_same_role_runs_revoke_independently_and_never_persist_a_raw_secret` test: distinct-purpose same-role issuance yields distinct random secrets, `revoke_hashes` of one bundle leaves the other resolving, Debug redacts the raw token, and an on-disk row dump finds only the token hash. Verified green earlier this session.

## Notes

The acceptance test already existed in the tree from a prior session's work. A near-identical duplicate was mistakenly added on top of it and then removed (commits `6535704db7` add, `791e1a5dd7` remove); the only lasting delta from that round trip is clippy `std::slice::from_ref` hygiene on the canonical test. A full-crate re-run at close time was blocked by an unrelated live `vaultspec-product` module-split refactor; the S43 test itself was confirmed passing before that churn.
