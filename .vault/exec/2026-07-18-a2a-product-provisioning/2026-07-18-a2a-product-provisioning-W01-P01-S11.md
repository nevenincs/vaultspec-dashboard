---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S11'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify manifest rejection, atomic receipt activation, dashboard-only capability creation, gateway read-only access, credential separation, permission restriction, and cross-process lock exclusion with real files, processes, and locks

## Scope

- `engine/crates/vaultspec-product/tests/product_authority.rs`

## Description

- Add the `product_authority` integration test exercising the production API
  against real files, credential material, an on-disk receipt, and a real second
  process.
- Prove manifest rejection: unpinned identity, target mismatch, digest drift, and
  floating `latest` each fail closed, while a capsule and release set built from
  the committed lock's pins verify.
- Prove atomic receipt activation leaves an active receipt with no interruption
  marker, dashboard-only capability creation with bootstrap retention, gateway
  read-only attach-control access plus separate worker-IPC minting, three
  distinct credential files, and owner-restricted permissions (`0600` under
  Unix).
- Prove cross-process install-lock exclusion by re-invoking the test binary as a
  separate process that holds the real lock, observing the parent read the lock
  as busy with the child's advisory owner identity, then confirming the freed
  lock is acquirable after the child releases.

## Outcome

All eleven acceptance cases pass with no fakes, mocks, stubs, or skips; the
cross-process case spawns and reaps a genuine second OS process holding the real
lock.

## Notes

Fixtures are derived from the committed component lock parsed by the production
parser, never copied from a run's output, so a drift between the test pins and
the real lock fails the build rather than passing silently.
