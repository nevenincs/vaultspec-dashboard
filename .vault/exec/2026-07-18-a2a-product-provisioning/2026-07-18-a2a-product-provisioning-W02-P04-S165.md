---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
step_id: 'S165'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove unreceipted staged rolling-back substituted incomplete tampered and self-authorized generations remain inert while one active fully verified receipt can start the frozen binary's dispatch (serve or start)

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`

## Description

- Place real generation trees on disk - release manifest, component lock at its fixed
  path, and a frozen-runtime directory with an entrypoint - and drive the production
  seated reconcile against each.
- Cover the inert matrix in one proof: unreceipted, staged, rolling back, substituted,
  incomplete, tampered, and self-authorized.
- Assert absence of a process rather than a refusal string, so a start that happened and
  was then disowned still fails the test.

## Outcome

Delivered for the inert half at this layer, with the positive half proven where it can be
proven honestly.

Every row builds real files and asks the production reconcile to start them. The
self-authorized row is the sharpest: a receipt written INSIDE the generation is the tree
asserting its own activation, and it changes nothing, because the fixed journal is the
only selector. The staged and rolling-back rows carry those states on a retired side-file
record, which is the only record shape that can express them at all - the journal settles
complete receipts and classifies anything torn as requiring recovery, so those states
cannot exist in it by construction.

The positive clause - one fully verified receipt CAN start the frozen runtime - is not
provable from this test crate, and deliberately so: receipt publication is private to the
product crate, which is the seal the sealed-provisioning work exists to hold. Exposing a
publication seam to a test would dismantle exactly the property under test. That proof
therefore lives in the product crate, where a settled receipt over a complete generation
authorizes a start and resolves the frozen runtime's entrypoint out of the proof. What
remains unproven anywhere is the exec of a genuine frozen runtime; that needs a real
built onedir and belongs with the certification lane, which already boots one.

## Notes

- No conditional skip was added. The pre-existing convention in this file gates
  artifact-dependent proofs on an environment variable and returns with a printed reason;
  the matrix added here needs no artifact and runs everywhere, unconditionally.
- Gate evidence: eight tests green in this module on Windows, formatting clean, and the
  API library compiles and lints. The suite was run before a concurrent lane added a new
  discovery verdict that currently stops the product library compiling; that break is in
  another lane's uncommitted file and none of it is in a file this Step touched.
- The test module still carries retired capsule vocabulary in its header and in two
  artifact-gated proofs. Those belong to the component reshape lane and were left alone
  rather than half-migrated from here.
