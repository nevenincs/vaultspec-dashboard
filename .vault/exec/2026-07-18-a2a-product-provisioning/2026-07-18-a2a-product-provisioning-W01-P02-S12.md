---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
body_hash: 'sha256:43dd2c096ae19f62b4c2a5dd4e9cb962e24a38ba925aca28eda543610768d32f'
step_id: 'S12'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Define typed install, ensure, start, stop, restart, repair, update, rollback, remove, doctor, readiness, and refusal contracts

## Scope

- `engine/crates/vaultspec-product/src/protocol.rs`

## Description

- Add `protocol.rs` defining the ten typed `LifecycleOp` variants (install,
  ensure, start, stop, restart, repair, update, rollback, remove, doctor) with
  `is_read_only` and `requires_ownership` classifiers.
- Define the one shared `Readiness` model (`Uninstalled` / `InstalledStopped` /
  `GatewayReady { worker }`) where a cold worker is still service-ready, and the
  `WorkerState` enum.
- Define the closed, serde-tagged `Refusal` set so a decision is never a
  free-form string.

## Outcome

The lifecycle vocabulary is transport-free and round-trips on the wire; every
receipt-bound mutation is flagged as ownership-requiring, and a cold worker does
not collapse readiness to a degradation.

## Notes

None.
