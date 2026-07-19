---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S34'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove seated boot, authenticated attach, cold readiness, foreign immutability, stale recovery, and clean gateway shutdown against the real desktop entrypoint

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`

## Description

- Added the runtime-identity acceptance suite driving the production `reconcile_seated_boot` against REAL artifacts.
- Proved authenticated attach plus cold readiness: a real loopback readiness server requiring the attach bearer, our own live pid plus fresh heartbeat classifying OwnedLive, and the reconcile reading it ready.
- Proved foreign immutability (attachable and untrusted-immutable both left untouched), stale recovery (a real spawned-then-reaped dead pid quarantined before a start attempt), and the not-installed no-op.
- Added capsule-gated proofs: extract the real capsule's own interpreter and prove the owned-tree termination contract on a real process, and verify the real capsule manifest against the committed lock and resolve the real owned gateway entrypoint (distinct from the standalone MCP).
- Added dev-deps (zip/flate2/tar/sha2) and test-only plane accessors; gated the capsule proofs on `VAULTSPEC_PRODUCT_CAPSULE` with skip-with-reason when absent.

## Outcome

All six proofs pass. With the real capsule present at the conventional dist path, the capsule proofs RAN (not skipped): the real interpreter was extracted and its owned process terminated cleanly, and the real manifest verified plus entrypoint resolved. 18 touched-scope api tests and the full api lib suite (870) pass; clippy all-targets and fmt green.

## Notes

The full real-entrypoint START via reconcile depends on the not-yet-built install layout (generation dir populated with the capsule plus component lock); the stale-recovery proof asserts the honest missing-capsule start outcome rather than faking a spawn. The a2a-runtime contract for whether the real gateway executable publishes the product `gateway-discovery.json` on a bare spawn is owned by the a2a side and is not asserted here; the authenticated-attach proof drives the real control socket directly.
