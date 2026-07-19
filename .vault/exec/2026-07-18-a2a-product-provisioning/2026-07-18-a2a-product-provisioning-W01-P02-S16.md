---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S16'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Implement receipt-gated lifecycle transitions while preserving cold installed state, foreign attach, mutable data, and complete release-set authority

## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs`

## Description

- Add `lifecycle.rs` with `LifecycleController` binding the receipt, credential,
  discovery, process, and protocol contracts into one authority.
- Gate receipt-bound mutations on the active receipt AND an ownership capability
  that verifies against the stored one; refuse a foreign-adopted install (no
  retained ownership) and treat the attach credential as insufficient.
- Implement the pure, total `plan_transition` state machine preserving cold
  installed state and refusing every non-install op on an uninstalled product,
  plus `resolve_attach` that never mutates a foreign resident.
- Fold in the P01 review items: route capsule loading through
  `CapsuleManifest::parse_and_verify` (`load_verified_capsule`) and sweep
  orphaned receipt temp files at `initialize`.

## Outcome

Uninstalled refuses every mutation but install; a receipt-bound stop is refused
without the ownership capability and with the attach credential, and allowed
with the correct one; the transition planner preserves cold state; a
foreign-adopted install cannot be mutated.

## Notes

None.
