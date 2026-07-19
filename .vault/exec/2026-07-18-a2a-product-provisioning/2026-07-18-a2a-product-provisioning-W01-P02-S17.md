---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S17'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove owner attach, foreign conflict, stale-owner recovery, credential separation, and lifecycle refusal with real processes, files, and sockets

## Scope

- `engine/crates/vaultspec-product/tests/desktop_gateway.rs`

## Description

- Add the `desktop_gateway` integration test proving the gateway-ownership
  contract against real artifacts.
- Owner attach: a real loopback HTTP gateway stub over a real socket plus this
  live process's own pid classify `OwnedLive`, and the authenticated readiness
  probe reads ready over the real socket.
- Foreign conflict: a live foreign gateway with no readable handoff classifies
  immutable and refuses attach (`ForeignResident`).
- Stale-owner recovery: a spawned-then-reaped child's dead pid classifies
  `OwnedStale`, and the owner-matched quarantine succeeds only because the
  process is provably dead (a foreign owner is refused).
- Credential separation on real files (three distinct role files) and a
  receipt-bound lifecycle refusal without the ownership capability.

## Outcome

All five acceptance cases pass with real sockets, real credential files, real
process identities, and a real receipt; no fakes, mocks, stubs, or skips.

## Notes

None.
