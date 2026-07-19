---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S27'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Start or authenticate the receipt-owned gateway during seated boot and leave compatible foreign residents immutable

## Scope

- `engine/crates/vaultspec-api/src/boot.rs`

## Description

- Added `reconcile_seated_boot` on the lifecycle plane: classify the current gateway discovery and start-or-authenticate ONLY the receipt-owned gateway (ADR D4), leaving foreign residents immutable.
- Wired a SEATED, non-bootstrap boot to reconcile after workspace/launcher state settles and before the wire flips to `ready`; the outcome is logged and never aborts the seat.
- Made the reconcile total: not-installed no-op; owned-live authenticate over the real loopback control endpoint; owned-stale quarantine the owner-matched dead record under the install lock then start; installed-cold start; foreign left untouched.
- Retained the spawned owned process for its lifetime and terminate its tree within a bound on the shared graceful-shutdown path before the seat lock releases.

## Outcome

Seated boot reconciles the receipt-owned gateway and cleans it up on shutdown; exempt and bootstrap boots never touch product state. Build/clippy/fmt green; the S34 suite proves authenticate, foreign-immutability, stale-recovery, and clean shutdown against real sockets/processes and the real capsule.

## Notes

The actual START from the active generation depends on the not-yet-built install layout; until it lands, the start path reports the honest missing-capsule reason rather than a fabricated success. No foreign-mutation path exists.
