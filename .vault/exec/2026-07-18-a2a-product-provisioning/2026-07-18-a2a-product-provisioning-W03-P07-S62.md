---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S62'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify with real executables that only the copied updater acquires the install lock, authenticated drain closes admission and resolves active runs plus checkpoints before owner-authorized gateway stop, runtime-singleton release precedes snapshot migration and swap, the gateway never acquires or waits on the install lock, descriptor replay fails, secrets remain redacted, and prior-seat recovery relaunches

## Scope

- `engine/crates/vaultspec-updater/tests/updater_process.rs`

## Description

- Real-executable proofs across the updater + product suites: the execute-drive branches (cold success through a real never-faked Quiescence; foreign, stale, and incompatible gateways typed-rollback with the descriptor cleared); only the copied updater acquires the install lock; the gateway never acquires or waits on it; descriptor replay fails; secrets stay redacted; the relaunch health probe requires a fresh owned-live re-publish; verify runs before drain and fails closed.

## Outcome

Every STAGE of the OwnedLive drive is proven no-mock with real files, real processes, and a real live pid.

## Notes

RESIDUAL — left UNTICKED: the single top-level `drive_fresh_update` SUCCESS call threading a real materialization source through all stages is unproven. Production verify is distribution-authority-sealing-gated; the sanctioned unsealed-verify test seam needs a cross-lane TUF test-bundle fixture (private to the distribution-authority test module) to yield a materialization source. This crate will not reimplement TUF signing it does not own. Stage-level coverage is comprehensive; the single-call e2e is the documented residual.
